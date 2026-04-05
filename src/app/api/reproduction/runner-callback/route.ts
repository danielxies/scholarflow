import { NextResponse } from "next/server";
import { z } from "zod";

import { inngest } from "@/inngest/client";
import { CUSTOM_EXPERIMENT_EVENTS } from "@/features/experiments/inngest/events";
import { REPRODUCTION_EVENTS } from "@/features/reproduction/inngest/events";
import { getRunnerCallbackSecret } from "@/features/reproduction/server/runner-config";
import { blockExperiment, failExperiment } from "@/features/reproduction/server/state-transitions";
import * as dbOps from "@/lib/db";

const baseCallbackSchema = z.object({
  runnerBackend: z.string().default("modal"),
  runnerJobId: z.string().min(1),
});

const callbackSchema = z.discriminatedUnion("type", [
  baseCallbackSchema.extend({
    type: z.literal("job_started"),
    currentCommand: z.string().nullable().optional(),
  }),
  baseCallbackSchema.extend({
    type: z.literal("log_chunk"),
    phase: z.string().default("monitor_runner_job"),
    kind: z.string().default("runner_output"),
    message: z.string().min(1),
    currentCommand: z.string().nullable().optional(),
  }),
  baseCallbackSchema.extend({
    type: z.literal("heartbeat"),
    currentCommand: z.string().nullable().optional(),
    progressPercent: z.number().min(0).max(100).nullable().optional(),
    resultSummary: z.string().nullable().optional(),
  }),
  baseCallbackSchema.extend({
    type: z.literal("artifact_ready"),
    artifactType: z.string().min(1),
    uri: z.string().min(1),
    metadata: z.string().nullable().optional(),
  }),
  baseCallbackSchema.extend({
    type: z.literal("metric_update"),
    metricName: z.string().min(1),
    value: z.number(),
    source: z.string().nullable().optional(),
  }),
  baseCallbackSchema.extend({
    type: z.literal("job_blocked"),
    blockerType: z.string().min(1),
    message: z.string().min(1),
    requiredInput: z.string().nullable().optional(),
    userResolvable: z.boolean().default(false),
  }),
  baseCallbackSchema.extend({
    type: z.literal("job_failed"),
    failureClass: z.string().nullable().optional(),
    error: z.string().min(1),
    resultSummary: z.string().nullable().optional(),
  }),
  baseCallbackSchema.extend({
    type: z.literal("job_succeeded"),
    resultSummary: z.string().nullable().optional(),
  }),
]);

const USER_RESOLVABLE_BLOCKERS = new Set([
  "dataset_credentials_required",
  "proprietary_api_required",
  "missing_external_asset",
  "missing_execution_path",
]);

function parseMetrics(metrics: string) {
  try {
    const parsed = JSON.parse(metrics) as unknown;
    return parsed && typeof parsed === "object" ? { ...(parsed as Record<string, number>) } : {};
  } catch {
    return {};
  }
}

