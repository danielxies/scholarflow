import { z } from "zod";
import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import * as dbOps from "@/lib/db";
import {
  CODING_AGENT_SYSTEM_PROMPT,
  TITLE_GENERATOR_SYSTEM_PROMPT,
} from "@/features/conversations/inngest/constants";
import { DEFAULT_CONVERSATION_TITLE } from "@/features/conversations/constants";
import {
  parseActions,
  executeActions,
  extractResponse,
  ACTION_INSTRUCTIONS,
} from "@/features/conversations/inngest/action-executor";
import { buildSkillsContext } from "@/lib/skills-loader";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY?.trim() ?? "";

const requestSchema = z.object({
  conversationId: z.string(),
  message: z.string(),
});

function resolveModel(): string {
  return "claude-sonnet-4-6";
}

export async function POST(request: Request) {
  const userId = await getSessionUserId();
  const body = await request.json();
  const { conversationId, message } = requestSchema.parse(body);

  const conversation = dbOps.getConversationById(conversationId) as {
    projectId: string;
    title?: string;
  } | null;

  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  const projectId = conversation.projectId;
  const project = dbOps.getProjectById(projectId);

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // Create user message
  dbOps.createMessage(conversationId, projectId, "user", message);

  // Create assistant placeholder
  const assistantMessageId = dbOps.createMessage(
    conversationId,
    projectId,
    "assistant",
    "",
    "processing"
  );

  // Build context
  const files = dbOps.getFiles(projectId);
  let projectContext = "Project is empty — no files yet.";
  if (files.length > 0) {
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
    projectContext = parts.join("\n\n");
  }

  const recentMessages = dbOps.getRecentMessages(conversationId, 10);
  const contextMessages = recentMessages.filter(
    (msg) => msg._id !== assistantMessageId && msg.content.trim() !== ""
  );
  const historyText =
    contextMessages.length > 0
      ? contextMessages
          .map((msg) => `${msg.role.toUpperCase()}: ${msg.content}`)
          .join("\n\n")
      : "";

  const fullPrompt = `${historyText ? `## Conversation History:\n${historyText}\n\n` : ""}## Project Files:\n${projectContext}\n\n## User Request:\n${message}`;

  // Build system prompt
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
    skillsContext ? `\n\n# Active Research Skills\n\n${skillsContext}` : "",
    researchState && researchState.phase !== "idle"
      ? `\n\n# Current Research State\nPhase: ${researchState.phase}\nQuestion: ${researchState.researchQuestion}${researchState.findings ? `\nFindings:\n${researchState.findings.slice(0, 2000)}` : ""}`
      : "",
    memories.length > 0
      ? `\n\n# Research Memory\n${memories.map((m) => `- [${m.type}] ${m.content}`).join("\n")}`
      : "",
  ].join("");

  // Generate title in background (non-blocking)
  if (conversation.title === DEFAULT_CONVERSATION_TITLE) {
    generateTitle(conversationId, message).catch(() => {});
  }

  // Stream from Anthropic
  const anthropicRes = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: resolveModel(),
      max_tokens: 4096,
      stream: true,
      system: systemPrompt,
      messages: [{ role: "user", content: fullPrompt }],
    }),
  });

  if (!anthropicRes.ok || !anthropicRes.body) {
    const errText = await anthropicRes.text();
    dbOps.updateMessageContent(assistantMessageId, `Error: ${errText.slice(0, 200)}`);
    dbOps.updateMessageStatus(assistantMessageId, "completed");
    return NextResponse.json({ error: errText }, { status: 500 });
  }

  // Transform the SSE stream
  const reader = anthropicRes.body.getReader();
  const decoder = new TextDecoder();
  let fullText = "";

  const stream = new ReadableStream({
    async start(controller) {
      let buffer = "";
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6);
            if (data === "[DONE]") continue;

            try {
              const event = JSON.parse(data);
              if (
                event.type === "content_block_delta" &&
                event.delta?.type === "text_delta" &&
                event.delta?.text
              ) {
                fullText += event.delta.text;
                controller.enqueue(new TextEncoder().encode(event.delta.text));
              }
            } catch {
              // skip malformed JSON
            }
          }
        }

        // Process actions and save
        const actions = parseActions(fullText);
        if (actions.length > 0) {
          await executeActions(actions, projectId);
        }
        const textResponse = extractResponse(fullText);
        dbOps.updateMessageContent(assistantMessageId, textResponse);
        dbOps.updateMessageStatus(assistantMessageId, "completed");

        controller.close();
      } catch (err) {
        dbOps.updateMessageContent(
          assistantMessageId,
          fullText || "An error occurred while streaming."
        );
        dbOps.updateMessageStatus(assistantMessageId, "completed");
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Transfer-Encoding": "chunked",
      "Cache-Control": "no-cache",
    },
  });
}

async function generateTitle(conversationId: string, message: string) {
  const res = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 60,
      system: TITLE_GENERATOR_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Generate a short title (3-6 words) for this conversation. The user said: "${message}". Return ONLY the title, nothing else.`,
        },
      ],
    }),
  });

  if (!res.ok) return;
  const data = await res.json();
  const title = (data.content?.[0]?.text ?? "").trim().replace(/^["']|["']$/g, "");
  if (title && title.length < 60) {
    dbOps.updateConversationTitle(conversationId, title);
  }
}
