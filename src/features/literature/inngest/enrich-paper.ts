import { z } from "zod";
import { NonRetriableError } from "inngest";

import { inngest } from "@/inngest/client";
import { callClaude } from "@/lib/claude-client";
import { extractJsonPayload } from "@/lib/ai-json";
import * as dbOps from "@/lib/db";
import {
  buildFallbackEnrichment,
} from "../lib/fallback-enrichment";
import { LITERATURE_EVENTS } from "./events";

interface EnrichPaperEvent {
  paperId: string;
  projectId: string;
}

const enrichmentSchema = z.object({
  summary: z.string().min(1),
  paperType: z.string().min(1),
  supportabilityLabel: z.enum([
    "high_support",
    "medium_support",
    "low_support",
    "unsupported",
  ]),
  reproducibilityClass: z.enum([
    "fully_supported",
    "partially_supported",
    "not_reproducible",
  ]),
  supportabilityScore: z.number().min(0).max(100),
  supportabilityReason: z.string().min(1),
});

function buildPrompt(
  paper: NonNullable<ReturnType<typeof dbOps.getPaperById>>
): string {
  const authors = (() => {
    try {
      const parsed = JSON.parse(paper.authors) as string[];
      return parsed.filter(Boolean).join(", ");
    } catch {
      return paper.authors;
    }
  })();

  const tags = (() => {
    try {
      const parsed = JSON.parse(paper.tags ?? "[]") as string[];
      return parsed.filter(Boolean).slice(0, 8).join(", ");
    } catch {
      return "";
    }
  })();

  const metadata = [
    `Title: ${paper.title}`,
    `Authors: ${authors}`,
    `Year: ${paper.year ?? "Unknown"}`,
    `Venue: ${paper.venue ?? "Unknown"}`,
    `Publication type: ${paper.publicationType ?? "Unknown"}`,
    `Primary topic: ${paper.primaryTopic ?? "Unknown"}`,
    `Citation count: ${paper.citationCount}`,
    tags ? `OpenAlex topics: ${tags}` : "",
    paper.abstract
      ? `Abstract:\n${paper.abstract.slice(0, 6000)}`
      : "Abstract: Not available",
  ]
    .filter(Boolean)
    .join("\n");

  return [
    "Analyze this research paper for a product that supports autonomous paper reproduction.",
    `Paper metadata:\n${metadata}`,
    "",
    "Classify supportability conservatively.",
    "Use ml_benchmark for benchmark-heavy ML papers, algorithm for method papers, systems for systems papers, bio for biology/biomed papers, and other otherwise.",
    "fully_supported means a reliable reproduction path is likely automatable in v1.",
    "partially_supported means some workflow can run, but meaningful ambiguity or setup burden remains.",
    "not_reproducible means the product should not allow an autonomous run.",
    'Return strict JSON only with keys "summary", "paperType", "supportabilityLabel", "reproducibilityClass", "supportabilityScore", and "supportabilityReason".',
    "summary: 2-4 concise sentences in plain text.",
    "supportabilityScore: integer 0-100.",
    "supportabilityReason: 1-2 concise sentences.",
  ].join("\n");
}

export const enrichPaper = inngest.createFunction(
  {
    id: "literature-enrich-paper",
    onFailure: async ({ event }) => {
      const { paperId } = event.data.event.data as EnrichPaperEvent;
      dbOps.updatePaperEnrichment(paperId, {
        summaryStatus: "failed",
        sourceDiscoveryStatus: "failed",
      });
    },
  },
  { event: LITERATURE_EVENTS.ENRICH_PAPER },
  async ({ event, step }) => {
    const { paperId } = event.data as EnrichPaperEvent;

    const paper = await step.run("load-paper", async () => {
      return dbOps.getPaperById(paperId);
    });

    if (!paper) {
      throw new NonRetriableError("Paper not found");
    }

    await step.run("mark-processing", async () => {
      dbOps.updatePaperEnrichment(paperId, {
        summaryStatus: "processing",
        sourceDiscoveryStatus: "processing",
      });
    });

    const enrichment = await step.run("generate-enrichment", async () => {
      try {
        const response = await callClaude({
          prompt: buildPrompt(paper),
          systemPrompt:
            "You are a literature analysis assistant. Return only valid JSON with no markdown or commentary.",
          model: "sonnet",
          maxTurns: 1,
          allowedTools: [],
        });

        const parsed = JSON.parse(extractJsonPayload(response)) as unknown;
        return enrichmentSchema.parse(parsed);
      } catch (error) {
        console.error("Paper enrichment fell back to metadata heuristics:", error);
        return buildFallbackEnrichment(paper);
      }
    });

    await step.run("save-enrichment", async () => {
      const fallback = buildFallbackEnrichment(paper);

      dbOps.updatePaperEnrichment(paperId, {
        aiSummary: enrichment.summary.trim(),
        summaryStatus: "completed",
        paperType: enrichment.paperType.trim(),
        supportabilityLabel: enrichment.supportabilityLabel,
        reproducibilityClass: enrichment.reproducibilityClass,
        supportabilityScore: Math.round(enrichment.supportabilityScore),
        supportabilityReason: enrichment.supportabilityReason.trim(),
        officialRepoUrl: fallback.officialRepoUrl,
        supplementaryUrls: JSON.stringify([]),
        pdfUrl: fallback.pdfUrl,
        sourceDiscoveryStatus: "completed",
        supportabilityUpdatedAt: Date.now(),
      });
    });

    return { success: true, paperId };
  }
);
