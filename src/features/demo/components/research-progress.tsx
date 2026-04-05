import { LoaderIcon, CheckCircleIcon, SquareIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface ResearchProgressProps {
  title: string;
  steps: { label: string; status: "pending" | "active" | "done" }[];
  statusText: string;
  progress: number; // 0-100
}

export const ResearchProgress = ({
  title,
  steps,
  statusText,
  progress,
}: ResearchProgressProps) => {
  return (
    <div className="w-full rounded-lg border bg-card shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <h3 className="text-sm font-bold">{title}</h3>
        <button className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded hover:bg-accent">
          Update
        </button>
      </div>

      {/* Steps */}
      <div className="px-4 pb-3 space-y-2">
        {steps.map((step, i) => (
          <div key={i} className="flex items-center gap-2.5">
            {step.status === "done" ? (
              <CheckCircleIcon className="size-4 text-green-500 shrink-0" />
            ) : step.status === "active" ? (
              <LoaderIcon className="size-4 text-muted-foreground animate-spin shrink-0" />
            ) : (
              <div className="size-4 rounded-full border border-muted-foreground/30 shrink-0" />
            )}
            <span
              className={cn(
                "text-sm",
                step.status === "done" && "text-muted-foreground",
                step.status === "pending" && "text-muted-foreground/60"
              )}
            >
              {step.label}
            </span>
          </div>
        ))}
      </div>

      {/* Status text */}
      <div className="px-4 pb-3">
        <p className="text-xs text-muted-foreground">{statusText}</p>
      </div>

      {/* Progress bar + stop button */}
      <div className="px-4 pb-3 flex items-center gap-2">
        <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full bg-secondary rounded-full transition-all duration-300"
            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          />
        </div>
        <button className="text-muted-foreground hover:text-foreground transition-colors shrink-0">
          <SquareIcon className="size-3.5" />
        </button>
      </div>
    </div>
  );
};
