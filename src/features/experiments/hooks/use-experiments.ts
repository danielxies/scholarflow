"use client";

import { useLocalQuery, useLocalMutation } from "@/lib/local-db/hooks";
import type { Id, Experiment } from "@/lib/local-db/types";

export const useExperiments = (projectId: Id<"projects"> | null) => {
  return useLocalQuery<Experiment[]>(
    "experiments.getByProject",
    projectId ? { projectId } : "skip"
  );
};

export const useExperimentsByHypothesis = (hypothesisId: Id<"hypotheses"> | null) => {
  return useLocalQuery<Experiment[]>(
    "experiments.getByHypothesis",
    hypothesisId ? { hypothesisId } : "skip"
  );
};

export const useCreateExperiment = () => {
  return useLocalMutation<{
    projectId: string;
    hypothesisId: string;
    name: string;
    protocol: string;
    skillsUsed: string;
    config: string;
  }>("experiments.create");
};

export const useUpdateExperimentStatus = () => {
  return useLocalMutation<{
    id: string;
    status: Experiment["status"];
  }>("experiments.updateStatus");
};

export const useUpdateExperimentResults = () => {
  return useLocalMutation<{
    id: string;
    results: string;
    metrics: string;
  }>("experiments.updateResults");
};
