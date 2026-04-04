"use client";

import { useLocalQuery } from "@/lib/local-db/hooks";
import type { Id, ResearchLogEntry } from "@/lib/local-db/types";

export const useResearchLog = (projectId: Id<"projects"> | null, limit?: number) => {
  return useLocalQuery<ResearchLogEntry[]>(
    "researchLog.get",
    projectId
      ? limit !== undefined
        ? { projectId, limit }
        : { projectId }
      : "skip"
  );
};
