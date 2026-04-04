"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  FlaskConical,
  MoreHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Hypothesis } from "@/lib/local-db/types";

const STATUS_COLORS: Record<Hypothesis["status"], string> = {
  proposed: "bg-gray-500/15 text-gray-600 dark:text-gray-400",
  active: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  completed: "bg-green-500/15 text-green-600 dark:text-green-400",
  failed: "bg-red-500/15 text-red-600 dark:text-red-400",
  abandoned: "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400",
};

const STATUS_TRANSITIONS: Record<Hypothesis["status"], Hypothesis["status"][]> = {
  proposed: ["active", "abandoned"],
  active: ["completed", "failed", "abandoned"],
  completed: [],
  failed: ["proposed"],
  abandoned: ["proposed"],
};

interface HypothesisCardProps {
  hypothesis: Hypothesis;
  experimentCount: number;
  onStatusChange: (id: string, status: Hypothesis["status"]) => void;
}

export function HypothesisCard({
  hypothesis,
  experimentCount,
  onStatusChange,
}: HypothesisCardProps) {
  const [expanded, setExpanded] = useState(false);
  const transitions = STATUS_TRANSITIONS[hypothesis.status];

  return (
    <Card className="gap-0 py-0 overflow-hidden">
      <CardHeader className="p-3 pb-0">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-sm leading-snug line-clamp-2">
            {hypothesis.title}
          </CardTitle>
          <div className="flex items-center gap-1 shrink-0">
            {transitions.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-xs">
                    <MoreHorizontal className="size-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {transitions.map((status) => (
                    <DropdownMenuItem
                      key={status}
                      onClick={() => onStatusChange(hypothesis._id, status)}
                    >
                      <Badge
                        className={cn(
                          "border-none text-[10px] px-1.5 py-0",
                          STATUS_COLORS[status]
                        )}
                      >
                        {status}
                      </Badge>
                      <span className="text-xs text-muted-foreground ml-1">
                        Move to {status}
                      </span>
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => setExpanded(!expanded)}
                  >
                    {expanded ? "Collapse" : "Expand"} details
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-3 pt-2">
        <p className={cn("text-xs text-muted-foreground", !expanded && "line-clamp-2")}>
          {hypothesis.description}
        </p>

        <div className="flex items-center gap-2 mt-2">
          <Badge
            className={cn(
              "border-none text-[10px] px-1.5 py-0",
              STATUS_COLORS[hypothesis.status]
            )}
          >
            {hypothesis.status}
          </Badge>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-1">
            <FlaskConical className="size-2.5" />
            {experimentCount}
          </Badge>
        </div>

        {expanded && (
          <div className="mt-3 space-y-2 border-t pt-2">
            <div>
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                Rationale
              </p>
              <p className="text-xs mt-0.5">{hypothesis.rationale}</p>
            </div>
            <div>
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                Expected Outcome
              </p>
              <p className="text-xs mt-0.5">{hypothesis.expectedOutcome}</p>
            </div>
            {hypothesis.actualOutcome && (
              <div>
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  Actual Outcome
                </p>
                <p className="text-xs mt-0.5">{hypothesis.actualOutcome}</p>
              </div>
            )}
          </div>
        )}

        <Button
          variant="ghost"
          size="xs"
          className="w-full mt-2 text-muted-foreground"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? (
            <ChevronUp className="size-3" />
          ) : (
            <ChevronDown className="size-3" />
          )}
          {expanded ? "Less" : "More"}
        </Button>
      </CardContent>
    </Card>
  );
}
