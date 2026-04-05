"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  FileText,
  FlaskConical,
  Lightbulb,
  Plus,
  ScrollText,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useLocalMutation } from "@/lib/local-db/hooks";
import type { ExperimentWorkspace, Hypothesis, Id } from "@/lib/local-db/types";

import { useCreateConversation, useConversationByContext } from "@/features/conversations/hooks/use-conversations";
import { useConversationStore } from "@/features/conversations/store/use-conversation-store";

import { useHypotheses } from "../hooks/use-hypotheses";
import {
  useExperiments,
  useExperimentWorkspace,
} from "../hooks/use-experiments";
import { ExperimentProgressPanel } from "./experiment-progress-panel";
import { FindingsPanel } from "./findings-panel";
import { HypothesisBoard } from "./hypothesis-board";
import { HypothesisCreateDialog } from "./hypothesis-create-dialog";
import { ResearchLogView } from "./research-log-view";

const STATUS_STYLES: Record<string, string> = {
  idle: "bg-gray-500/15 text-gray-600 dark:text-gray-400",
  planning: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  running: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  blocked: "bg-red-500/15 text-red-600 dark:text-red-400",
  complete: "bg-green-500/15 text-green-600 dark:text-green-400",
  failed: "bg-red-500/15 text-red-600 dark:text-red-400",
};

interface ExperimentsViewProps {
  projectId: Id<"projects">;
  isActive: boolean;
}

function getWorkflowLabel(hypothesis: Hypothesis) {
  return hypothesis.workflowStatus ?? hypothesis.status;
}

function sortHypotheses(hypotheses: Hypothesis[]) {
  return [...hypotheses].sort((left, right) => {
    if (right.createdAt !== left.createdAt) {
      return right.createdAt - left.createdAt;
    }

    return right._id.localeCompare(left._id);
  });
}

function buildDisplayTitles(hypotheses: Hypothesis[]) {
  const chronology = [...hypotheses].sort((left, right) => {
    if (left.createdAt !== right.createdAt) {
      return left.createdAt - right.createdAt;
    }

    return left._id.localeCompare(right._id);
  });

  const counts = new Map<string, number>();
  const displayTitles = new Map<string, string>();

  for (const hypothesis of chronology) {
    const nextCount = (counts.get(hypothesis.title) ?? 0) + 1;
    counts.set(hypothesis.title, nextCount);
    displayTitles.set(
      hypothesis._id,
      nextCount === 1 ? hypothesis.title : `${hypothesis.title} (${nextCount})`
    );
  }

  return displayTitles;
}

function isActiveWorkItem(hypothesis: Hypothesis) {
  const workflow = hypothesis.workflowStatus;
  return workflow === "planned" || workflow === "running" || workflow === "blocked";
}

function aggregateWorkspaceStatus(hypotheses: Hypothesis[]) {
  const workflows = hypotheses.map((hypothesis) => getWorkflowLabel(hypothesis));

  if (workflows.includes("running")) return "running";
  if (workflows.includes("planned")) return "planning";
  if (workflows.includes("blocked")) return "blocked";
  if (workflows.some((value) => value === "failed" || value === "not_reproduced")) {
    return "failed";
  }
  if (
    workflows.some((value) =>
      [
        "reproduced",
        "approximately_reproduced",
        "partially_reproduced",
        "completed",
      ].includes(value)
    )
  ) {
    return "complete";
  }

  return "idle";
}

function buildBlockerSeedMessage(params: {
  title: string;
  blockerMessage: string;
  requiredInput: string | null;
  phase: string | null;
}) {
  const lines = [
    `This experiment is blocked and needs human input to continue.`,
    "",
    `Experiment: ${params.title}`,
    `Blocker: ${params.blockerMessage}`,
  ];

  if (params.requiredInput) {
    lines.push(`Required input: ${params.requiredInput}`);
  }

  if (params.phase) {
    lines.push(`Current phase: ${params.phase}`);
  }

  lines.push("");
  lines.push("Reply here with the missing details to resume the blocked experiment.");

  return lines.join("\n");
}

