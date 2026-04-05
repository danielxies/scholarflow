"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { ExperimentWorkspace, Id } from "@/lib/local-db/types";
import { useProjectPapers } from "@/features/literature/hooks/use-papers";

interface HypothesisCreateDialogProps {
  projectId: Id<"projects">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode?: "create" | "edit";
  editHypothesisId?: Id<"hypotheses"> | null;
  initialWorkspace?: ExperimentWorkspace;
}

interface RunnerCapability {
  backend: string;
  available: boolean;
  reason: string | null;
}

function parseCustomSettings(workspace?: ExperimentWorkspace) {
  if (!workspace?.customContext) {
    return {
      computeTier: "standard" as const,
      allowSupportingPapers: true,
      humanApprovalOnBlocker: true,
      preferProvidedRepo: true,
      contextPaperIds: [] as string[],
    };
  }

  let computeTier: "small" | "standard" | "extended" = "standard";
  let allowSupportingPapers = true;
  let humanApprovalOnBlocker = true;
  let preferProvidedRepo = true;
  let contextPaperIds: string[] = [];

  try {
    const parsed = JSON.parse(workspace.customContext.settingsSnapshot) as {
      computeTier?: "small" | "standard" | "extended";
      allowSupportingPapers?: boolean;
      humanApprovalOnBlocker?: boolean;
      preferProvidedRepo?: boolean;
    };
    computeTier = parsed.computeTier ?? "standard";
    allowSupportingPapers = parsed.allowSupportingPapers ?? true;
    humanApprovalOnBlocker = parsed.humanApprovalOnBlocker ?? true;
    preferProvidedRepo = parsed.preferProvidedRepo ?? true;
  } catch {}

  try {
    const parsed = JSON.parse(workspace.customContext.contextPaperIds) as unknown;
    contextPaperIds = Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string")
      : [];
  } catch {}

  return {
    computeTier,
    allowSupportingPapers,
    humanApprovalOnBlocker,
    preferProvidedRepo,
    contextPaperIds,
  };
}

