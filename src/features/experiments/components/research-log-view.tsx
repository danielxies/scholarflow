"use client";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ResearchLogEntry } from "@/lib/local-db/types";

const PHASE_COLORS: Record<string, string> = {
  idle: "bg-gray-500/15 text-gray-600 dark:text-gray-400",
  bootstrap: "bg-purple-500/15 text-purple-600 dark:text-purple-400",
  inner_loop: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  outer_loop: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
  finalizing: "bg-green-500/15 text-green-600 dark:text-green-400",
  completed: "bg-green-500/15 text-green-600 dark:text-green-400",
};

function formatTimestamp(ts: number): string {
  const date = new Date(ts);
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

interface ResearchLogViewProps {
  entries: ResearchLogEntry[];
}

export function ResearchLogView({ entries }: ResearchLogViewProps) {
  if (entries.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        No log entries yet.
      </div>
    );
  }

  const sorted = [...entries].sort((a, b) => b.timestamp - a.timestamp);

  return (
    <ScrollArea className="h-full">
      <div className="space-y-0 pr-4">
        {sorted.map((entry, idx) => (
          <div key={entry._id} className="flex gap-3 py-2">
            {/* Timeline line */}
            <div className="flex flex-col items-center">
              <div className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0" />
              {idx < sorted.length - 1 && (
                <div className="w-px flex-1 bg-border mt-1" />
              )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0 pb-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] text-muted-foreground font-mono">
                  {formatTimestamp(entry.timestamp)}
                </span>
                <Badge
                  variant="outline"
                  className="text-[10px] px-1.5 py-0"
                >
                  {entry.action}
                </Badge>
                <Badge
                  className={cn(
                    "border-none text-[10px] px-1.5 py-0",
                    PHASE_COLORS[entry.phase] ?? "bg-gray-500/15 text-gray-600 dark:text-gray-400"
                  )}
                >
                  {entry.phase}
                </Badge>
              </div>
              {entry.details && (
                <p className="text-xs text-muted-foreground mt-1 line-clamp-3">
                  {entry.details}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
