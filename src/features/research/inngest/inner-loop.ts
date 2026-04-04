import { inngest } from "@/inngest/client";
import { callClaude } from "@/lib/claude-client";
import * as dbOps from "@/lib/db";
import { buildSkillsContext } from "@/lib/skills-loader";
import { parseActions, executeActions, extractResponse, ACTION_INSTRUCTIONS } from "@/features/conversations/inngest/action-executor";
import { INNER_LOOP_PROMPT } from "./prompts";
import { RESEARCH_EVENTS, MAX_INNER_LOOPS, OUTER_LOOP_INTERVAL } from "./events";

interface InnerLoopEvent {
  projectId: string;
}

export const researchInnerLoop = inngest.createFunction(
  {
    id: "research-inner-loop",
    cancelOn: [
      {
        event: RESEARCH_EVENTS.CANCEL,
        if: "event.data.projectId == async.data.projectId",
      },
    ],
    onFailure: async ({ event }) => {
      const { projectId } = event.data.event.data as InnerLoopEvent;
      dbOps.addResearchLogEntry(projectId, "inner_loop_error", "inner_loop", "Inner loop iteration failed");
    },
  },
  { event: RESEARCH_EVENTS.INNER_LOOP_TICK },
  async ({ event, step }) => {
    const { projectId } = event.data as InnerLoopEvent;

    // Check limits and load state
    const state = await step.run("check-state", () => {
      const s = dbOps.getResearchState(projectId);
      if (!s || s.phase === "idle" || s.phase === "completed") {
        return null; // Stop if research is not active
      }
      if (s.innerLoopCount >= MAX_INNER_LOOPS) {
        dbOps.upsertResearchState(projectId, { directionDecision: "CONCLUDE" });
        return null; // Hit max iterations, force conclude
      }
      return s;
    });

    if (!state) {
      // Force finalize if we hit the limit
      const currentState = dbOps.getResearchState(projectId);
      if (currentState && currentState.innerLoopCount >= MAX_INNER_LOOPS) {
        await step.sendEvent("force-finalize", {
          name: RESEARCH_EVENTS.FINALIZE,
          data: { projectId },
        });
      }
      return { success: true, stopped: true };
    }

    // Find current hypothesis
    const hypothesis = await step.run("get-hypothesis", () => {
      if (state.currentHypothesisId) {
        const h = dbOps.getHypothesisById(state.currentHypothesisId);
        if (h && h.status === "active") return h;
      }
      // Find any active hypothesis
      const hyps = dbOps.getHypotheses(projectId);
      const active = hyps.find((h) => h.status === "active");
      if (active) return active;
      // Promote a proposed one
      const proposed = hyps.find((h) => h.status === "proposed");
      if (proposed) {
        dbOps.updateHypothesisStatus(proposed._id, "active");
        return { ...proposed, status: "active" as const };
      }
      return null;
    });

    if (!hypothesis) {
      // No hypotheses to test, go to outer loop
      await step.sendEvent("no-hypothesis-outer", {
        name: RESEARCH_EVENTS.OUTER_LOOP_TICK,
        data: { projectId },
      });
      return { success: true, noHypothesis: true };
    }

    // Run experiment
    await step.run("run-experiment", async () => {
      const experiments = dbOps.getExperimentsByHypothesis(hypothesis._id);
      const projectSkills = dbOps.getProjectSkills(projectId);
      const skillsContext = projectSkills.length > 0
        ? buildSkillsContext(projectSkills.map((s) => s.skillId), 100)
        : "";
      const memories = dbOps.getResearchMemory(projectId).slice(0, 5);

      const systemPrompt = [
        INNER_LOOP_PROMPT,
        "\n\n",
        ACTION_INSTRUCTIONS,
        skillsContext ? `\n\n# Active Research Skills\n${skillsContext}` : "",
        memories.length > 0
          ? `\n\n# Research Memory\n${memories.map((m) => `- [${m.type}] ${m.content}`).join("\n")}`
          : "",
      ].join("");

      const priorResults = experiments
        .filter((e) => e.status === "completed" || e.status === "failed")
        .map((e) => `- ${e.name}: ${e.status} | Results: ${e.results ?? "none"} | Metrics: ${e.metrics}`)
        .join("\n");

      const prompt = [
        `## Current Hypothesis\n**${hypothesis.title}**\n${hypothesis.description}`,
        `\nExpected outcome: ${hypothesis.expectedOutcome}`,
        `\nRationale: ${hypothesis.rationale}`,
        priorResults ? `\n## Prior Experiments\n${priorResults}` : "",
        `\n## Current Findings\n${state.findings.slice(0, 1500)}`,
        `\n\nDesign and execute the next experiment to test this hypothesis.`,
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
    });

    // Update counters
    await step.run("update-counters", () => {
      const currentState = dbOps.getResearchState(projectId);
      const newInnerCount = (currentState?.innerLoopCount ?? 0) + 1;
      const newExpCount = (currentState?.experimentCount ?? 0) + 1;
      dbOps.upsertResearchState(projectId, {
        innerLoopCount: newInnerCount,
        experimentCount: newExpCount,
        currentHypothesisId: hypothesis._id,
      });
    });

    // Decide next step: inner loop or outer loop
    const updatedState = dbOps.getResearchState(projectId);
    const innerCount = updatedState?.innerLoopCount ?? 0;

    if (innerCount % OUTER_LOOP_INTERVAL === 0) {
      await step.sendEvent("trigger-outer-loop", {
        name: RESEARCH_EVENTS.OUTER_LOOP_TICK,
        data: { projectId },
      });
    } else {
      await step.sendEvent("continue-inner-loop", {
        name: RESEARCH_EVENTS.INNER_LOOP_TICK,
        data: { projectId },
      });
    }

    return { success: true, projectId, innerLoopCount: innerCount };
  }
);