export function HypothesisCreateDialog({
  projectId,
  open,
  onOpenChange,
  mode = "create",
  editHypothesisId = null,
  initialWorkspace,
}: HypothesisCreateDialogProps) {
  const papers = useProjectPapers(projectId) ?? [];
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [benchmark, setBenchmark] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [datasetNote, setDatasetNote] = useState("");
  const [selectedPaperIds, setSelectedPaperIds] = useState<string[]>([]);
  const [computeTier, setComputeTier] = useState<"small" | "standard" | "extended">(
    "standard"
  );
  const [allowSupportingPapers, setAllowSupportingPapers] = useState(true);
  const [humanApprovalOnBlocker, setHumanApprovalOnBlocker] = useState(true);
  const [preferProvidedRepo, setPreferProvidedRepo] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [runnerCapability, setRunnerCapability] = useState<RunnerCapability | null>(
    null
  );
  const [isLoadingRunnerCapability, setIsLoadingRunnerCapability] = useState(false);
  const [hasInitializedForm, setHasInitializedForm] = useState(false);

  useEffect(() => {
    if (open) {
      setHasInitializedForm(false);
    }
  }, [editHypothesisId, mode, open]);

  useEffect(() => {
    if (!open) {
      setHasInitializedForm(false);
      return;
    }

    if (hasInitializedForm) {
      return;
    }

    if (mode === "edit" && initialWorkspace?.hypothesis && initialWorkspace.customContext) {
      const settings = parseCustomSettings(initialWorkspace);
      setTitle(initialWorkspace.hypothesis.title);
      setDescription(initialWorkspace.customContext.description);
      setBenchmark(initialWorkspace.customContext.benchmark ?? "");
      setRepoUrl(initialWorkspace.customContext.repoUrl ?? "");
      setDatasetNote(initialWorkspace.customContext.datasetNote ?? "");
      setSelectedPaperIds(settings.contextPaperIds);
      setComputeTier(settings.computeTier);
      setAllowSupportingPapers(settings.allowSupportingPapers);
      setHumanApprovalOnBlocker(settings.humanApprovalOnBlocker);
      setPreferProvidedRepo(settings.preferProvidedRepo);
      setHasInitializedForm(true);
      return;
    }

    if (mode === "edit") {
      return;
    }

    setTitle("");
    setDescription("");
    setBenchmark("");
    setRepoUrl("");
    setDatasetNote("");
    setSelectedPaperIds([]);
    setComputeTier("standard");
    setAllowSupportingPapers(true);
    setHumanApprovalOnBlocker(true);
    setPreferProvidedRepo(true);
    setHasInitializedForm(true);
  }, [hasInitializedForm, initialWorkspace, mode, open]);

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

  const canStart = useMemo(() => {
    return (
      title.trim().length > 0 &&
      description.trim().length > 0 &&
      !isSubmitting &&
      !isLoadingRunnerCapability &&
      runnerCapability?.available !== false
    );
  }, [
    description,
    isLoadingRunnerCapability,
    isSubmitting,
    runnerCapability?.available,
    title,
  ]);

  const togglePaper = (paperId: string) => {
    setSelectedPaperIds((current) =>
      current.includes(paperId)
        ? current.filter((id) => id !== paperId)
        : [...current, paperId]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canStart) return;

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/experiments/custom", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: mode === "edit" ? "edit" : "start",
          projectId,
          ...(mode === "edit" && editHypothesisId
            ? { hypothesisId: editHypothesisId }
            : {}),
          experiment: {
            title: title.trim(),
            description: description.trim(),
            benchmark: benchmark.trim(),
            repoUrl: repoUrl.trim(),
            datasetNote: datasetNote.trim(),
            contextPaperIds: selectedPaperIds,
            settings: {
              computeTier,
              allowSupportingPapers,
              humanApprovalOnBlocker,
              preferProvidedRepo,
            },
          },
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { error?: string; title?: string }
        | null;

      if (!response.ok) {
        throw new Error(
          payload?.error ??
            `Unable to start experiment (${response.status} ${response.statusText})`
        );
      }

      toast.success(
        payload?.title
          ? mode === "edit"
            ? `Updated ${payload.title} and queued a rerun`
            : `Started ${payload.title}`
          : mode === "edit"
            ? "Experiment updated and rerun queued"
            : "Custom experiment started"
      );
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : mode === "edit"
            ? "Unable to update experiment"
            : "Unable to start custom experiment"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid h-[90vh] max-h-[90vh] grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="shrink-0 px-6 pt-6 pb-4">
          <DialogTitle>
            {mode === "edit" ? "Edit Experiment" : "New Experiment"}
          </DialogTitle>
          <DialogDescription>
            {mode === "edit"
              ? "Update the original experiment inputs and queue a new rerun on the shared Modal pipeline."
              : "Describe the experiment in natural language and the system will plan and run it on the shared Modal pipeline."}
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={handleSubmit}
          className="grid min-h-0 grid-rows-[minmax(0,1fr)_auto] overflow-hidden"
        >
          <div className="min-h-0 overflow-hidden">
            <ScrollArea className="h-full min-h-0">
              <div className="space-y-5 px-6 pt-2 pb-6">
              {runnerCapability?.available === false ? (
                <Alert variant="destructive">
                  <TriangleAlert className="size-4" />
                  <AlertTitle>Runner unavailable</AlertTitle>
                  <AlertDescription>
                    {runnerCapability.reason ??
                      "This deployment cannot execute custom experiments right now."}
                  </AlertDescription>
                </Alert>
              ) : null}

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="experiment-title">Name</Label>
                  <Input
                    id="experiment-title"
                    placeholder="e.g. Fine-tune Qwen on GSM8K with self-consistency"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="experiment-description">Description</Label>
                  <Textarea
                    id="experiment-description"
                    placeholder="Describe what you want to test, what should be run, and what outcome matters."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={4}
                    required
                  />
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="experiment-benchmark">Benchmark / success criteria</Label>
                  <Textarea
                    id="experiment-benchmark"
                    placeholder="Optional benchmark, target metric, or expected threshold."
                    value={benchmark}
                    onChange={(e) => setBenchmark(e.target.value)}
                    rows={3}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="experiment-repo">GitHub repo</Label>
                  <Input
                    id="experiment-repo"
                    placeholder="https://github.com/org/repo"
                    value={repoUrl}
                    onChange={(e) => setRepoUrl(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="experiment-tier">Compute tier</Label>
                  <Select
                    value={computeTier}
                    onValueChange={(value: "small" | "standard" | "extended") =>
                      setComputeTier(value)
                    }
                  >
                    <SelectTrigger id="experiment-tier">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="small">Small</SelectItem>
                      <SelectItem value="standard">Standard</SelectItem>
                      <SelectItem value="extended">Extended</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="experiment-dataset">Dataset / access note</Label>
                  <Textarea
                    id="experiment-dataset"
                    placeholder="Optional dataset path, gated access note, credentials, or data split details. Do not put install commands here."
                    value={datasetNote}
                    onChange={(e) => setDatasetNote(e.target.value)}
                    rows={3}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Context papers</Label>
                  <span className="text-xs text-muted-foreground">
                    {selectedPaperIds.length} selected
                  </span>
                </div>
                <div className="rounded-lg border">
                  <ScrollArea className="h-44">
                    <div className="space-y-2 p-3">
                      {papers.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          No saved library papers available for context yet.
                        </p>
                      ) : (
                        papers.map((paper) => (
                          <label
                            key={paper._id}
                            className="flex cursor-pointer items-start gap-3 rounded-md border p-2 transition-colors hover:bg-accent/40"
                          >
                            <Checkbox
                              checked={selectedPaperIds.includes(paper._id)}
                              onCheckedChange={() => togglePaper(paper._id)}
                            />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium">{paper.title}</p>
                              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                                {paper.aiSummary ?? paper.abstract ?? "No summary available"}
                              </p>
                            </div>
                          </label>
                        ))
                      )}
                    </div>
                  </ScrollArea>
                </div>
              </div>

              <div className="grid gap-3 rounded-lg border p-3 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="experiment-supporting">Use context papers</Label>
                  <div className="flex items-center justify-between gap-3 rounded-md border p-2">
                    <span className="text-xs text-muted-foreground">
                      Allow supporting papers during planning
                    </span>
                    <Switch
                      id="experiment-supporting"
                      checked={allowSupportingPapers}
                      onCheckedChange={setAllowSupportingPapers}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="experiment-repo-preference">Prefer repo</Label>
                  <div className="flex items-center justify-between gap-3 rounded-md border p-2">
                    <span className="text-xs text-muted-foreground">
                      Prefer the provided repo over inferred paths
                    </span>
                    <Switch
                      id="experiment-repo-preference"
                      checked={preferProvidedRepo}
                      onCheckedChange={setPreferProvidedRepo}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="experiment-human-approval">Human approval</Label>
                  <div className="flex items-center justify-between gap-3 rounded-md border p-2">
                    <span className="text-xs text-muted-foreground">
                      Pause only on true hard blockers
                    </span>
                    <Switch
                      id="experiment-human-approval"
                      checked={humanApprovalOnBlocker}
                      onCheckedChange={setHumanApprovalOnBlocker}
                    />
                  </div>
                </div>
              </div>
              </div>
            </ScrollArea>
          </div>

          <DialogFooter className="border-t px-6 py-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!canStart}>
              {isSubmitting || isLoadingRunnerCapability ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {mode === "edit" ? "Saving..." : "Starting..."}
                </>
              ) : (
                mode === "edit" ? "Save and Rerun" : "Start Experiment"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
