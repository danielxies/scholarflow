import { z } from "zod";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { inngest } from "@/inngest/client";
import * as dbOps from "@/lib/db";
import { LITERATURE_EVENTS } from "@/features/literature/inngest/events";

const requestSchema = z.object({
  projectId: z.string().min(1),
  paper: z.object({
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
        id: z.string().optional().nullable(),
        name: z.string().min(1),
        score: z.number().nullable(),
      })
    ),
    publicationType: z.string().nullable(),
  }),
});

export async function POST(request: Request) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { projectId, paper } = requestSchema.parse(body);

    const project = dbOps.getProjectById(projectId);
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    if (project.ownerId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const paperId = dbOps.addPaper(projectId, {
      provider: "openalex",
      openAlexId: paper.openAlexId,
      title: paper.title,
      authors: paper.authors.map((author) => author.name),
      abstract: paper.abstract ?? undefined,
      year: paper.year ?? undefined,
      venue: paper.venue ?? undefined,
      citationCount: paper.citationCount,
      url: paper.url ?? undefined,
      doi: paper.doi ?? undefined,
      arxivId: paper.arxivId ?? undefined,
      publicationType: paper.publicationType ?? undefined,
      primaryTopic: paper.primaryTopic ?? undefined,
      tags: paper.topics.map((topicItem) => topicItem.name),
      summaryStatus: "pending",
    });

    const savedPaper = dbOps.getPaperById(paperId);
    if (!savedPaper) {
      return NextResponse.json(
        { error: "Paper could not be saved" },
        { status: 500 }
      );
    }

    const shouldQueueEnrichment = ![
      "pending",
      "processing",
      "completed",
    ].includes(savedPaper.summaryStatus ?? "");

    if (shouldQueueEnrichment || savedPaper.summaryStatus === "pending") {
      dbOps.updatePaperEnrichment(paperId, {
        summaryStatus: "pending",
      });

      await inngest.send({
        name: LITERATURE_EVENTS.ENRICH_PAPER,
        data: {
          paperId,
          projectId,
        },
      });
    }

    return NextResponse.json({ paperId });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid paper payload" },
        { status: 400 }
      );
    }

    const message =
      error instanceof Error ? error.message : "Unable to add paper";
    console.error("Add paper error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
