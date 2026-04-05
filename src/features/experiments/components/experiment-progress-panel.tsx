"use client";

import { AlertTriangle, LockOpen, RotateCcw, Target } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ExperimentWorkspace } from "@/lib/local-db/types";

function formatMetric(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "—";
  }

  return value.toFixed(2);
}

interface ExperimentProgressPanelProps {
  workspace: ExperimentWorkspace | undefined;
  onUnblock?: () => void;
  onRetry?: () => void;
  isRetrying?: boolean;
}

export function ExperimentProgressPanel({
  workspace,
  onUnblock,
  onRetry,
  isRetrying = false,
}: ExperimentProgressPanelProps) {
  if (!workspace) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Select an experiment to inspect its current run.
      </div>
    );
  }

  const { hypothesis, experiment, blocker, artifacts, executionJob } = workspace;

  if (!experiment) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        No run has been created for this experiment yet.
      </div>
    );
  }

  const workflowStatus = hypothesis.workflowStatus ?? hypothesis.status;
  const hasActiveRunnerJob =
    !!executionJob &&
    !["completed", "failed", "cancelled", "blocked"].includes(
      executionJob.status
    );
  const canRetry =
    typeof onRetry === "function" &&
    !hasActiveRunnerJob;

  return (
    <ScrollArea className="h-full rounded-lg">
      <div className="flex min-w-0 flex-col gap-4 pr-4">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="min-w-0 rounded-lg border p-3">
            <div className="mb-2 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Current phase
                </p>
                <p className="line-clamp-2 text-sm font-medium break-words">
                  {experiment.phase ?? hypothesis.phase ?? "Queued"}
                </p>
              </div>
              <Badge variant="secondary" className="shrink-0">
                {workflowStatus.replace(/_/g, " ")}
              </Badge>
            </div>
            <Progress value={experiment.progressPercent} />
            <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
              {experiment.progressDetails || "Waiting for execution updates"}
            </p>
            {canRetry ? (
              <div className="mt-3">
                <Button size="sm" variant="outline" onClick={onRetry} disabled={isRetrying}>
                  <RotateCcw className="size-3.5" />
                  {isRetrying ? "Retrying..." : "Retry"}
                </Button>
              </div>
            ) : null}
          </div>

          <div className="min-w-0 rounded-lg border p-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Execution
            </p>
            <div className="mt-2 space-y-1.5 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Mode</span>
                <span className="truncate text-right">
                  {experiment.executionMode ?? "native"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Fallback</span>
                <span className="truncate text-right">
                  {experiment.fallbackMode ?? "none"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Artifacts</span>
                <span>{artifacts.length}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Runner</span>
                <span className="truncate text-right">
                  {executionJob?.runnerBackend ?? experiment.runnerId ?? "—"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Job</span>
                <span className="truncate text-right">
                  {executionJob?.runnerJobId ?? "pending"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Tier</span>
                <span className="truncate text-right">
                  {executionJob?.computeTier ?? "—"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Command</span>
                <span className="truncate text-right">
                  {executionJob?.currentCommand ?? "waiting"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Heartbeat</span>
                <span className="truncate text-right">
                  {executionJob?.lastHeartbeatAt
                    ? new Date(executionJob.lastHeartbeatAt).toLocaleTimeString()
                    : "—"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Inner</span>
                <span>{experiment.innerLoopCount}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Outer</span>
                <span>{experiment.outerLoopCount}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="min-w-0 rounded-lg border p-3">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Target className="size-3.5 shrink-0" />
              <span>Target metric</span>
            </div>
            <p className="mt-2 line-clamp-2 text-sm font-medium break-words">
              {hypothesis.targetMetric ?? workspace.plan?.targetMetric ?? "Unspecified"}
            </p>
          </div>
          <div className="min-w-0 rounded-lg border p-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Target value
            </p>
            <p className="mt-2 truncate text-sm font-medium">
              {formatMetric(hypothesis.targetValue ?? workspace.plan?.targetValue)}
            </p>
          </div>
          <div className="min-w-0 rounded-lg border p-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Best reproduced
            </p>
            <p className="mt-2 truncate text-sm font-medium">
              {formatMetric(hypothesis.bestValue)}
            </p>
          </div>
          <div className="min-w-0 rounded-lg border p-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Gap / tolerance
            </p>
            <p className="mt-2 truncate text-sm font-medium">
              {formatMetric(hypothesis.gap)} / {formatMetric(hypothesis.tolerance)}
            </p>
          </div>
        </div>

        {blocker && (
          <Alert variant="destructive">
            <AlertTriangle />
            <AlertTitle>Blocked</AlertTitle>
            <AlertDescription>
              <p className="line-clamp-3 break-words">{blocker.message}</p>
              {blocker.requiredInput ? (
                <p className="line-clamp-3 break-words">
                  {blocker.requiredInput}
                </p>
              ) : null}
              <div className="pt-2">
                <Button size="sm" variant="outline" onClick={onUnblock}>
                  <LockOpen className="size-3.5" />
                  Unblock
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        )}
      </div>
    </ScrollArea>
  );
}
