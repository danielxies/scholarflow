import { db } from "@/lib/local-db/client";
import { inngest } from "@/inngest/client";
import { searchWorks, getWork } from "@/lib/openalex";
import {
  generateBibtexEntry,
  generateCiteKey,
  citeKeyExists,
  appendBibtexEntry,
  fetchBibtex,
} from "@/lib/bibtex";
import * as dbOps from "@/lib/db";
import { LITERATURE_EVENTS } from "@/features/literature/inngest/events";

// Parse JSON actions block from Claude's response
export function parseActions(
  response: string
): { action: string; [key: string]: unknown }[] {
  const match = response.match(
    /<actions>\s*([\s\S]*?)\s*<\/actions>/
  );
  if (!match) return [];

  try {
    const parsed = JSON.parse(match[1]);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [];
  }
}

// Get the text response (everything outside <actions> blocks)
export function extractResponse(response: string): string {
  return response.replace(/<actions>[\s\S]*?<\/actions>/g, "").trim();
}

// Execute actions that Claude requested
export async function executeActions(
  actions: { action: string; [key: string]: unknown }[],
  projectId: string
): Promise<string[]> {
  const results: string[] = [];

  for (const act of actions) {
    try {
      switch (act.action) {
        // ---- File operations ----
        case "createFile": {
          await db.mutation("system.createFile", {
            projectId,
            name: act.name as string,
            content: act.content as string,
            parentId: act.parentId as string | undefined,
          });
          results.push(`Created ${act.name}`);
          break;
        }
        case "updateFile": {
          await db.mutation("system.updateFile", {
            fileId: act.fileId as string,
            content: act.content as string,
          });
          results.push(`Updated file ${act.fileId}`);
          break;
        }
        case "createFolder": {
          await db.mutation("system.createFolder", {
            projectId,
            name: act.name as string,
            parentId: act.parentId as string | undefined,
          });
          results.push(`Created folder ${act.name}`);
          break;
        }
        case "deleteFile": {
          await db.mutation("system.deleteFile", {
            fileId: act.fileId as string,
          });
          results.push(`Deleted ${act.fileId}`);
          break;
        }

        // ---- Paper search & citations ----
        case "searchPapers": {
          const papers = await searchWorks(act.query as string, {
            limit: (act.limit as number) ?? 10,
            yearRange: act.yearRange as string | undefined,
          });
          results.push(
            `Found ${papers.length} papers:\n` +
              papers
                .map(
                  (p) =>
                    `- "${p.title}" (${p.year}) by ${p.authors?.map((a) => a.name).join(", ") ?? "Unknown"} [${p.citationCount} citations, id: ${p.openAlexId}]`
                )
                .join("\n")
          );
          break;
        }
        case "insertCitation": {
          const paperId =
            (act.paperId as string | undefined) ??
            (act.openAlexId as string | undefined);

          if (!paperId) {
            throw new Error("insertCitation requires paperId or openAlexId");
          }

          const paper = await getWork(paperId);
          const citeKey =
            (act.citeKey as string) ?? generateCiteKey(paper);

          let bibtexEntry: string;
          if (paper.doi) {
            const doiBibtex = await fetchBibtex(paper.doi);
            bibtexEntry =
              doiBibtex ?? generateBibtexEntry(paper, citeKey);
          } else {
            bibtexEntry = generateBibtexEntry(paper, citeKey);
          }

          const files = (await db.query("system.getProjectFiles", {
            projectId,
          })) as { _id: string; name: string; type: string; content?: string }[];
          const bibFile = files.find(
            (f) => f.type === "file" && f.name.endsWith(".bib")
          );

          if (bibFile) {
            const existing = bibFile.content ?? "";
            if (!citeKeyExists(existing, citeKey)) {
              await db.mutation("system.updateFile", {
                fileId: bibFile._id,
                content: appendBibtexEntry(existing, bibtexEntry),
              });
            }
          } else {
            await db.mutation("system.createFile", {
              projectId,
              name: "references.bib",
              content: bibtexEntry + "\n",
            });
          }
          results.push(
            `Cited "${paper.title}" as \\cite{${citeKey}}`
          );
          break;
        }

        // ---- Research: Hypotheses ----
        case "createHypothesis": {
          const hId = dbOps.createHypothesis(
            projectId,
            act.title as string,
            act.description as string,
            act.rationale as string ?? "",
            act.expectedOutcome as string ?? ""
          );
          results.push(`Created hypothesis "${act.title}" (id: ${hId})`);
          break;
        }
        case "updateHypothesisStatus": {
          dbOps.updateHypothesisStatus(
            act.hypothesisId as string,
            act.status as string,
            act.actualOutcome as string | undefined
          );
          results.push(`Hypothesis ${act.hypothesisId} updated to ${act.status}`);
          break;
        }
        case "listHypotheses": {
          const hyps = dbOps.getHypotheses(projectId);
          results.push(JSON.stringify(hyps, null, 2));
          break;
        }

        // ---- Research: Experiments ----
        case "createExperiment": {
          const eId = dbOps.createExperiment(
            projectId,
            act.hypothesisId as string,
            act.name as string,
            act.protocol as string ?? "",
            (act.skillsUsed as string[]) ?? [],
            (act.config as Record<string, unknown>) ?? {}
          );
          results.push(`Created experiment "${act.name}" (id: ${eId})`);
          break;
        }
        case "updateExperimentResults": {
          dbOps.updateExperimentResults(
            act.experimentId as string,
            act.results as string,
            (act.metrics as Record<string, number>) ?? {}
          );
          results.push(`Experiment ${act.experimentId} results recorded`);
          break;
        }
        case "listExperiments": {
          const exps = act.hypothesisId
            ? dbOps.getExperimentsByHypothesis(act.hypothesisId as string)
            : dbOps.getExperiments(projectId);
          results.push(JSON.stringify(exps, null, 2));
          break;
        }

        // ---- Research: State ----
        case "getResearchState": {
          const state = dbOps.getResearchState(projectId);
          results.push(JSON.stringify(state ?? { phase: "idle" }, null, 2));
          break;
        }
        case "updateResearchState": {
          dbOps.upsertResearchState(projectId, act.updates as Record<string, unknown>);
          results.push("Research state updated");
          break;
        }

        // ---- Research: Memory ----
        case "addResearchMemory": {
          const mId = dbOps.addResearchMemory(
            projectId,
            act.type as string,
            act.content as string,
            act.source as string | undefined
          );
          results.push(`OK`);
          break;
        }
        case "getResearchMemory": {
          const memories = act.type
            ? dbOps.getResearchMemoryByType(projectId, act.type as string)
            : dbOps.getResearchMemory(projectId);
          results.push(JSON.stringify(memories, null, 2));
          break;
        }

        // ---- Research: Log ----
        case "addResearchLog": {
          const rState = dbOps.getResearchState(projectId);
          dbOps.addResearchLogEntry(
            projectId,
            act.action_name as string ?? act.logAction as string ?? "note",
            rState?.phase ?? "idle",
            act.details as string,
            act.relatedId as string | undefined
          );
          results.push("Research log entry added");
          break;
        }

        // ---- Research: Papers Library ----
        case "addPaperToLibrary": {
          const topicTags = Array.isArray(act.topics)
            ? act.topics
                .map((topicItem) => {
                  if (typeof topicItem === "string") {
                    return topicItem;
                  }

                  if (
                    topicItem &&
                    typeof topicItem === "object" &&
                    "name" in topicItem &&
                    typeof topicItem.name === "string"
                  ) {
                    return topicItem.name;
                  }

                  return null;
                })
                .filter((topicItem): topicItem is string => Boolean(topicItem))
            : undefined;
          const pId = dbOps.addPaper(projectId, {
            provider: "openalex",
            openAlexId:
              (act.openAlexId as string | undefined) ??
              (act.paperId as string | undefined),
            semanticScholarId: act.semanticScholarId as string | undefined,
            arxivId: act.arxivId as string | undefined,
            title: act.title as string,
            authors: act.authors as string[] | undefined,
            abstract: act.abstract as string | undefined,
            year: act.year as number | undefined,
            venue: act.venue as string | undefined,
            doi: act.doi as string | undefined,
            url: act.url as string | undefined,
            citationCount: act.citationCount as number | undefined,
            tldr: act.tldr as string | undefined,
            publicationType: act.publicationType as string | undefined,
            primaryTopic: act.primaryTopic as string | undefined,
            tags: topicTags,
            summaryStatus: "pending",
          });

          const savedPaper = dbOps.getPaperById(pId);
          if (
            savedPaper &&
            !["processing", "completed"].includes(savedPaper.summaryStatus ?? "")
          ) {
            dbOps.updatePaperEnrichment(pId, {
              summaryStatus: "pending",
            });
            await inngest.send({
              name: LITERATURE_EVENTS.ENRICH_PAPER,
              data: {
                paperId: pId,
                projectId,
              },
            });
          }

          results.push(`Paper "${act.title}" added to library (id: ${pId})`);
          break;
        }
        case "listLibraryPapers": {
          const papers = dbOps.getProjectPapers(projectId);
          results.push(JSON.stringify(papers, null, 2));
          break;
        }

        default:
          results.push(`Unknown action: ${act.action}`);
      }
    } catch (e) {
      results.push(
        `Error in ${act.action}: ${e instanceof Error ? e.message : "unknown"}`
      );
    }
  }

  return results;
}

