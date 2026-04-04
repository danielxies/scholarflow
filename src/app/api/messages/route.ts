import { z } from "zod";
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { inngest } from "@/inngest/client";
import { db } from "@/lib/local-db/client";

const requestSchema = z.object({
  conversationId: z.string(),
  message: z.string(),
});

export async function POST(request: Request) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { conversationId, message } = requestSchema.parse(body);

  const conversation = await db.query("system.getConversationById", {
    conversationId,
  }) as { projectId: string } | null;

  if (!conversation) {
    return NextResponse.json(
      { error: "Conversation not found" },
      { status: 404 }
    );
  }

  const projectId = conversation.projectId;

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
