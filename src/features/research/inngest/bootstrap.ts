import { inngest } from "@/inngest/client";
import { NonRetriableError } from "inngest";
import { callClaude } from "@/lib/claude-client";
import * as dbOps from "@/lib/db";
import { buildSkillsContext, getSkillContent } from "@/lib/skills-loader";
import { parseActions, executeActions, extractResponse, ACTION_INSTRUCTIONS } from "@/features/conversations/inngest/action-executor";
import { BOOTSTRAP_PROMPT } from "./prompts";
import { RESEARCH_EVENTS } from "./events";

interface ResearchStartEvent {
  projectId: string;
  researchQuestion: string;
  userId: string;
}

export const researchBootstrap = inngest.createFunction(
  {
    id: "research-bootstrap",
    cancelOn: [
      {
        event: RESEARCH_EVENTS.CANCEL,
        if: "event.data.projectId == async.data.projectId",
      },
    ],
    onFailure: async ({ event }) => {
      const { projectId } = event.data.event.data as ResearchStartEvent;
      dbOps.upsertResearchState(projectId, { phase: "idle" });
      dbOps.addResearchLogEntry(projectId, "bootstrap_failed", "bootstrap", "Bootstrap phase failed with an error");
    },
  },
  { event: RESEARCH_EVENTS.START },
  async ({ event, step }) => {
    const { projectId, researchQuestion } = event.data as ResearchStartEvent;

    // Update state to bootstrap
    await step.run("set-bootstrap-phase", () => {
      dbOps.upsertResearchState(projectId, {
        phase: "bootstrap",
        researchQuestion,
      });
      dbOps.addResearchLogEntry(projectId, "bootstrap_started", "bootstrap", `Research question: ${researchQuestion}`);
    });

    // Load autoresearch skill context if available
    const skillContext = await step.run("load-skill-context", () => {
      const autoresearch = getSkillContent("autoresearch");
      const projectSkills = dbOps.getProjectSkills(projectId);
      const activeContext = projectSkills.length > 0
        ? buildSkillsContext(projectSkills.map((s) => s.skillId), 100)
        : "";
      return {
        autoresearchContext: autoresearch?.content?.slice(0, 3000) ?? "",
        activeSkillsContext: activeContext,
      };
    });

    // Run bootstrap agent
    const result = await step.run("run-bootstrap-agent", async () => {
      const systemPrompt = [
        BOOTSTRAP_PROMPT,
        "\n\n",
        ACTION_INSTRUCTIONS,
        skillContext.autoresearchContext
          ? `\n\n# Autoresearch Methodology\n${skillContext.autoresearchContext}`
          : "",
        skillContext.activeSkillsContext
          ? `\n\n# Available Research Skills\n${skillContext.activeSkillsContext}`
          : "",
      ].join("");

      const prompt = `## Research Question\n${researchQuestion}\n\nBegin the bootstrap phase. Search for relevant literature, identify gaps, and formulate testable hypotheses.`;

      const response = await callClaude({
        prompt,
        systemPrompt,
        model: "sonnet",
        maxTurns: 3,
        allowedTools: [],
      });

      // Execute actions
      const actions = parseActions(response);
      if (actions.length > 0) {
        await executeActions(actions, projectId);
      }

      return extractResponse(response);
    });

    // Transition to inner loop
    await step.run("transition-to-inner-loop", () => {
      const hypotheses = dbOps.getHypotheses(projectId);
      if (hypotheses.length === 0) {
        throw new NonRetriableError("Bootstrap failed to generate any hypotheses");
      }

      // Set the first proposed hypothesis as active
      const firstProposed = hypotheses.find((h) => h.status === "proposed");
      if (firstProposed) {
        dbOps.updateHypothesisStatus(firstProposed._id, "active");
        dbOps.upsertResearchState(projectId, {
          phase: "inner_loop",
          currentHypothesisId: firstProposed._id,
          findings: result,
        });
      } else {
        dbOps.upsertResearchState(projectId, {
          phase: "inner_loop",
          findings: result,
        });
      }

      dbOps.addResearchLogEntry(
        projectId,
        "bootstrap_complete",
        "bootstrap",
        `Generated ${hypotheses.length} hypotheses. Transitioning to inner loop.`
      );
    });

    // Send inner loop tick
    await step.sendEvent("start-inner-loop", {
      name: RESEARCH_EVENTS.INNER_LOOP_TICK,
      data: { projectId },
    });

    return { success: true, projectId };
  }
);