export async function POST(request: Request) {
  try {
    const expectedSecret = getRunnerCallbackSecret();
    const providedSecret = request.headers.get("x-scholarflow-callback-secret")?.trim() ?? "";

    if (!expectedSecret || providedSecret !== expectedSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = callbackSchema.parse(await request.json());
    const executionJob = dbOps.getExecutionJobByRunnerJobId(
      payload.runnerBackend,
      payload.runnerJobId
    );

    if (!executionJob) {
      return NextResponse.json({ error: "Execution job not found" }, { status: 404 });
    }

    const experiment = dbOps.getExperimentById(executionJob.experimentId);
    const hypothesis = dbOps.getHypothesisById(executionJob.hypothesisId);
    if (!experiment || !hypothesis) {
      return NextResponse.json(
        { error: "Execution context not found" },
        { status: 404 }
      );
    }

    switch (payload.type) {
      case "job_started": {
        dbOps.updateExecutionJob(executionJob._id, {
          status: "running",
          startedAt: Date.now(),
          currentCommand: payload.currentCommand ?? null,
        });
        dbOps.updateExperiment(experiment._id, {
          phase: "monitor_runner_job",
          progressDetails: "Modal worker started executing the repository plan.",
        });
        break;
      }

      case "log_chunk": {
        dbOps.updateExecutionJob(executionJob._id, {
          status: "running",
          lastHeartbeatAt: Date.now(),
          currentCommand: payload.currentCommand ?? executionJob.currentCommand,
        });
        dbOps.addExperimentLog({
          projectId: executionJob.projectId,
          hypothesisId: executionJob.hypothesisId,
          experimentId: executionJob.experimentId,
          phase: payload.phase,
          kind: payload.kind,
          message: payload.message,
          metadata: payload.currentCommand ?? null,
        });
        break;
      }

      case "heartbeat": {
        dbOps.updateExecutionJob(executionJob._id, {
          status: "running",
          lastHeartbeatAt: Date.now(),
          currentCommand: payload.currentCommand ?? executionJob.currentCommand,
          resultSummary: payload.resultSummary ?? executionJob.resultSummary,
        });
        dbOps.updateExperiment(experiment._id, {
          phase: "monitor_runner_job",
          progressPercent:
            payload.progressPercent ?? experiment.progressPercent,
          progressDetails:
            payload.currentCommand ??
            "Runner heartbeat received from Modal worker.",
        });
        break;
      }

      case "artifact_ready": {
        dbOps.addExperimentArtifact({
          projectId: executionJob.projectId,
          hypothesisId: executionJob.hypothesisId,
          experimentId: executionJob.experimentId,
          type: payload.artifactType,
          uri: payload.uri,
          metadata: payload.metadata ?? null,
        });
        break;
      }

      case "metric_update": {
        const metrics = parseMetrics(experiment.metrics);
        metrics[payload.metricName] = payload.value;

        dbOps.updateExperiment(experiment._id, {
          metrics: JSON.stringify(metrics),
        });
        dbOps.addExperimentLog({
          projectId: executionJob.projectId,
          hypothesisId: executionJob.hypothesisId,
          experimentId: executionJob.experimentId,
          phase: "monitor_runner_job",
          kind: "metric",
          message: `Metric update: ${payload.metricName} = ${payload.value}`,
          metadata: payload.source ?? null,
        });
        break;
      }

      case "job_blocked": {
        dbOps.updateExecutionJob(executionJob._id, {
          status: "blocked",
          error: payload.message,
          completedAt: Date.now(),
        });

        if (payload.userResolvable && USER_RESOLVABLE_BLOCKERS.has(payload.blockerType)) {
          blockExperiment({
            projectId: executionJob.projectId,
            hypothesisId: executionJob.hypothesisId,
            experimentId: executionJob.experimentId,
            phase: "monitor_runner_job",
            blockerType: payload.blockerType,
            message: payload.message,
            requiredInput: payload.requiredInput ?? null,
          });
        } else {
          failExperiment({
            projectId: executionJob.projectId,
            hypothesisId: executionJob.hypothesisId,
            experimentId: executionJob.experimentId,
            phase: "monitor_runner_job",
            message: payload.message,
            workflowStatus: hypothesis.kind === "custom" ? "failed" : undefined,
          });
        }
        break;
      }

      case "job_failed": {
        dbOps.updateExecutionJob(executionJob._id, {
          status: "failed",
          error: payload.error,
          resultSummary: payload.resultSummary ?? executionJob.resultSummary,
          completedAt: Date.now(),
        });
        failExperiment({
          projectId: executionJob.projectId,
          hypothesisId: executionJob.hypothesisId,
          experimentId: executionJob.experimentId,
          phase: "monitor_runner_job",
          message: payload.error,
          workflowStatus: hypothesis.kind === "custom" ? "failed" : undefined,
          payload: {
            failureClass: payload.failureClass ?? "runtime_failed",
            resultSummary: payload.resultSummary ?? null,
          },
        });
        break;
      }

      case "job_succeeded": {
        const alreadyCompleted = executionJob.status === "completed";
        dbOps.updateExecutionJob(executionJob._id, {
          status: "completed",
          resultSummary: payload.resultSummary ?? executionJob.resultSummary,
          completedAt: Date.now(),
          lastHeartbeatAt: Date.now(),
        });
        dbOps.updateExperiment(experiment._id, {
          phase: "extract_results",
          progressDetails: "Runner completed. Extracting normalized results.",
        });

        if (!alreadyCompleted) {
          await inngest.send({
            name:
              hypothesis.kind === "custom"
                ? CUSTOM_EXPERIMENT_EVENTS.STAGE
                : REPRODUCTION_EVENTS.STAGE,
            data: {
              projectId: executionJob.projectId,
              hypothesisId: executionJob.hypothesisId,
              experimentId: executionJob.experimentId,
              stage: "extract_results",
            },
          });
        }
        break;
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid callback payload" }, { status: 400 });
    }

    console.error("Runner callback error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to process runner callback",
      },
      { status: 500 }
    );
  }
}
