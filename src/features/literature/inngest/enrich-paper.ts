import { z } from "zod";
import { NonRetriableError } from "inngest";

import { inngest } from "@/inngest/client";
import { callClaude } from "@/lib/claude-client";
import { extractJsonPayload } from "@/lib/ai-json";
import * as dbOps from "@/lib/db";
import { LITERATURE_EVENTS } from "./events";

interface EnrichPaperEvent {
  paperId: string;
  projectId: string;
}

const enrichmentSchema = z.object({
  summary: z.string().min(1),
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
    "Summarize this research paper for a user deciding whether to keep it in their project library.",
    `Paper metadata:\n${metadata}`,
    "",
    'Return strict JSON only with key "summary".',
    "summary: 2-4 concise sentences in plain text.",
  ].join("\n");
}

export const enrichPaper = inngest.createFunction(
  {
    id: "literature-enrich-paper",
    onFailure: async ({ event }) => {
      const { paperId } = event.data.event.data as EnrichPaperEvent;
      dbOps.updatePaperEnrichment(paperId, {
        summaryStatus: "failed",
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
      });
    });

    const enrichment = await step.run("generate-enrichment", async () => {
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
    });

    await step.run("save-enrichment", async () => {
      dbOps.updatePaperEnrichment(paperId, {
        aiSummary: enrichment.summary.trim(),
        summaryStatus: "completed",
      });
    });

    return { success: true, paperId };
  }
);
