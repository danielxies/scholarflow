import { z } from "zod";
import { NonRetriableError } from "inngest";

import { extractJsonPayload } from "@/lib/ai-json";
import { callClaude } from "@/lib/claude-client";
import * as dbOps from "@/lib/db";
import { inngest } from "@/inngest/client";
import { REPRODUCTION_EVENTS } from "./events";
import {
  buildCompactSynthesisPack,
  MAX_BUNDLE_REPAIR_ATTEMPTS,
  preflightExecutionBundle,
  buildExecutionSourcePack,
  compileExecutionSpec,
  ExecutionPlanningBlockerError,
  extractSynthesisDiagnostics,
  generateExecutionPlannerOutput,
  repairExecutionBundle,
  serializeExecutionPlanningBlocker,
  synthesizeExecutionBundle,
  validateExecutionBundle,
  type BundleRepairAttemptRecord,
  type ExecutionPlannerOutput,
  type ExecutionSpec,
  type ExecutionSourcePack,
  type NormalizedExecutionBundle,
} from "@/features/reproduction/server/execution-spec";
import { inspectGitHubRepository } from "@/features/reproduction/server/github-inspector";
import {
  ModalRunnerContractError,
  preflightModalExecution,
  submitModalExecution,
} from "@/features/reproduction/server/modal-runner";
import { getRunnerCallbackSecret } from "@/features/reproduction/server/runner-config";
import {
  blockExperiment,
  failExperiment,
} from "@/features/reproduction/server/state-transitions";
import { generateReproductionReport } from "@/features/reproduction/server/report-generation";

type ReproductionStage =
  | "ingest"
  | "extract_claim"
  | "plan_execution"
  | "collect_source_pack"
  | "synthesize_bundle"
  | "validate_bundle"
  | "compile_execution_spec"
  | "preflight_bundle"
  | "submit_runner_job"
  | "monitor_runner_job"
  | "extract_results"
  | "compare_results"
  | "generate_report";

interface ReproductionStageEvent {
  projectId: string;
  hypothesisId: string;
  experimentId: string;
  stage: ReproductionStage;
}

const claimSchema = z.object({
  targetClaim: z.string().min(1),
  targetMetric: z.string().nullable(),
  targetValue: z.number().nullable(),
  tolerance: z.number().min(0).max(100).nullable(),
});

const normalizedResultsSchema = z.object({
  bestValue: z.number().nullable(),
  normalizedMetric: z.string().nullable(),
  evidence: z.string().nullable(),
  confidence: z.number().min(0).max(1).nullable(),
});

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function parseAppBaseUrl(environmentSpec: string | null | undefined) {
  if (!environmentSpec) {
    return "";
  }

  try {
    const parsed = JSON.parse(environmentSpec) as { appBaseUrl?: string };
    return parsed.appBaseUrl ?? "";
  } catch {
    return "";
  }
}

function stageProgress(stage: ReproductionStage): number {
  switch (stage) {
    case "ingest":
      return 8;
    case "extract_claim":
      return 18;
    case "plan_execution":
      return 28;
    case "collect_source_pack":
      return 40;
    case "synthesize_bundle":
      return 52;
    case "validate_bundle":
      return 62;
    case "compile_execution_spec":
      return 72;
    case "preflight_bundle":
      return 78;
    case "submit_runner_job":
      return 82;
    case "monitor_runner_job":
      return 88;
    case "extract_results":
      return 94;
    case "compare_results":
      return 97;
    case "generate_report":
      return 100;
  }
}

function nextStage(stage: ReproductionStage): ReproductionStage | null {
  switch (stage) {
    case "ingest":
      return "extract_claim";
    case "extract_claim":
      return "plan_execution";
    case "plan_execution":
      return "collect_source_pack";
    case "collect_source_pack":
      return "synthesize_bundle";
    case "synthesize_bundle":
      return "validate_bundle";
    case "validate_bundle":
      return "compile_execution_spec";
    case "compile_execution_spec":
      return "preflight_bundle";
    case "preflight_bundle":
      return "submit_runner_job";
    case "submit_runner_job":
      return "monitor_runner_job";
    case "monitor_runner_job":
      return null;
    case "extract_results":
      return "compare_results";
    case "compare_results":
      return "generate_report";
    case "generate_report":
      return null;
  }
}

function fallbackClaim(paper: NonNullable<ReturnType<typeof dbOps.getPaperById>>) {
  const abstract = (paper.abstract ?? "").toLowerCase();

  if (abstract.includes("accuracy")) {
    return {
      targetClaim: `Main reported accuracy result for ${paper.title}`,
      targetMetric: "accuracy",
      targetValue: null,
      tolerance: 1.0,
    };
  }

  if (abstract.includes("f1")) {
    return {
      targetClaim: `Main reported F1 result for ${paper.title}`,
      targetMetric: "f1",
      targetValue: null,
      tolerance: 1.0,
    };
  }

  return {
    targetClaim: `Main reported result for ${paper.title}`,
    targetMetric: null,
    targetValue: null,
    tolerance: 1.0,
  };
}

