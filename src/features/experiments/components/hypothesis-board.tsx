"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import type { Hypothesis } from "@/lib/local-db/types";
import { cn } from "@/lib/utils";
import { HypothesisCard } from "./hypothesis-card";

interface HypothesisBoardProps {
  hypotheses: Hypothesis[];
  displayTitles?: Map<Hypothesis["_id"], string>;
  selectedHypothesisId: Hypothesis["_id"] | null;
  onSelect: (hypothesisId: Hypothesis["_id"]) => void;
  onEdit?: (hypothesisId: Hypothesis["_id"]) => void;
  className?: string;
}

export function HypothesisBoard({
  hypotheses,
  displayTitles,
  selectedHypothesisId,
  onSelect,
  onEdit,
  className,
}: HypothesisBoardProps) {
  if (hypotheses.length === 0) {
    return (
      <div
        className={cn(
          "flex h-full min-h-[12rem] items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground",
          className
        )}
      >
        No experiments yet. Create a custom experiment or reproduce a paper from your library.
      </div>
    );
  }

  return (
    <ScrollArea className={cn("h-full rounded-lg border", className)}>
      <div className="flex flex-col gap-2 p-2">
        {hypotheses.map((hypothesis) => (
          <HypothesisCard
            key={hypothesis._id}
            hypothesis={hypothesis}
            displayTitle={displayTitles?.get(hypothesis._id) ?? hypothesis.title}
            isSelected={selectedHypothesisId === hypothesis._id}
            onSelect={onSelect}
            onEdit={onEdit}
          />
        ))}
      </div>
    </ScrollArea>
  );
}
