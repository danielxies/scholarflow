import * as dbOps from "@/lib/db";

const RESUMABLE_STAGES = new Set([
  "ingest",
  "extract_claim",
  "plan_execution",
  "collect_source_pack",
  "synthesize_bundle",
  "validate_bundle",
  "compile_execution_spec",
  "submit_runner_job",
  "monitor_runner_job",
]);

function normalizeStage(stage: string | null | undefined, blockerType?: string | null) {
  if (
    blockerType &&
    [
      "dataset_credentials_required",
      "proprietary_api_required",
      "missing_external_asset",
    ].includes(blockerType)
  ) {
    return "submit_runner_job" as const;
  }

  if (stage === "monitor_runner_job") {
    return "submit_runner_job" as const;
  }

  if (stage && RESUMABLE_STAGES.has(stage)) {
    return stage as
      | "ingest"
      | "extract_claim"
      | "plan_execution"
      | "collect_source_pack"
      | "synthesize_bundle"
      | "validate_bundle"
      | "compile_execution_spec"
      | "submit_runner_job"
      | "monitor_runner_job";
  }

  return "monitor_runner_job" as const;
}

export function buildBlockerConversationMessage(blockerId: string) {
  const blocker = dbOps.getExperimentBlockerById(blockerId);
  if (!blocker) {
    throw new Error("Blocker not found");
  }

  const hypothesis = dbOps.getHypothesisById(blocker.hypothesisId);
  const experiment = dbOps.getExperimentById(blocker.experimentId);
  const plan = dbOps.getReproductionPlanByHypothesis(blocker.hypothesisId);

  const lines = [
    `This experiment is blocked and needs human input to continue.`,
    "",
    `Blocker: ${blocker.message}`,
  ];

  if (blocker.requiredInput) {
    lines.push(`Required input: ${blocker.requiredInput}`);
  }

  if (hypothesis?.phase) {
    lines.push(`Current phase: ${hypothesis.phase}`);
  }

  if (plan?.targetClaim) {
    lines.push(`Target claim: ${plan.targetClaim}`);
  }

  if (experiment?.executionMode) {
    lines.push(`Execution mode: ${experiment.executionMode}`);
  }

  lines.push("");
  lines.push("Reply with the missing information, credentials note, repo details, or execution constraints needed to resume this reproduction.");

  return lines.join("\n");
}

export function resumeBlockedExperiment(blockerId: string, resolution: string) {
  const blocker = dbOps.getExperimentBlockerById(blockerId);
  if (!blocker) {
    throw new Error("Blocker not found");
  }

  if (blocker.status !== "open") {
    throw new Error("Blocker is already resolved");
  }

  if (blocker.blockerType === "execution_backend_unavailable") {
    throw new Error(
      "This blocker is caused by deployment configuration and cannot be resumed through chat."
    );
  }

  const hypothesis = dbOps.getHypothesisById(blocker.hypothesisId);
  const experiment = dbOps.getExperimentById(blocker.experimentId);

  if (!hypothesis || !experiment) {
    throw new Error("Blocked experiment context not found");
  }

  const stage = normalizeStage(experiment.phase ?? hypothesis.phase, blocker.blockerType);

  dbOps.resolveExperimentBlocker(blockerId, resolution);
  dbOps.updateHypothesis(hypothesis._id, {
    status: "active",
    workflowStatus: "running",
    phase: stage,
    blockedAt: null,
  });
  dbOps.updateExperiment(experiment._id, {
    status: "running",
    workflowStatus: "running",
    phase: stage,
    progressDetails: "Resuming after blocker resolution",
  });
  dbOps.addExperimentLog({
    projectId: blocker.projectId,
    hypothesisId: blocker.hypothesisId,
    experimentId: blocker.experimentId,
    phase: stage,
    kind: "resolution",
    message: "Blocker resolved with human input. Resuming the experiment.",
    metadata: resolution,
  });
  dbOps.createWorkflowCheckpoint({
    projectId: blocker.projectId,
    hypothesisId: blocker.hypothesisId,
    experimentId: blocker.experimentId,
    stage,
    status: "resumed",
    payload: resolution,
  });

  return {
    projectId: blocker.projectId,
    hypothesisId: blocker.hypothesisId,
    experimentId: blocker.experimentId,
    stage,
  };
}
