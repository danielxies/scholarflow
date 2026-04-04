import { inngest } from "@/inngest/client";
import { callClaude } from "@/lib/claude-client";
import * as dbOps from "@/lib/db";
import { parseActions, executeActions, extractResponse, ACTION_INSTRUCTIONS } from "@/features/conversations/inngest/action-executor";
import { OUTER_LOOP_PROMPT } from "./prompts";
import { RESEARCH_EVENTS, MAX_OUTER_LOOPS } from "./events";

interface OuterLoopEvent {
  projectId: string;
}

export const researchOuterLoop = inngest.createFunction(
  {
    id: "research-outer-loop",
    cancelOn: [
      {
        event: RESEARCH_EVENTS.CANCEL,
        if: "event.data.projectId == async.data.projectId",
      },
    ],
    onFailure: async ({ event }) => {
      const { projectId } = event.data.event.data as OuterLoopEvent;
      dbOps.addResearchLogEntry(projectId, "outer_loop_error", "outer_loop", "Outer loop failed");
    },
  },
  { event: RESEARCH_EVENTS.OUTER_LOOP_TICK },
  async ({ event, step }) => {
    const { projectId } = event.data as OuterLoopEvent;

    // Check state
    const state = await step.run("check-state", () => {
      const s = dbOps.getResearchState(projectId);
      if (!s || s.phase === "idle" || s.phase === "completed") return null;
      if ((s.outerLoopCount ?? 0) >= MAX_OUTER_LOOPS) {
        dbOps.upsertResearchState(projectId, { directionDecision: "CONCLUDE" });
        return null;
      }
      return s;
    });

    if (!state) {
      await step.sendEvent("force-finalize", {
        name: RESEARCH_EVENTS.FINALIZE,
        data: { projectId },
      });
      return { success: true, stopped: true };
    }

    // Update phase
    await step.run("set-outer-loop-phase", () => {
      dbOps.upsertResearchState(projectId, { phase: "outer_loop" });
    });

    // Run synthesis
    const direction = await step.run("run-synthesis", async () => {
      const hypotheses = dbOps.getHypotheses(projectId);
      const experiments = dbOps.getExperiments(projectId);
      const memories = dbOps.getResearchMemory(projectId);

      const hypothesisSummary = hypotheses
        .map((h) => `- [${h.status}] ${h.title}: ${h.description}${h.actualOutcome ? ` | Outcome: ${h.actualOutcome}` : ""}`)
        .join("\n");

      const experimentSummary = experiments
        .filter((e) => e.status === "completed" || e.status === "failed")
        .map((e) => `- ${e.name} (${e.status}): metrics=${e.metrics}, results=${(e.results ?? "").slice(0, 200)}`)
        .join("\n");

      const memorySummary = memories
        .map((m) => `- [${m.type}] ${m.content}`)
        .join("\n");

      const systemPrompt = OUTER_LOOP_PROMPT + "\n\n" + ACTION_INSTRUCTIONS;

      const prompt = [
        `## Research Question\n${state.researchQuestion}`,
        `\n## Current Findings\n${state.findings}`,
        `\n## Hypotheses (${hypotheses.length})\n${hypothesisSummary}`,
        `\n## Experiments (${experiments.length})\n${experimentSummary}`,
        memories.length > 0 ? `\n## Research Memory\n${memorySummary}` : "",
        `\n## Stats\nInner loops: ${state.innerLoopCount}, Outer loops: ${state.outerLoopCount}, Total experiments: ${state.experimentCount}`,
        `\n\nSynthesize all results and decide the next direction: DEEPEN, BROADEN, PIVOT, or CONCLUDE.`,
      ].join("\n");

      const response = await callClaude({
        prompt,
        systemPrompt,
        model: "sonnet",
        maxTurns: 3,
        allowedTools: [],
      });

      const actions = parseActions(response);
      if (actions.length > 0) {
        await executeActions(actions, projectId);
      }

      // Try to detect the direction from the response or research state
      const updatedState = dbOps.getResearchState(projectId);
      return updatedState?.directionDecision ?? "DEEPEN";
    });

    // Update counters
    await step.run("update-outer-count", () => {
      const currentState = dbOps.getResearchState(projectId);
      dbOps.upsertResearchState(projectId, {
        outerLoopCount: (currentState?.outerLoopCount ?? 0) + 1,
        phase: "inner_loop",
        innerLoopCount: 0, // Reset inner loop counter
      });
      dbOps.addResearchLogEntry(
        projectId,
        "outer_loop_complete",
        "outer_loop",
        `Direction decided: ${direction}`
      );
    });

    // Route based on direction
    if (direction === "CONCLUDE") {
      await step.sendEvent("trigger-finalize", {
        name: RESEARCH_EVENTS.FINALIZE,
        data: { projectId },
      });
    } else {
      await step.sendEvent("continue-research", {
        name: RESEARCH_EVENTS.INNER_LOOP_TICK,
        data: { projectId },
      });
    }

    return { success: true, projectId, direction };
  }
);
