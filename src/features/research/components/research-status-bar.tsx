"use client";

import { cn } from "@/lib/utils";
import ky from "ky";
import { toast } from "sonner";
import {
  FlaskConicalIcon,
  LoaderIcon,
  SquareIcon,
  CircleCheckIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Id, type ResearchState } from "@/lib/local-db/types";

interface ResearchStatusBarProps {
  projectId: Id<"projects">;
  state: ResearchState | undefined;
  onStartClick: () => void;
}

const phaseLabels: Record<string, string> = {
  idle: "Idle",
  bootstrap: "Bootstrapping",
  inner_loop: "Running Experiments",
  outer_loop: "Synthesizing",
  finalizing: "Writing Paper",
  completed: "Completed",
};

const phaseColors: Record<string, string> = {
  idle: "bg-muted text-muted-foreground",
  bootstrap: "bg-blue-500/15 text-blue-400",
  inner_loop: "bg-purple-500/15 text-purple-400",
  outer_loop: "bg-amber-500/15 text-amber-400",
  finalizing: "bg-emerald-500/15 text-emerald-400",
  completed: "bg-green-500/15 text-green-400",
};

export const ResearchStatusBar = ({
  projectId,
  state,
  onStartClick,
}: ResearchStatusBarProps) => {
  const phase = state?.phase ?? "idle";
  const isActive = phase !== "idle" && phase !== "completed";

  const handleStop = async () => {
    try {
      await ky.post("/api/research", {
        json: { action: "stop", projectId },
      });
      toast.success("Research stopped");
    } catch {
      toast.error("Failed to stop research");
    }
  };

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border bg-card px-4 py-2.5">
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex items-center gap-2">
          {isActive ? (
            <LoaderIcon className="size-3.5 animate-spin text-purple-400" />
          ) : phase === "completed" ? (
            <CircleCheckIcon className="size-3.5 text-green-400" />
          ) : (
            <FlaskConicalIcon className="size-3.5 text-muted-foreground" />
          )}
          <Badge className={cn("text-xs", phaseColors[phase])}>
            {phaseLabels[phase]}
          </Badge>
        </div>
        {state?.researchQuestion && (
          <span className="text-xs text-muted-foreground truncate">
            {state.researchQuestion}
          </span>
        )}
        {isActive && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
            <span>{state?.experimentCount ?? 0} experiments</span>
            <span>&middot;</span>
            <span>Loop {state?.innerLoopCount ?? 0}</span>
          </div>
        )}
      </div>
      <div className="shrink-0">
        {phase === "idle" ? (
          <Button size="sm" onClick={onStartClick}>
            <FlaskConicalIcon className="size-3 mr-1.5" />
            Start Research
          </Button>
        ) : isActive ? (
          <Button size="sm" variant="destructive" onClick={handleStop}>
            <SquareIcon className="size-3 mr-1.5" />
            Stop
          </Button>
        ) : null}
      </div>
    </div>
  );
};
