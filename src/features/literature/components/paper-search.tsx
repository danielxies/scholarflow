"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Id } from "@/lib/local-db/types";
import {
  normalizeDoi,
  type LiteratureSearchResult,
} from "@/lib/openalex";

import { useAddPaper, usePaperSearch } from "../hooks/use-papers";
import { PaperCard } from "./paper-card";

interface PaperSearchProps {
  projectId: Id<"projects">;
  libraryPaperIds: Set<string>;
  onPaperClick?: (paper: LiteratureSearchResult) => void;
  className?: string;
}

function buildSearchKeys(paper: LiteratureSearchResult): string[] {
  const keys = [`openalex:${paper.openAlexId}`];
  const normalizedDoi = normalizeDoi(paper.doi);
  if (normalizedDoi) {
    keys.push(`doi:${normalizedDoi}`);
  }
  return keys;
}

export function PaperSearch({
  projectId,
  libraryPaperIds,
  onPaperClick,
  className,
}: PaperSearchProps) {
  const [inputValue, setInputValue] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [addingPaperId, setAddingPaperId] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    results,
    isLoading,
    isScoring,
    error,
    relevanceError,
  } = usePaperSearch(projectId, debouncedQuery);
  const addPaper = useAddPaper();

  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    timerRef.current = setTimeout(() => {
      setDebouncedQuery(inputValue.trim());
    }, 500);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [inputValue]);

  const handleAdd = async (paper: LiteratureSearchResult) => {
    setAddingPaperId(paper.openAlexId);

    try {
      await addPaper({
        projectId,
        paper: {
          openAlexId: paper.openAlexId,
          title: paper.title,
          authors: paper.authors,
          abstract: paper.abstract,
          year: paper.year,
          venue: paper.venue,
          citationCount: paper.citationCount,
          url: paper.url,
          doi: paper.doi,
          arxivId: paper.arxivId,
          primaryTopic: paper.primaryTopic,
          topics: paper.topics,
          publicationType: paper.publicationType,
        },
      });
      toast.success("Paper saved to library");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add paper");
    } finally {
      setAddingPaperId(null);
    }
  };

  return (
    <div className={cn("flex min-h-0 flex-col gap-3", className)}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="Search papers via OpenAlex..."
          className="pl-9"
        />
        {isLoading && (
          <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}
      {relevanceError && results.length > 0 && (
        <p className="text-xs text-muted-foreground">{relevanceError}</p>
      )}
      {isScoring && results.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Scoring results against `notes.md`, `main.tex`, and the rest of the
          project context.
        </p>
      )}

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-2 pr-3">
          {results.length === 0 && debouncedQuery && !isLoading && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No papers found for &quot;{debouncedQuery}&quot;
            </p>
          )}
          {results.length === 0 && !debouncedQuery && !isLoading && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Search OpenAlex to add papers to your library.
            </p>
          )}
          {results.map((paper) => {
            const isInLibrary = buildSearchKeys(paper).some((key) =>
              libraryPaperIds.has(key)
            );

            return (
              <PaperCard
                key={paper.openAlexId}
                title={paper.title}
                authors={JSON.stringify(
                  paper.authors.map((author) => author.name)
                )}
                abstract={paper.abstract}
                year={paper.year}
                venue={paper.venue}
                citationCount={paper.citationCount}
                tldr={null}
                url={paper.url}
                provider={paper.provider}
                publicationType={paper.publicationType}
                primaryTopic={paper.primaryTopic}
                relevanceScore={paper.relevanceScore}
                relevanceReason={paper.relevanceReason}
                relevanceStatus={paper.relevanceStatus}
                showRelevance={true}
                isInLibrary={isInLibrary}
                isAdding={addingPaperId === paper.openAlexId}
                onAdd={() => handleAdd(paper)}
                onClick={() => onPaperClick?.(paper)}
              />
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