export const ACTION_INSTRUCTIONS = `
If you need to perform operations, include an <actions> block with a JSON array.
Each action is an object with an "action" field. Available actions:

FILE OPERATIONS:
- {"action": "createFile", "name": "filename.tex", "content": "..."}
- {"action": "updateFile", "fileId": "the-file-id", "content": "new content"}
- {"action": "createFolder", "name": "foldername"}
- {"action": "deleteFile", "fileId": "the-file-id"}

PAPER SEARCH & CITATIONS:
- {"action": "searchPapers", "query": "search terms", "limit": 10}
- {"action": "insertCitation", "paperId": "openalex-work-id"}

RESEARCH - HYPOTHESES:
- {"action": "createHypothesis", "title": "...", "description": "...", "rationale": "...", "expectedOutcome": "..."}
- {"action": "updateHypothesisStatus", "hypothesisId": "id", "status": "proposed|active|completed|failed|abandoned", "actualOutcome": "..."}
- {"action": "listHypotheses"}

RESEARCH - EXPERIMENTS:
- {"action": "createExperiment", "hypothesisId": "id", "name": "...", "protocol": "...", "skillsUsed": ["skill-id"], "config": {}}
- {"action": "updateExperimentResults", "experimentId": "id", "results": "...", "metrics": {"accuracy": 0.95}}
- {"action": "listExperiments", "hypothesisId": "optional-filter"}

RESEARCH - STATE & MEMORY:
- {"action": "getResearchState"}
- {"action": "updateResearchState", "updates": {"phase": "...", "findings": "..."}}
- {"action": "addResearchMemory", "type": "discovery|dead_end|decision|insight|context", "content": "...", "source": "conversation"}
- {"action": "getResearchMemory", "type": "optional-filter"}
- {"action": "addResearchLog", "action_name": "what_happened", "details": "description"}

RESEARCH - PAPER LIBRARY:
- {"action": "addPaperToLibrary", "title": "...", "authors": ["..."], "year": 2024, "openAlexId": "W1234567890", "abstract": "...", "venue": "...", "citationCount": 100}
- {"action": "listLibraryPapers"}

IMPORTANT: Always write your text response OUTSIDE the <actions> block. The <actions> block is ONLY for structured operations.
`;
