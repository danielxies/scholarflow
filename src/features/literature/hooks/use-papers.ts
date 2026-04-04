"use client";

import { useState, useEffect, useCallback, useRef } from "react";

import { useLocalQuery, useLocalMutation } from "@/lib/local-db/hooks";
import { Id } from "@/lib/local-db/types";
import type { Paper } from "@/lib/local-db/types";
import type { LiteratureSearchResult } from "@/lib/openalex";

interface PaperSearchOptions {
  limit?: number;
  yearStart?: string;
  yearEnd?: string;
}

interface PaperSearchResult {
  results: LiteratureSearchResult[];
  isLoading: boolean;
  isScoring: boolean;
  error: string | null;
  relevanceError: string | null;
}

export function usePaperSearch(
  projectId: Id<"projects">,
  query: string,
  options: PaperSearchOptions = {}
): PaperSearchResult {
  const [results, setResults] = useState<LiteratureSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isScoring, setIsScoring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [relevanceError, setRelevanceError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchPapers = useCallback(
    async (searchQuery: string, opts: PaperSearchOptions) => {
      if (!searchQuery.trim()) {
        setResults([]);
        setIsLoading(false);
        setIsScoring(false);
        setError(null);
        setRelevanceError(null);
        return;
      }

      // Cancel any in-flight request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      const controller = new AbortController();
      abortControllerRef.current = controller;

      setIsLoading(true);
      setIsScoring(false);
      setError(null);
      setRelevanceError(null);

      try {
        const params = new URLSearchParams({ q: searchQuery });
        if (opts.limit) params.set("limit", String(opts.limit));
        if (opts.yearStart) params.set("yearStart", opts.yearStart);
        if (opts.yearEnd) params.set("yearEnd", opts.yearEnd);

        const res = await fetch(`/api/papers/search?${params}`, {
          signal: controller.signal,
        });

        if (!res.ok) {
          const payload = (await res.json().catch(() => null)) as
            | { error?: string }
            | null;
          throw new Error(
            payload?.error ?? `Search failed: ${res.status} ${res.statusText}`
          );
        }

        const data = await res.json();
        const papers = ((data.papers ?? []) as LiteratureSearchResult[]).map(
          (paper) => ({
            ...paper,
            relevanceScore: null,
            relevanceReason: null,
            relevanceStatus: "scoring" as const,
          })
        );

        setResults(papers);
        setIsLoading(false);

        if (papers.length === 0) {
          return;
        }

        setIsScoring(true);

        try {
          const relevanceRes = await fetch("/api/papers/relevance", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            signal: controller.signal,
            body: JSON.stringify({
              projectId,
              query: searchQuery,
              papers: papers.map((paper) => ({
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
              })),
            }),
          });

          if (!relevanceRes.ok) {
            const payload = (await relevanceRes.json().catch(() => null)) as
              | { error?: string }
              | null;
            throw new Error(
              payload?.error ??
                `Relevance scoring failed: ${relevanceRes.status} ${relevanceRes.statusText}`
            );
          }

          const relevanceData = (await relevanceRes.json()) as {
            scores?: Array<{
              openAlexId: string;
              relevanceScore: number;
              relevanceReason: string;
            }>;
          };
          const scoreMap = new Map(
            (relevanceData.scores ?? []).map((score) => [score.openAlexId, score])
          );

          setResults((currentResults) =>
            currentResults.map((paper) => {
              const score = scoreMap.get(paper.openAlexId);

              if (!score) {
                return {
                  ...paper,
                  relevanceStatus: "failed",
                };
              }

              return {
                ...paper,
                relevanceScore: score.relevanceScore,
                relevanceReason: score.relevanceReason,
                relevanceStatus: "scored",
              };
            })
          );
        } catch (relevanceErr) {
          if (
            relevanceErr instanceof DOMException &&
            relevanceErr.name === "AbortError"
          ) {
            return;
          }

          setRelevanceError(
            relevanceErr instanceof Error
              ? relevanceErr.message
              : "Relevance scoring failed"
          );
          setResults((currentResults) =>
            currentResults.map((paper) => ({
              ...paper,
              relevanceStatus: "failed",
            }))
          );
        } finally {
          setIsScoring(false);
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          return; // Ignore aborted requests
        }
        setError(err instanceof Error ? err.message : "Search failed");
        setResults([]);
        setIsScoring(false);
      } finally {
        setIsLoading(false);
      }
    },
    [projectId]
  );

  useEffect(() => {
    fetchPapers(query, options);

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, query, options.limit, options.yearStart, options.yearEnd]);

  return { results, isLoading, isScoring, error, relevanceError };
}

export function useProjectPapers(projectId: Id<"projects">) {
  return useLocalQuery<Paper[]>("papers.getByProject", { projectId });
}

export function useAddPaper() {
  return useCallback(
    async (args: {
      projectId: Id<"projects">;
      paper: {
        openAlexId: string;
        title: string;
        authors: { name: string }[];
        abstract: string | null;
        year: number | null;
        venue: string | null;
        citationCount: number;
        url: string | null;
        doi: string | null;
        arxivId: string | null;
        primaryTopic: string | null;
        topics: { id: string; name: string; score: number | null }[];
        publicationType: string | null;
      };
    }) => {
      const res = await fetch("/api/papers/add", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(args),
      });

      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(
          payload?.error ?? `Add paper failed: ${res.status} ${res.statusText}`
        );
      }

      return (await res.json()) as { paperId: Id<"papers"> };
    },
    []
  );
}

export function useUpdatePaperNotes() {
  return useLocalMutation<{
    id: Id<"papers">;
    notes: string;
  }>("papers.updateNotes");
}

export function useRemovePaper() {
  return useLocalMutation<{
    id: Id<"papers">;
  }>("papers.remove");
}
