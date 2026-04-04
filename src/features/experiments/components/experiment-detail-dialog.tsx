"use client";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import type { Experiment } from "@/lib/local-db/types";

const STATUS_COLORS: Record<Experiment["status"], string> = {
  planned: "bg-gray-500/15 text-gray-600 dark:text-gray-400",
  running: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  completed: "bg-green-500/15 text-green-600 dark:text-green-400",
  failed: "bg-red-500/15 text-red-600 dark:text-red-400",
  cancelled: "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400",
};

function parseJson(jsonStr: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(jsonStr);
    if (typeof parsed === "object" && parsed !== null) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // ignore
  }
  return null;
}

interface ExperimentDetailDialogProps {
  experiment: Experiment | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ExperimentDetailDialog({
  experiment,
  open,
  onOpenChange,
}: ExperimentDetailDialogProps) {
  if (!experiment) return null;

  const metrics = parseJson(experiment.metrics);
  const skillsUsed = parseJson(experiment.skillsUsed);
  const config = parseJson(experiment.config);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <DialogTitle>{experiment.name}</DialogTitle>
            <Badge
              className={cn(
                "border-none text-xs",
                STATUS_COLORS[experiment.status]
              )}
            >
              {experiment.status}
            </Badge>
          </div>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh]">
          <div className="space-y-4 pr-4">
            {/* Protocol */}
            <Section title="Protocol">
              <p className="text-sm whitespace-pre-wrap">{experiment.protocol}</p>
            </Section>

            {/* Results */}
            {experiment.results && (
              <Section title="Results">
                <p className="text-sm whitespace-pre-wrap">{experiment.results}</p>
              </Section>
            )}

            {/* Metrics Table */}
            {metrics && Object.keys(metrics).length > 0 && (
              <Section title="Metrics">
                <div className="rounded-md border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left font-medium p-2">Metric</th>
                        <th className="text-left font-medium p-2">Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(metrics).map(([key, value]) => (
                        <tr key={key} className="border-b last:border-b-0">
                          <td className="p-2 text-muted-foreground">{key}</td>
                          <td className="p-2 font-mono">{String(value)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Section>
            )}

            {/* Skills Used */}
            {skillsUsed && (
              <Section title="Skills Used">
                <div className="flex flex-wrap gap-1">
                  {Array.isArray(skillsUsed)
                    ? (skillsUsed as string[]).map((s, i) => (
                        <Badge key={i} variant="outline" className="text-xs">
                          {String(s)}
                        </Badge>
                      ))
                    : Object.entries(skillsUsed).map(([key, val]) => (
                        <Badge key={key} variant="outline" className="text-xs">
                          {key}: {String(val)}
                        </Badge>
                      ))}
                </div>
              </Section>
            )}

            {/* Config */}
            {config && Object.keys(config).length > 0 && (
              <Section title="Configuration">
                <pre className="text-xs bg-muted rounded-md p-3 overflow-x-auto">
                  {JSON.stringify(config, null, 2)}
                </pre>
              </Section>
            )}

            {/* Logs */}
            {experiment.logs && (
              <Section title="Logs">
                <pre className="text-xs bg-muted rounded-md p-3 overflow-x-auto whitespace-pre-wrap max-h-48">
                  {experiment.logs}
                </pre>
              </Section>
            )}

            {/* Timestamps */}
            <Section title="Timeline">
              <div className="flex gap-4 text-xs text-muted-foreground">
                {experiment.startedAt && (
                  <span>
                    Started: {new Date(experiment.startedAt).toLocaleString()}
                  </span>
                )}
                {experiment.completedAt && (
                  <span>
                    Completed: {new Date(experiment.completedAt).toLocaleString()}
                  </span>
                )}
              </div>
            </Section>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {title}
        </h3>
        <Separator className="flex-1" />
      </div>
      {children}
    </div>
  );
}