async function extractClaim(
  paper: NonNullable<ReturnType<typeof dbOps.getPaperById>>
) {
  const prompt = [
    `Title: ${paper.title}`,
    `Year: ${paper.year ?? "Unknown"}`,
    `Venue: ${paper.venue ?? "Unknown"}`,
    `Summary: ${paper.aiSummary ?? "Unavailable"}`,
    `Abstract: ${paper.abstract ?? "Unavailable"}`,
    "",
    "Identify the main result to reproduce conservatively.",
    'Return strict JSON with keys "targetClaim", "targetMetric", "targetValue", and "tolerance".',
    "targetMetric should be a short snake_case metric name or null.",
    "targetValue should be numeric if clearly stated, else null.",
    "tolerance should be a small positive number if targetValue is known, else 1.0.",
  ].join("\n");

  try {
    const response = await callClaude({
      prompt,
      systemPrompt:
        "You extract reproduction targets from paper metadata. Return only valid JSON.",
      model: "sonnet",
      maxTurns: 1,
      allowedTools: [],
    });
    return claimSchema.parse(JSON.parse(extractJsonPayload(response)) as unknown);
  } catch {
    return fallbackClaim(paper);
  }
}

function parseArtifactJson<T>(artifact: dbOps.ExperimentArtifact | undefined | null): T | null {
  if (!artifact?.metadata) {
    return null;
  }

  try {
    return JSON.parse(artifact.metadata) as T;
  } catch {
    return null;
  }
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function fallbackNormalizedResults(params: {
  targetMetric: string | null | undefined;
  experiment: dbOps.Experiment;
  logs: dbOps.ExperimentLogEntry[];
  executionJob: dbOps.ExecutionJob | null;
}) {
  const haystack = [
    params.executionJob?.resultSummary ?? "",
    params.experiment.results ?? "",
    ...params.logs.slice(0, 20).map((log) => log.message),
  ].join("\n");

  const metric = params.targetMetric ?? null;
  if (metric) {
    const regex = new RegExp(
      `${escapeRegExp(metric).replace(/_/g, "[_\\s-]?")}[^\\d-]{0,20}([0-9]+(?:\\.[0-9]+)?)`,
      "i"
    );
    const match = haystack.match(regex);
    if (match) {
      return {
        bestValue: Number(match[1]),
        normalizedMetric: metric,
        evidence: match[0],
        confidence: 0.45,
      };
    }
  }

  const generic = haystack.match(/([0-9]+(?:\.[0-9]+)?)/);
  if (generic) {
    return {
      bestValue: Number(generic[1]),
      normalizedMetric: metric,
      evidence: generic[0],
      confidence: 0.2,
    };
  }

  return {
    bestValue: null,
    normalizedMetric: metric,
    evidence: null,
    confidence: null,
  };
}

async function extractNormalizedResults(params: {
  paper: dbOps.Paper;
  hypothesis: dbOps.Hypothesis;
  plan: dbOps.ReproductionPlan;
  experiment: dbOps.Experiment;
  logs: dbOps.ExperimentLogEntry[];
  executionJob: dbOps.ExecutionJob | null;
}) {
  const prompt = [
    `Paper title: ${params.paper.title}`,
    `Target claim: ${params.plan.targetClaim}`,
    `Target metric: ${params.plan.targetMetric ?? "unknown"}`,
    `Target value: ${params.plan.targetValue ?? "unknown"}`,
    "",
    `Runner summary: ${params.executionJob?.resultSummary ?? "Unavailable"}`,
    "",
    "Recent execution logs:",
    params.logs
      .slice(0, 20)
      .map((log) => `- [${log.phase}/${log.kind}] ${log.message}`)
      .join("\n") || "No logs available",
    "",
    'Return strict JSON with keys "bestValue", "normalizedMetric", "evidence", and "confidence".',
    "bestValue should be numeric if a reproduced metric is visible, else null.",
    "normalizedMetric should be the metric name you used, else null.",
    "evidence should be a short summary of where the metric came from, else null.",
  ].join("\n");

  try {
    const response = await callClaude({
      prompt,
      systemPrompt:
        "You extract the best reproduced metric value from execution logs and summaries. Return only valid JSON.",
      model: "sonnet",
      maxTurns: 1,
      allowedTools: [],
    });

    return normalizedResultsSchema.parse(
      JSON.parse(extractJsonPayload(response)) as unknown
    );
  } catch {
    return fallbackNormalizedResults({
      targetMetric: params.hypothesis.targetMetric ?? params.plan.targetMetric,
      experiment: params.experiment,
      logs: params.logs,
      executionJob: params.executionJob,
    });
  }
}

function resolveVerdict(params: {
  bestValue: number | null;
  targetValue: number | null;
  tolerance: number | null;
}) {
  const tolerance = params.tolerance ?? 1.0;

  if (typeof params.bestValue !== "number" || Number.isNaN(params.bestValue)) {
    return {
      workflowStatus: "partially_reproduced" as const,
      verdict: "Partially Reproduced",
      gap: null,
      hypothesisStatus: "completed" as const,
    };
  }

  if (typeof params.targetValue !== "number" || Number.isNaN(params.targetValue)) {
    return {
      workflowStatus: "partially_reproduced" as const,
      verdict: "Partially Reproduced",
      gap: null,
      hypothesisStatus: "completed" as const,
    };
  }

  const gap = Math.abs(params.targetValue - params.bestValue);
  if (gap <= tolerance) {
    return {
      workflowStatus: "reproduced" as const,
      verdict: "Reproduced",
      gap,
      hypothesisStatus: "completed" as const,
    };
  }

  if (gap <= tolerance * 1.5) {
    return {
      workflowStatus: "approximately_reproduced" as const,
      verdict: "Approximately Reproduced",
      gap,
      hypothesisStatus: "completed" as const,
    };
  }

  return {
    workflowStatus: "not_reproduced" as const,
    verdict: "Not Reproduced",
    gap,
    hypothesisStatus: "failed" as const,
  };
}

export const reproductionStage = inngest.createFunction(
  {
    id: "reproduction-stage",
    cancelOn: [
      {
        event: REPRODUCTION_EVENTS.CANCEL,
        if: "event.data.experimentId == async.data.experimentId",
      },
    ],
    onFailure: async ({ event }) => {
      const { projectId, hypothesisId, experimentId, stage } =
        event.data.event.data as ReproductionStageEvent;

      failExperiment({
        projectId,
        hypothesisId,
        experimentId,
        phase: stage,
        message: `Reproduction stage ${stage} failed.`,
      });
    },
  },
  { event: REPRODUCTION_EVENTS.STAGE },
  async ({ event, step }) => {
    const { projectId, hypothesisId, experimentId, stage } =
      event.data as ReproductionStageEvent;

    const workspace = await step.run("load-workspace", async () => {
      return dbOps.getExperimentWorkspace(hypothesisId);
    });

    if (!workspace?.experiment || !workspace.plan) {
      throw new NonRetriableError("Experiment workspace not found");
    }

    const paper = await step.run("load-paper", async () => {
      return workspace.hypothesis.paperId
        ? dbOps.getPaperById(workspace.hypothesis.paperId)
        : undefined;
    });

    if (!paper) {
      throw new NonRetriableError("Paper not found for reproduction");
    }

    await step.run(`stage-${stage}-checkpoint`, async () => {
      const workflowStatus =
        stage === "plan_execution" ||
        stage === "collect_source_pack" ||
        stage === "synthesize_bundle" ||
        stage === "validate_bundle" ||
        stage === "compile_execution_spec" ||
        stage === "preflight_bundle"
          ? "planned"
          : stage === "generate_report"
            ? (workspace.hypothesis.workflowStatus ?? "running")
          : "running";

      dbOps.updateHypothesis(hypothesisId, {
        workflowStatus,
        phase: stage,
        blockedAt: null,
      });
      dbOps.updateExperiment(experimentId, {
        status: "running",
        workflowStatus:
          stage === "generate_report"
            ? (workspace.experiment?.workflowStatus ?? workflowStatus)
            : workflowStatus,
        phase: stage,
        progressPercent: stageProgress(stage),
        progressDetails: `Running ${stage.replace(/_/g, " ")}`,
        startedAt: workspace.experiment!.startedAt ?? Date.now(),
      });
      dbOps.addExperimentLog({
        projectId,
        hypothesisId,
        experimentId,
        phase: stage,
        kind: "stage",
        message: `Entering ${stage.replace(/_/g, " ")} stage.`,
        metadata: null,
      });
      dbOps.createWorkflowCheckpoint({
        projectId,
        hypothesisId,
        experimentId,
        stage,
        status: "started",
        payload: null,
      });
    });

    try {
      switch (stage) {
        case "ingest": {
          await step.run("ingest-paper-context", async () => {
            dbOps.addExperimentFinding({
              projectId,
              hypothesisId,
              experimentId,
              type: "assumption",
              severity: "info",
              confidence: 0.8,
              source: "paper_metadata",
              message: `Paper classified as ${paper.paperType ?? "other"} with ${paper.supportabilityLabel ?? "unknown"} supportability.`,
              metadata: null,
            });

            if (paper.officialRepoUrl) {
              dbOps.addExperimentFinding({
                projectId,
                hypothesisId,
                experimentId,
                type: "match",
                severity: "info",
                confidence: 0.9,
                source: "paper_metadata",
                message:
                  "Official repository detected and selected as the preferred execution path.",
                metadata: paper.officialRepoUrl,
              });
            }
          });
          break;
        }

        case "extract_claim": {
          const claim = await step.run("extract-main-claim", async () => extractClaim(paper));

          await step.run("persist-main-claim", async () => {
            dbOps.updateHypothesis(hypothesisId, {
              targetMetric: claim.targetMetric,
              targetValue: claim.targetValue,
              tolerance: claim.tolerance,
              phase: "planning",
            });

            dbOps.updateReproductionPlan(workspace.plan!._id, {
              targetClaim: claim.targetClaim,
              targetMetric: claim.targetMetric,
              targetValue: claim.targetValue,
              tolerance: claim.tolerance,
            });

            dbOps.addExperimentFinding({
              projectId,
              hypothesisId,
              experimentId,
              type: "assumption",
              severity: "info",
              confidence: 0.65,
              source: "paper_text",
              message: `Primary target claim selected: ${claim.targetClaim}`,
              metadata: safeStringify(claim),
            });
          });
          break;
        }

        case "plan_execution": {
          const repoContext = await step.run("inspect-official-repo", async () => {
            return inspectGitHubRepository(paper.officialRepoUrl);
          });
          const plannerOutput = await step.run("generate-planner-output", async () => {
            return generateExecutionPlannerOutput({
              paper,
              hypothesis: workspace.hypothesis,
              experiment: workspace.experiment!,
              plan: workspace.plan!,
              repoContext,
              appBaseUrl: "",
            });
          });

          await step.run("persist-planner-output", async () => {
            dbOps.addExperimentArtifact({
              projectId,
              hypothesisId,
              experimentId,
              type: "planner_output",
              uri: `inline://planner/${experimentId}`,
              metadata: safeStringify({
                plannerOutput,
                repoContext,
              }),
            });

            plannerOutput.assumptions.forEach((assumption) => {
              dbOps.addExperimentFinding({
                projectId,
                hypothesisId,
                experimentId,
                type: "assumption",
                severity: "info",
                confidence: 0.7,
                source: "planner",
                message: assumption,
                metadata: null,
              });
            });

            dbOps.addExperimentLog({
              projectId,
              hypothesisId,
              experimentId,
              phase: "plan_execution",
              kind: "planning",
              message:
                "Generated the initial execution plan from paper metadata and repository evidence.",
              metadata: null,
            });
          });
          break;
        }

        case "collect_source_pack": {
          const plannerArtifact = dbOps.getLatestExperimentArtifactByType(
            experimentId,
            "planner_output"
          );
          const plannerArtifactPayload = parseArtifactJson<{
            plannerOutput: ExecutionPlannerOutput;
            repoContext: Awaited<ReturnType<typeof inspectGitHubRepository>>;
          }>(plannerArtifact);

          if (!plannerArtifactPayload?.plannerOutput) {
            throw new NonRetriableError("Planner output artifact not found");
          }

          const sourcePack = await step.run("build-source-pack", async () =>
            buildExecutionSourcePack({
              context: {
                paper,
                hypothesis: workspace.hypothesis,
                experiment: workspace.experiment!,
                plan: workspace.plan!,
                repoContext: plannerArtifactPayload.repoContext ?? null,
                appBaseUrl: parseAppBaseUrl(workspace.plan?.environmentSpec),
              },
              plannerOutput: plannerArtifactPayload.plannerOutput,
            })
          );

          await step.run("persist-source-pack", async () => {
            dbOps.addExperimentArtifact({
              projectId,
              hypothesisId,
              experimentId,
              type: "source_pack",
              uri: `inline://source-pack/${experimentId}`,
              metadata: safeStringify(sourcePack),
            });

            dbOps.addExperimentLog({
              projectId,
              hypothesisId,
              experimentId,
              phase: "collect_source_pack",
              kind: "planning",
              message:
                "Collected normalized repository, paper, and planner evidence into a source pack.",
              metadata: null,
            });
          });
          break;
        }

        case "synthesize_bundle": {
          const sourcePackArtifact = dbOps.getLatestExperimentArtifactByType(
            experimentId,
            "source_pack"
          );
          const sourcePack = parseArtifactJson<ExecutionSourcePack>(sourcePackArtifact);

          if (!sourcePack) {
            throw new NonRetriableError("Source pack artifact not found");
          }

          const compactSourcePack = buildCompactSynthesisPack(sourcePack);
          await step.run("persist-compact-synthesis-pack", async () => {
            dbOps.addExperimentArtifact({
              projectId,
              hypothesisId,
              experimentId,
              type: "compact_synthesis_pack",
              uri: `inline://compact-synthesis-pack/${experimentId}`,
              metadata: safeStringify(compactSourcePack),
            });
          });

          const synthesisResult = await step.run("synthesize-normalized-bundle", async () => {
            try {
              return {
                ok: true as const,
                result: await synthesizeExecutionBundle({ sourcePack }),
              };
            } catch (error) {
              return {
                ok: false as const,
                blocker: serializeExecutionPlanningBlocker(error),
                diagnostics: extractSynthesisDiagnostics(error),
                errorMessage: error instanceof Error ? error.message : String(error),
              };
            }
          });

          if (!synthesisResult.ok) {
            await step.run("persist-synthesis-diagnostics-failure", async () => {
              if (synthesisResult.diagnostics) {
                dbOps.addExperimentArtifact({
                  projectId,
                  hypothesisId,
                  experimentId,
                  type: "bundle_synthesis_diagnostics",
                  uri: `inline://bundle-synthesis-diagnostics/${experimentId}`,
                  metadata: safeStringify(synthesisResult.diagnostics),
                });
              }

              dbOps.addExperimentLog({
                projectId,
                hypothesisId,
                experimentId,
                phase: "synthesize_bundle",
                kind: "failure",
                message: synthesisResult.blocker
                  ? synthesisResult.blocker.message
                  : `Bundle synthesis failed: ${synthesisResult.errorMessage}`,
                metadata: synthesisResult.diagnostics
                  ? safeStringify(synthesisResult.diagnostics)
                  : null,
              });
            });

            if (synthesisResult.blocker) {
              blockExperiment({
                projectId,
                hypothesisId,
                experimentId,
                phase: stage,
                blockerType: synthesisResult.blocker.blockerType,
                message: synthesisResult.blocker.message,
                requiredInput: synthesisResult.blocker.requiredInput,
              });

              return { success: true, projectId, hypothesisId, experimentId, blocked: true };
            }

            failExperiment({
              projectId,
              hypothesisId,
              experimentId,
              phase: stage,
              message: `Bundle synthesis failed: ${synthesisResult.errorMessage}`,
            });

            return { success: false, projectId, hypothesisId, experimentId, failed: true };
          }

          const { bundle, diagnostics } = synthesisResult.result;

          await step.run("persist-normalized-bundle", async () => {
            dbOps.addExperimentArtifact({
              projectId,
              hypothesisId,
              experimentId,
              type: "bundle_synthesis_diagnostics",
              uri: `inline://bundle-synthesis-diagnostics/${experimentId}`,
              metadata: safeStringify(diagnostics),
            });

            dbOps.addExperimentArtifact({
              projectId,
              hypothesisId,
              experimentId,
              type: "normalized_bundle",
              uri: `inline://normalized-bundle/${experimentId}`,
              metadata: safeStringify(bundle),
            });

            bundle.assumptions.forEach((assumption) => {
              dbOps.addExperimentFinding({
                projectId,
                hypothesisId,
                experimentId,
                type: "assumption",
                severity: "info",
                confidence: 0.6,
                source: "planner",
                message: assumption,
                metadata: null,
              });
            });

            dbOps.addExperimentLog({
              projectId,
              hypothesisId,
              experimentId,
              phase: "synthesize_bundle",
              kind: "planning",
              message:
                "Synthesized a compact normalized execution bundle from the collected evidence.",
              metadata: safeStringify({
                strategy: bundle.strategy,
                inferenceLevel: bundle.inferenceLevel,
                credibilityScore: bundle.credibilityScore,
                entrypoint: bundle.entrypoint,
                fileCount: bundle.files.length,
                diagnostics,
              }),
            });
          });
          break;
        }

        case "validate_bundle": {
          const sourcePackArtifact = dbOps.getLatestExperimentArtifactByType(
            experimentId,
            "source_pack"
          );
          const bundleArtifact = dbOps.getLatestExperimentArtifactByType(
            experimentId,
            "normalized_bundle"
          );
          const sourcePack = parseArtifactJson<ExecutionSourcePack>(sourcePackArtifact);
          const bundle = parseArtifactJson<NormalizedExecutionBundle>(bundleArtifact);

          if (!sourcePack || !bundle) {
            throw new NonRetriableError("Bundle validation prerequisites not found");
          }

          const validationReport = await step.run("validate-normalized-bundle", async () =>
            validateExecutionBundle({ sourcePack, bundle })
          );

          await step.run("persist-bundle-validation-report", async () => {
            dbOps.addExperimentArtifact({
              projectId,
              hypothesisId,
              experimentId,
              type: "bundle_validation_report",
              uri: `inline://bundle-validation/${experimentId}`,
              metadata: safeStringify(validationReport),
            });

            validationReport.warnings.forEach((warning) => {
              dbOps.addExperimentFinding({
                projectId,
                hypothesisId,
                experimentId,
                type: "assumption",
                severity: "info",
                confidence: 0.55,
                source: "planner",
                message: warning,
                metadata: null,
              });
            });

            dbOps.addExperimentLog({
              projectId,
              hypothesisId,
              experimentId,
              phase: "validate_bundle",
              kind: "planning",
              message: validationReport.summary,
              metadata: validationReport.errors.length
                ? safeStringify(validationReport.errors)
                : null,
            });
          });

          if (!validationReport.valid) {
            blockExperiment({
              projectId,
              hypothesisId,
              experimentId,
              phase: stage,
              blockerType: "invalid_execution_bundle",
              message: validationReport.errors.join(" "),
              requiredInput:
                "Provide a narrower runnable benchmark path, a valid repo entrypoint, or more concrete execution instructions.",
            });

            return { success: true, projectId, hypothesisId, experimentId, blocked: true };
          }
          break;
        }

        case "compile_execution_spec": {
          const sourcePackArtifact = dbOps.getLatestExperimentArtifactByType(
            experimentId,
            "source_pack"
          );
          const bundleArtifact = dbOps.getLatestExperimentArtifactByType(
            experimentId,
            "normalized_bundle"
          );
          const sourcePack = parseArtifactJson<ExecutionSourcePack>(sourcePackArtifact);
          const bundle = parseArtifactJson<NormalizedExecutionBundle>(bundleArtifact);

          if (!sourcePack || !bundle) {
            throw new NonRetriableError("Normalized bundle artifacts not found");
          }

          const compileResult = await step.run("compile-execution-spec", async () => {
            try {
              return {
                ok: true as const,
                executionSpec: compileExecutionSpec({
                  context: {
                    paper,
                    hypothesis: workspace.hypothesis,
                    experiment: workspace.experiment!,
                    plan: workspace.plan!,
                    repoContext: null,
                    appBaseUrl: parseAppBaseUrl(workspace.plan?.environmentSpec),
                  },
                  sourcePack,
                  bundle,
                }),
              };
            } catch (error) {
              const blocker = serializeExecutionPlanningBlocker(error);
              if (blocker) {
                return {
                  ok: false as const,
                  blocker,
                };
              }

              throw error;
            }
          });

          if (!compileResult.ok) {
            blockExperiment({
              projectId,
              hypothesisId,
              experimentId,
              phase: stage,
              blockerType: compileResult.blocker.blockerType,
              message: compileResult.blocker.message,
              requiredInput: compileResult.blocker.requiredInput,
            });

            return { success: true, projectId, hypothesisId, experimentId, blocked: true };
          }

          const executionSpec = compileResult.executionSpec;

          await step.run("persist-execution-spec", async () => {
            dbOps.addExperimentArtifact({
              projectId,
              hypothesisId,
              experimentId,
              type: "execution_spec",
              uri: `inline://execution-spec/${experimentId}`,
              metadata: safeStringify(executionSpec),
            });

            dbOps.updateExperiment(experimentId, {
              environmentManifest: safeStringify({
                backend: executionSpec.environment.backend,
                computeTier: executionSpec.environment.computeTier,
                repoUrl: executionSpec.repo?.url ?? null,
                repoRef: executionSpec.repo?.ref ?? null,
                datasetAccess: executionSpec.datasets.accessMode,
                bundleStrategy: executionSpec.bundle.strategy,
                inferenceLevel: executionSpec.inferenceLevel,
                credibilityScore: executionSpec.credibilityScore,
                bundleFileCount: executionSpec.bundle.files.length,
                entrypoint: executionSpec.bundle.entrypoint,
              }),
              progressDetails: "Compiled canonical execution spec",
            });
          });
          break;
        }

        case "preflight_bundle": {
          const sourcePackArtifact = dbOps.getLatestExperimentArtifactByType(
            experimentId,
            "source_pack"
          );
          const bundleArtifact = dbOps.getLatestExperimentArtifactByType(
            experimentId,
            "normalized_bundle"
          );
          const specArtifact = dbOps.getLatestExperimentArtifactByType(
            experimentId,
            "execution_spec"
          );
          const sourcePack = parseArtifactJson<ExecutionSourcePack>(sourcePackArtifact);
          const initialBundle = parseArtifactJson<NormalizedExecutionBundle>(bundleArtifact);
          const initialExecutionSpec = parseArtifactJson<ExecutionSpec>(specArtifact);

          if (!sourcePack || !initialBundle || !initialExecutionSpec) {
            throw new NonRetriableError("Bundle preflight prerequisites not found");
          }

          const preflightResult = await step.run("preflight-and-repair-bundle", async () => {
            let currentBundle = initialBundle;
            let currentExecutionSpec = initialExecutionSpec;
            const repairAttempts: BundleRepairAttemptRecord[] = [];
            let finalReport: unknown = null;

            for (let attemptNumber = 1; attemptNumber <= MAX_BUNDLE_REPAIR_ATTEMPTS; attemptNumber += 1) {
              const localReport = preflightExecutionBundle({
                sourcePack,
                bundle: currentBundle,
                executionSpec: currentExecutionSpec,
              });

              if (!localReport.ok) {
                finalReport = localReport;
                const repair = await repairExecutionBundle({
                  sourcePack,
                  bundle: currentBundle,
                  executionSpec: currentExecutionSpec,
                  report: localReport,
                  attemptNumber,
                });
                repairAttempts.push({
                  attemptNumber,
                  source: "local",
                  failureClass: localReport.failureClass ?? "local_preflight_failed",
                  errorSummary:
                    localReport.errorSummary ??
                    "Local bundle preflight failed.",
                  checks: localReport.checks,
                  repairSummary: repair.repairSummary,
                });
                currentBundle = repair.bundle;
                currentExecutionSpec = compileExecutionSpec({
                  context: {
                    paper,
                    hypothesis: workspace.hypothesis,
                    experiment: workspace.experiment!,
                    plan: workspace.plan!,
                    repoContext: null,
                    appBaseUrl: parseAppBaseUrl(workspace.plan?.environmentSpec),
                  },
                  sourcePack,
                  bundle: currentBundle,
                });
                continue;
              }

              try {
                const remoteReport = await preflightModalExecution({
                  spec: currentExecutionSpec,
                });
                finalReport = remoteReport;
                if (remoteReport.ok) {
                  return {
                    ok: true as const,
                    bundle: currentBundle,
                    executionSpec: currentExecutionSpec,
                    report: remoteReport,
                    repairAttempts,
                  };
                }

                const repair = await repairExecutionBundle({
                  sourcePack,
                  bundle: currentBundle,
                  executionSpec: currentExecutionSpec,
                  report: remoteReport,
                  attemptNumber,
                });
                repairAttempts.push({
                  attemptNumber,
                  source: "remote",
                  failureClass: remoteReport.failureClass ?? "remote_preflight_failed",
                  errorSummary:
                    remoteReport.errorSummary ??
                    "Remote Modal bundle preflight failed.",
                  checks: remoteReport.checks,
                  repairSummary: repair.repairSummary,
                });
                currentBundle = repair.bundle;
                currentExecutionSpec = compileExecutionSpec({
                  context: {
                    paper,
                    hypothesis: workspace.hypothesis,
                    experiment: workspace.experiment!,
                    plan: workspace.plan!,
                    repoContext: null,
                    appBaseUrl: parseAppBaseUrl(workspace.plan?.environmentSpec),
                  },
                  sourcePack,
                  bundle: currentBundle,
                });
              } catch (error) {
                if (error instanceof ModalRunnerContractError) {
                  return {
                    ok: false as const,
                    infrastructureError: error.message,
                    report: {
                      ok: false,
                      failureClass: "contract_mismatch",
                      errorSummary: error.message,
                      warnings: [],
                      checks: [],
                    },
                    repairAttempts,
                  };
                }

                const remoteReport = {
                  ok: false,
                  failureClass: "remote_preflight_failed",
                  errorSummary:
                    error instanceof Error ? error.message : String(error),
                  warnings: [],
                  checks: [
                    {
                      name: "modal_preflight_request",
                      source: "remote" as const,
                      status: "failed" as const,
                      summary: "Modal preflight request failed.",
                      details:
                        error instanceof Error ? error.message : String(error),
                    },
                  ],
                };
                finalReport = remoteReport;
                const repair = await repairExecutionBundle({
                  sourcePack,
                  bundle: currentBundle,
                  executionSpec: currentExecutionSpec,
                  report: remoteReport,
                  attemptNumber,
                });
                repairAttempts.push({
                  attemptNumber,
                  source: "remote",
                  failureClass: "remote_preflight_failed",
                  errorSummary: remoteReport.errorSummary,
                  checks: remoteReport.checks,
                  repairSummary: repair.repairSummary,
                });
                currentBundle = repair.bundle;
                currentExecutionSpec = compileExecutionSpec({
                  context: {
                    paper,
                    hypothesis: workspace.hypothesis,
                    experiment: workspace.experiment!,
                    plan: workspace.plan!,
                    repoContext: null,
                    appBaseUrl: parseAppBaseUrl(workspace.plan?.environmentSpec),
                  },
                  sourcePack,
                  bundle: currentBundle,
                });
              }
            }

            return {
              ok: false as const,
              report: finalReport,
              bundle: currentBundle,
              executionSpec: currentExecutionSpec,
              repairAttempts,
            };
          });

          await step.run("persist-bundle-preflight-artifacts", async () => {
            if ("bundle" in preflightResult && preflightResult.bundle) {
              dbOps.addExperimentArtifact({
                projectId,
                hypothesisId,
                experimentId,
                type: "normalized_bundle",
                uri: `inline://normalized-bundle/${experimentId}`,
                metadata: safeStringify(preflightResult.bundle),
              });
            }

            if ("executionSpec" in preflightResult && preflightResult.executionSpec) {
              dbOps.addExperimentArtifact({
                projectId,
                hypothesisId,
                experimentId,
                type: "execution_spec",
                uri: `inline://execution-spec/${experimentId}`,
                metadata: safeStringify(preflightResult.executionSpec),
              });
            }

            if (preflightResult.report) {
              dbOps.addExperimentArtifact({
                projectId,
                hypothesisId,
                experimentId,
                type: "bundle_preflight_report",
                uri: `inline://bundle-preflight-report/${experimentId}`,
                metadata: safeStringify(preflightResult.report),
              });
            }

            dbOps.addExperimentArtifact({
              projectId,
              hypothesisId,
              experimentId,
              type: "bundle_repair_attempts",
              uri: `inline://bundle-repair-attempts/${experimentId}`,
              metadata: safeStringify(preflightResult.repairAttempts ?? []),
            });
          });

          if (!preflightResult.ok) {
            const reportSummary =
              preflightResult.report &&
              typeof preflightResult.report === "object" &&
              "errorSummary" in preflightResult.report &&
              typeof preflightResult.report.errorSummary === "string"
                ? preflightResult.report.errorSummary
                : null;

            if ("infrastructureError" in preflightResult && preflightResult.infrastructureError) {
              failExperiment({
                projectId,
                hypothesisId,
                experimentId,
                phase: stage,
                message: preflightResult.infrastructureError,
                workflowStatus: "failed",
                payload: preflightResult.report ?? null,
              });

              return { success: false, projectId, hypothesisId, experimentId, failed: true };
            }

            failExperiment({
              projectId,
              hypothesisId,
              experimentId,
              phase: stage,
              message:
                reportSummary ??
                `Bundle preflight failed after ${MAX_BUNDLE_REPAIR_ATTEMPTS} repair attempts.`,
              workflowStatus: "failed",
              payload: {
                report: preflightResult.report ?? null,
                repairAttempts: preflightResult.repairAttempts,
              },
            });

            return { success: false, projectId, hypothesisId, experimentId, failed: true };
          }

          await step.run("persist-bundle-preflight-success-log", async () => {
            dbOps.addExperimentLog({
              projectId,
              hypothesisId,
              experimentId,
              phase: "preflight_bundle",
              kind: "planning",
              message:
                preflightResult.repairAttempts.length > 0
                  ? `Bundle preflight passed after ${preflightResult.repairAttempts.length} repair attempt(s).`
                  : "Bundle preflight passed locally and on the Modal worker image.",
              metadata: safeStringify(preflightResult.report),
            });
            dbOps.updateExperiment(experimentId, {
              progressDetails: "Bundle preflight passed and is ready for Modal execution.",
            });
          });
          break;
        }

        case "submit_runner_job": {
          const specArtifact = dbOps.getLatestExperimentArtifactByType(
            experimentId,
            "execution_spec"
          );
          const executionSpec = parseArtifactJson<ReturnType<typeof compileExecutionSpec>>(
            specArtifact
          );
          if (!executionSpec) {
            throw new NonRetriableError("Execution spec artifact not found");
          }

          const submission = await step.run("submit-modal-job", async () => {
            return submitModalExecution({
              spec: executionSpec,
              runContext: {
                projectId,
                hypothesisId,
                experimentId,
              },
              callbackSecret: getRunnerCallbackSecret(),
            });
          });

          await step.run("persist-execution-job", async () => {
            dbOps.createExecutionJob({
              projectId,
              hypothesisId,
              experimentId,
              runnerBackend: "modal",
              runnerJobId: submission.runnerJobId,
              status: submission.status ?? "queued",
              computeTier: executionSpec.environment.computeTier,
              repoUrl: executionSpec.repo?.url ?? null,
              repoRef: executionSpec.repo?.ref ?? null,
              currentCommand: null,
              lastHeartbeatAt: null,
              startedAt: null,
              completedAt: null,
              error: null,
              resultSummary: null,
            });

            dbOps.addExperimentLog({
              projectId,
              hypothesisId,
              experimentId,
              phase: "submit_runner_job",
              kind: "execution",
              message: `Submitted the execution spec to the Modal runner backend as job ${submission.runnerJobId}.`,
              metadata: safeStringify({
                runnerBackend: "modal",
                runnerJobId: submission.runnerJobId,
              }),
            });
          });
          break;
        }

        case "monitor_runner_job": {
          await step.run("mark-runner-monitoring", async () => {
            dbOps.updateExperiment(experimentId, {
              workflowStatus: "running",
              progressDetails:
                "Monitoring Modal runner callbacks for logs, artifacts, and metric updates.",
            });
            dbOps.createWorkflowCheckpoint({
              projectId,
              hypothesisId,
              experimentId,
              stage: "monitor_runner_job",
              status: "monitoring",
              payload: null,
            });
          });

          return {
            success: true,
            projectId,
            hypothesisId,
            experimentId,
            stage,
            waitingOnRunner: true,
          };
        }

        case "extract_results": {
          const latestWorkspace = dbOps.getExperimentWorkspace(hypothesisId);
          if (!latestWorkspace?.experiment || !latestWorkspace.plan) {
            throw new NonRetriableError("Experiment workspace not found during result extraction");
          }

          const normalizedResults = await step.run("extract-normalized-results", async () => {
            return extractNormalizedResults({
              paper,
              hypothesis: latestWorkspace.hypothesis,
              plan: latestWorkspace.plan!,
              experiment: latestWorkspace.experiment!,
              logs: latestWorkspace.logs,
              executionJob: latestWorkspace.executionJob,
            });
          });

          await step.run("persist-normalized-results", async () => {
            dbOps.addExperimentArtifact({
              projectId,
              hypothesisId,
              experimentId,
              type: "normalized_results",
              uri: `inline://normalized-results/${experimentId}`,
              metadata: safeStringify(normalizedResults),
            });
          });
          break;
        }

        case "compare_results": {
          const resultsArtifact = dbOps.getLatestExperimentArtifactByType(
            experimentId,
            "normalized_results"
          );
          const normalizedResults = parseArtifactJson<
            z.infer<typeof normalizedResultsSchema>
          >(resultsArtifact);

          if (!normalizedResults) {
            throw new NonRetriableError("Normalized results artifact not found");
          }

          await step.run("persist-verdict", async () => {
            const verdict = resolveVerdict({
              bestValue: normalizedResults.bestValue,
              targetValue:
                workspace.plan?.targetValue ?? workspace.hypothesis.targetValue ?? null,
              tolerance:
                workspace.plan?.tolerance ?? workspace.hypothesis.tolerance ?? null,
            });

            const gap = verdict.gap;
            const metric = normalizedResults.normalizedMetric ?? workspace.hypothesis.targetMetric;

            dbOps.updateHypothesis(hypothesisId, {
              status: verdict.hypothesisStatus,
              workflowStatus: verdict.workflowStatus,
              verdict: verdict.verdict,
              bestValue: normalizedResults.bestValue,
              gap,
              targetMetric: metric,
              phase: "compare_results",
            });
            dbOps.updateExperiment(experimentId, {
              workflowStatus: verdict.workflowStatus,
              phase: "compare_results",
              results: safeStringify(normalizedResults),
              metrics: safeStringify(
                metric && typeof normalizedResults.bestValue === "number"
                  ? { [metric]: normalizedResults.bestValue }
                  : {}
              ),
              progressDetails: `Verdict: ${verdict.verdict}`,
            });

            dbOps.addExperimentFinding({
              projectId,
              hypothesisId,
              experimentId,
              type:
                verdict.workflowStatus === "reproduced" ? "match" : "mismatch",
              severity:
                verdict.workflowStatus === "reproduced" ? "info" : "warning",
              confidence: normalizedResults.confidence,
              source: "result_extraction",
              message:
                verdict.workflowStatus === "reproduced"
                  ? `Result reproduced within tolerance${gap === null ? "" : ` (gap ${gap.toFixed(2)}).`}`
                  : `Result finished with verdict ${verdict.verdict}${gap === null ? "" : ` (gap ${gap.toFixed(2)}).`}`,
              metadata: safeStringify(normalizedResults),
            });
          });
          break;
        }

        case "generate_report": {
          const latestWorkspace = dbOps.getExperimentWorkspace(hypothesisId);
          if (!latestWorkspace?.experiment) {
            throw new NonRetriableError("Experiment workspace missing during report generation");
          }

          const generatedReport = await step.run("generate-reproduction-report", async () => {
            return generateReproductionReport({
              paper,
              hypothesis: latestWorkspace.hypothesis,
              experiment: latestWorkspace.experiment!,
              plan: latestWorkspace.plan,
              blocker: latestWorkspace.blocker,
              findings: latestWorkspace.findings,
              logs: latestWorkspace.logs,
              artifacts: latestWorkspace.artifacts,
              executionJob: latestWorkspace.executionJob,
            });
          });

          await step.run("persist-report", async () => {
            dbOps.addExperimentArtifact({
              projectId,
              hypothesisId,
              experimentId,
              type: "report_markdown",
              uri: `inline://report/${experimentId}`,
              metadata: generatedReport.markdown,
            });
            dbOps.addExperimentArtifact({
              projectId,
              hypothesisId,
              experimentId,
              type: "report_json",
              uri: `inline://report-json/${experimentId}`,
              metadata: safeStringify(generatedReport.payload),
            });
            dbOps.updateExperiment(experimentId, {
              status: "completed",
              completedAt: Date.now(),
              progressPercent: 100,
              progressDetails: "Generated the final report bundle",
            });
          });
          break;
        }
      }
    } catch (error) {
      if (error instanceof ExecutionPlanningBlockerError) {
        blockExperiment({
          projectId,
          hypothesisId,
          experimentId,
          phase: stage,
          blockerType: error.blockerType,
          message: error.message,
          requiredInput: error.requiredInput,
        });

        return { success: true, projectId, hypothesisId, experimentId, blocked: true };
      }

      throw error;
    }

    await step.run(`stage-${stage}-complete`, async () => {
      dbOps.createWorkflowCheckpoint({
        projectId,
        hypothesisId,
        experimentId,
        stage,
        status: "completed",
        payload: null,
      });
    });

    const upcomingStage = nextStage(stage);
    if (upcomingStage) {
      await step.sendEvent(`advance-${stage}-to-${upcomingStage}`, {
        name: REPRODUCTION_EVENTS.STAGE,
        data: {
          projectId,
          hypothesisId,
          experimentId,
          stage: upcomingStage,
        },
      });
    }

    return { success: true, projectId, hypothesisId, experimentId, stage };
  }
);
