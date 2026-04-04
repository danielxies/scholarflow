"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { HypothesisCard } from "./hypothesis-card";
import type { Hypothesis, Experiment } from "@/lib/local-db/types";

const COLUMNS: {
  status: Hypothesis["status"];
  label: string;
  color: string;
}[] = [
  { status: "proposed", label: "Proposed", color: "bg-gray-500/15 text-gray-600 dark:text-gray-400" },
  { status: "active", label: "Active", color: "bg-blue-500/15 text-blue-600 dark:text-blue-400" },
  { status: "completed", label: "Completed", color: "bg-green-500/15 text-green-600 dark:text-green-400" },
  { status: "failed", label: "Failed", color: "bg-red-500/15 text-red-600 dark:text-red-400" },
];

interface HypothesisBoardProps {
  hypotheses: Hypothesis[];
  experiments: Experiment[];
  onStatusChange: (id: string, status: Hypothesis["status"]) => void;
}

export function HypothesisBoard({
  hypotheses,
  experiments,
  onStatusChange,
}: HypothesisBoardProps) {
  const experimentCountMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const exp of experiments) {
      map[exp.hypothesisId] = (map[exp.hypothesisId] || 0) + 1;
    }
    return map;
  }, [experiments]);

  const grouped = useMemo(() => {
    const map: Record<string, Hypothesis[]> = {};
    for (const col of COLUMNS) {
      map[col.status] = [];
    }
    for (const h of hypotheses) {
      if (map[h.status]) {
        map[h.status].push(h);
      }
    }
    return map;
  }, [hypotheses]);

  if (hypotheses.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
        No hypotheses yet. Create one to get started.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-4 gap-3 min-h-[200px]">
      {COLUMNS.map((col) => (
        <div key={col.status} className="flex flex-col gap-2">
          <div className="flex items-center gap-2 px-1">
            <Badge
              className={cn("border-none text-xs", col.color)}
            >
              {col.label}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {grouped[col.status]?.length || 0}
            </span>
          </div>
          <ScrollArea className="flex-1 max-h-[400px]">
            <div className="flex flex-col gap-2 pr-2">
              {grouped[col.status]?.map((h) => (
                <HypothesisCard
                  key={h._id}
                  hypothesis={h}
                  experimentCount={experimentCountMap[h._id] || 0}
                  onStatusChange={onStatusChange}
                />
              ))}
              {grouped[col.status]?.length === 0 && (
                <div className="flex items-center justify-center h-20 rounded-lg border border-dashed text-xs text-muted-foreground">
                  None
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      ))}
    </div>
  );
}
