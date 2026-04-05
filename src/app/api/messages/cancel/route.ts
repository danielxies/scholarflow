import { z } from "zod";
import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";

import { inngest } from "@/inngest/client";
import { db } from "@/lib/local-db/client";

const requestSchema = z.object({
  projectId: z.string(),
});

export async function POST(request: Request) {
  const userId = await getSessionUserId();


  const body = await request.json();
  const { projectId } = requestSchema.parse(body);

  // Find all processing messages in this project
  const processingMessages = await db.query("system.getProcessingMessages", {
    projectId,
  }) as { _id: string }[];

  if (processingMessages.length === 0) {
    return NextResponse.json({ success: true, cancelled: false });
  }

  // Cancel all processing messages
  const cancelledIds = await Promise.all(
    processingMessages.map(async (msg: { _id: string }) => {
      await inngest.send({
        name: "message/cancel",
        data: { messageId: msg._id },
      });
      await db.mutation("system.updateMessageStatus", {
        messageId: msg._id,
        status: "cancelled",
      });
      return msg._id;
    })
  );

  return NextResponse.json({
    success: true,
    cancelled: true,
    messageIds: cancelledIds,
  });
}
