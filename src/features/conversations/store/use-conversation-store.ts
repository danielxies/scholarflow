import { create } from "zustand";

import { Id } from "@/lib/local-db/types";

interface ConversationStore {
  selectedByProject: Map<Id<"projects">, Id<"conversations"> | null>;
  getSelectedConversationId: (
    projectId: Id<"projects">
  ) => Id<"conversations"> | null;
  setSelectedConversationId: (
    projectId: Id<"projects">,
    conversationId: Id<"conversations"> | null
  ) => void;
}

export const useConversationStore = create<ConversationStore>()((set, get) => ({
  selectedByProject: new Map(),

  getSelectedConversationId: (projectId) => {
    return get().selectedByProject.get(projectId) ?? null;
  },

  setSelectedConversationId: (projectId, conversationId) => {
    const next = new Map(get().selectedByProject);
    next.set(projectId, conversationId);
    set({ selectedByProject: next });
  },
}));
