"use client";

import { useState } from "react";
import {
  FileIcon,
  PencilIcon,
  SearchIcon,
  FlaskConicalIcon,
  BrainIcon,
  FolderPlusIcon,
  Trash2Icon,
  BookOpenIcon,
  ClipboardListIcon,
  ActivityIcon,
  DatabaseIcon,
  ChevronRightIcon,
  CheckCircle2Icon,
  XCircleIcon,
  LibraryIcon,
} from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ToolCall {
  /** The original action type from the actions JSON */
  actionType: string;
  /** Human-readable label, e.g. "Edit main.tex" */
  label: string;
  /** The icon category used for rendering */
  category:
    | "file-read"
    | "file-edit"
    | "file-create"
    | "file-delete"
    | "folder-create"
    | "search"
    | "citation"
    | "hypothesis"
    | "experiment"
    | "memory"
    | "research-state"
    | "research-log"
    | "paper-library"
    | "unknown";
  /** Optional detail / result text shown when expanded */
  detail?: string;
  /** Whether this action succeeded (derived from result prefix) */
  success?: boolean;
}

// ---------------------------------------------------------------------------
// Icon map
// ---------------------------------------------------------------------------

const CATEGORY_ICON: Record<ToolCall["category"], React.ElementType> = {
  "file-read": FileIcon,
  "file-edit": PencilIcon,
  "file-create": FileIcon,
  "file-delete": Trash2Icon,
  "folder-create": FolderPlusIcon,
  search: SearchIcon,
  citation: BookOpenIcon,
  hypothesis: ClipboardListIcon,
  experiment: FlaskConicalIcon,
  memory: BrainIcon,
  "research-state": ActivityIcon,
  "research-log": DatabaseIcon,
  "paper-library": LibraryIcon,
  unknown: ActivityIcon,
};

const CATEGORY_ACCENT: Record<ToolCall["category"], string> = {
  "file-read": "border-l-blue-500/60",
  "file-edit": "border-l-amber-500/60",
  "file-create": "border-l-green-500/60",
  "file-delete": "border-l-red-500/60",
  "folder-create": "border-l-green-500/60",
  search: "border-l-violet-500/60",
  citation: "border-l-cyan-500/60",
  hypothesis: "border-l-orange-500/60",
  experiment: "border-l-pink-500/60",
  memory: "border-l-purple-500/60",
  "research-state": "border-l-teal-500/60",
  "research-log": "border-l-slate-500/60",
  "paper-library": "border-l-indigo-500/60",
  unknown: "border-l-border",
};

// ---------------------------------------------------------------------------
// Parser helpers
// ---------------------------------------------------------------------------

function categorize(actionType: string): ToolCall["category"] {
  switch (actionType) {
    case "updateFile":
      return "file-edit";
    case "createFile":
      return "file-create";
    case "deleteFile":
      return "file-delete";
    case "createFolder":
      return "folder-create";
    case "searchPapers":
      return "search";
    case "insertCitation":
      return "citation";
    case "createHypothesis":
    case "updateHypothesisStatus":
    case "listHypotheses":
      return "hypothesis";
    case "createExperiment":
    case "updateExperimentResults":
    case "listExperiments":
      return "experiment";
    case "addResearchMemory":
    case "getResearchMemory":
      return "memory";
    case "getResearchState":
    case "updateResearchState":
      return "research-state";
    case "addResearchLog":
      return "research-log";
    case "addPaperToLibrary":
    case "listLibraryPapers":
      return "paper-library";
    default:
      return "unknown";
  }
}

function labelFor(
  action: Record<string, unknown>
): string {
  const type = action.action as string;
  switch (type) {
    case "createFile":
      return `Create ${action.name ?? "file"}`;
    case "updateFile":
      return `Edit ${action.fileId ?? "file"}`;
    case "deleteFile":
      return `Delete ${action.fileId ?? "file"}`;
    case "createFolder":
      return `Create folder ${action.name ?? ""}`;
    case "searchPapers":
      return `Search papers: ${action.query ?? ""}`;
    case "insertCitation":
      return `Insert citation ${action.paperId ?? action.openAlexId ?? ""}`;
    case "createHypothesis":
      return `Create hypothesis: ${action.title ?? ""}`;
    case "updateHypothesisStatus":
      return `Update hypothesis ${action.status ?? ""}`;
    case "listHypotheses":
      return "List hypotheses";
    case "createExperiment":
      return `Create experiment: ${action.name ?? ""}`;
    case "updateExperimentResults":
      return `Record experiment results`;
    case "listExperiments":
      return "List experiments";
    case "getResearchState":
      return "Get research state";
    case "updateResearchState":
      return "Update research state";
    case "addResearchMemory":
      return `Save memory (${action.type ?? "note"})`;
    case "getResearchMemory":
      return `Recall memory${action.type ? ` (${action.type})` : ""}`;
    case "addResearchLog":
      return `Log: ${action.action_name ?? action.logAction ?? "note"}`;
    case "addPaperToLibrary":
      return `Add to library: ${action.title ?? "paper"}`;
    case "listLibraryPapers":
      return "List library papers";
    default:
      return type;
  }
}

