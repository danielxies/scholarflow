"use client";

import { FileText } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ExperimentFinding } from "@/lib/local-db/types";

interface FindingsReportCard {
  title: string;
  summary: string | null;
  generatedAt: number | null;
  workflowStatus: string | null;
}

interface FindingsPanelProps {
  findings: ExperimentFinding[];
  report?: FindingsReportCard | null;
  onOpenReport?: () => void;
}

export function FindingsPanel({
  findings,
  report = null,
  onOpenReport,
}: FindingsPanelProps) {
  if (findings.length === 0 && !report) {
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
        {report ? (
          <button
            type="button"
            onClick={onOpenReport}
            className="w-full rounded-lg border border-primary/20 bg-primary/5 p-3 text-left transition-colors hover:bg-primary/10"
          >
            <div className="flex items-start gap-3">
              <div className="rounded-md bg-primary/10 p-2 text-primary">
                <FileText className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <Badge variant="secondary">report</Badge>
                  {report.workflowStatus ? (
                    <Badge variant="outline">
                      {report.workflowStatus.replace(/_/g, " ")}
                    </Badge>
                  ) : null}
                  {report.generatedAt ? (
                    <span className="text-[11px] text-muted-foreground sm:ml-auto">
                      {new Date(report.generatedAt).toLocaleString()}
                    </span>
                  ) : null}
                </div>
                <p className="mt-2 text-sm font-medium">{report.title}</p>
                <p className="mt-1 line-clamp-3 text-sm leading-relaxed text-muted-foreground">
                  {report.summary ??
                    "Open the generated report for a full run summary, findings, and output analysis."}
                </p>
              </div>
            </div>
          </button>
        ) : null}

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
