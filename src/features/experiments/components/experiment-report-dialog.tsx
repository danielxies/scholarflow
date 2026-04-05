"use client";

import { Fragment } from "react";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ReportPayload {
  summary: string | null;
  generatedAt: number | null;
  verdict: string | null;
  workflowStatus: string | null;
  targetMetric: string | null;
  targetValue: number | null;
  bestValue: number | null;
  gap: number | null;
  tolerance: number | null;
}

interface ExperimentReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  displayTitle: string;
  reportMarkdown: string | null;
  reportPayload: ReportPayload | null;
}

function formatMetric(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "—";
  }

  return value.toFixed(2);
}

type MarkdownBlock =
  | { type: "code"; content: string }
  | { type: "text"; content: string };

function tokenizeMarkdownBlocks(markdown: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  let textBuffer: string[] = [];
  let codeBuffer: string[] = [];
  let inCodeFence = false;

  const flushText = () => {
    const content = textBuffer.join("\n").trim();
    if (content) {
      blocks.push({ type: "text", content });
    }
    textBuffer = [];
  };

  const flushCode = () => {
    blocks.push({ type: "code", content: codeBuffer.join("\n") });
    codeBuffer = [];
  };

  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      if (inCodeFence) {
        flushCode();
      } else {
        flushText();
      }
      inCodeFence = !inCodeFence;
      continue;
    }

    if (inCodeFence) {
      codeBuffer.push(line);
      continue;
    }

    textBuffer.push(line);
  }

  if (inCodeFence) {
    flushCode();
  } else {
    flushText();
  }

  return blocks;
}

