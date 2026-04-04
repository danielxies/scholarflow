"use client";

import { useLocalQuery, useLocalMutation } from "@/lib/local-db/hooks";
import type { Id, Hypothesis } from "@/lib/local-db/types";

export const useHypotheses = (projectId: Id<"projects"> | null) => {
  return useLocalQuery<Hypothesis[]>(
    "hypotheses.getByProject",
    projectId ? { projectId } : "skip"
  );
};

export const useHypothesisById = (id: Id<"hypotheses"> | null) => {
  return useLocalQuery<Hypothesis>(
    "hypotheses.getById",
    id ? { id } : "skip"
  );
};

export const useCreateHypothesis = () => {
  return useLocalMutation<{
    projectId: string;
    title: string;
    description: string;
    rationale: string;
    expectedOutcome: string;
  }>("hypotheses.create");
};

export const useUpdateHypothesisStatus = () => {
  return useLocalMutation<{
    id: string;
    status: Hypothesis["status"];
    actualOutcome?: string;
  }>("hypotheses.updateStatus");
};
