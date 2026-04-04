"use client";

import { useState, useCallback } from "react";
import {
  FlaskConical,
  Lightbulb,
  Plus,
  Activity,
  ScrollText,
  FileText,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useHypotheses, useUpdateHypothesisStatus } from "../hooks/use-hypotheses";
import { useExperiments } from "../hooks/use-experiments";
import { useResearchState } from "../hooks/use-research-state";
import { useResearchLog } from "../hooks/use-research-log";
import { HypothesisBoard } from "./hypothesis-board";
import { HypothesisCreateDialog } from "./hypothesis-create-dialog";
import { ExperimentCard } from "./experiment-card";
import { ExperimentDetailDialog } from "./experiment-detail-dialog";
import { KarpathyPlot } from "./karpathy-plot";
import { FindingsPanel } from "./findings-panel";
import { ResearchLogView } from "./research-log-view";
import type { Hypothesis, Experiment } from "@/lib/local-db/types";

const PHASE_LABELS: Record<string, string> = {
  idle: "Idle",
  bootstrap: "Bootstrap",
  inner_loop: "Inner Loop",
  outer_loop: "Outer Loop",
  finalizing: "Finalizing",
  completed: "Completed",
};

const PHASE_COLORS: Record<string, string> = {
  idle: "bg-gray-500/15 text-gray-600 dark:text-gray-400",
  bootstrap: "bg-purple-500/15 text-purple-600 dark:text-purple-400",
  inner_loop: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  outer_loop: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
  finalizing: "bg-green-500/15 text-green-600 dark:text-green-400",
  completed: "bg-green-500/15 text-green-600 dark:text-green-400",
};

const DIRECTION_LABELS: Record<string, string> = {
  DEEPEN: "Deepen",
  BROADEN: "Broaden",
  PIVOT: "Pivot",
  CONCLUDE: "Conclude",
};

interface ExperimentsViewProps {
  projectId: string;
  isActive: boolean;
}

export function ExperimentsView({ projectId, isActive }: ExperimentsViewProps) {
  const hypotheses = useHypotheses(isActive ? projectId : null);
  const experiments = useExperiments(isActive ? projectId : null);
  const researchState = useResearchState(isActive ? projectId : null);
  const logEntries = useResearchLog(isActive ? projectId : null, 50);

  const updateHypothesisStatus = useUpdateHypothesisStatus();

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedExperiment, setSelectedExperiment] = useState<Experiment | null>(null);
  const [experimentDialogOpen, setExperimentDialogOpen] = useState(false);

  const handleStatusChange = useCallback(
    async (id: string, status: Hypothesis["status"]) => {
      try {
        await updateHypothesisStatus({ id, status });
      } catch (err) {
        console.error("Failed to update hypothesis status:", err);
      }
    },
    [updateHypothesisStatus]
  );

  const handleExperimentClick = useCallback((experiment: Experiment) => {
    setSelectedExperiment(experiment);
    setExperimentDialogOpen(true);
  }, []);

  const isLoading = hypotheses === undefined || experiments === undefined;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        Loading experiments...
      </div>
    );
  }

  const state = researchState ?? undefined;

  return (
    <div className="flex flex-col gap-6 p-4 h-full overflow-y-auto">
      {/* Research Status Bar */}
      <div className="flex items-center gap-3 p-3 rounded-lg border bg-card">
        <Activity className="size-4 text-muted-foreground shrink-0" />
        <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
          <span className="text-sm font-medium">Research</span>
          <Badge
            className={cn(
              "border-none text-xs",
              PHASE_COLORS[state?.phase ?? "idle"] ?? PHASE_COLORS.idle
            )}
          >
            {PHASE_LABELS[state?.phase ?? "idle"] ?? "Idle"}
          </Badge>
          {state?.directionDecision && (
            <Badge variant="outline" className="text-xs">
              {DIRECTION_LABELS[state.directionDecision] ?? state.directionDecision}
            </Badge>
          )}
          {state?.researchQuestion && (
            <span className="text-xs text-muted-foreground truncate">
              {state.researchQuestion}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
          <span className="flex items-center gap-1">
            <FlaskConical className="size-3" />
            {state?.experimentCount ?? 0} experiments
          </span>
          <span className="flex items-center gap-1">
            inner: {state?.innerLoopCount ?? 0}
          </span>
          <span className="flex items-center gap-1">
            outer: {state?.outerLoopCount ?? 0}
          </span>
        </div>
      </div>

      {/* Hypotheses Section */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Lightbulb className="size-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Hypotheses</h2>
            <span className="text-xs text-muted-foreground">
              ({hypotheses.length})
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCreateDialogOpen(true)}
          >
            <Plus className="size-3.5" />
            New Hypothesis
          </Button>
        </div>
        <HypothesisBoard
          hypotheses={hypotheses}
          experiments={experiments}
          onStatusChange={handleStatusChange}
        />
      </div>

      <Separator />

      {/* Experiments List */}
      {experiments.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <FlaskConical className="size-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">All Experiments</h2>
            <span className="text-xs text-muted-foreground">
              ({experiments.length})
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {experiments.map((exp) => (
              <ExperimentCard
                key={exp._id}
                experiment={exp}
                onClick={() => handleExperimentClick(exp)}
              />
            ))}
          </div>
        </div>
      )}

      {experiments.length > 0 && <Separator />}

      {/* Two-panel: Karpathy Plot + Findings */}
      <div className="flex gap-4 min-h-[280px]">
        {/* Karpathy Plot */}
        <div className="flex-1 flex flex-col border rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="size-4 text-muted-foreground" />
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Experiment Progress
            </h3>
          </div>
          <div className="flex-1 min-h-[200px]">
            <KarpathyPlot experiments={experiments} />
          </div>
        </div>

        {/* Findings */}
        <div className="flex-1 flex flex-col border rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <FileText className="size-4 text-muted-foreground" />
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Findings
            </h3>
          </div>
          <div className="flex-1 min-h-[200px]">
            <FindingsPanel findings={state?.findings ?? ""} />
          </div>
        </div>
      </div>

      <Separator />

      {/* Research Log */}
      <div className="flex flex-col min-h-[200px]">
        <div className="flex items-center gap-2 mb-3">
          <ScrollText className="size-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Research Log</h2>
          {logEntries && (
            <span className="text-xs text-muted-foreground">
              ({logEntries.length} entries)
            </span>
          )}
        </div>
        <div className="flex-1 border rounded-lg p-3 max-h-[400px]">
          <ResearchLogView entries={logEntries ?? []} />
        </div>
      </div>

      {/* Dialogs */}
      <HypothesisCreateDialog
        projectId={projectId}
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
      />
      <ExperimentDetailDialog
        experiment={selectedExperiment}
        open={experimentDialogOpen}
        onOpenChange={setExperimentDialogOpen}
      />
    </div>
  );
}
