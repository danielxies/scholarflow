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

export const useCreateConversation = () => {
  return useLocalMutation<{ projectId: string; title: string }, string>("conversations.create");
};
