"use client";

import { useState } from "react";
import {
  BookOpen,
  Calendar,
  Check,
  ExternalLink,
  Loader2,
  Plus,
  Quote,
  Sparkles,
  Tag,
  Trash2,
  TriangleAlert,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface PaperCardProps {
  title: string;
  authors: string;
  abstract: string | null;
  year: number | null;
  venue: string | null;
  citationCount: number;
  tldr: string | null;
  url: string | null;
  isInLibrary: boolean;
  provider?: string | null;
  publicationType?: string | null;
  primaryTopic?: string | null;
  relevanceScore?: number | null;
  relevanceReason?: string | null;
  relevanceStatus?: "idle" | "scoring" | "scored" | "failed";
  isAdding?: boolean;
  onAdd?: () => void;
  onRemove?: () => void;
  onClick?: () => void;
  className?: string;
  showRelevance?: boolean;
}

export function PaperCard({
  title,
  authors,
  abstract,
  year,
  venue,
  citationCount,
  tldr,
  url,
  isInLibrary,
  publicationType,
  primaryTopic,
  relevanceScore,
  relevanceReason,
  relevanceStatus = "idle",
  isAdding = false,
  onAdd,
  onRemove,
  onClick,
  className,
  showRelevance = false,
}: PaperCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  let authorList: string[] = [];
  try {
    authorList = JSON.parse(authors);
  } catch {
    authorList = authors ? [authors] : [];
  }

  const displayAuthors =
    authorList.length > 3
      ? `${authorList.slice(0, 3).join(", ")} et al.`
      : authorList.join(", ");

  const previewText = tldr ?? abstract;
  const displayPreview = previewText
    ? isExpanded || previewText.length <= 220
      ? previewText
      : `${previewText.slice(0, 220)}...`
    : null;
  const showExpand = Boolean(previewText && previewText.length > 220);

  const showScoring = showRelevance && relevanceStatus === "scoring";
  const showRelevanceFailure = showRelevance && relevanceStatus === "failed";
  const hasRelevanceScore =
    showRelevance && typeof relevanceScore === "number";

  return (
    <div
      className={cn(
        "group rounded-lg border bg-card p-4 transition-colors hover:bg-accent/50",
        className
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          className="flex-1 text-left"
          onClick={onClick}
        >
          <h3 className="text-sm font-semibold leading-snug hover:underline">
            {title}
          </h3>
        </button>
        <div className="flex shrink-0 items-center gap-1">
          {url && (
            <Button variant="ghost" size="icon-xs" asChild>
              <a href={url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="size-3" />
              </a>
            </Button>
          )}
          {isInLibrary && onRemove ? (
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={onRemove}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="size-3" />
            </Button>
          ) : isInLibrary ? (
            <Badge variant="secondary" className="gap-1 text-[10px]">
              <Check className="size-2.5" />
              Added
            </Badge>
          ) : (
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={onAdd}
              disabled={!onAdd || isAdding}
              className="text-primary"
            >
              {isAdding ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Plus className="size-3" />
              )}
            </Button>
          )}
        </div>
      </div>

      {displayAuthors && (
        <p className="mt-1 text-xs text-muted-foreground">{displayAuthors}</p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {year && (
          <Badge variant="secondary" className="gap-1 text-[10px]">
            <Calendar className="size-2.5" />
            {year}
          </Badge>
        )}
        {venue && (
          <Badge variant="secondary" className="gap-1 text-[10px]">
            <BookOpen className="size-2.5" />
            {venue.length > 30 ? `${venue.slice(0, 30)}...` : venue}
          </Badge>
        )}
        <Badge variant="outline" className="gap-1 text-[10px]">
          <Quote className="size-2.5" />
          {citationCount.toLocaleString()}
        </Badge>
        {publicationType && (
          <Badge variant="outline" className="text-[10px]">
            {publicationType.replace(/_/g, " ")}
          </Badge>
        )}
        {primaryTopic && (
          <Badge variant="outline" className="gap-1 text-[10px]">
            <Tag className="size-2.5" />
            {primaryTopic}
          </Badge>
        )}
        {hasRelevanceScore && (
          <Badge className="gap-1 text-[10px]">
            <Sparkles className="size-2.5" />
            Relevance {relevanceScore}
          </Badge>
        )}
        {showScoring && (
          <Badge variant="secondary" className="gap-1 text-[10px]">
            <Loader2 className="size-2.5 animate-spin" />
            Scoring relevance
          </Badge>
        )}
        {showRelevanceFailure && (
          <Badge variant="destructive" className="gap-1 text-[10px]">
            <TriangleAlert className="size-2.5" />
            Relevance unavailable
          </Badge>
        )}
      </div>

      <div className="mt-2">
        {showRelevance && relevanceReason ? (
          <p className="mb-2 text-xs text-muted-foreground">{relevanceReason}</p>
        ) : null}

        {displayPreview ? (
          <div>
            <p className="text-xs text-muted-foreground">{displayPreview}</p>
            {showExpand && (
              <button
                type="button"
                onClick={() => setIsExpanded((value) => !value)}
                className="mt-0.5 text-xs font-medium text-primary hover:underline"
              >
                {isExpanded ? "Show less" : "Show more"}
              </button>
            )}
          </div>
        ) : showScoring ? (
          <p className="text-xs text-muted-foreground">
            Comparing this paper against your project files.
          </p>
        ) : null}
      </div>
    </div>
  );
}