function renderInlineMarkdown(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const inlinePattern = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let lastIndex = 0;

  for (const match of text.matchAll(inlinePattern)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      nodes.push(text.slice(lastIndex, index));
    }

    const token = match[0];
    if (token.startsWith("`") && token.endsWith("`")) {
      nodes.push(
        <code
          key={`${keyPrefix}-${index}`}
          className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.9em]"
        >
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith("**") && token.endsWith("**")) {
      nodes.push(
        <strong key={`${keyPrefix}-${index}`} className="font-semibold text-foreground">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith("*") && token.endsWith("*")) {
      nodes.push(
        <em key={`${keyPrefix}-${index}`} className="italic">
          {token.slice(1, -1)}
        </em>
      );
    } else {
      nodes.push(token);
    }

    lastIndex = index + token.length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

function renderListBlock(
  lines: string[],
  key: string,
  ordered: boolean
) {
  const items: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const markerPattern = ordered ? /^\d+\.\s+/ : /^[-*]\s+/;
    if (markerPattern.test(line)) {
      items.push(line.replace(markerPattern, ""));
      continue;
    }

    if (items.length > 0) {
      items[items.length - 1] = `${items[items.length - 1]} ${line}`.trim();
    }
  }

  const Component = ordered ? "ol" : "ul";

  return (
    <Component
      key={key}
      className={
        ordered
          ? "list-decimal space-y-2 pl-5 text-sm leading-7 text-foreground/90"
          : "list-disc space-y-2 pl-5 text-sm leading-7 text-foreground/90"
      }
    >
      {items.map((item, index) => (
        <li key={`${key}-${index}`}>{renderInlineMarkdown(item, `${key}-${index}`)}</li>
      ))}
    </Component>
  );
}

function renderParagraphBlock(lines: string[], key: string) {
  const text = lines.map((line) => line.trim()).join(" ").trim();
  if (!text) {
    return null;
  }

  return (
    <p key={key} className="whitespace-pre-wrap text-sm leading-7 text-foreground/90">
      {renderInlineMarkdown(text, key)}
    </p>
  );
}

function renderQuoteBlock(lines: string[], key: string) {
  return (
    <blockquote
      key={key}
      className="border-l-2 border-primary/30 pl-4 text-sm leading-7 text-muted-foreground"
    >
      {lines.map((line, index) => (
        <Fragment key={`${key}-${index}`}>
          {renderInlineMarkdown(line.replace(/^>\s?/, "").trim(), `${key}-${index}`)}
          {index < lines.length - 1 ? <br /> : null}
        </Fragment>
      ))}
    </blockquote>
  );
}

function parseTextSections(block: string, keyPrefix: string) {
  const rendered: ReactNode[] = [];
  const lines = block.split("\n");
  let buffer: string[] = [];
  let bufferType: "paragraph" | "unordered-list" | "ordered-list" | "quote" | null = null;
  let blockIndex = 0;

  const flushBuffer = () => {
    if (!bufferType || buffer.length === 0) {
      buffer = [];
      bufferType = null;
      return;
    }

    const key = `${keyPrefix}-${blockIndex}`;
    blockIndex += 1;

    if (bufferType === "paragraph") {
      rendered.push(renderParagraphBlock(buffer, key));
    } else if (bufferType === "unordered-list") {
      rendered.push(renderListBlock(buffer, key, false));
    } else if (bufferType === "ordered-list") {
      rendered.push(renderListBlock(buffer, key, true));
    } else if (bufferType === "quote") {
      rendered.push(renderQuoteBlock(buffer, key));
    }

    buffer = [];
    bufferType = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    if (!trimmed) {
      flushBuffer();
      continue;
    }

    if (/^---+$/.test(trimmed) || /^\*\*\*+$/.test(trimmed)) {
      flushBuffer();
      rendered.push(
        <hr key={`${keyPrefix}-${blockIndex}`} className="border-border/70" />
      );
      blockIndex += 1;
      continue;
    }

    if (trimmed.startsWith("# ")) {
      flushBuffer();
      rendered.push(
        <h1
          key={`${keyPrefix}-${blockIndex}`}
          className="text-xl font-semibold tracking-tight text-foreground"
        >
          {renderInlineMarkdown(trimmed.replace(/^#\s+/, ""), `${keyPrefix}-${blockIndex}`)}
        </h1>
      );
      blockIndex += 1;
      continue;
    }

    if (trimmed.startsWith("## ")) {
      flushBuffer();
      rendered.push(
        <h2
          key={`${keyPrefix}-${blockIndex}`}
          className="border-b border-border/60 pb-2 text-lg font-semibold tracking-tight text-foreground"
        >
          {renderInlineMarkdown(trimmed.replace(/^##\s+/, ""), `${keyPrefix}-${blockIndex}`)}
        </h2>
      );
      blockIndex += 1;
      continue;
    }

    if (trimmed.startsWith("### ")) {
      flushBuffer();
      rendered.push(
        <h3
          key={`${keyPrefix}-${blockIndex}`}
          className="text-base font-semibold tracking-tight text-foreground"
        >
          {renderInlineMarkdown(trimmed.replace(/^###\s+/, ""), `${keyPrefix}-${blockIndex}`)}
        </h3>
      );
      blockIndex += 1;
      continue;
    }

    if (trimmed.startsWith(">")) {
      if (bufferType !== "quote") {
        flushBuffer();
        bufferType = "quote";
      }
      buffer.push(trimmed);
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      if (bufferType !== "unordered-list") {
        flushBuffer();
        bufferType = "unordered-list";
      }
      buffer.push(trimmed);
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      if (bufferType !== "ordered-list") {
        flushBuffer();
        bufferType = "ordered-list";
      }
      buffer.push(trimmed);
      continue;
    }

    if (bufferType === "unordered-list" || bufferType === "ordered-list") {
      buffer[buffer.length - 1] = `${buffer[buffer.length - 1]} ${trimmed}`.trim();
      continue;
    }

    if (bufferType !== "paragraph") {
      flushBuffer();
      bufferType = "paragraph";
    }
    buffer.push(trimmed);
  }

  flushBuffer();

  return rendered;
}

function renderReportMarkdown(markdown: string) {
  return tokenizeMarkdownBlocks(markdown).flatMap((block, index) => {
    if (block.type === "code") {
      return (
        <pre
          key={`report-code-${index}`}
          className="overflow-x-auto rounded-lg border bg-muted/60 p-4 text-xs leading-6 text-foreground"
        >
          <code>{block.content}</code>
        </pre>
      );
    }

    return parseTextSections(block.content, `report-block-${index}`);
  }) as ReactNode[];
}

export function ExperimentReportDialog({
  open,
  onOpenChange,
  displayTitle,
  reportMarkdown,
  reportPayload,
}: ExperimentReportDialogProps) {
  if (!reportMarkdown) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid h-[92vh] max-h-[92vh] grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden p-0 sm:max-w-5xl">
        <DialogHeader className="shrink-0 border-b px-6 pt-6 pb-4">
          <div className="flex items-center gap-2">
            <DialogTitle>{displayTitle}</DialogTitle>
            <Badge variant="secondary">Report</Badge>
            {reportPayload?.workflowStatus ? (
              <Badge variant="outline">
                {reportPayload.workflowStatus.replace(/_/g, " ")}
              </Badge>
            ) : null}
          </div>
          <DialogDescription>
            {reportPayload?.summary ??
              "AI-generated summary of the experiment run, findings, and observed outputs."}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 overflow-hidden">
          <ScrollArea className="h-full min-h-0">
            <div className="space-y-6 px-6 pt-5 pb-8">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <div className="rounded-lg border p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Verdict
                </p>
                <p className="mt-2 text-sm font-medium">
                  {reportPayload?.verdict ?? "—"}
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Target metric
                </p>
                <p className="mt-2 text-sm font-medium">
                  {reportPayload?.targetMetric ?? "—"}
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Target value
                </p>
                <p className="mt-2 text-sm font-medium">
                  {formatMetric(reportPayload?.targetValue)}
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Best result
                </p>
                <p className="mt-2 text-sm font-medium">
                  {formatMetric(reportPayload?.bestValue)}
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Gap / tolerance
                </p>
                <p className="mt-2 text-sm font-medium">
                  {formatMetric(reportPayload?.gap)} /{" "}
                  {formatMetric(reportPayload?.tolerance)}
                </p>
              </div>
            </div>

            {typeof reportPayload?.generatedAt === "number" ? (
              <p className="text-xs text-muted-foreground">
                Generated {new Date(reportPayload.generatedAt).toLocaleString()}
              </p>
            ) : null}

              <article className="space-y-4">
                {renderReportMarkdown(reportMarkdown)}
              </article>
            </div>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}
