"use client";

import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ExperimentLogEntry } from "@/lib/local-db/types";

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
  entries: ExperimentLogEntry[];
}

export function ResearchLogView({ entries }: ResearchLogViewProps) {
  if (entries.length === 0) {
    return (
      <div className="flex h-full items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
        No log entries yet.
      </div>
    );
  }

  const sorted = [...entries].sort((a, b) => b.timestamp - a.timestamp);

  return (
    <ScrollArea className="h-full rounded-lg">
      <div className="space-y-2 pr-4">
        {sorted.map((entry, idx) => (
          <div
            key={entry._id}
            className="min-w-0 rounded-lg border border-border/70 bg-background/70 px-3 py-2"
          >
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="size-2 rounded-full bg-primary shrink-0" />
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    {entry.kind}
                  </Badge>
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    {entry.phase}
                  </Badge>
                </div>
                {entry.message && (
                  <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-foreground break-words">
                    {entry.message}
                  </p>
                )}
              </div>
              <span className="shrink-0 text-[10px] text-muted-foreground font-mono">
                {idx + 1 === 1 ? "Latest" : formatTimestamp(entry.timestamp)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
