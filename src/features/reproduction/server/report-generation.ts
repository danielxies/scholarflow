import { callClaude } from "@/lib/claude-client";
import type {
  CustomExperimentContext,
  Experiment,
  ExperimentArtifact,
  ExperimentFinding,
  ExperimentLogEntry,
  ExecutionJob,
  Hypothesis,
  Paper,
  ReproductionPlan,
} from "@/lib/db";

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function truncateText(value: string | null | undefined, maxLength = 3000) {
  if (!value) {
    return null;
  }

  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function summarizeFindings(findings: ExperimentFinding[]) {
  return findings.slice(0, 12).map((finding) => ({
    type: finding.type,
    severity: finding.severity,
    source: finding.source,
    confidence: finding.confidence,
    message: finding.message,
    timestamp: finding.timestamp,
  }));
}

function summarizeLogs(logs: ExperimentLogEntry[]) {
  return logs.slice(0, 40).map((log) => ({
    phase: log.phase,
    kind: log.kind,
    message: truncateText(log.message, 600),
    timestamp: log.timestamp,
  }));
}

function summarizeArtifacts(artifacts: ExperimentArtifact[]) {
  return artifacts.slice(0, 20).map((artifact) => ({
    type: artifact.type,
    uri: artifact.uri,
    createdAt: artifact.createdAt,
  }));
}

function extractSummaryLine(markdown: string) {
  const paragraph = markdown
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .find(
      (part) =>
        part.length > 0 &&
        !part.startsWith("#") &&
        !part.startsWith("- ") &&
        !part.startsWith("* ")
    );

  return paragraph ? paragraph.replace(/\s+/g, " ").trim() : null;
}

export interface GeneratedReportPayload {
  version: "v2";
  kind: "reproduction" | "custom";
  reportTitle: string;
  summary: string | null;
  generatedAt: number;
  reportMarkdown: string;
  verdict: string | null;
  workflowStatus: string | null;
  targetMetric: string | null;
  targetValue: number | null;
  bestValue: number | null;
  gap: number | null;
  tolerance: number | null;
  sourceData: Record<string, unknown>;
}

function buildReproductionFallbackReport(params: {
  paper: Paper;
  hypothesis: Hypothesis;
  experiment: Experiment;
  plan: ReproductionPlan | null;
  findings: ExperimentFinding[];
  executionJob: ExecutionJob | null;
}) {
  return [
    "# Reproduction Report",
    "",
    `## Outcome`,
    `Paper: ${params.paper.title}`,
    `Verdict: ${params.hypothesis.verdict ?? "Unknown"}`,
    `Workflow status: ${params.hypothesis.workflowStatus ?? "unknown"}`,
    `Target metric: ${params.hypothesis.targetMetric ?? params.plan?.targetMetric ?? "Unknown"}`,
    `Target value: ${params.hypothesis.targetValue ?? params.plan?.targetValue ?? "Unknown"}`,
    `Best reproduced value: ${params.hypothesis.bestValue ?? "Unknown"}`,
    `Gap: ${params.hypothesis.gap ?? "Unknown"}`,
    "",
    "## Key Findings",
    ...params.findings.slice(0, 8).map((finding) => `- [${finding.type}] ${finding.message}`),
    "",
    "## Execution Summary",
    params.executionJob?.resultSummary ?? "No structured runner summary was captured.",
  ].join("\n");
}

function buildCustomFallbackReport(params: {
  customContext: CustomExperimentContext;
  hypothesis: Hypothesis;
  findings: ExperimentFinding[];
  executionJob: ExecutionJob | null;
}) {
  return [
    "# Experiment Report",
    "",
    "## Outcome",
    `Experiment: ${params.hypothesis.title}`,
    `Workflow status: ${params.hypothesis.workflowStatus ?? "unknown"}`,
    `Target metric: ${params.hypothesis.targetMetric ?? "Unknown"}`,
    `Target value: ${params.hypothesis.targetValue ?? "Unknown"}`,
    `Best result: ${params.hypothesis.bestValue ?? "Unknown"}`,
    `Gap: ${params.hypothesis.gap ?? "Unknown"}`,
    "",
    "## Experiment Context",
    params.customContext.description,
    params.customContext.benchmark ? `Benchmark: ${params.customContext.benchmark}` : null,
    params.customContext.repoUrl ? `Repository: ${params.customContext.repoUrl}` : null,
    "",
    "## Key Findings",
    ...params.findings.slice(0, 8).map((finding) => `- [${finding.type}] ${finding.message}`),
    "",
    "## Execution Summary",
    params.executionJob?.resultSummary ?? "No structured runner summary was captured.",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function generateReproductionReport(params: {
  paper: Paper;
  hypothesis: Hypothesis;
  experiment: Experiment;
  plan: ReproductionPlan | null;
  blocker: unknown;
  findings: ExperimentFinding[];
  logs: ExperimentLogEntry[];
  artifacts: ExperimentArtifact[];
  executionJob: ExecutionJob | null;
}) {
  const sourceData = {
    paper: {
      id: params.paper._id,
      title: params.paper.title,
      summary: truncateText(params.paper.aiSummary ?? params.paper.abstract, 1800),
      officialRepoUrl: params.paper.officialRepoUrl,
      pdfUrl: params.paper.pdfUrl,
    },
    hypothesis: params.hypothesis,
    experiment: params.experiment,
    plan: params.plan,
    blocker: params.blocker,
    findings: summarizeFindings(params.findings),
    logs: summarizeLogs(params.logs),
    artifacts: summarizeArtifacts(params.artifacts),
    executionJob: params.executionJob,
  };

  const prompt = [
    "Write a concise but thorough AI-generated report for a completed paper reproduction run.",
    "Focus on what happened, the strongest findings, the observed outputs, the result quality, and the main caveats.",
    "Return Markdown only. Do not wrap it in code fences.",
    "",
    "Use this structure:",
    "# Reproduction Report",
    "## Outcome",
    "## Key Findings",
    "## Execution Summary",
    "## Outputs and Metrics",
    "## Caveats",
    "## Recommended Next Steps",
    "",
    "Source data:",
    safeJson(sourceData),
  ].join("\n");

  let reportMarkdown = buildReproductionFallbackReport(params);
  try {
    const response = await callClaude({
      prompt,
      systemPrompt:
        "You write high-signal experiment reports. Return Markdown only with no preamble and no code fences.",
      model: "sonnet",
      maxTurns: 1,
      allowedTools: [],
    });
    if (response.trim()) {
      reportMarkdown = response.trim();
    }
  } catch {
    // keep fallback report
  }

  const payload: GeneratedReportPayload = {
    version: "v2",
    kind: "reproduction",
    reportTitle: "Reproduction Report",
    summary: extractSummaryLine(reportMarkdown),
    generatedAt: Date.now(),
    reportMarkdown,
    verdict: params.hypothesis.verdict ?? null,
    workflowStatus: params.hypothesis.workflowStatus ?? null,
    targetMetric: params.hypothesis.targetMetric ?? params.plan?.targetMetric ?? null,
    targetValue: params.hypothesis.targetValue ?? params.plan?.targetValue ?? null,
    bestValue: params.hypothesis.bestValue ?? null,
    gap: params.hypothesis.gap ?? null,
    tolerance: params.hypothesis.tolerance ?? params.plan?.tolerance ?? null,
    sourceData,
  };

  return { markdown: reportMarkdown, payload };
}

export async function generateCustomExperimentReport(params: {
  customContext: CustomExperimentContext;
  hypothesis: Hypothesis;
  experiment: Experiment;
  blocker: unknown;
  findings: ExperimentFinding[];
  logs: ExperimentLogEntry[];
  artifacts: ExperimentArtifact[];
  executionJob: ExecutionJob | null;
}) {
  const sourceData = {
    customContext: {
      description: params.customContext.description,
      benchmark: params.customContext.benchmark,
      repoUrl: params.customContext.repoUrl,
      datasetNote: params.customContext.datasetNote,
    },
    hypothesis: params.hypothesis,
    experiment: params.experiment,
    blocker: params.blocker,
    findings: summarizeFindings(params.findings),
    logs: summarizeLogs(params.logs),
    artifacts: summarizeArtifacts(params.artifacts),
    executionJob: params.executionJob,
  };

  const prompt = [
    "Write a concise but thorough AI-generated report for a completed custom experiment run.",
    "Focus on the original experiment intent, what the system actually ran, the strongest findings, the outputs, and the key caveats.",
    "Return Markdown only. Do not wrap it in code fences.",
    "",
    "Use this structure:",
    "# Experiment Report",
    "## Outcome",
    "## Key Findings",
    "## Execution Summary",
    "## Outputs and Metrics",
    "## Caveats",
    "## Recommended Next Steps",
    "",
    "Source data:",
    safeJson(sourceData),
  ].join("\n");

  let reportMarkdown = buildCustomFallbackReport(params);
  try {
    const response = await callClaude({
      prompt,
      systemPrompt:
        "You write high-signal experiment reports. Return Markdown only with no preamble and no code fences.",
      model: "sonnet",
      maxTurns: 1,
      allowedTools: [],
    });
    if (response.trim()) {
      reportMarkdown = response.trim();
    }
  } catch {
    // keep fallback report
  }

  const payload: GeneratedReportPayload = {
    version: "v2",
    kind: "custom",
    reportTitle: "Experiment Report",
    summary: extractSummaryLine(reportMarkdown),
    generatedAt: Date.now(),
    reportMarkdown,
    verdict: params.hypothesis.verdict ?? null,
    workflowStatus: params.hypothesis.workflowStatus ?? null,
    targetMetric: params.hypothesis.targetMetric ?? null,
    targetValue: params.hypothesis.targetValue ?? null,
    bestValue: params.hypothesis.bestValue ?? null,
    gap: params.hypothesis.gap ?? null,
    tolerance: params.hypothesis.tolerance ?? null,
    sourceData,
  };

  return { markdown: reportMarkdown, payload };
}
