import { z } from "zod";
import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";

import { inngest } from "@/inngest/client";
import * as dbOps from "@/lib/db";
import { db } from "@/lib/local-db/client";
import { REPRODUCTION_EVENTS } from "@/features/reproduction/inngest/events";
import { resumeBlockedExperiment } from "@/features/reproduction/server/resume-blocked-experiment";

const requestSchema = z.object({
  conversationId: z.string(),
  message: z.string(),
});

export async function POST(request: Request) {
  const userId = await getSessionUserId();


  const body = await request.json();
  const { conversationId, message } = requestSchema.parse(body);

  const conversation = await db.query("system.getConversationById", {
    conversationId,
  }) as {
    projectId: string;
    contextType?: string | null;
    contextId?: string | null;
  } | null;

  if (!conversation) {
    return NextResponse.json(
      { error: "Conversation not found" },
      { status: 404 }
    );
  }

  const projectId = conversation.projectId;
  const project = dbOps.getProjectById(projectId);

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  if (project.ownerId !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Find all processing messages in this project
  const processingMessages = await db.query("system.getProcessingMessages", {
    projectId,
  }) as { _id: string }[];

  if (processingMessages.length > 0) {
    // Cancel all processing messages
    await Promise.all(
      processingMessages.map(async (msg: { _id: string }) => {
        await inngest.send({
          name: "message/cancel",
          data: { messageId: msg._id },
        });
        await db.mutation("system.updateMessageStatus", {
          messageId: msg._id,
          status: "cancelled",
        });
      })
    );
  }

  // Create user message
  await db.mutation("system.createMessage", {
    conversationId,
    projectId,
    role: "user",
    content: message,
  });

  // Create assistant message placeholder with processing status
  const assistantMessageId = await db.mutation("system.createMessage", {
    conversationId,
    projectId,
    role: "assistant",
    content: "",
    status: "processing",
  });

  if (
    conversation.contextType === "experiment_blocker" &&
    conversation.contextId
  ) {
    try {
      const resumed = resumeBlockedExperiment(
        conversation.contextId,
        message.trim()
      );

      await inngest.send({
        name: REPRODUCTION_EVENTS.STAGE,
        data: resumed,
      });

      await db.mutation("system.updateMessageContent", {
        messageId: assistantMessageId,
        content:
          "Blocker details recorded. The experiment has been resumed from its blocked stage.",
      });
      await db.mutation("system.updateMessageStatus", {
        messageId: assistantMessageId,
        status: "completed",
      });

      return NextResponse.json({
        success: true,
        messageId: assistantMessageId,
        resumed: true,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Unable to resume blocked experiment";

      await db.mutation("system.updateMessageContent", {
        messageId: assistantMessageId,
        content: `Unable to resume the blocked experiment: ${errorMessage}`,
      });
      await db.mutation("system.updateMessageStatus", {
        messageId: assistantMessageId,
        status: "completed",
      });

      return NextResponse.json({ error: errorMessage }, { status: 400 });
    }
  }

  // Trigger Inngest to process the message
  const event = await inngest.send({
    name: "message/sent",
    data: {
      messageId: assistantMessageId,
      conversationId,
      projectId,
      message,
    },
  });

  return NextResponse.json({
    success: true,
    eventId: event.ids[0],
    messageId: assistantMessageId,
  });
}
