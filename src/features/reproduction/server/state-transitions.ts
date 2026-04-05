import * as dbOps from "@/lib/db";

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function blockExperiment(params: {
  projectId: string;
  hypothesisId: string;
  experimentId: string;
  phase: string;
  blockerType: string;
  message: string;
  requiredInput?: string | null;
  payload?: unknown;
}) {
  const existing = dbOps.getOpenExperimentBlocker(params.hypothesisId);
  const blockerId =
    existing &&
    existing.experimentId === params.experimentId &&
    existing.blockerType === params.blockerType &&
    existing.message === params.message
      ? existing._id
      : dbOps.createExperimentBlocker({
          projectId: params.projectId,
          hypothesisId: params.hypothesisId,
          experimentId: params.experimentId,
          blockerType: params.blockerType,
          message: params.message,
          requiredInput: params.requiredInput ?? null,
        });

  dbOps.updateHypothesis(params.hypothesisId, {
    workflowStatus: "blocked",
    phase: params.phase,
    blockedAt: Date.now(),
  });
  dbOps.updateExperiment(params.experimentId, {
    status: "running",
    workflowStatus: "blocked",
    phase: params.phase,
    progressDetails: params.message,
  });
  dbOps.addExperimentLog({
    projectId: params.projectId,
    hypothesisId: params.hypothesisId,
    experimentId: params.experimentId,
    phase: params.phase,
    kind: "blocker",
    message: params.message,
    metadata: params.requiredInput ?? null,
  });
  dbOps.createWorkflowCheckpoint({
    projectId: params.projectId,
    hypothesisId: params.hypothesisId,
    experimentId: params.experimentId,
    stage: params.phase,
    status: "blocked",
    payload: params.payload === undefined ? null : safeStringify(params.payload),
  });

  return blockerId;
}

export function failExperiment(params: {
  projectId: string;
  hypothesisId: string;
  experimentId: string;
  phase: string;
  message: string;
  hypothesisStatus?: "failed" | "completed" | "active";
  workflowStatus?: string;
  payload?: unknown;
}) {
  dbOps.updateHypothesis(params.hypothesisId, {
    status: params.hypothesisStatus ?? "failed",
    workflowStatus: params.workflowStatus ?? "not_reproduced",
    phase: params.phase,
    blockedAt: null,
  });
  dbOps.updateExperiment(params.experimentId, {
    status: "failed",
    workflowStatus: "failed",
    phase: params.phase,
    completedAt: Date.now(),
    progressDetails: params.message,
  });
  dbOps.addExperimentLog({
    projectId: params.projectId,
    hypothesisId: params.hypothesisId,
    experimentId: params.experimentId,
    phase: params.phase,
    kind: "failure",
    message: params.message,
    metadata: null,
  });
  dbOps.createWorkflowCheckpoint({
    projectId: params.projectId,
    hypothesisId: params.hypothesisId,
    experimentId: params.experimentId,
    stage: params.phase,
    status: "failed",
    payload: params.payload === undefined ? null : safeStringify(params.payload),
  });
}
