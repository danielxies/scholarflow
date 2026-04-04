"use client";

import { useEffect, useState } from "react";
import {
  BookOpen,
  Calendar,
  ExternalLink,
  Loader2,
  Quote,
  Save,
  Sparkles,
  Tag,
  TriangleAlert,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import type { Paper } from "@/lib/local-db/types";
import { buildOpenAlexUrl } from "@/lib/openalex";

import { useUpdatePaperNotes } from "../hooks/use-papers";

interface PaperDetailDialogProps {
  paper: Paper | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  searchRelevanceStatus?: "idle" | "scoring" | "scored" | "failed";
}

function parseArray(value: string | null | undefined): string[] {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value) as string[];
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch {
    return [value];
  }
}

export function PaperDetailDialog({
  paper,
  open,
  onOpenChange,
  searchRelevanceStatus = "idle",
}: PaperDetailDialogProps) {
  const [notes, setNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const updateNotes = useUpdatePaperNotes();

  useEffect(() => {
    if (paper) {
      setNotes(paper.notes ?? "");
    }
  }, [paper]);

  if (!paper) return null;

  const authorList = parseArray(paper.authors);
  const tags = parseArray(paper.tags);
  const isPersisted = paper._id !== "";
  const canEditNotes = isPersisted;

  const openAlexUrl =
    paper.provider === "openalex"
      ? buildOpenAlexUrl(paper.openAlexId)
      : null;
  const doiUrl = paper.doi ? `https://doi.org/${paper.doi}` : null;
  const arxivUrl = paper.arxivId
    ? `https://arxiv.org/abs/${paper.arxivId}`
    : null;
  const externalLabel =
    paper.provider === "openalex" ? "OpenAlex" : "Paper source";

  const handleSaveNotes = async () => {
    if (!canEditNotes) return;

    setIsSaving(true);
    try {
      await updateNotes({ id: paper._id, notes });
    } catch (err) {
      console.error("Failed to save notes:", err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="pr-6 text-base leading-snug">
            {paper.title}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {authorList.join(", ")}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh]">
          <div className="flex flex-col gap-4 pr-3">
            <div className="flex flex-wrap items-center gap-2">
              {paper.year && (
                <Badge variant="secondary" className="gap-1">
                  <Calendar className="size-3" />
                  {paper.year}
                </Badge>
              )}
              {paper.venue && (
                <Badge variant="secondary" className="gap-1">
                  <BookOpen className="size-3" />
                  {paper.venue}
                </Badge>
              )}
              <Badge variant="outline" className="gap-1">
                <Quote className="size-3" />
                {paper.citationCount.toLocaleString()} citations
              </Badge>
              {paper.publicationType && (
                <Badge variant="outline">
                  {paper.publicationType.replace(/_/g, " ")}
                </Badge>
              )}
              {paper.primaryTopic && (
                <Badge variant="outline" className="gap-1">
                  <Tag className="size-3" />
                  {paper.primaryTopic}
                </Badge>
              )}
              {!isPersisted && typeof paper.relevanceScore === "number" && (
                <Badge className="gap-1">
                  <Sparkles className="size-3" />
                  Relevance {paper.relevanceScore}/100
                </Badge>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {openAlexUrl && (
                <Button variant="outline" size="xs" asChild>
                  <a href={openAlexUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="size-3" />
                    {externalLabel}
                  </a>
                </Button>
              )}
              {paper.url && paper.url !== openAlexUrl && paper.url !== doiUrl && (
                <Button variant="outline" size="xs" asChild>
                  <a href={paper.url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="size-3" />
                    Paper link
                  </a>
                </Button>
              )}
              {doiUrl && (
                <Button variant="outline" size="xs" asChild>
                  <a href={doiUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="size-3" />
                    DOI
                  </a>
                </Button>
              )}
              {arxivUrl && (
                <Button variant="outline" size="xs" asChild>
                  <a href={arxivUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="size-3" />
                    arXiv
                  </a>
                </Button>
              )}
            </div>

            {!isPersisted &&
              (paper.relevanceReason ||
                paper.relevanceScore !== null ||
                searchRelevanceStatus === "scoring" ||
                searchRelevanceStatus === "failed") && (
              <div>
                <h4 className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                  Search Relevance
                </h4>
                {typeof paper.relevanceScore === "number" ? (
                  <p className="text-sm leading-relaxed">
                    {paper.relevanceReason ?? "Relevance scored from the current project context."}
                  </p>
                ) : searchRelevanceStatus === "failed" ? (
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <TriangleAlert className="size-4" />
                    Relevance scoring was unavailable for this search.
                  </p>
                ) : (
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" />
                    Scoring this paper against your project files.
                  </p>
                )}
              </div>
            )}

            {isPersisted && (paper.aiSummary || paper.summaryStatus) && (
              <div>
                <h4 className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                  AI Summary
                </h4>
                {paper.aiSummary ? (
                  <p className="text-sm leading-relaxed">{paper.aiSummary}</p>
                ) : paper.summaryStatus === "pending" ||
                  paper.summaryStatus === "processing" ? (
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" />
                    Generating a saved-paper summary.
                  </p>
                ) : paper.summaryStatus === "failed" ? (
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <TriangleAlert className="size-4" />
                    Summary generation failed.
                  </p>
                ) : null}
              </div>
            )}

            {paper.tldr && (
              <div>
                <h4 className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                  TL;DR
                </h4>
                <p className="text-sm">{paper.tldr}</p>
              </div>
            )}

            {paper.abstract && (
              <div>
                <h4 className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                  Abstract
                </h4>
                <p className="text-sm leading-relaxed">{paper.abstract}</p>
              </div>
            )}

            {tags.length > 0 && (
              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                  Metadata
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {tags.map((tag) => (
                    <Badge key={tag} variant="secondary">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <div>
              <div className="mb-1 flex items-center justify-between">
                <h4 className="text-xs font-semibold uppercase text-muted-foreground">
                  Notes
                </h4>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={handleSaveNotes}
                  disabled={
                    !canEditNotes || isSaving || notes === (paper.notes ?? "")
                  }
                >
                  <Save className="size-3" />
                  {isSaving ? "Saving..." : "Save"}
                </Button>
              </div>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={
                  canEditNotes
                    ? "Add your notes about this paper..."
                    : "Save the paper to your library to keep notes."
                }
                className="min-h-24 text-sm"
                disabled={!canEditNotes}
              />
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
