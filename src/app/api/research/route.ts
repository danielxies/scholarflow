import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { inngest } from "@/inngest/client";
import * as dbOps from "@/lib/db";
import { RESEARCH_EVENTS } from "@/features/research/inngest/events";

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { action, projectId, researchQuestion, direction, reason } = body;

  if (!projectId || !action) {
    return NextResponse.json({ error: "Missing projectId or action" }, { status: 400 });
  }

  switch (action) {
    case "start": {
      if (!researchQuestion?.trim()) {
        return NextResponse.json({ error: "Research question is required" }, { status: 400 });
      }
      dbOps.upsertResearchState(projectId, {
        phase: "bootstrap",
        researchQuestion,
        innerLoopCount: 0,
        outerLoopCount: 0,
        experimentCount: 0,
        findings: "",
        directionDecision: null,
      });
      await inngest.send({
        name: RESEARCH_EVENTS.START,
        data: { projectId, researchQuestion, userId },
      });
      return NextResponse.json({ success: true });
    }

    case "stop": {
      dbOps.upsertResearchState(projectId, { phase: "idle" });
      await inngest.send({
        name: RESEARCH_EVENTS.CANCEL,
        data: { projectId },
      });
      dbOps.addResearchLogEntry(projectId, "research_stopped", "idle", "Research stopped by user");
      return NextResponse.json({ success: true });
    }

    case "override": {
      if (!direction) {
        return NextResponse.json({ error: "Direction is required" }, { status: 400 });
      }
      dbOps.upsertResearchState(projectId, { directionDecision: direction });
      dbOps.addResearchLogEntry(
        projectId,
        "direction_override",
        dbOps.getResearchState(projectId)?.phase ?? "idle",
        `User override: ${direction}${reason ? ` — ${reason}` : ""}`
      );
      return NextResponse.json({ success: true });
    }

    default:
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }
}
