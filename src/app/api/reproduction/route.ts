import { z } from "zod";
import { getSessionUserId } from "@/lib/session";
import { NextResponse } from "next/server";

import { inngest } from "@/inngest/client";
import * as dbOps from "@/lib/db";
import { REPRODUCTION_EVENTS } from "@/features/reproduction/inngest/events";
import { cancelModalExecution } from "@/features/reproduction/server/modal-runner";
import { resumeBlockedExperiment } from "@/features/reproduction/server/resume-blocked-experiment";
import {
  getRunnerCapability,
  resolvePublicAppBaseUrl,
} from "@/features/reproduction/server/runner-config";

const startSchema = z.object({
  action: z.literal("start"),
  projectId: z.string().min(1),
  paperId: z.string().min(1),
  settings: z.object({
    computeTier: z.enum(["small", "standard", "extended"]).default("standard"),
    allowSupportingPapers: z.boolean().default(true),
    preferOfficialCode: z.boolean().default(true),
    humanApprovalOnBlocker: z.boolean().default(true),
    credentialsNote: z.string().trim().max(4000).optional().default(""),
  }),
});

const cancelSchema = z.object({
  action: z.literal("cancel"),
  projectId: z.string().min(1),
  experimentId: z.string().min(1),
});

const retrySchema = z.object({
  action: z.literal("retry"),
  projectId: z.string().min(1),
  hypothesisId: z.string().min(1),
});

const unblockSchema = z.object({
  action: z.literal("unblock"),
  projectId: z.string().min(1),
  blockerId: z.string().min(1),
  resolution: z.string().trim().min(1).max(8000),
});

const requestSchema = z.discriminatedUnion("action", [
  startSchema,
  cancelSchema,
  retrySchema,
  unblockSchema,
]);

function ensureProjectAccess(projectId: string, userId: string) {
  const project = dbOps.getProjectById(projectId);
  if (!project) {
    throw new Error("Project not found");
  }

  if (project.ownerId !== userId) {
    throw new Error("Forbidden");
  }

  return project;
}

export async function GET() {
  const userId = await getSessionUserId();


  return NextResponse.json(getRunnerCapability());
}

