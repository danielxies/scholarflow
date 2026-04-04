import { inngest } from "@/inngest/client";
import { callClaude } from "@/lib/claude-client";
import * as dbOps from "@/lib/db";
import { getSkillContent } from "@/lib/skills-loader";
import { parseActions, executeActions, extractResponse, ACTION_INSTRUCTIONS } from "@/features/conversations/inngest/action-executor";
import { FINALIZE_PROMPT } from "./prompts";
import { RESEARCH_EVENTS } from "./events";

interface FinalizeEvent {
  projectId: string;
}

export const researchFinalize = inngest.createFunction(
  {
    id: "research-finalize",
    cancelOn: [
      {
        event: RESEARCH_EVENTS.CANCEL,
        if: "event.data.projectId == async.data.projectId",
      },
    ],
    onFailure: async ({ event }) => {
      const { projectId } = event.data.event.data as FinalizeEvent;
      dbOps.addResearchLogEntry(projectId, "finalize_failed", "finalizing", "Finalization failed");
      dbOps.upsertResearchState(projectId, { phase: "idle" });
    },
  },
  { event: RESEARCH_EVENTS.FINALIZE },
  async ({ event, step }) => {
    const { projectId } = event.data as FinalizeEvent;

    // Set finalizing phase
    await step.run("set-finalizing-phase", () => {
      dbOps.upsertResearchState(projectId, { phase: "finalizing" });
      dbOps.addResearchLogEntry(projectId, "finalize_started", "finalizing", "Beginning paper drafting");
    });

    // Gather all research data
    const researchData = await step.run("gather-data", () => {
      const state = dbOps.getResearchState(projectId);
      const hypotheses = dbOps.getHypotheses(projectId);
      const experiments = dbOps.getExperiments(projectId);
      const papers = dbOps.getProjectPapers(projectId);
      const memories = dbOps.getResearchMemory(projectId);

      return { state, hypotheses, experiments, papers, memories };
    });

    // Draft the paper
    await step.run("draft-paper", async () => {
      const { state, hypotheses, experiments, papers, memories } = researchData;

      // Load ml-paper-writing skill if available
      const paperWritingSkill = getSkillContent("ml-paper-writing");
      const skillContext = paperWritingSkill?.content?.slice(0, 3000) ?? "";

      const hypothesisSummary = hypotheses
        .map((h) => `### ${h.title} [${h.status}]\n${h.description}\nExpected: ${h.expectedOutcome}\nActual: ${h.actualOutcome ?? "pending"}`)
        .join("\n\n");

      const experimentSummary = experiments
        .filter((e) => e.results)
        .map((e) => `### ${e.name} [${e.status}]\nProtocol: ${e.protocol}\nResults: ${e.results}\nMetrics: ${e.metrics}`)
        .join("\n\n");

      const paperRefs = papers
        .map((p) => {
          const authors = JSON.parse(p.authors || "[]");
          return `- ${authors[0] ?? "Unknown"} et al. (${p.year ?? "?"}) "${p.title}"`;
        })
        .join("\n");

      const memorySummary = memories
        .filter((m) => m.type === "discovery" || m.type === "insight")
        .map((m) => `- [${m.type}] ${m.content}`)
        .join("\n");

      const systemPrompt = [
        FINALIZE_PROMPT,
        "\n\n",
        ACTION_INSTRUCTIONS,
        skillContext ? `\n\n# Paper Writing Guide\n${skillContext}` : "",
      ].join("");

      const prompt = [
        `## Research Question\n${state?.researchQuestion ?? ""}`,
        `\n## Key Findings\n${state?.findings ?? ""}`,
        `\n## Hypotheses\n${hypothesisSummary}`,
        `\n## Experiments\n${experimentSummary}`,
        `\n## Literature\n${paperRefs}`,
        memorySummary ? `\n## Key Insights\n${memorySummary}` : "",
        `\n\nDraft the complete paper. Create LaTeX files for each section.`,
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

    // Mark complete
    await step.run("mark-complete", () => {
      dbOps.upsertResearchState(projectId, { phase: "completed" });
      dbOps.addResearchLogEntry(projectId, "research_completed", "completed", "Research finalized and paper drafted");
      dbOps.addResearchMemory(projectId, "decision", "Research completed. Paper drafted from all findings.", "autoresearch");
    });

    return { success: true, projectId };
  }
);
