import { getSessionUserId } from "@/lib/session";
import { NextResponse } from "next/server";
import { z } from "zod";

import { callClaude } from "@/lib/claude-client";
import { extractJsonPayload } from "@/lib/ai-json";
import { buildProjectRelevanceContext } from "@/lib/project-relevance-context";
import * as dbOps from "@/lib/db";

const paperSchema = z.object({
  openAlexId: z.string().min(1),
  title: z.string().min(1),
  authors: z.array(
    z.object({
      name: z.string().min(1),
    })
  ),
  abstract: z.string().nullable(),
  year: z.number().int().nullable(),
  venue: z.string().nullable(),
  citationCount: z.number().int().nonnegative(),
  url: z.string().nullable(),
  doi: z.string().nullable(),
  arxivId: z.string().nullable(),
  primaryTopic: z.string().nullable(),
  topics: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      score: z.number().nullable(),
    })
  ),
  publicationType: z.string().nullable(),
});

const requestSchema = z.object({
  projectId: z.string().min(1),
  query: z.string().trim().min(1),
  papers: z.array(paperSchema).min(1).max(10),
});

const responseSchema = z.array(
  z.object({
    openAlexId: z.string().min(1),
    relevanceScore: z.number().int().min(0).max(100),
    relevanceReason: z.string().min(1),
  })
);

function truncate(value: string, limit: number): string {
  if (value.length <= limit) {
    return value;
  }

  return `${value.slice(0, limit)}\n... (truncated)`;
}

function buildPaperBlock(paper: z.infer<typeof paperSchema>): string {
  const topics = paper.topics
    .map((topic) => topic.name)
    .filter(Boolean)
    .slice(0, 5)
    .join(", ");

  return [
    `openAlexId: ${paper.openAlexId}`,
    `title: ${paper.title}`,
    `authors: ${paper.authors.map((author) => author.name).join(", ") || "Unknown"}`,
    `year: ${paper.year ?? "Unknown"}`,
    `venue: ${paper.venue ?? "Unknown"}`,
    `publicationType: ${paper.publicationType ?? "Unknown"}`,
    `primaryTopic: ${paper.primaryTopic ?? "Unknown"}`,
    `citationCount: ${paper.citationCount}`,
    topics ? `topics: ${topics}` : "",
    paper.abstract ? `abstract:\n${truncate(paper.abstract, 1200)}` : "abstract: Not available",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function POST(request: Request) {
  try {
    const userId = await getSessionUserId();


    const body = await request.json();
    const { projectId, query, papers } = requestSchema.parse(body);

    const project = dbOps.getProjectById(projectId);
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    if (project.ownerId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const projectContext = buildProjectRelevanceContext(projectId);
    const prompt = [
      "Score how relevant each paper is to the current project.",
      "Use the project context as the primary signal and the search query as a secondary hint.",
      "Return strict JSON only as an array of objects with keys openAlexId, relevanceScore, and relevanceReason.",
      "relevanceScore must be an integer from 0 to 100.",
      "relevanceReason must be one concise sentence.",
      "",
      `Search query:\n${query}`,
      "",
      `Project context:\n${projectContext}`,
      "",
      "Papers:",
      ...papers.map((paper, index) => `${index + 1}.\n${buildPaperBlock(paper)}`),
    ].join("\n\n");

    const response = await callClaude({
      prompt,
      systemPrompt:
        "You are a research triage assistant. Return only valid JSON with no markdown.",
      model: "sonnet",
      maxTurns: 1,
      allowedTools: [],
    });

    const parsed = responseSchema.parse(
      JSON.parse(extractJsonPayload(response)) as unknown
    );

    return NextResponse.json({
      scores: parsed,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid relevance request" },
        { status: 400 }
      );
    }

    const message =
      error instanceof Error
        ? error.message
        : "Unable to score paper relevance";
    console.error("Paper relevance error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
