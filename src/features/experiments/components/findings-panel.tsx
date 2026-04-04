"use client";

import { ScrollArea } from "@/components/ui/scroll-area";

interface FindingsPanelProps {
  findings: string;
}

export function FindingsPanel({ findings }: FindingsPanelProps) {
  if (!findings || findings.trim().length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        No findings recorded yet.
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="pr-4">
        <p className="text-sm whitespace-pre-wrap leading-relaxed">
          {findings}
        </p>
      </div>
    </ScrollArea>
  );
}
