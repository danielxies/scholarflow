import { z } from "zod";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { inngest } from "@/inngest/client";
import * as dbOps from "@/lib/db";
import { CUSTOM_EXPERIMENT_EVENTS } from "@/features/experiments/inngest/events";
import {
  getRunnerCapability,
  resolvePublicAppBaseUrl,
} from "@/features/reproduction/server/runner-config";

const startSchema = z.object({
  action: z.literal("start"),
  projectId: z.string().min(1),
  experiment: z.object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().min(1).max(8000),
    benchmark: z.string().trim().max(4000).optional().default(""),
    repoUrl: z.union([z.string().trim().url(), z.literal("")]).optional().default(""),
    datasetNote: z.string().trim().max(4000).optional().default(""),
    contextPaperIds: z.array(z.string().min(1)).max(8).optional().default([]),
    settings: z.object({
      computeTier: z.enum(["small", "standard", "extended"]).default("standard"),
      allowSupportingPapers: z.boolean().default(true),
      humanApprovalOnBlocker: z.boolean().default(true),
      preferProvidedRepo: z.boolean().default(true),
    }),
  }),
});

const retrySchema = z.object({
  action: z.literal("retry"),
  projectId: z.string().min(1),
  hypothesisId: z.string().min(1),
});

const editSchema = z.object({
  action: z.literal("edit"),
  projectId: z.string().min(1),
  hypothesisId: z.string().min(1),
  experiment: startSchema.shape.experiment,
});