// ---------------------------------------------------------------------------
// parseToolCalls  --  the main public parser
// ---------------------------------------------------------------------------

/**
 * Extracts tool call information from raw message content.
 *
 * It looks for two things:
 * 1. `<actions>` JSON blocks in the content (present during streaming)
 * 2. A `\n---\n` separated results section appended at the end (present in
 *    stored messages from `process-message.ts`)
 *
 * Returns an array of ToolCall descriptors ready for rendering.
 */
export function parseToolCalls(content: string): ToolCall[] {
  const calls: ToolCall[] = [];

  // ---- 1. Parse <actions> JSON blocks ----
  const actionsRegex = /<actions>\s*([\s\S]*?)\s*<\/actions>/g;
  let match: RegExpExecArray | null;

  while ((match = actionsRegex.exec(content)) !== null) {
    try {
      const parsed = JSON.parse(match[1]);
      const items: Record<string, unknown>[] = Array.isArray(parsed)
        ? parsed
        : [parsed];

      for (const item of items) {
        const actionType = item.action as string;
        calls.push({
          actionType,
          label: labelFor(item),
          category: categorize(actionType),
        });
      }
    } catch {
      // Malformed JSON -- skip
    }
  }

  // ---- 2. Parse result lines after --- separator ----
  const separatorIdx = content.indexOf("\n---\n");
  if (separatorIdx !== -1) {
    const resultBlock = content.slice(separatorIdx + 5).trim();
    const resultLines = resultBlock.split("\n").filter(Boolean);

    for (const line of resultLines) {
      const call = parseResultLine(line);
      if (call) {
        // Try to match with an existing parsed action by position
        calls.push(call);
      }
    }
  }

  // Deduplicate: if we found both an action block entry and a result line
  // for the same action, merge them so we keep one entry with the detail.
  return deduplicateCalls(calls);
}

/** Parse a single result line like `Created main.tex` or `Updated file abc123` */
function parseResultLine(line: string): ToolCall | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  // Check for error prefix
  const isError = trimmed.startsWith("Error in ");
  const success = !isError;

  // File operations
  if (/^Created\s+\S/.test(trimmed) && !trimmed.startsWith("Created folder") && !trimmed.startsWith("Created hypothesis") && !trimmed.startsWith("Created experiment")) {
    const name = trimmed.replace(/^Created\s+/, "");
    return { actionType: "createFile", label: `Create ${name}`, category: "file-create", detail: trimmed, success };
  }
  if (/^Updated file\s/.test(trimmed)) {
    const id = trimmed.replace(/^Updated file\s+/, "");
    return { actionType: "updateFile", label: `Edit ${id}`, category: "file-edit", detail: trimmed, success };
  }
  if (/^Deleted\s/.test(trimmed)) {
    const id = trimmed.replace(/^Deleted\s+/, "");
    return { actionType: "deleteFile", label: `Delete ${id}`, category: "file-delete", detail: trimmed, success };
  }
  if (/^Created folder\s/.test(trimmed)) {
    const name = trimmed.replace(/^Created folder\s+/, "");
    return { actionType: "createFolder", label: `Create folder ${name}`, category: "folder-create", detail: trimmed, success };
  }

  // Paper search
  if (/^Found\s+\d+\s+papers/.test(trimmed)) {
    return { actionType: "searchPapers", label: "Search papers", category: "search", detail: trimmed, success };
  }

  // Citation
  if (/^Cited\s/.test(trimmed)) {
    return { actionType: "insertCitation", label: trimmed, category: "citation", detail: trimmed, success };
  }

  // Hypothesis
  if (/^Created hypothesis/.test(trimmed)) {
    return { actionType: "createHypothesis", label: trimmed, category: "hypothesis", detail: trimmed, success };
  }
  if (/^Hypothesis\s.*updated/.test(trimmed)) {
    return { actionType: "updateHypothesisStatus", label: trimmed, category: "hypothesis", detail: trimmed, success };
  }

  // Experiment
  if (/^Created experiment/.test(trimmed)) {
    return { actionType: "createExperiment", label: trimmed, category: "experiment", detail: trimmed, success };
  }
  if (/^Experiment\s.*results recorded/.test(trimmed)) {
    return { actionType: "updateExperimentResults", label: "Record experiment results", category: "experiment", detail: trimmed, success };
  }

  // Research state
  if (trimmed === "Research state updated") {
    return { actionType: "updateResearchState", label: "Update research state", category: "research-state", detail: trimmed, success };
  }

  // Research memory
  if (trimmed === "OK") {
    return { actionType: "addResearchMemory", label: "Save memory", category: "memory", detail: trimmed, success };
  }

  // Research log
  if (trimmed === "Research log entry added") {
    return { actionType: "addResearchLog", label: "Add research log", category: "research-log", detail: trimmed, success };
  }

  // Paper library
  if (/^Paper\s+".*"\s+added to library/.test(trimmed)) {
    const titleMatch = trimmed.match(/^Paper\s+"(.*)"\s+added/);
    const title = titleMatch?.[1] ?? "paper";
    return { actionType: "addPaperToLibrary", label: `Add to library: ${title}`, category: "paper-library", detail: trimmed, success };
  }

  // Error fallback
  if (isError) {
    const actionMatch = trimmed.match(/^Error in (\w+):/);
    const actionType = actionMatch?.[1] ?? "unknown";
    return { actionType, label: trimmed, category: categorize(actionType), detail: trimmed, success: false };
  }

  // JSON blob results (listHypotheses, listExperiments, etc.)
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    return { actionType: "query", label: "Query result", category: "research-state", detail: trimmed, success: true };
  }

  // Unknown result line
  if (trimmed.startsWith("Unknown action:")) {
    return { actionType: "unknown", label: trimmed, category: "unknown", detail: trimmed, success: false };
  }

  return null;
}