export async function POST(request: Request) {
  try {
    const userId = await getSessionUserId();


    const body = await request.json();
    const payload = requestSchema.parse(body);

    try {
      ensureProjectAccess(payload.projectId, userId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Forbidden";
      const status =
        message === "Project not found" ? 404 : message === "Forbidden" ? 403 : 500;
      return NextResponse.json({ error: message }, { status });
    }

    if (payload.action === "start") {
      const runnerCapability = getRunnerCapability();
      if (!runnerCapability.available) {
        return NextResponse.json(
          {
            error:
              runnerCapability.reason ??
              "This deployment cannot execute reproduction runs yet.",
          },
          { status: 409 }
        );
      }

      const paper = dbOps.getPaperById(payload.paperId);
      if (!paper || paper.projectId !== payload.projectId) {
        return NextResponse.json({ error: "Paper not found" }, { status: 404 });
      }

      if (paper.reproducibilityClass === "not_reproducible") {
        return NextResponse.json(
          {
            error:
              paper.supportabilityReason ??
              "This paper is not currently supported for autonomous reproduction.",
          },
          { status: 400 }
        );
      }

      if (!paper.reproducibilityClass || !paper.supportabilityLabel) {
        return NextResponse.json(
          { error: "Paper supportability is still being analyzed." },
          { status: 409 }
        );
      }

      const title = `Reproduce: ${paper.title}`;
      const hypothesisId = dbOps.createHypothesis(
        payload.projectId,
        title,
        "The main reported result of this paper can be reproduced within tolerance under a faithful implementation.",
        paper.supportabilityReason ??
          "Autonomously reproduce the paper's main result using the official repository first, then paper evidence.",
        "A reproduced or approximately reproduced verdict with a locked plan, findings, logs, and artifact bundle.",
        {
          kind: "reproduction",
          paperId: paper._id,
          workflowStatus: "planned",
          phase: "queued",
          supportabilityLabel: paper.supportabilityLabel,
          tolerance: 1.0,
          lastActivityAt: Date.now(),
        }
      );

      dbOps.updateHypothesisStatus(hypothesisId, "active");

      const experimentId = dbOps.createExperiment(
        payload.projectId,
        hypothesisId,
        "Main result reproduction",
        "Official-code-first reproduction workflow for the paper's primary result.",
        [],
        {
          computeTier: payload.settings.computeTier,
          preferOfficialCode: payload.settings.preferOfficialCode,
          allowSupportingPapers: payload.settings.allowSupportingPapers,
          humanApprovalOnBlocker: payload.settings.humanApprovalOnBlocker,
        },
        {
          status: "planned",
          workflowStatus: "planned",
          executionMode: payload.settings.preferOfficialCode
            ? "official_code"
            : "hybrid_reconstruction",
          fallbackMode: "hybrid_reconstruction",
          runnerId: runnerCapability.backend,
          phase: "queued",
          progressPercent: 0,
          progressDetails: "Queued for autonomous intake",
        }
      );

      dbOps.updateHypothesis(hypothesisId, {
        currentExperimentId: experimentId,
        lastActivityAt: Date.now(),
      });

      dbOps.createReproductionPlan({
        projectId: payload.projectId,
        hypothesisId,
        experimentId,
        paperId: paper._id,
        paperType: paper.paperType ?? null,
        targetClaim: "Main reported result",
        targetMetric: null,
        targetValue: null,
        tolerance: 1.0,
        primaryExecutionMode: payload.settings.preferOfficialCode
          ? "official_code"
          : "hybrid_reconstruction",
        fallbackExecutionMode: "hybrid_reconstruction",
        acceptedSources: JSON.stringify(
          payload.settings.allowSupportingPapers
            ? [
                "official_repo",
                "paper_pdf",
                "supplementary_material",
                "supporting_papers",
              ]
            : ["official_repo", "paper_pdf", "supplementary_material"]
        ),
        datasetSpec: payload.settings.credentialsNote || null,
        environmentSpec: JSON.stringify({
          appBaseUrl: resolvePublicAppBaseUrl(request),
          computeTier: payload.settings.computeTier,
          officialRepoUrl: paper.officialRepoUrl,
          pdfUrl: paper.pdfUrl,
          runnerBackend: runnerCapability.backend,
        }),
        assumptionPolicy: "auto_resolve_low_risk",
        escalationPolicy: payload.settings.humanApprovalOnBlocker
          ? "hard_blockers_only"
          : "autonomous_best_effort",
        successPolicy: "within_tolerance",
        settingsSnapshot: JSON.stringify(payload.settings),
      });

      dbOps.addExperimentLog({
        projectId: payload.projectId,
        hypothesisId,
        experimentId,
        phase: "queued",
        kind: "planning",
        message: "Queued paper reproduction from the literature library.",
        metadata: JSON.stringify({
          paperId: paper._id,
          paperTitle: paper.title,
        }),
      });
      dbOps.createWorkflowCheckpoint({
        projectId: payload.projectId,
        hypothesisId,
        experimentId,
        stage: "queued",
        status: "created",
        payload: JSON.stringify(payload.settings),
      });

      await inngest.send({
        name: REPRODUCTION_EVENTS.STAGE,
        data: {
          projectId: payload.projectId,
          hypothesisId,
          experimentId,
          stage: "ingest",
        },
      });

      return NextResponse.json({
        success: true,
        hypothesisId,
        experimentId,
      });
    }

    if (payload.action === "retry") {
      const runnerCapability = getRunnerCapability();
      if (!runnerCapability.available) {
        return NextResponse.json(
          {
            error:
              runnerCapability.reason ??
              "This deployment cannot execute reproduction runs yet.",
          },
          { status: 409 }
        );
      }

      const hypothesis = dbOps.getHypothesisById(payload.hypothesisId);
      if (
        !hypothesis ||
        hypothesis.projectId !== payload.projectId ||
        hypothesis.kind !== "reproduction"
      ) {
        return NextResponse.json(
          { error: "Reproduction experiment not found" },
          { status: 404 }
        );
      }

      const previousExperiment = hypothesis.currentExperimentId
        ? dbOps.getExperimentById(hypothesis.currentExperimentId)
        : dbOps.getLatestExperimentByHypothesis(hypothesis._id);
      const previousPlan = dbOps.getReproductionPlanByHypothesis(hypothesis._id);
      const paperId = previousPlan?.paperId ?? hypothesis.paperId ?? null;
      const paper = paperId ? dbOps.getPaperById(paperId) : null;

      if (!previousExperiment || !previousPlan || !paper) {
        return NextResponse.json(
          { error: "Retry context for this reproduction is unavailable." },
          { status: 409 }
        );
      }

      const experimentConfig = (() => {
        try {
          const parsed = JSON.parse(previousExperiment.config) as unknown;
          return parsed && typeof parsed === "object"
            ? (parsed as Record<string, unknown>)
            : {};
        } catch {
          return {};
        }
      })();

      const nextEnvironmentSpec = (() => {
        try {
          const parsed = JSON.parse(previousPlan.environmentSpec ?? "{}") as Record<
            string,
            unknown
          >;
          return JSON.stringify({
            ...parsed,
            appBaseUrl: resolvePublicAppBaseUrl(request),
            runnerBackend: runnerCapability.backend,
          });
        } catch {
          return JSON.stringify({
            appBaseUrl: resolvePublicAppBaseUrl(request),
            runnerBackend: runnerCapability.backend,
          });
        }
      })();

      const experimentId = dbOps.createExperiment(
        payload.projectId,
        hypothesis._id,
        previousExperiment.name,
        previousExperiment.protocol,
        [],
        experimentConfig,
        {
          status: "planned",
          workflowStatus: "planned",
          executionMode:
            previousExperiment.executionMode ??
            previousPlan.primaryExecutionMode ??
            "official_code",
          fallbackMode:
            previousExperiment.fallbackMode ??
            previousPlan.fallbackExecutionMode ??
            "hybrid_reconstruction",
          runnerId: runnerCapability.backend,
          phase: "queued",
          progressPercent: 0,
          progressDetails: "Queued retry for autonomous intake",
        }
      );

      dbOps.updateHypothesis(hypothesis._id, {
        status: "active",
        actualOutcome: null,
        completedAt: null,
        workflowStatus: "planned",
        phase: "queued",
        verdict: null,
        bestValue: null,
        gap: null,
        blockedAt: null,
        currentExperimentId: experimentId,
        lastActivityAt: Date.now(),
      });

      const openBlocker = dbOps.getOpenExperimentBlocker(hypothesis._id);
      if (openBlocker) {
        dbOps.resolveExperimentBlocker(openBlocker._id, "Superseded by retry attempt.");
      }

      dbOps.createReproductionPlan({
        projectId: payload.projectId,
        hypothesisId: hypothesis._id,
        experimentId,
        paperId: paper._id,
        paperType: previousPlan.paperType,
        targetClaim: previousPlan.targetClaim,
        targetMetric: previousPlan.targetMetric,
        targetValue: previousPlan.targetValue,
        tolerance: previousPlan.tolerance,
        primaryExecutionMode: previousPlan.primaryExecutionMode,
        fallbackExecutionMode: previousPlan.fallbackExecutionMode,
        acceptedSources: previousPlan.acceptedSources,
        datasetSpec: previousPlan.datasetSpec,
        environmentSpec: nextEnvironmentSpec,
        assumptionPolicy: previousPlan.assumptionPolicy,
        escalationPolicy: previousPlan.escalationPolicy,
        successPolicy: previousPlan.successPolicy,
        settingsSnapshot: previousPlan.settingsSnapshot,
      });

      dbOps.addExperimentLog({
        projectId: payload.projectId,
        hypothesisId: hypothesis._id,
        experimentId,
        phase: "queued",
        kind: "planning",
        message: `Retry queued from attempt ${previousExperiment.attemptNumber}.`,
        metadata: JSON.stringify({
          previousExperimentId: previousExperiment._id,
          previousAttemptNumber: previousExperiment.attemptNumber,
          paperId: paper._id,
          paperTitle: paper.title,
        }),
      });
      dbOps.createWorkflowCheckpoint({
        projectId: payload.projectId,
        hypothesisId: hypothesis._id,
        experimentId,
        stage: "queued",
        status: "retried",
        payload: JSON.stringify({
          previousExperimentId: previousExperiment._id,
          previousAttemptNumber: previousExperiment.attemptNumber,
        }),
      });

      await inngest.send({
        name: REPRODUCTION_EVENTS.STAGE,
        data: {
          projectId: payload.projectId,
          hypothesisId: hypothesis._id,
          experimentId,
          stage: "ingest",
        },
      });

      return NextResponse.json({
        success: true,
        hypothesisId: hypothesis._id,
        experimentId,
      });
    }

    if (payload.action === "cancel") {
      const experiment = dbOps.getExperimentById(payload.experimentId);
      if (!experiment || experiment.projectId !== payload.projectId) {
        return NextResponse.json({ error: "Experiment not found" }, { status: 404 });
      }

      const hypothesis = dbOps.getHypothesisById(experiment.hypothesisId);
      if (!hypothesis) {
        return NextResponse.json({ error: "Hypothesis not found" }, { status: 404 });
      }

      const executionJob = dbOps.getLatestExecutionJobByExperiment(payload.experimentId);
      if (
        executionJob &&
        executionJob.runnerBackend === "modal" &&
        !["completed", "failed", "cancelled"].includes(executionJob.status)
      ) {
        try {
          await cancelModalExecution(executionJob);
        } catch (error) {
          return NextResponse.json(
            {
              error:
                error instanceof Error
                  ? error.message
                  : "Unable to cancel the active runner job.",
            },
            { status: 409 }
          );
        }
        dbOps.updateExecutionJob(executionJob._id, {
          status: "cancelled",
          completedAt: Date.now(),
        });
      }

      dbOps.updateExperiment(payload.experimentId, {
        status: "cancelled",
        workflowStatus: "not_reproduced",
        completedAt: Date.now(),
        progressDetails: "Cancelled by user",
      });
      dbOps.updateHypothesis(hypothesis._id, {
        status: "abandoned",
        workflowStatus: "not_reproduced",
      });
      dbOps.addExperimentLog({
        projectId: payload.projectId,
        hypothesisId: hypothesis._id,
        experimentId: payload.experimentId,
        phase: experiment.phase ?? "cancelled",
        kind: "cancellation",
        message: "Experiment cancelled by user.",
        metadata: null,
      });
      dbOps.createWorkflowCheckpoint({
        projectId: payload.projectId,
        hypothesisId: hypothesis._id,
        experimentId: payload.experimentId,
        stage: experiment.phase ?? "cancelled",
        status: "cancelled",
        payload: null,
      });

      await inngest.send({
        name: REPRODUCTION_EVENTS.CANCEL,
        data: {
          projectId: payload.projectId,
          hypothesisId: hypothesis._id,
          experimentId: payload.experimentId,
        },
      });

      return NextResponse.json({ success: true });
    }

    const blocker = dbOps.getExperimentBlockerById(payload.blockerId);
    if (!blocker || blocker.projectId !== payload.projectId) {
      return NextResponse.json({ error: "Blocker not found" }, { status: 404 });
    }

    const resumed = resumeBlockedExperiment(
      payload.blockerId,
      payload.resolution
    );

    await inngest.send({
      name: REPRODUCTION_EVENTS.STAGE,
      data: resumed,
    });

    return NextResponse.json({ success: true, ...resumed });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid reproduction request" },
        { status: 400 }
      );
    }

    const message =
      error instanceof Error ? error.message : "Unable to process reproduction request";
    console.error("Reproduction route error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
