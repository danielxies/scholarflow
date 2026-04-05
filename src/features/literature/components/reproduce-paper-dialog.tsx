"use client";

import { useEffect, useState } from "react";
import { Loader2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { Id, Paper } from "@/lib/local-db/types";

function formatToken(value: string | null | undefined) {
  if (!value) return "Unknown";
  return value.replace(/_/g, " ");
}

interface ReproducePaperDialogProps {
  projectId: Id<"projects">;
  paper: Paper | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface RunnerCapability {
  backend: string;
  available: boolean;
  reason: string | null;
}

export function ReproducePaperDialog({
  projectId,
  paper,
  open,
  onOpenChange,
}: ReproducePaperDialogProps) {
  const [computeTier, setComputeTier] = useState<"small" | "standard" | "extended">(
    "standard"
  );
  const [allowSupportingPapers, setAllowSupportingPapers] = useState(true);
  const [preferOfficialCode, setPreferOfficialCode] = useState(true);
  const [humanApprovalOnBlocker, setHumanApprovalOnBlocker] = useState(true);
  const [credentialsNote, setCredentialsNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [runnerCapability, setRunnerCapability] = useState<RunnerCapability | null>(
    null
  );
  const [isLoadingRunnerCapability, setIsLoadingRunnerCapability] = useState(false);

  useEffect(() => {
    if (!paper || !open) return;
    setComputeTier("standard");
    setAllowSupportingPapers(true);
    setPreferOfficialCode(true);
    setHumanApprovalOnBlocker(true);
    setCredentialsNote("");
  }, [paper, open]);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setIsLoadingRunnerCapability(true);

    fetch("/api/reproduction", {
      method: "GET",
      cache: "no-store",
    })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as
          | RunnerCapability
          | { error?: string }
          | null;
        const payloadError =
          payload && "error" in payload && typeof payload.error === "string"
            ? payload.error
            : null;

        if (!response.ok) {
          throw new Error(
            payloadError ??
              `Unable to load runner status (${response.status} ${response.statusText})`
          );
        }

        if (!cancelled) {
          setRunnerCapability(payload as RunnerCapability);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setRunnerCapability({
            backend: "none",
            available: false,
            reason:
              error instanceof Error
                ? error.message
                : "Unable to load runner availability.",
          });
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingRunnerCapability(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!paper) {
    return null;
  }

  const analysisFailed =
    paper.summaryStatus === "failed" || paper.sourceDiscoveryStatus === "failed";
  const isUnsupported = paper.reproducibilityClass === "not_reproducible";
  const isPending =
    !analysisFailed &&
    (!paper.reproducibilityClass ||
      !paper.supportabilityLabel ||
      paper.sourceDiscoveryStatus === "processing");
  const isRunnerUnavailable =
    !isLoadingRunnerCapability && runnerCapability?.available === false;
  const canStart = !isUnsupported && !isPending && !isRunnerUnavailable;

  const handleRefreshAnalysis = async () => {
    if (isRefreshing) return;

    setIsRefreshing(true);
    try {
      const response = await fetch("/api/papers/refresh-enrichment", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          projectId,
          paperId: paper._id,
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!response.ok) {
        throw new Error(
          payload?.error ??
            `Unable to refresh paper analysis (${response.status} ${response.statusText})`
        );
      }

      toast.success("Paper analysis refreshed");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to refresh paper analysis"
      );
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleStart = async () => {
    if (!canStart || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/reproduction", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "start",
          projectId,
          paperId: paper._id,
          settings: {
            computeTier,
            allowSupportingPapers,
            preferOfficialCode,
            humanApprovalOnBlocker,
            credentialsNote,
          },
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!response.ok) {
        throw new Error(
          payload?.error ??
            `Unable to start reproduction (${response.status} ${response.statusText})`
        );
      }

      toast.success("Reproduction queued");
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to start reproduction"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Reproduce Paper</DialogTitle>
          <DialogDescription>
            Start one autonomous main-result reproduction for this paper.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2 rounded-lg border bg-card/40 p-3">
            <div>
              <p className="text-sm font-medium leading-snug">{paper.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Mode: main result · Strictness: within tolerance
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">
                {formatToken(paper.supportabilityLabel)}
              </Badge>
              <Badge variant="outline">
                {formatToken(paper.reproducibilityClass)}
              </Badge>
              <Badge variant="outline">
                Official repo: {paper.officialRepoUrl ? "yes" : "no"}
              </Badge>
            </div>
          </div>

          {isUnsupported && (
            <Alert variant="destructive">
              <TriangleAlert />
              <AlertTitle>Run unavailable</AlertTitle>
              <AlertDescription>
                {paper.supportabilityReason ??
                  "This paper is not supported for reliable autonomous reproduction."}
              </AlertDescription>
            </Alert>
          )}

          {isPending && !isUnsupported && (
            <Alert>
              <Loader2 className="animate-spin" />
              <AlertTitle>Paper analysis still running</AlertTitle>
              <AlertDescription>
                Supportability and reproducibility must finish processing before
                this paper can be reproduced.
                <div className="pt-2">
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={handleRefreshAnalysis}
                    disabled={isRefreshing}
                  >
                    {isRefreshing ? "Refreshing..." : "Refresh analysis"}
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {analysisFailed && (
            <Alert variant="destructive">
              <TriangleAlert />
              <AlertTitle>Analysis failed</AlertTitle>
              <AlertDescription>
                The saved paper analysis did not complete cleanly. Refresh it to
                rebuild the summary and reproduction supportability.
                <div className="pt-2">
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={handleRefreshAnalysis}
                    disabled={isRefreshing}
                  >
                    {isRefreshing ? "Refreshing..." : "Refresh analysis"}
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {isLoadingRunnerCapability && (
            <Alert>
              <Loader2 className="animate-spin" />
              <AlertTitle>Checking runner availability</AlertTitle>
              <AlertDescription>
                Confirming whether this deployment can execute reproduction runs.
              </AlertDescription>
            </Alert>
          )}

          {isRunnerUnavailable && (
            <Alert variant="destructive">
              <TriangleAlert />
              <AlertTitle>Execution backend unavailable</AlertTitle>
              <AlertDescription>
                {runnerCapability?.reason ??
                  "This deployment cannot execute reproduction runs right now."}
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="compute-tier">Compute tier</Label>
            <Select
              value={computeTier}
              onValueChange={(value) =>
                setComputeTier(value as "small" | "standard" | "extended")
              }
            >
              <SelectTrigger id="compute-tier" className="w-full">
                <SelectValue placeholder="Select compute tier" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="small">Small</SelectItem>
                <SelectItem value="standard">Standard</SelectItem>
                <SelectItem value="extended">Extended</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="credentials-note">
              Dataset/API credentials note
            </Label>
            <Textarea
              id="credentials-note"
              value={credentialsNote}
              onChange={(event) => setCredentialsNote(event.target.value)}
              rows={3}
              placeholder="Optional: note any gated datasets, API access, or execution constraints needed to unblock this run later."
            />
          </div>

          <div className="space-y-3 rounded-lg border p-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Advanced
            </p>

            <div className="flex items-center justify-between gap-4">
              <div className="space-y-1">
                <Label>Allow supporting papers</Label>
                <p className="text-xs text-muted-foreground">
                  Use supporting or citing papers only to resolve ambiguity.
                </p>
              </div>
              <Switch
                checked={allowSupportingPapers}
                onCheckedChange={setAllowSupportingPapers}
              />
            </div>

            <div className="flex items-center justify-between gap-4">
              <div className="space-y-1">
                <Label>Prefer official code</Label>
                <p className="text-xs text-muted-foreground">
                  Use the official repository as the primary execution path.
                </p>
              </div>
              <Switch
                checked={preferOfficialCode}
                onCheckedChange={setPreferOfficialCode}
              />
            </div>

            <div className="flex items-center justify-between gap-4">
              <div className="space-y-1">
                <Label>Human approval on blocker</Label>
                <p className="text-xs text-muted-foreground">
                  Pause only on hard blockers and resume through chat.
                </p>
              </div>
              <Switch
                checked={humanApprovalOnBlocker}
                onCheckedChange={setHumanApprovalOnBlocker}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleStart}
            disabled={!canStart || isSubmitting || isLoadingRunnerCapability}
          >
            {isSubmitting ? "Starting..." : "Start Reproduction"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
