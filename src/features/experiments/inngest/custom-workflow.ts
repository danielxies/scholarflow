import { NonRetriableError } from "inngest";
import { z } from "zod";

import { extractJsonPayload } from "@/lib/ai-json";
import { callClaude } from "@/lib/claude-client";
import * as dbOps from "@/lib/db";
import { inngest } from "@/inngest/client";
import { REPRODUCTION_EVENTS } from "@/features/reproduction/inngest/events";
import {
  buildCompactSynthesisPack,
  MAX_BUNDLE_REPAIR_ATTEMPTS,
  preflightExecutionBundle,
  buildCustomExecutionSourcePack,
  compileCustomExecutionSpec,
  ExecutionPlanningBlockerError,
  extractSynthesisDiagnostics,
  generateCustomExecutionPlannerOutput,
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
import { generateCustomExperimentReport } from "@/features/reproduction/server/report-generation";
import { CUSTOM_EXPERIMENT_EVENTS } from "./events";

type CustomExperimentStage =
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

interface CustomExperimentStageEvent {
  projectId: string;
  hypothesisId: string;
  experimentId: string;
  stage: CustomExperimentStage;
}

const targetSchema = z.object({
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

function parseStoredSettings(
  settingsSnapshot: string
): {
  appBaseUrl: string;
  computeTier: "small" | "standard" | "extended";
  allowSupportingPapers: boolean;
  humanApprovalOnBlocker: boolean;
  preferProvidedRepo: boolean;
} {
  try {
    const parsed = JSON.parse(settingsSnapshot) as {
      appBaseUrl?: string;
      computeTier?: "small" | "standard" | "extended";
      allowSupportingPapers?: boolean;
      humanApprovalOnBlocker?: boolean;
      preferProvidedRepo?: boolean;
    };

    return {
      appBaseUrl: parsed.appBaseUrl ?? "",
      computeTier: parsed.computeTier ?? "standard",
      allowSupportingPapers: parsed.allowSupportingPapers ?? true,
      humanApprovalOnBlocker: parsed.humanApprovalOnBlocker ?? true,
      preferProvidedRepo: parsed.preferProvidedRepo ?? true,
    };
  } catch {
    return {
      appBaseUrl: "",
      computeTier: "standard",
      allowSupportingPapers: true,
      humanApprovalOnBlocker: true,
      preferProvidedRepo: true,
    };
  }
}

function stageProgress(stage: CustomExperimentStage): number {
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

function nextStage(stage: CustomExperimentStage): CustomExperimentStage | null {
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

function fallbackTarget(context: dbOps.CustomExperimentContext) {
  const source = [context.benchmark ?? "", context.description].join(" ").toLowerCase();
  const metric =
    source.includes("accuracy")
      ? "accuracy"
      : source.includes("f1")
        ? "f1"
        : source.includes("loss")
          ? "loss"
          : source.includes("pass@1")
            ? "pass_at_1"
            : null;
  const numericMatch = [context.benchmark ?? "", context.description]
    .join(" ")
    .match(/([0-9]+(?:\.[0-9]+)?)/);

  return {
    targetClaim: context.benchmark?.trim() || context.description,
    targetMetric: metric,
    targetValue: numericMatch ? Number(numericMatch[1]) : null,
    tolerance: numericMatch ? 1.0 : null,
  };
}

async function extractTarget(params: {
  hypothesis: dbOps.Hypothesis;
  context: dbOps.CustomExperimentContext;
  contextPapers: dbOps.Paper[];
}) {
  const prompt = [
    `Experiment title: ${params.hypothesis.title}`,
    `Description: ${params.context.description}`,
    `Benchmark note: ${params.context.benchmark ?? "none"}`,
    `Dataset/access note: ${params.context.datasetNote ?? "none"}`,
    "",
    "Context papers:",
    params.contextPapers.length
      ? params.contextPapers
          .map((paper) =>
            `- ${paper.title}: ${paper.aiSummary ?? paper.abstract ?? "No summary available"}`
          )
          .join("\n")
      : "No context papers provided.",
    "",
    'Return strict JSON with keys "targetClaim", "targetMetric", "targetValue", and "tolerance".',
    "targetMetric should be a short snake_case metric name or null.",
    "targetValue should be numeric if clearly stated, else null.",
    "tolerance should be numeric if a targetValue is known, else null.",
  ].join("\n");

  try {
    const response = await callClaude({
      prompt,
      systemPrompt:
        "You extract benchmark targets from custom experiment descriptions. Return only valid JSON.",
      model: "sonnet",
      maxTurns: 1,
      allowedTools: [],
    });

    return targetSchema.parse(JSON.parse(extractJsonPayload(response)) as unknown);
  } catch {
    return fallbackTarget(params.context);
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
    ...params.logs.slice(0, 30).map((log) => log.message),
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
  hypothesis: dbOps.Hypothesis;
  context: dbOps.CustomExperimentContext;
  experiment: dbOps.Experiment;
  logs: dbOps.ExperimentLogEntry[];
  executionJob: dbOps.ExecutionJob | null;
}) {
  const prompt = [
    `Experiment title: ${params.hypothesis.title}`,
    `Description: ${params.context.description}`,
    `Benchmark note: ${params.context.benchmark ?? "none"}`,
    `Target metric: ${params.hypothesis.targetMetric ?? "unknown"}`,
    `Target value: ${params.hypothesis.targetValue ?? "unknown"}`,
    "",
    `Runner summary: ${params.executionJob?.resultSummary ?? "Unavailable"}`,
    "",
    "Recent execution logs:",
    params.logs
      .slice(0, 30)
      .map((log) => `- [${log.phase}/${log.kind}] ${log.message}`)
      .join("\n") || "No logs available",
    "",
    'Return strict JSON with keys "bestValue", "normalizedMetric", "evidence", and "confidence".',
    "bestValue should be numeric if a benchmark result is visible, else null.",
    "normalizedMetric should be the metric name you used, else null.",
    "evidence should be a short summary of where the result came from, else null.",
  ].join("\n");

  try {
    const response = await callClaude({
      prompt,
      systemPrompt:
        "You extract the best benchmark result from custom experiment execution logs. Return only valid JSON.",
      model: "sonnet",
      maxTurns: 1,
      allowedTools: [],
    });

    return normalizedResultsSchema.parse(
      JSON.parse(extractJsonPayload(response)) as unknown
    );
  } catch {
    return fallbackNormalizedResults({
      targetMetric: params.hypothesis.targetMetric,
      experiment: params.experiment,
      logs: params.logs,
      executionJob: params.executionJob,
    });
  }
}

export const customExperimentStage = inngest.createFunction(
  {
    id: "custom-experiment-stage",
    cancelOn: [
      {
        event: REPRODUCTION_EVENTS.CANCEL,
        if: "event.data.experimentId == async.data.experimentId",
      },
    ],
    onFailure: async ({ event }) => {
      const { projectId, hypothesisId, experimentId, stage } =
        event.data.event.data as CustomExperimentStageEvent;

      failExperiment({
        projectId,
        hypothesisId,
        experimentId,
        phase: stage,
        message: `Custom experiment stage ${stage} failed.`,
        workflowStatus: "failed",
      });
    },
  },
  { event: CUSTOM_EXPERIMENT_EVENTS.STAGE },
  async ({ event, step }) => {
    const { projectId, hypothesisId, experimentId, stage } =
      event.data as CustomExperimentStageEvent;

    const workspace = await step.run("load-custom-workspace", async () => {
      return dbOps.getExperimentWorkspace(hypothesisId);
    });

    if (!workspace?.experiment || !workspace.customContext) {
      throw new NonRetriableError("Custom experiment workspace not found");
    }

    const contextPapers = await step.run("load-context-papers", async () => {
      try {
        const ids = JSON.parse(workspace.customContext!.contextPaperIds) as unknown;
        return Array.isArray(ids)
          ? ids
              .map((paperId) =>
                typeof paperId === "string" ? dbOps.getPaperById(paperId) : undefined
              )
              .filter((paper): paper is dbOps.Paper => Boolean(paper))
          : [];
      } catch {
        return [];
      }
    });

    await step.run(`custom-stage-${stage}-checkpoint`, async () => {
      const workflowStatus =
        stage === "plan_execution" ||
        stage === "collect_source_pack" ||
        stage === "synthesize_bundle" ||
        stage === "validate_bundle" ||
        stage === "compile_execution_spec" ||
        stage === "preflight_bundle"
          ? "planned"
          : stage === "generate_report"
            ? "completed"
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
            ? (workspace.experiment?.workflowStatus ?? "running")
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
          await step.run("ingest-custom-context", async () => {
            dbOps.addExperimentFinding({
              projectId,
              hypothesisId,
              experimentId,
              type: "assumption",
              severity: "info",
              confidence: 0.8,
              source: "custom_context",
              message: "Custom experiment context ingested and queued for autonomous planning.",
              metadata: safeStringify({
                repoUrl: workspace.customContext?.repoUrl,
                benchmark: workspace.customContext?.benchmark,
                contextPaperCount: contextPapers.length,
              }),
            });

            if (workspace.customContext?.repoUrl) {
              dbOps.addExperimentFinding({
                projectId,
                hypothesisId,
                experimentId,
                type: "match",
                severity: "info",
                confidence: 0.9,
                source: "custom_context",
                message:
                  "Provided repository detected and selected as the preferred execution path.",
                metadata: workspace.customContext.repoUrl,
              });
            }
          });
          break;
        }

        case "extract_claim": {
          const target = await step.run("extract-custom-target", async () =>
            extractTarget({
              hypothesis: workspace.hypothesis,
              context: workspace.customContext!,
              contextPapers,
            })
          );

          await step.run("persist-custom-target", async () => {
            dbOps.updateHypothesis(hypothesisId, {
              targetMetric: target.targetMetric,
              targetValue: target.targetValue,
              tolerance: target.tolerance,
            });

            dbOps.addExperimentFinding({
              projectId,
              hypothesisId,
              experimentId,
              type: "assumption",
              severity: "info",
              confidence: 0.65,
              source: "custom_context",
              message: `Primary custom experiment target selected: ${target.targetClaim}`,
              metadata: safeStringify(target),
            });
          });
          break;
        }

        case "plan_execution": {
          const repoContext = await step.run("inspect-custom-repo", async () => {
            return inspectGitHubRepository(workspace.customContext?.repoUrl ?? null);
          });
          const plannerOutput = await step.run(
            "generate-custom-planner-output",
            async () =>
              generateCustomExecutionPlannerOutput({
                hypothesis: workspace.hypothesis,
                experiment: workspace.experiment!,
                customContext: workspace.customContext!,
                contextPapers,
                repoContext,
                appBaseUrl: parseStoredSettings(
                  workspace.customContext!.settingsSnapshot
                ).appBaseUrl,
              })
          );

          await step.run("persist-custom-planner-output", async () => {
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
                "Generated the initial custom experiment execution plan from the experiment description and repository evidence.",
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

          const sourcePack = await step.run("build-custom-source-pack", async () =>
            buildCustomExecutionSourcePack({
              context: {
                hypothesis: workspace.hypothesis,
                experiment: workspace.experiment!,
                customContext: workspace.customContext!,
                contextPapers,
                repoContext: plannerArtifactPayload.repoContext ?? null,
                appBaseUrl: parseStoredSettings(workspace.customContext!.settingsSnapshot)
                  .appBaseUrl,
              },
              plannerOutput: plannerArtifactPayload.plannerOutput,
            })
          );

          await step.run("persist-custom-source-pack", async () => {
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
                "Collected normalized custom context, repository, and planner evidence into a source pack.",
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
          await step.run("persist-custom-compact-synthesis-pack", async () => {
            dbOps.addExperimentArtifact({
              projectId,
              hypothesisId,
              experimentId,
              type: "compact_synthesis_pack",
              uri: `inline://compact-synthesis-pack/${experimentId}`,
              metadata: safeStringify(compactSourcePack),
            });
          });

          const synthesisResult = await step.run(
            "synthesize-custom-normalized-bundle",
            async () => {
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
            }
          );

          if (!synthesisResult.ok) {
            await step.run("persist-custom-synthesis-diagnostics-failure", async () => {
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
              workflowStatus: "failed",
            });

            return { success: false, projectId, hypothesisId, experimentId, failed: true };
          }

          const { bundle, diagnostics } = synthesisResult.result;

          await step.run("persist-custom-normalized-bundle", async () => {
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
                "Synthesized a compact normalized execution bundle from the custom experiment source pack.",
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

          const validationReport = await step.run(
            "validate-custom-normalized-bundle",
            async () => validateExecutionBundle({ sourcePack, bundle })
          );

          await step.run("persist-custom-bundle-validation-report", async () => {
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

          const compileResult = await step.run(
            "compile-custom-execution-spec",
            async () => {
              try {
                return {
                  ok: true as const,
                  executionSpec: compileCustomExecutionSpec({
                    context: {
                      hypothesis: workspace.hypothesis,
                      experiment: workspace.experiment!,
                      customContext: workspace.customContext!,
                      contextPapers,
                      repoContext: null,
                      appBaseUrl: parseStoredSettings(
                        workspace.customContext!.settingsSnapshot
                      ).appBaseUrl,
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
            }
          );

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

          await step.run("persist-custom-execution-spec", async () => {
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

          const preflightResult = await step.run(
            "preflight-and-repair-custom-bundle",
            async () => {
              let currentBundle = initialBundle;
              let currentExecutionSpec = initialExecutionSpec;
              const repairAttempts: BundleRepairAttemptRecord[] = [];
              let finalReport: unknown = null;

              for (
                let attemptNumber = 1;
                attemptNumber <= MAX_BUNDLE_REPAIR_ATTEMPTS;
                attemptNumber += 1
              ) {
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
                  currentExecutionSpec = compileCustomExecutionSpec({
                    context: {
                      hypothesis: workspace.hypothesis,
                      experiment: workspace.experiment!,
                      customContext: workspace.customContext!,
                      contextPapers,
                      repoContext: null,
                      appBaseUrl: parseStoredSettings(
                        workspace.customContext!.settingsSnapshot
                      ).appBaseUrl,
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
                  currentExecutionSpec = compileCustomExecutionSpec({
                    context: {
                      hypothesis: workspace.hypothesis,
                      experiment: workspace.experiment!,
                      customContext: workspace.customContext!,
                      contextPapers,
                      repoContext: null,
                      appBaseUrl: parseStoredSettings(
                        workspace.customContext!.settingsSnapshot
                      ).appBaseUrl,
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
                  currentExecutionSpec = compileCustomExecutionSpec({
                    context: {
                      hypothesis: workspace.hypothesis,
                      experiment: workspace.experiment!,
                      customContext: workspace.customContext!,
                      contextPapers,
                      repoContext: null,
                      appBaseUrl: parseStoredSettings(
                        workspace.customContext!.settingsSnapshot
                      ).appBaseUrl,
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
            }
          );

          await step.run("persist-custom-bundle-preflight-artifacts", async () => {
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

          await step.run("persist-custom-bundle-preflight-success-log", async () => {
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
          const executionSpec = parseArtifactJson<
            ReturnType<typeof compileCustomExecutionSpec>
          >(specArtifact);
          if (!executionSpec) {
            throw new NonRetriableError("Execution spec artifact not found");
          }

          const submission = await step.run("submit-custom-modal-job", async () => {
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

          await step.run("persist-custom-execution-job", async () => {
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
          await step.run("mark-custom-runner-monitoring", async () => {
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
          const latestContext = dbOps.getCustomExperimentContextByExperiment(experimentId);
          if (!latestWorkspace?.experiment || !latestContext) {
            throw new NonRetriableError(
              "Custom experiment workspace not found during result extraction"
            );
          }

          const normalizedResults = await step.run(
            "extract-custom-normalized-results",
            async () =>
              extractNormalizedResults({
                hypothesis: latestWorkspace.hypothesis,
                context: latestContext,
                experiment: latestWorkspace.experiment!,
                logs: latestWorkspace.logs,
                executionJob: latestWorkspace.executionJob,
              })
          );

          await step.run("persist-custom-normalized-results", async () => {
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

          await step.run("persist-custom-results", async () => {
            const metric =
              normalizedResults.normalizedMetric ?? workspace.hypothesis.targetMetric;
            const targetValue = workspace.hypothesis.targetValue;
            const gap =
              typeof targetValue === "number" &&
              typeof normalizedResults.bestValue === "number"
                ? Math.abs(targetValue - normalizedResults.bestValue)
                : null;

            dbOps.updateHypothesis(hypothesisId, {
              bestValue: normalizedResults.bestValue,
              gap,
              targetMetric: metric,
              phase: "compare_results",
              workflowStatus: "running",
            });
            dbOps.updateExperiment(experimentId, {
              workflowStatus: "running",
              phase: "compare_results",
              results: safeStringify(normalizedResults),
              metrics: safeStringify(
                metric && typeof normalizedResults.bestValue === "number"
                  ? { [metric]: normalizedResults.bestValue }
                  : {}
              ),
              progressDetails:
                typeof normalizedResults.bestValue === "number"
                  ? `Captured result ${normalizedResults.bestValue.toFixed(2)}`
                  : "Captured custom experiment results",
            });

            dbOps.addExperimentFinding({
              projectId,
              hypothesisId,
              experimentId,
              type: "analysis",
              severity: "info",
              confidence: normalizedResults.confidence,
              source: "result_extraction",
              message:
                typeof normalizedResults.bestValue === "number"
                  ? `Custom experiment recorded ${metric ?? "result"} = ${normalizedResults.bestValue.toFixed(2)}${gap === null ? "" : ` (gap ${gap.toFixed(2)}).`}`
                  : "Custom experiment completed without a normalized benchmark value.",
              metadata: safeStringify(normalizedResults),
            });
          });
          break;
        }

        case "generate_report": {
          const latestWorkspace = dbOps.getExperimentWorkspace(hypothesisId);
          const latestContext = dbOps.getCustomExperimentContextByExperiment(experimentId);
          if (!latestWorkspace?.experiment || !latestContext) {
            throw new NonRetriableError(
              "Custom experiment workspace missing during report generation"
            );
          }

          const generatedReport = await step.run("generate-custom-report", async () => {
            return generateCustomExperimentReport({
              customContext: latestContext,
              hypothesis: latestWorkspace.hypothesis,
              experiment: latestWorkspace.experiment!,
              blocker: latestWorkspace.blocker,
              findings: latestWorkspace.findings,
              logs: latestWorkspace.logs,
              artifacts: latestWorkspace.artifacts,
              executionJob: latestWorkspace.executionJob,
            });
          });

          await step.run("persist-custom-report", async () => {
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
            dbOps.updateHypothesis(hypothesisId, {
              status: "completed",
              workflowStatus: "completed",
              verdict: "Completed",
              phase: "generate_report",
            });
            dbOps.updateExperiment(experimentId, {
              status: "completed",
              workflowStatus: "completed",
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

    await step.run(`custom-stage-${stage}-complete`, async () => {
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
      await step.sendEvent(`advance-custom-${stage}-to-${upcomingStage}`, {
        name: CUSTOM_EXPERIMENT_EVENTS.STAGE,
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