/** Merge action-block entries with their corresponding result-line entries */
function deduplicateCalls(calls: ToolCall[]): ToolCall[] {
  // If there are no result-line entries, return as-is
  const withDetail = calls.filter((c) => c.detail);
  const withoutDetail = calls.filter((c) => !c.detail);

  if (withDetail.length === 0) return withoutDetail;
  if (withoutDetail.length === 0) return withDetail;

  // Try to match by actionType in order
  const merged: ToolCall[] = [];
  const usedDetailIndices = new Set<number>();

  for (const action of withoutDetail) {
    const detailIdx = withDetail.findIndex(
      (d, i) => !usedDetailIndices.has(i) && d.actionType === action.actionType
    );
    if (detailIdx !== -1) {
      usedDetailIndices.add(detailIdx);
      merged.push({
        ...action,
        detail: withDetail[detailIdx].detail,
        success: withDetail[detailIdx].success,
      });
    } else {
      merged.push(action);
    }
  }

  // Add any unmatched result lines
  for (let i = 0; i < withDetail.length; i++) {
    if (!usedDetailIndices.has(i)) {
      merged.push(withDetail[i]);
    }
  }

  return merged;
}

// ---------------------------------------------------------------------------
// Utility: strip tool-call artifacts from content for clean rendering
// ---------------------------------------------------------------------------

/**
 * Returns the "clean" message text with `<actions>` blocks and the
 * trailing `---` results section removed.
 */
export function stripToolCallArtifacts(content: string): string {
  // Remove <actions> blocks
  let cleaned = content.replace(/<actions>[\s\S]*?<\/actions>/g, "");

  // Remove trailing result section
  const separatorIdx = cleaned.indexOf("\n---\n");
  if (separatorIdx !== -1) {
    cleaned = cleaned.slice(0, separatorIdx);
  }

  return cleaned.trim();
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function ToolCallItem({ call }: { call: ToolCall }) {
  const [open, setOpen] = useState(false);
  const Icon = CATEGORY_ICON[call.category];
  const accent = CATEGORY_ACCENT[call.category];

  const hasExpandableDetail =
    call.detail && call.detail.length > 80;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div
        className={cn(
          "rounded-md border border-border/40 bg-accent/50 border-l-2",
          accent
        )}
      >
        <CollapsibleTrigger className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left group">
          <ChevronRightIcon
            className={cn(
              "size-3 shrink-0 text-muted-foreground/60 transition-transform duration-150",
              open && "rotate-90"
            )}
          />
          <Icon className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="flex-1 truncate text-xs text-muted-foreground font-mono">
            {call.label}
          </span>
          {call.success !== undefined && (
            call.success ? (
              <CheckCircle2Icon className="size-3 shrink-0 text-green-500/70" />
            ) : (
              <XCircleIcon className="size-3 shrink-0 text-red-500/70" />
            )
          )}
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="border-t border-border/30 px-2.5 py-2">
            {call.detail ? (
              <pre className="whitespace-pre-wrap break-words text-[11px] leading-relaxed text-muted-foreground/80 font-mono max-h-48 overflow-y-auto">
                {hasExpandableDetail ? call.detail : call.detail}
              </pre>
            ) : (
              <span className="text-[11px] text-muted-foreground/50 italic">
                No output captured
              </span>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

// ---------------------------------------------------------------------------
// Main exported component
// ---------------------------------------------------------------------------

interface ToolCallBlockProps {
  /** Raw message content that may contain action blocks / result lines */
  content: string;
  className?: string;
}

/**
 * Renders inline tool-call blocks for AI messages that performed agentic
 * actions (file edits, paper searches, experiments, etc.).
 *
 * Usage:
 * ```tsx
 * <ToolCallBlock content={message.content} />
 * ```
 *
 * The component parses both `<actions>` XML blocks (visible during streaming)
 * and the `---` separated result lines appended to stored messages.
 * If no tool calls are found, it renders nothing.
 */
export function ToolCallBlock({ content, className }: ToolCallBlockProps) {
  const calls = parseToolCalls(content);

  if (calls.length === 0) return null;

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <span className="text-[10px] font-mono uppercase tracking-[0.08em] text-muted-foreground/50 mb-0.5">
        {calls.length} action{calls.length !== 1 ? "s" : ""} performed
      </span>
      {calls.map((call, i) => (
        <ToolCallItem key={`${call.actionType}-${i}`} call={call} />
      ))}
    </div>
  );
}
