"use client";

import { useLocalQuery, useLocalMutation } from "@/lib/local-db/hooks";
import type { Id, Conversation, Message } from "@/lib/local-db/types";

export const useConversation = (id: Id<"conversations"> | null) => {
  return useLocalQuery<Conversation>("conversations.getById", id ? { id } : "skip");
};

export const useMessages = (conversationId: Id<"conversations"> | null) => {
  return useLocalQuery<Message[]>(
    "conversations.getMessages",
    conversationId ? { conversationId } : "skip"
  );
};

export const useConversations = (projectId: Id<"projects">) => {
  return useLocalQuery<Conversation[]>("conversations.getByProject", { projectId });
};

export const useConversationByContext = (
  projectId: Id<"projects"> | null,
  contextType: Conversation["contextType"] | null,
  contextId: string | null
) => {
  return useLocalQuery<Conversation>(
    "conversations.getByContext",
    projectId && contextType && contextId
      ? {
          projectId,
          contextType,
          contextId,
        }
      : "skip"
  );
};

export const useCreateConversation = () => {
  return useLocalMutation<
    {
      projectId: string;
      title: string;
      contextType?: Conversation["contextType"] | null;
      contextId?: string | null;
      contextPayload?: string | null;
    },
    string
  >("conversations.create");
};
