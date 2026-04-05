"use client";

import { useMemo, useState } from "react";
import { Library, Search } from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Id } from "@/lib/local-db/types";
import type { Paper } from "@/lib/local-db/types";
import {
  normalizeDoi,
  type LiteratureSearchResult,
} from "@/lib/openalex";

import { useProjectPapers } from "../hooks/use-papers";
import { PaperDetailDialog } from "./paper-detail-dialog";
import { PaperLibrary } from "./paper-library";
import { PaperSearch } from "./paper-search";

interface LiteratureViewProps {
  projectId: Id<"projects">;
  isActive?: boolean;
}

function buildLibraryKeys(paper: Paper): string[] {
  const keys: string[] = [];

  if (paper.openAlexId) {
    keys.push(`openalex:${paper.openAlexId}`);
  }
  if (paper.semanticScholarId) {
    keys.push(`legacy:${paper.semanticScholarId}`);
  }

  const normalizedDoi = normalizeDoi(paper.doi);
  if (normalizedDoi) {
    keys.push(`doi:${normalizedDoi}`);
  }

  return keys;
}

export function LiteratureView({ projectId }: LiteratureViewProps) {
  const papers = useProjectPapers(projectId);
  const [selectedSearchPaper, setSelectedSearchPaper] =
    useState<LiteratureSearchResult | null>(null);

  const libraryPaperIds = useMemo(() => {
    const ids = new Set<string>();
    if (papers) {
      for (const paper of papers) {
        for (const key of buildLibraryKeys(paper)) {
          ids.add(key);
        }
      }
    }
    return ids;
  }, [papers]);

  const dialogPaper: Paper | null = selectedSearchPaper
    ? {
        _id: "" as Id<"papers">,
        _creationTime: 0,
        projectId,
        provider: selectedSearchPaper.provider,
        openAlexId: selectedSearchPaper.openAlexId,
        semanticScholarId: null,
        arxivId: selectedSearchPaper.arxivId,
        doi: selectedSearchPaper.doi,
        title: selectedSearchPaper.title,
        authors: JSON.stringify(
          selectedSearchPaper.authors.map((author) => author.name)
        ),
        abstract: selectedSearchPaper.abstract,
        year: selectedSearchPaper.year,
        venue: selectedSearchPaper.venue,
        citationCount: selectedSearchPaper.citationCount,
        tldr: null,
        url: selectedSearchPaper.url,
        publicationType: selectedSearchPaper.publicationType,
        primaryTopic: selectedSearchPaper.primaryTopic,
        aiSummary: null,
        relevanceScore: selectedSearchPaper.relevanceScore,
        relevanceReason: selectedSearchPaper.relevanceReason,
        summaryStatus: null,
        notes: null,
        tags: JSON.stringify(
          selectedSearchPaper.topics.map((topic) => topic.name)
        ),
        addedAt: 0,
        paperType: null,
        supportabilityLabel: null,
        reproducibilityClass: null,
        supportabilityScore: null,
        supportabilityReason: null,
        officialRepoUrl: null,
        supplementaryUrls: null,
        pdfUrl: null,
        sourceDiscoveryStatus: null,
        supportabilityUpdatedAt: null,
      }
    : null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="hidden h-full min-h-0 lg:grid lg:grid-cols-2 lg:gap-4 lg:p-4">
        <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border bg-card p-4">
          <div className="mb-3 flex items-center gap-2">
            <Search className="size-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Search Papers</h2>
          </div>
          <PaperSearch
            projectId={projectId}
            libraryPaperIds={libraryPaperIds}
            onPaperClick={(paper) => setSelectedSearchPaper(paper)}
            className="min-h-0 flex-1 overflow-hidden"
          />
        </div>
        <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border bg-card p-4">
          <PaperLibrary
            projectId={projectId}
            className="min-h-0 flex-1 overflow-hidden"
          />
        </div>
      </div>

      <div className="flex h-full min-h-0 flex-col lg:hidden">
        <Tabs defaultValue="search" className="flex h-full min-h-0 flex-col p-4">
          <TabsList className="w-full">
            <TabsTrigger value="search" className="flex-1">
              <Search className="mr-1.5 size-3.5" />
              Search
            </TabsTrigger>
            <TabsTrigger value="library" className="flex-1">
              <Library className="mr-1.5 size-3.5" />
              Library
              {papers && papers.length > 0 && (
                <span className="ml-1 text-xs text-muted-foreground">
                  ({papers.length})
                </span>
              )}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="search" className="min-h-0 flex-1 overflow-hidden">
            <PaperSearch
              projectId={projectId}
              libraryPaperIds={libraryPaperIds}
              onPaperClick={(paper) => setSelectedSearchPaper(paper)}
              className="h-full min-h-0"
            />
          </TabsContent>
          <TabsContent value="library" className="min-h-0 flex-1 overflow-hidden">
            <PaperLibrary projectId={projectId} className="h-full min-h-0" />
          </TabsContent>
        </Tabs>
      </div>

      <PaperDetailDialog
        paper={dialogPaper}
        searchRelevanceStatus={selectedSearchPaper?.relevanceStatus ?? "idle"}
        open={selectedSearchPaper !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedSearchPaper(null);
        }}
      />
    </div>
  );
}
