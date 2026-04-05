"use client";

import { useState } from "react";
import { Library, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Id } from "@/lib/local-db/types";

import { useProjectPapers, useRemovePaper } from "../hooks/use-papers";
import { PaperCard } from "./paper-card";
import { PaperDetailDialog } from "./paper-detail-dialog";
import { ReproducePaperDialog } from "./reproduce-paper-dialog";

interface PaperLibraryProps {
  projectId: Id<"projects">;
  className?: string;
}

export function PaperLibrary({ projectId, className }: PaperLibraryProps) {
  const papers = useProjectPapers(projectId);
  const removePaper = useRemovePaper();
  const [selectedPaperId, setSelectedPaperId] = useState<Id<"papers"> | null>(null);
  const [reproducePaperId, setReproducePaperId] = useState<Id<"papers"> | null>(null);

  const selectedPaper =
    papers?.find((paper) => paper._id === selectedPaperId) ?? null;
  const reproducePaper =
    papers?.find((paper) => paper._id === reproducePaperId) ?? null;

  const handleRemove = async (id: Id<"papers">) => {
    try {
      await removePaper({ id });
      if (selectedPaperId === id) {
        setSelectedPaperId(null);
      }
      if (reproducePaperId === id) {
        setReproducePaperId(null);
      }
    } catch (err) {
      console.error("Failed to remove paper:", err);
    }
  };

  const isLoading = papers === undefined;

  return (
    <div className={cn("flex min-h-0 flex-col gap-3", className)}>
      <div className="flex items-center gap-2">
        <Library className="size-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">
          My Library
          {papers && papers.length > 0 && (
            <span className="ml-1.5 text-xs font-normal text-muted-foreground">
              ({papers.length})
            </span>
          )}
        </h2>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {!isLoading && papers.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No papers saved yet. Search and add papers to your library.
        </p>
      )}

      {!isLoading && papers.length > 0 && (
        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col gap-2 pr-3">
            {papers.map((paper) => (
              <PaperCard
                key={paper._id}
                title={paper.title}
                authors={paper.authors}
                abstract={paper.abstract}
                year={paper.year}
                venue={paper.venue}
                citationCount={paper.citationCount}
                tldr={paper.tldr}
                url={paper.url}
                provider={paper.provider}
                publicationType={paper.publicationType}
                primaryTopic={paper.primaryTopic}
                supportabilityLabel={paper.supportabilityLabel}
                reproducibilityClass={paper.reproducibilityClass}
                officialRepoUrl={paper.officialRepoUrl}
                isInLibrary={true}
                onRemove={() => handleRemove(paper._id)}
                onReproduce={() => setReproducePaperId(paper._id)}
                onClick={() => setSelectedPaperId(paper._id)}
                showReproduce={true}
              />
            ))}
          </div>
        </ScrollArea>
      )}

      <PaperDetailDialog
        paper={selectedPaper}
        open={selectedPaper !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedPaperId(null);
        }}
      />
      <ReproducePaperDialog
        projectId={projectId}
        paper={reproducePaper}
        open={reproducePaper !== null}
        onOpenChange={(open) => {
          if (!open) setReproducePaperId(null);
        }}
      />
    </div>
  );
}
