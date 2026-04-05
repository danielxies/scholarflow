"use client";

import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ExperimentFinding } from "@/lib/local-db/types";

interface FindingsPanelProps {
  findings: ExperimentFinding[];
}

export function FindingsPanel({ findings }: FindingsPanelProps) {
  if (findings.length === 0) {
    return (
      <div className="flex h-full items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
        No findings recorded yet.
      </div>
    );
  }

  const sorted = [...findings].sort((a, b) => b.timestamp - a.timestamp);

  return (
    <ScrollArea className="h-full rounded-lg">
      <div className="space-y-2.5 pr-4">
        {sorted.map((finding) => (
          <div key={finding._id} className="min-w-0 rounded-lg border p-2.5">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <Badge variant="secondary">{finding.type}</Badge>
              <Badge variant="outline">{finding.severity}</Badge>
              {finding.source ? (
                <Badge variant="outline">{finding.source}</Badge>
              ) : null}
              <span className="text-[11px] text-muted-foreground sm:ml-auto">
                {new Date(finding.timestamp).toLocaleString()}
              </span>
            </div>
            <p className="mt-2 line-clamp-3 text-sm leading-relaxed break-words">
              {finding.message}
            </p>
            {typeof finding.confidence === "number" ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Confidence {Math.round(finding.confidence * 100)}%
              </p>
            ) : null}
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
