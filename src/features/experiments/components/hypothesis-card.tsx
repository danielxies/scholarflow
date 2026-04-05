"use client";

import { Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Hypothesis } from "@/lib/local-db/types";

function formatNumber(value: number | null) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "—";
  }

  return value.toFixed(2);
}

function displayStatus(hypothesis: Hypothesis) {
  return (hypothesis.workflowStatus ?? hypothesis.status).replace(/_/g, " ");
}

interface HypothesisCardProps {
  hypothesis: Hypothesis;
  displayTitle?: string;
  isSelected: boolean;
  onSelect: (hypothesisId: Hypothesis["_id"]) => void;
  onEdit?: (hypothesisId: Hypothesis["_id"]) => void;
}

export function HypothesisCard({
  hypothesis,
  displayTitle,
  isSelected,
  onSelect,
  onEdit,
}: HypothesisCardProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(hypothesis._id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(hypothesis._id);
        }
      }}
      className={cn(
        "w-full min-w-0 rounded-lg border bg-card p-3 text-left transition-colors",
        "hover:bg-accent/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        isSelected && "border-primary bg-accent/40"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {displayTitle ?? hypothesis.title}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Created {new Date(hypothesis.createdAt).toLocaleString()}
          </p>
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
            {hypothesis.description}
          </p>
        </div>
        <div className="flex max-w-[10rem] shrink-0 flex-col items-end gap-1">
          <Badge variant={hypothesis.kind === "reproduction" ? "default" : "outline"}>
            {hypothesis.kind === "reproduction" ? "Reproduction" : "Custom"}
          </Badge>
          <Badge variant="secondary">{displayStatus(hypothesis)}</Badge>
        </div>
      </div>

      <div className="mt-3 flex min-w-0 flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
        {hypothesis.targetMetric ? (
          <span className="break-words">Target: {hypothesis.targetMetric}</span>
        ) : null}
        {hypothesis.targetValue !== null ? (
          <span>Goal {formatNumber(hypothesis.targetValue)}</span>
        ) : null}
        {hypothesis.bestValue !== null ? (
          <span>Best {formatNumber(hypothesis.bestValue)}</span>
        ) : null}
        {hypothesis.gap !== null ? (
          <span>Gap {formatNumber(hypothesis.gap)}</span>
        ) : null}
        {hypothesis.supportabilityLabel ? (
          <span>{hypothesis.supportabilityLabel.replace(/_/g, " ")}</span>
        ) : null}
      </div>

      {hypothesis.kind === "custom" && onEdit ? (
        <div className="mt-3 flex justify-end">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 px-2 text-[11px]"
            onClick={(event) => {
              event.stopPropagation();
              onEdit(hypothesis._id);
            }}
          >
            <Pencil className="size-3.5" />
            Edit
          </Button>
        </div>
      ) : null}
    </div>
  );
}