const requestSchema = z.discriminatedUnion("action", [
  startSchema,
  retrySchema,
  editSchema,
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

function parseSettingsSnapshot(
  settingsSnapshot: string,
  appBaseUrl: string
): {
  computeTier: "small" | "standard" | "extended";
  allowSupportingPapers: boolean;
  humanApprovalOnBlocker: boolean;
  preferProvidedRepo: boolean;
  appBaseUrl: string;
} {
  try {
    const parsed = JSON.parse(settingsSnapshot) as {
      computeTier?: "small" | "standard" | "extended";
      allowSupportingPapers?: boolean;
      humanApprovalOnBlocker?: boolean;
      preferProvidedRepo?: boolean;
      appBaseUrl?: string;
    };

    return {
      computeTier: parsed.computeTier ?? "standard",
      allowSupportingPapers: parsed.allowSupportingPapers ?? true,
      humanApprovalOnBlocker: parsed.humanApprovalOnBlocker ?? true,
      preferProvidedRepo: parsed.preferProvidedRepo ?? true,
      appBaseUrl,
    };
  } catch {
    return {
      computeTier: "standard",
      allowSupportingPapers: true,
      humanApprovalOnBlocker: true,
      preferProvidedRepo: true,
      appBaseUrl,
    };
  }
}

function parseExperimentConfig(config: string) {
  try {
    const parsed = JSON.parse(config) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function buildCustomExperimentCopy(experiment: {
  description: string;
  benchmark: string;
  repoUrl: string;
  datasetNote: string;
  contextPaperCount: number;
}) {
  const expectedOutcome =
    experiment.benchmark.trim() ||
    "Run the custom experiment, capture benchmark outputs, and generate a report bundle.";
  const rationale = [
    experiment.repoUrl ? `Repository context: ${experiment.repoUrl}` : null,
    experiment.datasetNote.trim()
      ? `Dataset/access note: ${experiment.datasetNote.trim()}`
      : null,
    experiment.contextPaperCount
      ? `Context papers: ${experiment.contextPaperCount} selected from the library.`
      : null,
  ]
    .filter(Boolean)
    .join(" ");

  return { expectedOutcome, rationale };
}

export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = requestSchema.parse(await request.json());

    try {
      ensureProjectAccess(payload.projectId, userId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Forbidden";
      const status =
        message === "Project not found" ? 404 : message === "Forbidden" ? 403 : 500;
      return NextResponse.json({ error: message }, { status });
    }

    const runnerCapability = getRunnerCapability();
    if (!runnerCapability.available) {
      return NextResponse.json(
        {
          error:
            runnerCapability.reason ??
            "This deployment cannot execute custom experiments yet.",
        },
        { status: 409 }
      );
    }

    if (payload.action === "start") {
      const validContextPaperIds = payload.experiment.contextPaperIds.filter((paperId) => {
        const paper = dbOps.getPaperById(paperId);
        return paper?.projectId === payload.projectId;
      });

      const uniqueTitle = dbOps.generateUniqueHypothesisTitle(
        payload.projectId,
        payload.experiment.title
      );

      const { expectedOutcome, rationale } = buildCustomExperimentCopy({
        description: payload.experiment.description.trim(),
        benchmark: payload.experiment.benchmark.trim(),
        repoUrl: payload.experiment.repoUrl.trim(),
        datasetNote: payload.experiment.datasetNote.trim(),
        contextPaperCount: validContextPaperIds.length,
      });

      const hypothesisId = dbOps.createHypothesis(
        payload.projectId,
        uniqueTitle,
        payload.experiment.description.trim(),
        rationale,
        expectedOutcome,
        {
          kind: "custom",
          workflowStatus: "planned",
          phase: "queued",
          lastActivityAt: Date.now(),
        }
      );
      dbOps.updateHypothesisStatus(hypothesisId, "active");

      const experimentId = dbOps.createExperiment(
        payload.projectId,
        hypothesisId,
        "Custom experiment run",
        "LLM-planned custom experiment workflow with Modal-backed execution.",
        [],
        {
          computeTier: payload.experiment.settings.computeTier,
          repoUrl: payload.experiment.repoUrl || null,
          benchmark: payload.experiment.benchmark || null,
        },
        {
          status: "planned",
          workflowStatus: "planned",
          executionMode: payload.experiment.repoUrl
            ? "provided_repo"
            : "planner_inferred",
          fallbackMode: "planner_repair",
          runnerId: runnerCapability.backend,
          phase: "queued",
          progressPercent: 0,
          progressDetails: "Queued for autonomous custom experiment intake",
        }
      );

      dbOps.updateHypothesis(hypothesisId, {
        currentExperimentId: experimentId,
        lastActivityAt: Date.now(),
      });

      dbOps.createCustomExperimentContext({
        projectId: payload.projectId,
        hypothesisId,
        experimentId,
        description: payload.experiment.description.trim(),
        benchmark: payload.experiment.benchmark.trim() || null,
        repoUrl: payload.experiment.repoUrl.trim() || null,
        datasetNote: payload.experiment.datasetNote.trim() || null,
        contextPaperIds: JSON.stringify(validContextPaperIds),
        settingsSnapshot: JSON.stringify({
          ...payload.experiment.settings,
          appBaseUrl: resolvePublicAppBaseUrl(request),
        }),
      });

      dbOps.addExperimentLog({
        projectId: payload.projectId,
        hypothesisId,
        experimentId,
        phase: "queued",
        kind: "planning",
        message: "Queued custom experiment from the experiments workspace.",
        metadata: JSON.stringify({
          repoUrl: payload.experiment.repoUrl || null,
          benchmark: payload.experiment.benchmark || null,
          contextPaperIds: validContextPaperIds,
        }),
      });
      dbOps.createWorkflowCheckpoint({
        projectId: payload.projectId,
        hypothesisId,
        experimentId,
        stage: "queued",
        status: "created",
        payload: JSON.stringify(payload.experiment),
      });

      await inngest.send({
        name: CUSTOM_EXPERIMENT_EVENTS.STAGE,
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
        title: uniqueTitle,
      });
    }

    if (payload.action === "edit") {
      const hypothesis = dbOps.getHypothesisById(payload.hypothesisId);
      if (!hypothesis || hypothesis.projectId !== payload.projectId || hypothesis.kind !== "custom") {
        return NextResponse.json({ error: "Custom experiment not found" }, { status: 404 });
      }

      const previousExperiment = hypothesis.currentExperimentId
        ? dbOps.getExperimentById(hypothesis.currentExperimentId)
        : dbOps.getLatestExperimentByHypothesis(hypothesis._id);
      const activeExecutionJob = previousExperiment
        ? dbOps.getLatestExecutionJobByExperiment(previousExperiment._id)
        : null;

      if (
        activeExecutionJob &&
        !["completed", "failed", "cancelled", "blocked"].includes(activeExecutionJob.status)
      ) {
        return NextResponse.json(
          { error: "This experiment is still running. Cancel or wait for it to finish before editing the inputs." },
          { status: 409 }
        );
      }

      const validContextPaperIds = payload.experiment.contextPaperIds.filter((paperId) => {
        const paper = dbOps.getPaperById(paperId);
        return paper?.projectId === payload.projectId;
      });

      const nextTitle =
        payload.experiment.title.trim() === hypothesis.title
          ? hypothesis.title
          : dbOps.generateUniqueHypothesisTitleExcluding(
              payload.projectId,
              payload.experiment.title,
              hypothesis._id
            );
      const { expectedOutcome, rationale } = buildCustomExperimentCopy({
        description: payload.experiment.description.trim(),
        benchmark: payload.experiment.benchmark.trim(),
        repoUrl: payload.experiment.repoUrl.trim(),
        datasetNote: payload.experiment.datasetNote.trim(),
        contextPaperCount: validContextPaperIds.length,
      });

      const experimentId = dbOps.createExperiment(
        payload.projectId,
        hypothesis._id,
        previousExperiment?.name ?? "Custom experiment run",
        previousExperiment?.protocol ??
          "LLM-planned custom experiment workflow with Modal-backed execution.",
        [],
        {
          computeTier: payload.experiment.settings.computeTier,
          repoUrl: payload.experiment.repoUrl || null,
          benchmark: payload.experiment.benchmark || null,
        },
        {
          status: "planned",
          workflowStatus: "planned",
          executionMode: payload.experiment.repoUrl
            ? "provided_repo"
            : "planner_inferred",
          fallbackMode: "planner_repair",
          runnerId: runnerCapability.backend,
          phase: "queued",
          progressPercent: 0,
          progressDetails: "Queued edited custom experiment for autonomous intake",
        }
      );

      dbOps.updateHypothesis(hypothesis._id, {
        title: nextTitle,
        description: payload.experiment.description.trim(),
        rationale,
        expectedOutcome,
        status: "active",
        actualOutcome: null,
        completedAt: null,
        workflowStatus: "planned",
        phase: "queued",
        verdict: null,
        targetMetric: null,
        targetValue: null,
        tolerance: null,
        bestValue: null,
        gap: null,
        blockedAt: null,
        currentExperimentId: experimentId,
        lastActivityAt: Date.now(),
      });

      const openBlocker = dbOps.getOpenExperimentBlocker(hypothesis._id);
      if (openBlocker) {
        dbOps.resolveExperimentBlocker(openBlocker._id, "Superseded by edited rerun.");
      }

      dbOps.createCustomExperimentContext({
        projectId: payload.projectId,
        hypothesisId: hypothesis._id,
        experimentId,
        description: payload.experiment.description.trim(),
        benchmark: payload.experiment.benchmark.trim() || null,
        repoUrl: payload.experiment.repoUrl.trim() || null,
        datasetNote: payload.experiment.datasetNote.trim() || null,
        contextPaperIds: JSON.stringify(validContextPaperIds),
        settingsSnapshot: JSON.stringify({
          ...payload.experiment.settings,
          appBaseUrl: resolvePublicAppBaseUrl(request),
        }),
      });

      dbOps.addExperimentLog({
        projectId: payload.projectId,
        hypothesisId: hypothesis._id,
        experimentId,
        phase: "queued",
        kind: "planning",
        message: "Edited experiment inputs and queued a new custom experiment attempt.",
        metadata: JSON.stringify({
          previousExperimentId: previousExperiment?._id ?? null,
          previousAttemptNumber: previousExperiment?.attemptNumber ?? null,
          repoUrl: payload.experiment.repoUrl || null,
          benchmark: payload.experiment.benchmark || null,
          contextPaperIds: validContextPaperIds,
        }),
      });
      dbOps.createWorkflowCheckpoint({
        projectId: payload.projectId,
        hypothesisId: hypothesis._id,
        experimentId,
        stage: "queued",
        status: "edited",
        payload: JSON.stringify(payload.experiment),
      });

      await inngest.send({
        name: CUSTOM_EXPERIMENT_EVENTS.STAGE,
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
        title: nextTitle,
      });
    }

    const hypothesis = dbOps.getHypothesisById(payload.hypothesisId);
    if (!hypothesis || hypothesis.projectId !== payload.projectId || hypothesis.kind !== "custom") {
      return NextResponse.json({ error: "Custom experiment not found" }, { status: 404 });
    }

    const previousExperiment = hypothesis.currentExperimentId
      ? dbOps.getExperimentById(hypothesis.currentExperimentId)
      : dbOps.getLatestExperimentByHypothesis(hypothesis._id);
    const customContext = dbOps.getCustomExperimentContextByHypothesis(hypothesis._id);

    if (!previousExperiment || !customContext) {
      return NextResponse.json(
        { error: "Retry context for this experiment is unavailable." },
        { status: 409 }
      );
    }

    const settings = parseSettingsSnapshot(
      customContext.settingsSnapshot,
      resolvePublicAppBaseUrl(request)
    );
    const experimentId = dbOps.createExperiment(
      payload.projectId,
      hypothesis._id,
      previousExperiment.name,
      previousExperiment.protocol,
      [],
      parseExperimentConfig(previousExperiment.config),
      {
        status: "planned",
        workflowStatus: "planned",
        executionMode:
          previousExperiment.executionMode ??
          (customContext.repoUrl ? "provided_repo" : "planner_inferred"),
        fallbackMode: previousExperiment.fallbackMode ?? "planner_repair",
        runnerId: runnerCapability.backend,
        phase: "queued",
        progressPercent: 0,
        progressDetails: "Queued retry for autonomous custom experiment intake",
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

    dbOps.createCustomExperimentContext({
      projectId: payload.projectId,
      hypothesisId: hypothesis._id,
      experimentId,
      description: customContext.description,
      benchmark: customContext.benchmark,
      repoUrl: customContext.repoUrl,
      datasetNote: customContext.datasetNote,
      contextPaperIds: customContext.contextPaperIds,
      settingsSnapshot: JSON.stringify(settings),
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
        repoUrl: customContext.repoUrl,
        benchmark: customContext.benchmark,
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
      name: CUSTOM_EXPERIMENT_EVENTS.STAGE,
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
      title: hypothesis.title,
    });
  } catch (error) {
    console.error("Custom experiment start failed", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "Invalid custom experiment request" },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to start custom experiment",
      },
      { status: 500 }
    );
  }
}
