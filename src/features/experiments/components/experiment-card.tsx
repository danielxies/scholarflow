"use client";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Experiment } from "@/lib/local-db/types";

const STATUS_COLORS: Record<Experiment["status"], string> = {
  planned: "bg-gray-500/15 text-gray-600 dark:text-gray-400",
  running: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  completed: "bg-green-500/15 text-green-600 dark:text-green-400",
  failed: "bg-red-500/15 text-red-600 dark:text-red-400",
  cancelled: "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400",
};

function parseKeyMetric(metricsJson: string): { key: string; value: string } | null {
  try {
    const parsed = JSON.parse(metricsJson);
    if (typeof parsed === "object" && parsed !== null) {
      const entries = Object.entries(parsed);
      if (entries.length > 0) {
        const [key, value] = entries[0];
        return { key, value: String(value) };
      }
    }
  } catch {
    // ignore parse errors
  }
  return null;
}

interface ExperimentCardProps {
  experiment: Experiment;
  onClick?: () => void;
}

export function ExperimentCard({ experiment, onClick }: ExperimentCardProps) {
  const keyMetric = parseKeyMetric(experiment.metrics);

  return (
    <Card
      className="gap-0 py-0 overflow-hidden cursor-pointer hover:border-primary/30 transition-colors"
      onClick={onClick}
    >
      <CardHeader className="p-3 pb-0">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-sm leading-snug line-clamp-1">
            {experiment.name}
          </CardTitle>
          <Badge
            className={cn(
              "border-none text-[10px] px-1.5 py-0 shrink-0",
              STATUS_COLORS[experiment.status]
            )}
          >
            {experiment.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-3 pt-2">
        <p className="text-xs text-muted-foreground line-clamp-2">
          {experiment.protocol}
        </p>
        {keyMetric && (
          <div className="mt-2 flex items-center gap-1.5">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
              {keyMetric.key}:
            </span>
            <span className="text-xs font-medium">{keyMetric.value}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
