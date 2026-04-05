import { z } from "zod";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { inngest } from "@/inngest/client";
import * as dbOps from "@/lib/db";
import { LITERATURE_EVENTS } from "@/features/literature/inngest/events";
import { buildFallbackEnrichment } from "@/features/literature/lib/fallback-enrichment";

const requestSchema = z.object({
  projectId: z.string().min(1),
  paperId: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { projectId, paperId } = requestSchema.parse(body);

    const project = dbOps.getProjectById(projectId);
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    if (project.ownerId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const paper = dbOps.getPaperById(paperId);
    if (!paper || paper.projectId !== projectId) {
      return NextResponse.json({ error: "Paper not found" }, { status: 404 });
    }

    const fallback = buildFallbackEnrichment(paper);

    dbOps.updatePaperEnrichment(paperId, {
      aiSummary: fallback.summary,
      summaryStatus: "completed",
      paperType: fallback.paperType,
      supportabilityLabel: fallback.supportabilityLabel,
      reproducibilityClass: fallback.reproducibilityClass,
      supportabilityScore: fallback.supportabilityScore,
      supportabilityReason: fallback.supportabilityReason,
      officialRepoUrl: fallback.officialRepoUrl,
      supplementaryUrls: JSON.stringify([]),
      pdfUrl: fallback.pdfUrl,
      sourceDiscoveryStatus: "completed",
      supportabilityUpdatedAt: Date.now(),
    });

    await inngest.send({
      name: LITERATURE_EVENTS.ENRICH_PAPER,
      data: {
        paperId,
        projectId,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid refresh request" },
        { status: 400 }
      );
    }

    const message =
      error instanceof Error ? error.message : "Unable to refresh paper analysis";
    console.error("Refresh enrichment error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
