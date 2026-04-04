"use client";

import { useLocalQuery, useLocalMutation } from "@/lib/local-db/hooks";
import type { Id, ResearchState } from "@/lib/local-db/types";

export const useResearchState = (projectId: Id<"projects"> | null) => {
  return useLocalQuery<ResearchState | undefined>(
    "researchState.get",
    projectId ? { projectId } : "skip"
  );
};

export const useUpsertResearchState = () => {
  return useLocalMutation<{
    projectId: string;
    updates: Partial<Omit<ResearchState, "_id" | "_creationTime" | "projectId">>;
  }>("researchState.upsert");
};
