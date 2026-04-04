import { inngest } from "@/inngest/client";
import { NonRetriableError } from "inngest";
import { db } from "@/lib/local-db/client";
import { callClaude } from "@/lib/claude-client";
import {
  CODING_AGENT_SYSTEM_PROMPT,
  TITLE_GENERATOR_SYSTEM_PROMPT,
} from "./constants";
import { DEFAULT_CONVERSATION_TITLE } from "../constants";
import {
  parseActions,
  executeActions,
  extractResponse,
  ACTION_INSTRUCTIONS,
} from "./action-executor";
import { buildSkillsContext } from "@/lib/skills-loader";
import * as dbOps from "@/lib/db";

interface MessageEvent {
  messageId: string;
  conversationId: string;
  projectId: string;
  message: string;
}

// Build a context dump of all project files for Claude
async function buildProjectContext(projectId: string): Promise<string> {
  const files = (await db.query("system.getProjectFiles", {
    projectId,
  })) as { _id: string; name: string; type: string; content?: string }[];

  if (files.length === 0) return "Project is empty — no files yet.";

  const parts: string[] = ["Current project files:"];
  for (const f of files) {
    if (f.type === "folder") {
      parts.push(`[folder] ${f.name} (id: ${f._id})`);
    } else {
      const preview = f.content
        ? f.content.length > 2000
          ? f.content.substring(0, 2000) + "\n... (truncated)"
          : f.content
        : "(empty)";
      parts.push(`--- ${f.name} (id: ${f._id}) ---\n${preview}`);
    }
  }
  return parts.join("\n\n");
}

export const processMessage = inngest.createFunction(
  {
    id: "process-message",
    cancelOn: [
      {
        event: "message/cancel",
        if: "event.data.messageId == async.data.messageId",
      },
    ],
    onFailure: async ({ event, step }) => {
      const { messageId } = event.data.event.data as MessageEvent;

      await step.run("update-message-on-failure", async () => {
        await db.mutation("system.updateMessageContent", {
          messageId,
          content:
            "Sorry, I encountered an error processing your request. Please try again.",
        });
      });
    },
  },
  { event: "message/sent" },
  async ({ event, step }) => {
    const { messageId, conversationId, projectId, message } =
      event.data as MessageEvent;

    await step.sleep("wait-for-db-sync", "500ms");

    // Get conversation
    const conversation = (await step.run("get-conversation", async () => {
      return await db.query("system.getConversationById", {
        conversationId,
      });
    })) as { title: string } | null;

    if (!conversation) {
      throw new NonRetriableError("Conversation not found");
    }

    // Get recent messages for context
    const recentMessages = (await step.run(
      "get-recent-messages",
      async () => {
        return await db.query("system.getRecentMessages", {
          conversationId,
          limit: 10,
        });
      }
    )) as { _id: string; role: string; content: string }[];

    // Generate title if needed
    if (conversation.title === DEFAULT_CONVERSATION_TITLE) {
      await step.run("generate-title", async () => {
        try {
          const title = await callClaude({
            prompt: `Generate a short title (3-6 words) for this conversation. The user said: "${message}". Return ONLY the title, nothing else.`,
            systemPrompt: TITLE_GENERATOR_SYSTEM_PROMPT,
            model: "haiku",
            maxTurns: 2,
          });
          const cleanTitle = title.trim().replace(/^["']|["']$/g, "");
          if (cleanTitle && cleanTitle.length < 60) {
            await db.mutation("system.updateConversationTitle", {
              conversationId,
              title: cleanTitle,
            });
          }
        } catch {
          // Title generation is non-critical, don't fail the whole request
        }
      });
    }

    // Run main agent
    const assistantResponse = await step.run("run-agent", async () => {
      // Build full context
      const projectContext = await buildProjectContext(projectId);

      const contextMessages = recentMessages.filter(
        (msg) => msg._id !== messageId && msg.content.trim() !== ""
      );
      const historyText =
        contextMessages.length > 0
          ? contextMessages
              .map((msg) => `${msg.role.toUpperCase()}: ${msg.content}`)
              .join("\n\n")
          : "";

      const fullPrompt = `${historyText ? `## Conversation History:\n${historyText}\n\n` : ""}## Project Files:\n${projectContext}\n\n## User Request:\n${message}`;

      // Build enhanced system prompt with skills, research state, and memory
      const projectSkills = dbOps.getProjectSkills(projectId);
      const skillsContext = projectSkills.length > 0
        ? buildSkillsContext(projectSkills.map((s) => s.skillId), 150)
        : "";
      const researchState = dbOps.getResearchState(projectId);
      const memories = dbOps.getResearchMemory(projectId).slice(0, 10);

      const systemPrompt = [
        CODING_AGENT_SYSTEM_PROMPT,
        "\n\n",
        ACTION_INSTRUCTIONS,
        skillsContext
          ? `\n\n# Active Research Skills\n\n${skillsContext}`
          : "",
        researchState && researchState.phase !== "idle"
          ? `\n\n# Current Research State\nPhase: ${researchState.phase}\nQuestion: ${researchState.researchQuestion}${researchState.findings ? `\nFindings:\n${researchState.findings.slice(0, 2000)}` : ""}`
          : "",
        memories.length > 0
          ? `\n\n# Research Memory\n${memories.map((m) => `- [${m.type}] ${m.content}`).join("\n")}`
          : "",
      ].join("");

      // Call Claude — allow a few turns in case the agent needs them
      let response: string;
      try {
        response = await callClaude({
          prompt: fullPrompt,
          systemPrompt,
          model: "sonnet",
          maxTurns: 3,
          allowedTools: [],
        });
      } catch (e) {
        return `I wasn't able to process that request. Error: ${e instanceof Error ? e.message : "unknown"}. Please try again.`;
      }

      // Parse and execute any actions
      const actions = parseActions(response);
      let actionResults = "";

      if (actions.length > 0) {
        const results = await executeActions(actions, projectId);
        actionResults = "\n\n---\n" + results.join("\n");
      }

      // Extract the text response
      const textResponse = extractResponse(response);

      return textResponse + actionResults;
    });

    // Save the response
    await step.run("update-assistant-message", async () => {
      await db.mutation("system.updateMessageContent", {
        messageId,
        content: assistantResponse,
      });
    });

    return { success: true, messageId, conversationId };
  }
);