export function ExperimentsView({ projectId, isActive }: ExperimentsViewProps) {
  const hypotheses = useHypotheses(isActive ? projectId : null);
  const experiments = useExperiments(isActive ? projectId : null);
  const sortedHypotheses = useMemo(
    () => sortHypotheses(hypotheses ?? []),
    [hypotheses]
  );
  const displayTitles = useMemo(
    () => buildDisplayTitles(sortedHypotheses),
    [sortedHypotheses]
  );

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingHypothesisId, setEditingHypothesisId] =
    useState<Id<"hypotheses"> | null>(null);
  const [editingWorkspaceSnapshot, setEditingWorkspaceSnapshot] =
    useState<ExperimentWorkspace | undefined>(undefined);
  const [isRetrying, setIsRetrying] = useState(false);
  const [manualSelectedHypothesisId, setManualSelectedHypothesisId] =
    useState<Id<"hypotheses"> | null>(null);
  const selectedHypothesisId = useMemo(() => {
    if (!sortedHypotheses.length) {
      return null;
    }

    const hasManualSelection = sortedHypotheses.some(
      (hypothesis) => hypothesis._id === manualSelectedHypothesisId
    );

    if (manualSelectedHypothesisId && hasManualSelection) {
      return manualSelectedHypothesisId;
    }

    return sortedHypotheses[0]._id;
  }, [manualSelectedHypothesisId, sortedHypotheses]);

  const workspace = useExperimentWorkspace(
    isActive ? selectedHypothesisId : null
  );
  const editingWorkspace = useExperimentWorkspace(
    isActive &&
      editDialogOpen &&
      editingHypothesisId &&
      !editingWorkspaceSnapshot
      ? editingHypothesisId
      : null
  );
  const selectedDisplayTitle = workspace?.hypothesis
    ? displayTitles.get(workspace.hypothesis._id) ?? workspace.hypothesis.title
    : null;
  const createConversation = useCreateConversation();
  const createMessage = useLocalMutation<{
    conversationId: string;
    projectId: string;
    role: "user" | "assistant";
    content: string;
    status?: "processing" | "completed" | "cancelled";
  }>("messages.create");
  const setSelectedConversationId = useConversationStore(
    (state) => state.setSelectedConversationId
  );
  const blockerConversation = useConversationByContext(
    isActive && workspace?.blocker ? projectId : null,
    workspace?.blocker ? "experiment_blocker" : null,
    workspace?.blocker?._id ?? null
  );

  const isLoading = hypotheses === undefined || experiments === undefined;

  const aggregateStatus = aggregateWorkspaceStatus(sortedHypotheses);
  const activeCount = sortedHypotheses.filter(isActiveWorkItem).length;
  const activeExperiments = (experiments ?? []).filter((experiment) => {
    return (
      experiment.status === "planned" ||
      experiment.status === "running" ||
      experiment.workflowStatus === "blocked"
    );
  });
  const innerCount = activeExperiments.reduce(
    (total, experiment) => total + experiment.innerLoopCount,
    0
  );
  const outerCount = activeExperiments.reduce(
    (total, experiment) => total + experiment.outerLoopCount,
    0
  );

  useEffect(() => {
    if (
      editDialogOpen &&
      editingHypothesisId &&
      editingWorkspace &&
      editingWorkspace.hypothesis._id === editingHypothesisId &&
      !editingWorkspaceSnapshot
    ) {
      setEditingWorkspaceSnapshot(editingWorkspace);
    }
  }, [
    editDialogOpen,
    editingHypothesisId,
    editingWorkspace,
    editingWorkspaceSnapshot,
  ]);

  const handleUnblock = async () => {
    if (!workspace?.blocker || !workspace.experiment) return;

    try {
      let conversationId = blockerConversation?._id ?? null;

      if (!conversationId) {
        conversationId = await createConversation({
          projectId,
          title: `Unblock: ${workspace.hypothesis.title}`,
          contextType: "experiment_blocker",
          contextId: workspace.blocker._id,
          contextPayload: JSON.stringify({
            hypothesisId: workspace.hypothesis._id,
            experimentId: workspace.experiment._id,
          }),
        });

        await createMessage({
          conversationId,
          projectId,
          role: "assistant",
          content: buildBlockerSeedMessage({
            title: workspace.hypothesis.title,
            blockerMessage: workspace.blocker.message,
            requiredInput: workspace.blocker.requiredInput,
            phase: workspace.experiment.phase,
          }),
          status: "completed",
        });
      }

      setSelectedConversationId(projectId, conversationId as Id<"conversations">);
      toast.success("Blocker chat opened in the sidebar");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to open unblock chat"
      );
    }
  };

  const handleRetry = async () => {
    if (!workspace?.hypothesis) return;

    setIsRetrying(true);
    try {
      const endpoint =
        workspace.hypothesis.kind === "reproduction"
          ? "/api/reproduction"
          : "/api/experiments/custom";

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "retry",
          projectId,
          hypothesisId: workspace.hypothesis._id,
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!response.ok) {
        throw new Error(
          payload?.error ??
            `Unable to retry experiment (${response.status} ${response.statusText})`
        );
      }

      toast.success("Retry queued");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to retry experiment"
      );
    } finally {
      setIsRetrying(false);
    }
  };

  const handleEdit = (hypothesisId: Id<"hypotheses">) => {
    setManualSelectedHypothesisId(hypothesisId);
    setEditingHypothesisId(hypothesisId);
    setEditingWorkspaceSnapshot(
      workspace?.hypothesis?._id === hypothesisId ? workspace : undefined
    );
    setEditDialogOpen(true);
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading experiments...
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto p-4">
      <div className="flex items-center gap-3 rounded-lg border bg-card p-3">
        <Activity className="size-4 shrink-0 text-muted-foreground" />
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="text-sm font-medium">Research status</span>
          <Badge className={STATUS_STYLES[aggregateStatus] ?? STATUS_STYLES.idle}>
            {aggregateStatus}
          </Badge>
          {selectedDisplayTitle ? (
            <span className="truncate text-xs text-muted-foreground">
              {selectedDisplayTitle}
            </span>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <FlaskConical className="size-3" />
            {activeCount} experiments
          </span>
          <span>inner: {innerCount}</span>
          <span>outer: {outerCount}</span>
        </div>
      </div>

      <div className="flex min-h-[24rem] min-w-0 flex-col">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Lightbulb className="size-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Experiments</h2>
            <span className="text-xs text-muted-foreground">
              ({sortedHypotheses.length})
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCreateDialogOpen(true)}
          >
            <Plus className="size-3.5" />
            New Experiment
          </Button>
        </div>

        <div className="min-h-0 flex-1">
          <HypothesisBoard
            className="h-full"
            hypotheses={sortedHypotheses}
            displayTitles={displayTitles}
            selectedHypothesisId={selectedHypothesisId}
            onSelect={setManualSelectedHypothesisId}
            onEdit={handleEdit}
          />
        </div>
      </div>

      <Separator />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="flex min-h-[28rem] min-w-0 flex-col rounded-lg border p-3 xl:h-[28rem]">
          <div className="mb-3 flex items-center gap-2">
            <TrendingUp className="size-4 text-muted-foreground" />
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Experiment Progress
            </h3>
          </div>
          <div className="min-h-0 flex-1">
            <ExperimentProgressPanel
              workspace={workspace}
              onUnblock={handleUnblock}
              onRetry={handleRetry}
              isRetrying={isRetrying}
            />
          </div>
        </div>

        <div className="flex min-h-[28rem] min-w-0 flex-col rounded-lg border p-3 xl:h-[28rem]">
          <div className="mb-3 flex items-center gap-2">
            <FileText className="size-4 text-muted-foreground" />
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Findings
            </h3>
            {workspace ? (
              <span className="text-xs text-muted-foreground">
                ({workspace.findings.length})
              </span>
            ) : null}
          </div>
          <div className="min-h-0 flex-1">
            <FindingsPanel findings={workspace?.findings ?? []} />
          </div>
        </div>
      </div>

      <Separator />

      <div className="flex h-[24rem] min-w-0 flex-col">
        <div className="mb-3 flex items-center gap-2">
          <ScrollText className="size-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Research Log</h2>
          {workspace ? (
            <span className="text-xs text-muted-foreground">
              ({workspace.logs.length} entries)
            </span>
          ) : null}
        </div>
        <div className="min-h-0 flex-1 rounded-lg border bg-card p-3">
          <ResearchLogView entries={workspace?.logs ?? []} />
        </div>
      </div>

      <HypothesisCreateDialog
        projectId={projectId}
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
      />
      <HypothesisCreateDialog
        projectId={projectId}
        open={editDialogOpen}
        onOpenChange={(open) => {
          setEditDialogOpen(open);
          if (!open) {
            setEditingHypothesisId(null);
            setEditingWorkspaceSnapshot(undefined);
          }
        }}
        mode="edit"
        editHypothesisId={editingHypothesisId}
        initialWorkspace={editingWorkspaceSnapshot}
      />
    </div>
  );
}
