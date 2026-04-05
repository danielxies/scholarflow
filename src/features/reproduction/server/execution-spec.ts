import { z } from "zod";

import { extractJsonPayload } from "@/lib/ai-json";
import { callClaude } from "@/lib/claude-client";
import type {
  CustomExperimentContext,
  Experiment,
  Hypothesis,
  Paper,
  ReproductionPlan,
} from "@/lib/db";
import type { GitHubRepositoryContext } from "./github-inspector";

const plannerCommandSchema = z.object({
  label: z.string().min(1),
  phase: z.enum(["install", "prepare_data", "run", "evaluate"]),
  argv: z.array(z.string().min(1)).min(1),
  cwd: z.string().min(1).default("."),
  timeoutSeconds: z.number().int().min(30).max(86400).default(1800),
  expectedOutputs: z.array(z.string()).default([]),
});

const plannerBlockerSchema = z.object({
  blockerType: z.string().min(1),
  message: z.string().min(1),
  requiredInput: z.string().nullable().default(null),
});

export const plannerOutputSchema = z.object({
  repoUrl: z.string().url().nullable(),
  repoRef: z.string().min(1).nullable(),
  repoConfidence: z.number().min(0).max(1).default(0.5),
  datasetPlan: z.object({
    summary: z.string().min(1),
    accessMode: z.enum(["public", "credentials_required", "manual"]),
    datasetNames: z.array(z.string()).default([]),
    requiredCredentials: z.array(z.string()).default([]),
  }),
  installPlan: z.array(plannerCommandSchema).default([]),
  commandGraph: z.array(plannerCommandSchema).default([]),
  outputContracts: z
    .array(
      z.object({
        type: z.string().min(1),
        pathHint: z.string().min(1),
        description: z.string().min(1),
      })
    )
    .default([]),
  metricRules: z
    .array(
      z.object({
        metricName: z.string().min(1),
        sourceHint: z.string().min(1),
        regex: z.string().nullable().default(null),
        filePattern: z.string().nullable().default(null),
      })
    )
    .default([]),
  assumptions: z.array(z.string().min(1)).default([]),
  hardBlockers: z.array(plannerBlockerSchema).default([]),
  fallbackPlan: z.array(z.string().min(1)).default([]),
});

const sourcePackEvidenceSchema = z.object({
  kind: z.enum([
    "paper",
    "repository",
    "supplement",
    "supporting_paper",
    "custom_context",
    "planner",
  ]),
  label: z.string().min(1),
  summary: z.string().min(1),
  url: z.string().nullable().default(null),
  content: z.string().nullable().default(null),
});

const executionSourcePackSchema = z.object({
  version: z.literal("v1"),
  kind: z.enum(["reproduction", "custom"]),
  paper: z.object({
    id: z.string().min(1),
    title: z.string().min(1),
    summary: z.string().nullable(),
    abstract: z.string().nullable(),
    paperType: z.string().nullable(),
  }),
  target: z.object({
    targetClaim: z.string().min(1),
    targetMetric: z.string().nullable(),
    targetValue: z.number().nullable(),
    tolerance: z.number().nullable(),
  }),
  repo: z.object({
    url: z.string().url().nullable(),
    ref: z.string().nullable(),
    confidence: z.number().min(0).max(1),
    defaultBranch: z.string().nullable(),
    description: z.string().nullable(),
    rootEntries: z.array(z.string()).default([]),
    treePaths: z.array(z.string()).default([]),
    readmeExcerpt: z.string().nullable(),
  }),
  datasets: plannerOutputSchema.shape.datasetPlan,
  acceptedSources: z.array(z.string().min(1)).default([]),
  contextSummary: z.string().min(1),
  plannerOutput: plannerOutputSchema,
  evidence: z.array(sourcePackEvidenceSchema).default([]),
});

const bundleDependencySchema = z.object({
  name: z.string().min(1),
  version: z.string().nullable().default(null),
  rationale: z.string().min(1),
});

const bundleFileSchema = z.object({
  path: z.string().min(1),
  purpose: z.string().min(1),
  content: z.string().min(1),
});

export const normalizedExecutionBundleSchema = z.object({
  version: z.literal("v1"),
  strategy: z.enum(["single_file", "multi_file"]),
  inferenceLevel: z.enum(["repo_faithful", "api_reconstruction", "benchmark_sample"]),
  rationale: z.string().min(1),
  bundleOriginSummary: z.string().min(1),
  credibilityScore: z.number().min(0).max(1),
  fallbackChainUsed: z.array(z.string().min(1)).default([]),
  entrypoint: z.string().min(1),
  workingDirectory: z.string().min(1).default("."),
  installCommand: z.array(z.string().min(1)).default([
    "python",
    "-m",
    "pip",
    "install",
    "-r",
    "requirements.txt",
  ]),
  files: z.array(bundleFileSchema).min(1),
  dependencies: z.array(bundleDependencySchema).default([]),
  assumptions: z.array(z.string().min(1)).default([]),
  outputContracts: plannerOutputSchema.shape.outputContracts.default([]),
  metricRules: plannerOutputSchema.shape.metricRules.default([]),
});

const bundleValidationReportSchema = z.object({
  valid: z.boolean(),
  warnings: z.array(z.string()).default([]),
  errors: z.array(z.string()).default([]),
  summary: z.string().min(1),
});

export const executionSpecSchema = z.object({
  version: z.literal("v2"),
  runnerContractVersion: z.string().min(1).default("bundle-v2"),
  paper: z.object({
    id: z.string().min(1),
    title: z.string().min(1),
    paperType: z.string().nullable(),
  }),
  claim: z.object({
    targetClaim: z.string().min(1),
    targetMetric: z.string().nullable(),
    targetValue: z.number().nullable(),
    tolerance: z.number().nullable(),
  }),
  sources: z.object({
    acceptedSources: z.array(z.string().min(1)),
    officialRepoUrl: z.string().url().nullable(),
    pdfUrl: z.string().url().nullable(),
    supplementaryUrls: z.array(z.string().url()).default([]),
  }),
  repo: z
    .object({
      url: z.string().url().nullable(),
      ref: z.string().nullable(),
      confidence: z.number().min(0).max(1),
      defaultBranch: z.string().nullable(),
    })
    .nullable(),
  sourcePack: executionSourcePackSchema,
  inferenceLevel: z.enum(["repo_faithful", "api_reconstruction", "benchmark_sample"]),
  bundleOriginSummary: z.string().min(1),
  assumptionLedger: z.array(z.string().min(1)).default([]),
  credibilityScore: z.number().min(0).max(1),
  fallbackChainUsed: z.array(z.string().min(1)).default([]),
  bundle: normalizedExecutionBundleSchema,
  environment: z.object({
    backend: z.literal("modal"),
    computeTier: z.enum(["small", "standard", "extended"]),
    workingDirectory: z.string().min(1),
  }),
  datasets: z.object({
    summary: z.string().min(1),
    accessMode: z.enum(["public", "credentials_required", "manual"]),
    datasetNames: z.array(z.string()).default([]),
  }),
  credentials: z.object({
    required: z.boolean(),
    note: z.string().nullable(),
    requiredCredentials: z.array(z.string()).default([]),
  }),
  outputContracts: plannerOutputSchema.shape.outputContracts,
  metricRules: plannerOutputSchema.shape.metricRules,
  repairPolicy: z.object({
    autoAssumeLowRisk: z.boolean(),
    allowSupportingPapers: z.boolean(),
    humanApprovalOnBlocker: z.boolean(),
  }),
  callbacks: z.object({
    url: z.string().url(),
  }),
  timeouts: z.object({
    jobSeconds: z.number().int().positive(),
    heartbeatSeconds: z.number().int().positive(),
  }),
});

export type ExecutionPlannerOutput = z.infer<typeof plannerOutputSchema>;
export type ExecutionSourcePack = z.infer<typeof executionSourcePackSchema>;
export type NormalizedExecutionBundle = z.infer<typeof normalizedExecutionBundleSchema>;
export type BundleValidationReport = z.infer<typeof bundleValidationReportSchema>;
export type ExecutionSpec = z.infer<typeof executionSpecSchema>;

export interface BundlePreflightCheck {
  name: string;
  source: "local" | "remote";
  status: "passed" | "failed" | "skipped";
  summary: string;
  details: string | null;
}

export interface BundlePreflightReport {
  ok: boolean;
  failureClass: string | null;
  errorSummary: string | null;
  warnings: string[];
  checks: BundlePreflightCheck[];
}

export interface BundleRepairAttemptRecord {
  attemptNumber: number;
  source: "local" | "remote";
  failureClass: string;
  errorSummary: string;
  checks: BundlePreflightCheck[];
  repairSummary: string;
}

export const MAX_BUNDLE_REPAIR_ATTEMPTS = 3;

export interface SerializedExecutionPlanningBlocker {
  blockerType: string;
  message: string;
  requiredInput: string | null;
}

export interface BundleSynthesisDiagnostics {
  modelAttempted: boolean;
  modelSucceeded: boolean;
  modelError: string | null;
  secondaryModelAttempted: boolean;
  secondaryModelSucceeded: boolean;
  secondaryModelError: string | null;
  fallbackAttempted: boolean;
  fallbackSucceeded: boolean;
  fallbackError: string | null;
  usedFallback: boolean;
  attempts: string[];
  promptSourcePackBytes: number;
  compactSourcePackBytes: number;
  strategy: "single_file" | "multi_file" | null;
  inferenceLevel: "repo_faithful" | "api_reconstruction" | "benchmark_sample" | null;
}

export interface BundleSynthesisResult {
  bundle: NormalizedExecutionBundle;
  diagnostics: BundleSynthesisDiagnostics;
  compactSourcePack: unknown;
}

export class ExecutionPlanningBlockerError extends Error {
  blockerType: string;
  requiredInput: string | null;

  constructor(blockerType: string, message: string, requiredInput?: string | null) {
    super(message);
    this.name = "ExecutionPlanningBlockerError";
    this.blockerType = blockerType;
    this.requiredInput = requiredInput ?? null;
  }
}

export function serializeExecutionPlanningBlocker(
  error: unknown
): SerializedExecutionPlanningBlocker | null {
  if (error instanceof ExecutionPlanningBlockerError) {
    return {
      blockerType: error.blockerType,
      message: error.message,
      requiredInput: error.requiredInput,
    };
  }

  if (error && typeof error === "object") {
    const candidate = error as {
      name?: unknown;
      blockerType?: unknown;
      message?: unknown;
      requiredInput?: unknown;
    };

    if (
      (candidate.name === "ExecutionPlanningBlockerError" ||
        typeof candidate.blockerType === "string") &&
      typeof candidate.message === "string"
    ) {
      return {
        blockerType:
          typeof candidate.blockerType === "string"
            ? candidate.blockerType
            : "missing_execution_path",
        message: candidate.message,
        requiredInput:
          typeof candidate.requiredInput === "string"
            ? candidate.requiredInput
            : null,
      };
    }
  }

  return null;
}

export interface ExecutionPlanningContext {
  paper: Paper;
  hypothesis: Hypothesis;
  experiment: Experiment;
  plan: ReproductionPlan;
  repoContext: GitHubRepositoryContext | null;
  appBaseUrl: string;
}

export interface CustomExecutionPlanningContext {
  hypothesis: Hypothesis;
  experiment: Experiment;
  customContext: CustomExperimentContext;
  contextPapers: Paper[];
  repoContext: GitHubRepositoryContext | null;
  appBaseUrl: string;
}

function safeJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function truncateText(value: string | null | undefined, maxLength = 2000): string | null {
  if (!value) {
    return null;
  }

  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

interface CustomDatasetContext {
  datasetNote: string | null;
  setupNote: string | null;
  accessMode: "public" | "credentials_required" | "manual";
  requiredCredentials: string[];
  summary: string;
}

const CUSTOM_NOTE_CREDENTIAL_RE =
  /\b(token|credential|credentials|api[_ -]?key|access[_ -]?key|secret|login|gated|private|hf[_ -]?token|hugging\s*face\s*token|kaggle|s3|bucket)\b/i;
const CUSTOM_NOTE_SETUP_RE =
  /\b(pip\s+install|python\s+-m\s+pip\s+install|conda\s+install|poetry\s+add|uv\s+pip\s+install|npm\s+install|brew\s+install|apt(?:-get)?\s+install)\b/i;

function interpretCustomDatasetNote(
  note: string | null | undefined
): CustomDatasetContext {
  const trimmed = note?.trim() ?? "";
  if (!trimmed) {
    return {
      datasetNote: null,
      setupNote: null,
      accessMode: "public",
      requiredCredentials: [],
      summary:
        "Assume public dataset access unless the repository or benchmark instructions indicate otherwise.",
    };
  }

  if (CUSTOM_NOTE_CREDENTIAL_RE.test(trimmed)) {
    return {
      datasetNote: trimmed,
      setupNote: null,
      accessMode: "credentials_required",
      requiredCredentials: ["dataset_credentials"],
      summary: trimmed,
    };
  }

  if (CUSTOM_NOTE_SETUP_RE.test(trimmed)) {
    return {
      datasetNote: null,
      setupNote: trimmed,
      accessMode: "public",
      requiredCredentials: [],
      summary:
        "No dataset credential requirements were identified from the custom note; treat it as setup guidance instead.",
    };
  }

  return {
    datasetNote: trimmed,
    setupNote: null,
    accessMode: "public",
    requiredCredentials: [],
    summary: trimmed,
  };
}

function collectSourceSignals(sourcePack: ExecutionSourcePack) {
  return [
    sourcePack.target.targetClaim,
    sourcePack.target.targetMetric,
    sourcePack.contextSummary,
    sourcePack.paper.title,
    sourcePack.paper.summary,
    sourcePack.paper.abstract,
    sourcePack.repo.url,
    sourcePack.repo.description,
    sourcePack.repo.readmeExcerpt,
    ...sourcePack.acceptedSources,
    ...sourcePack.repo.rootEntries,
    ...sourcePack.repo.treePaths,
    ...sourcePack.evidence.map((evidence) => evidence.summary),
    ...sourcePack.evidence.map((evidence) => evidence.content ?? ""),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function inferTaskFamily(sourcePack: ExecutionSourcePack) {
  const signals = collectSourceSignals(sourcePack);
  if (
    sourcePack.target.targetMetric?.toLowerCase().includes("runtime") ||
    signals.includes("runtime") ||
    signals.includes("latency") ||
    signals.includes("throughput")
  ) {
    return "runtime_benchmark" as const;
  }

  if (
    signals.includes("classification") ||
    signals.includes("sentiment") ||
    signals.includes("label")
  ) {
    return "text_classification" as const;
  }

  if (
    signals.includes("generation") ||
    signals.includes("summarization") ||
    signals.includes("translation") ||
    signals.includes("qa")
  ) {
    return "text_generation" as const;
  }

  return "general_ml" as const;
}

function inferWorkingModelName(sourcePack: ExecutionSourcePack) {
  const signals = collectSourceSignals(sourcePack);

  if (signals.includes("distilbert")) {
    return "distilbert-base-uncased";
  }
  if (signals.includes("roberta")) {
    return "roberta-base";
  }
  if (signals.includes("bert")) {
    return "bert-base-uncased";
  }
  if (signals.includes("t5")) {
    return "t5-small";
  }
  if (signals.includes("gpt2")) {
    return "gpt2";
  }

  return "distilbert-base-uncased";
}

function repoUsesTransformers(sourcePack: ExecutionSourcePack) {
  const signals = collectSourceSignals(sourcePack);
  return (
    signals.includes("transformers") ||
    signals.includes("huggingface") ||
    signals.includes("distilbert") ||
    signals.includes("bert")
  );
}

function withSynthesisDiagnostics(
  error: unknown,
  diagnostics: BundleSynthesisDiagnostics
): Error {
  const target =
    error instanceof Error ? error : new Error(errorMessage(error));
  (
    target as Error & {
      synthesisDiagnostics?: BundleSynthesisDiagnostics;
    }
  ).synthesisDiagnostics = diagnostics;
  return target;
}

export function extractSynthesisDiagnostics(
  error: unknown
): BundleSynthesisDiagnostics | null {
  if (!error || typeof error !== "object") {
    return null;
  }

  const candidate = error as {
    synthesisDiagnostics?: BundleSynthesisDiagnostics;
  };

  return candidate.synthesisDiagnostics ?? null;
}

function parseAcceptedSources(plan: ReproductionPlan): string[] {
  try {
    const parsed = JSON.parse(plan.acceptedSources) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string")
      : [];
  } catch {
    return [];
  }
}

function parseSettingsSnapshot(
  source: Pick<ReproductionPlan, "settingsSnapshot"> | Pick<CustomExperimentContext, "settingsSnapshot">
) {
  try {
    const parsed = JSON.parse(source.settingsSnapshot) as {
      computeTier?: "small" | "standard" | "extended";
      allowSupportingPapers?: boolean;
      humanApprovalOnBlocker?: boolean;
    };
    return {
      computeTier: parsed.computeTier ?? "standard",
      allowSupportingPapers: parsed.allowSupportingPapers ?? true,
      humanApprovalOnBlocker: parsed.humanApprovalOnBlocker ?? true,
    };
  } catch {
    return {
      computeTier: "standard" as const,
      allowSupportingPapers: true,
      humanApprovalOnBlocker: true,
    };
  }
}

function tokenizeCommand(command: string): string[] {
  const tokens = command.match(/"[^"]*"|'[^']*'|`[^`]*`|[^\s]+/g) ?? [];
  return tokens
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => token !== "\\")
    .map((token) =>
      token.replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1").replace(/^`(.*)`$/, "$1")
    );
}

function normalizeShellBlock(block: string): string[] {
  const commands: string[] = [];
  let current = "";

  for (const rawLine of block.split("\n")) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const line = trimmed.replace(/\s+#.*$/, "").trim();
    if (!line) {
      continue;
    }

    if (line.endsWith("\\")) {
      current = `${current} ${line.slice(0, -1).trim()}`.trim();
      continue;
    }

    const combined = `${current} ${line}`.trim();
    current = "";
    commands.push(combined);
  }

  if (current) {
    commands.push(current);
  }

  return commands;
}

function extractCommandLines(readme: string | null): string[] {
  if (!readme) return [];

  const blocks = [...readme.matchAll(/```(?:bash|sh|shell|zsh|python)?\n([\s\S]*?)```/gi)];
  const lines = blocks.flatMap((match) => normalizeShellBlock(match[1]));

  return lines.filter((line) =>
    /^(python|python3|bash|sh|\.\/|pytest|make)\b/i.test(line)
  );
}

function buildFallbackInstallPlan(repoContext: GitHubRepositoryContext | null) {
  if (!repoContext) return [] as ExecutionPlannerOutput["installPlan"];

  const root = new Set(repoContext.rootEntries.map((entry) => entry.toLowerCase()));
  if (root.has("requirements.txt")) {
    return [
      {
        label: "Install Python requirements",
        phase: "install" as const,
        argv: ["python", "-m", "pip", "install", "-r", "requirements.txt"],
        cwd: ".",
        timeoutSeconds: 1800,
        expectedOutputs: [],
      },
    ];
  }

  if (root.has("pyproject.toml") || root.has("setup.py")) {
    return [
      {
        label: "Install project package",
        phase: "install" as const,
        argv: ["python", "-m", "pip", "install", "."],
        cwd: ".",
        timeoutSeconds: 1800,
        expectedOutputs: [],
      },
    ];
  }

  return [];
}

function buildFallbackRunCommands(
  repoContext: GitHubRepositoryContext | null
): ExecutionPlannerOutput["commandGraph"] {
  const fromReadme = extractCommandLines(repoContext?.readme ?? null)
    .filter((line) => !/^python(?:3)?\s+-m\s+pip\b/i.test(line))
    .map((line, index) => ({
      label: `README command ${index + 1}`,
      phase: /(?:eval|test|infer|predict)/i.test(line) ? ("evaluate" as const) : ("run" as const),
      argv: tokenizeCommand(line),
      cwd: ".",
      timeoutSeconds: /(?:train|finetune)/i.test(line) ? 21600 : 7200,
      expectedOutputs: [],
    }))
    .filter((command) => command.argv.length > 0);

  if (fromReadme.length > 0) {
    return fromReadme.slice(0, 4);
  }

  const root = new Set(repoContext?.rootEntries.map((entry) => entry.toLowerCase()) ?? []);
  const inferred =
    root.has("eval.py")
      ? ["python", "eval.py"]
      : root.has("test.py")
        ? ["python", "test.py"]
        : root.has("main.py")
          ? ["python", "main.py"]
          : root.has("train.py")
            ? ["python", "train.py"]
            : null;

  if (!inferred) {
    return [];
  }

  return [
    {
      label: "Inferred primary command",
      phase: inferred[1]?.includes("eval") || inferred[1]?.includes("test")
        ? "evaluate"
        : "run",
      argv: inferred,
      cwd: ".",
      timeoutSeconds: inferred[1] === "train.py" ? 21600 : 7200,
      expectedOutputs: [],
    },
  ];
}

function buildDefaultMetricRules(
  targetMetric: string | null | undefined
): ExecutionPlannerOutput["metricRules"] {
  if (!targetMetric) {
    return [];
  }

  return [
    {
      metricName: targetMetric,
      sourceHint: "stdout, outputs/metrics.json, or outputs/report.json",
      regex: `${targetMetric.replace(/_/g, "[_\\s-]?")}[^\\d-]*([0-9]+(?:\\.[0-9]+)?)`,
      filePattern: "outputs/metrics.json|outputs/report.json|outputs/*.json|outputs/*.txt|outputs/*.log",
    },
  ];
}

function buildDefaultOutputContracts(): ExecutionPlannerOutput["outputContracts"] {
  return [
    {
      type: "results_file",
      pathHint: "outputs/metrics.json|outputs/report.json|outputs/*.json|outputs/*.txt|outputs/*.log",
      description: "Structured benchmark outputs and execution summaries generated by the normalized bundle.",
    },
  ];
}

function buildFallbackPlannerOutput(
  context: ExecutionPlanningContext
): ExecutionPlannerOutput {
  const repoUrl = context.paper.officialRepoUrl ?? context.repoContext?.repoUrl ?? null;
  const datasetMode = context.plan.datasetSpec ? "credentials_required" : "public";

  return {
    repoUrl,
    repoRef: context.repoContext?.defaultBranch ?? null,
    repoConfidence: repoUrl ? 0.55 : 0.2,
    datasetPlan: {
      summary: context.plan.datasetSpec
        ? "Execution may require user-provided dataset credentials or notes captured in the reproduction plan."
        : "Assume public dataset access unless the repository requires gated assets during execution.",
      accessMode: datasetMode,
      datasetNames: [],
      requiredCredentials: context.plan.datasetSpec ? ["dataset_credentials"] : [],
    },
    installPlan: buildFallbackInstallPlan(context.repoContext),
    commandGraph: buildFallbackRunCommands(context.repoContext),
    outputContracts: buildDefaultOutputContracts(),
    metricRules: buildDefaultMetricRules(context.hypothesis.targetMetric),
    assumptions: [
      "Used repository defaults when the paper metadata did not specify an exact git ref.",
      "Selected the first credible README or root-script execution path available from the official repository metadata.",
    ],
    hardBlockers: [],
    fallbackPlan: [
      "If direct synthesis fails, generate a normalized bundle that adapts the repository-backed execution path into a compact runner.",
      "If repository execution remains unclear, infer a runnable benchmark sample from paper and supporting evidence.",
    ],
  };
}

function buildCustomFallbackPlannerOutput(
  context: CustomExecutionPlanningContext
): ExecutionPlannerOutput {
  const repoUrl = context.customContext.repoUrl ?? context.repoContext?.repoUrl ?? null;
  const datasetContext = interpretCustomDatasetNote(context.customContext.datasetNote);

  return {
    repoUrl,
    repoRef: context.repoContext?.defaultBranch ?? null,
    repoConfidence: repoUrl ? 0.5 : 0.1,
    datasetPlan: {
      summary: datasetContext.summary,
      accessMode: datasetContext.accessMode,
      datasetNames: [],
      requiredCredentials: datasetContext.requiredCredentials,
    },
    installPlan: buildFallbackInstallPlan(context.repoContext),
    commandGraph: buildFallbackRunCommands(context.repoContext),
    outputContracts: buildDefaultOutputContracts(),
    metricRules: buildDefaultMetricRules(context.hypothesis.targetMetric),
    assumptions: [
      "Used repository defaults and benchmark notes when the custom experiment description did not specify an exact execution path.",
      "Selected the first credible repository-backed execution path available from the provided repo context.",
    ],
    hardBlockers: [],
    fallbackPlan: [
      "If direct synthesis fails, generate a normalized bundle that adapts the repository-backed execution path into a compact runner.",
      "If repository execution remains unclear, infer a runnable benchmark sample from the experiment description and available context.",
    ],
  };
}

async function callPlannerModel(
  context: ExecutionPlanningContext
): Promise<ExecutionPlannerOutput> {
  const acceptedSources = parseAcceptedSources(context.plan);
  const prompt = [
    `Paper title: ${context.paper.title}`,
    `Paper type: ${context.paper.paperType ?? "unknown"}`,
    `Supportability: ${context.paper.supportabilityLabel ?? "unknown"}`,
    `Target claim: ${context.plan.targetClaim}`,
    `Target metric: ${context.plan.targetMetric ?? "unknown"}`,
    `Target value: ${context.plan.targetValue ?? "unknown"}`,
    `Tolerance: ${context.plan.tolerance ?? "unknown"}`,
    `Official repository URL: ${context.paper.officialRepoUrl ?? "unknown"}`,
    `Dataset note: ${context.plan.datasetSpec ?? "none"}`,
    `Accepted sources: ${acceptedSources.join(", ") || "none"}`,
    "",
    "Repository context:",
    safeJson({
      defaultBranch: context.repoContext?.defaultBranch ?? null,
      description: context.repoContext?.description ?? null,
      rootEntries: context.repoContext?.rootEntries ?? [],
      readmeExcerpt: truncateText(context.repoContext?.readme ?? null, 5000),
      treePaths: (context.repoContext?.treePaths ?? []).slice(0, 120),
    }),
    "",
    "Return strict JSON with keys:",
    "- repoUrl",
    "- repoRef",
    "- repoConfidence",
    "- datasetPlan { summary, accessMode, datasetNames, requiredCredentials }",
    "- installPlan[] of { label, phase, argv, cwd, timeoutSeconds, expectedOutputs }",
    "- commandGraph[] of { label, phase, argv, cwd, timeoutSeconds, expectedOutputs }",
    "- outputContracts[] of { type, pathHint, description }",
    "- metricRules[] of { metricName, sourceHint, regex, filePattern }",
    "- assumptions[]",
    "- hardBlockers[] of { blockerType, message, requiredInput }",
    "- fallbackPlan[]",
    "",
    "Rules:",
    "- Prefer official repository defaults when available, but infer missing defaults aggressively when the task family is clear.",
    "- Prefer a runnable benchmark or sample path over blocking whenever the paper and repository evidence imply a plausible execution strategy.",
    "- Only ask for human input on true hard blockers such as gated datasets with no substitute path or a genuinely opaque task family.",
    "- Use argv arrays only. Do not emit shell operators, heredocs, env assignments, or chained commands.",
    "- Favor evaluation commands over full retraining if the repository clearly supports evaluation or checkpoint use.",
    "- When exact commands are missing, infer a standard-library or common-framework benchmark path that stays as faithful as possible to the described task.",
  ].join("\n");

  const response = await callClaude({
    prompt,
    systemPrompt:
      "You are an inference-first ML reproduction planner. Return only valid JSON matching the requested schema.",
    model: "sonnet",
    maxTurns: 1,
    allowedTools: [],
  });

  return plannerOutputSchema.parse(JSON.parse(extractJsonPayload(response)) as unknown);
}

function repoSummary(repoContext: GitHubRepositoryContext | null, repoUrl: string | null) {
  return {
    url: repoUrl ?? repoContext?.repoUrl ?? null,
    ref: repoContext?.defaultBranch ?? null,
    confidence: repoUrl ? 0.8 : 0.25,
    defaultBranch: repoContext?.defaultBranch ?? null,
    description: repoContext?.description ?? null,
    rootEntries: repoContext?.rootEntries ?? [],
    treePaths: (repoContext?.treePaths ?? []).slice(0, 200),
    readmeExcerpt: truncateText(repoContext?.readme ?? null, 12000),
  };
}

export async function generateExecutionPlannerOutput(
  context: ExecutionPlanningContext
): Promise<ExecutionPlannerOutput> {
  try {
    return await callPlannerModel(context);
  } catch {
    return buildFallbackPlannerOutput(context);
  }
}

export async function generateCustomExecutionPlannerOutput(
  context: CustomExecutionPlanningContext
): Promise<ExecutionPlannerOutput> {
  const datasetContext = interpretCustomDatasetNote(context.customContext.datasetNote);
  const prompt = [
    `Experiment title: ${context.hypothesis.title}`,
    `Description: ${context.customContext.description}`,
    `Benchmark note: ${context.customContext.benchmark ?? "none"}`,
    `Provided repository URL: ${context.customContext.repoUrl ?? "none"}`,
    `Dataset/access note: ${datasetContext.datasetNote ?? "none"}`,
    `Additional setup note: ${datasetContext.setupNote ?? "none"}`,
    "",
    "Context papers:",
    context.contextPapers.length
      ? context.contextPapers
          .map((paper) =>
            safeJson({
              title: paper.title,
              summary: truncateText(paper.aiSummary ?? null, 500),
              abstract: truncateText(paper.abstract ?? null, 500),
              officialRepoUrl: paper.officialRepoUrl ?? null,
            })
          )
          .join("\n")
      : "No context papers provided.",
    "",
    "Repository context:",
    safeJson({
      defaultBranch: context.repoContext?.defaultBranch ?? null,
      description: context.repoContext?.description ?? null,
      rootEntries: context.repoContext?.rootEntries ?? [],
      readmeExcerpt: truncateText(context.repoContext?.readme ?? null, 5000),
      treePaths: (context.repoContext?.treePaths ?? []).slice(0, 120),
    }),
    "",
    "Return strict JSON with keys:",
    "- repoUrl",
    "- repoRef",
    "- repoConfidence",
    "- datasetPlan { summary, accessMode, datasetNames, requiredCredentials }",
    "- installPlan[] of { label, phase, argv, cwd, timeoutSeconds, expectedOutputs }",
    "- commandGraph[] of { label, phase, argv, cwd, timeoutSeconds, expectedOutputs }",
    "- outputContracts[] of { type, pathHint, description }",
    "- metricRules[] of { metricName, sourceHint, regex, filePattern }",
    "- assumptions[]",
    "- hardBlockers[] of { blockerType, message, requiredInput }",
    "- fallbackPlan[]",
    "",
    "Rules:",
    "- Prefer the provided repository over inferred repositories, but do not require repo-perfect instructions to produce a runnable plan.",
    "- Infer missing defaults aggressively when the experiment description makes the task family clear.",
    "- Prefer a runnable benchmark or sample path over blocking whenever the task and framework are recognizable.",
    "- Only ask for human input on true hard blockers such as gated datasets with no substitute path or a genuinely opaque task family.",
    "- Use argv arrays only. Do not emit shell operators, heredocs, env assignments, or chained commands.",
    "- When exact commands are missing, infer a standard-library or common-framework benchmark path that stays as faithful as possible to the described task.",
  ].join("\n");

  try {
    const response = await callClaude({
      prompt,
      systemPrompt:
        "You plan inference-first executable custom experiments. Return only valid JSON.",
      model: "sonnet",
      maxTurns: 1,
      allowedTools: [],
    });

    return plannerOutputSchema.parse(JSON.parse(extractJsonPayload(response)) as unknown);
  } catch {
    return buildCustomFallbackPlannerOutput(context);
  }
}

export function buildExecutionSourcePack(params: {
  context: ExecutionPlanningContext;
  plannerOutput: ExecutionPlannerOutput;
}): ExecutionSourcePack {
  const { context, plannerOutput } = params;

  return executionSourcePackSchema.parse({
    version: "v1",
    kind: "reproduction",
    paper: {
      id: context.paper._id,
      title: context.paper.title,
      summary: context.paper.aiSummary ?? null,
      abstract: context.paper.abstract ?? null,
      paperType: context.paper.paperType ?? null,
    },
    target: {
      targetClaim: context.plan.targetClaim,
      targetMetric: context.plan.targetMetric,
      targetValue: context.plan.targetValue,
      tolerance: context.plan.tolerance,
    },
    repo: repoSummary(
      context.repoContext,
      plannerOutput.repoUrl ?? context.paper.officialRepoUrl ?? null
    ),
    datasets: plannerOutput.datasetPlan,
    acceptedSources: parseAcceptedSources(context.plan),
    contextSummary:
      context.paper.aiSummary ??
      context.paper.abstract ??
      `Reproduce the main reported result of ${context.paper.title}.`,
    plannerOutput,
    evidence: [
      {
        kind: "paper",
        label: context.paper.title,
        summary: "Primary paper metadata and summary used as the reproduction target.",
        url: context.paper.pdfUrl ?? null,
        content: truncateText(
          [context.paper.aiSummary, context.paper.abstract].filter(Boolean).join("\n\n"),
          6000
        ),
      },
      {
        kind: "repository",
        label: plannerOutput.repoUrl ?? context.paper.officialRepoUrl ?? "repository",
        summary: "Official repository evidence used to derive the normalized execution bundle.",
        url: plannerOutput.repoUrl ?? context.paper.officialRepoUrl ?? null,
        content: truncateText(context.repoContext?.readme ?? null, 8000),
      },
      {
        kind: "planner",
        label: "planner_output",
        summary: "Conservative execution planner output used as source evidence for bundle synthesis.",
        url: null,
        content: safeJson(plannerOutput),
      },
    ],
  });
}

export function buildCustomExecutionSourcePack(params: {
  context: CustomExecutionPlanningContext;
  plannerOutput: ExecutionPlannerOutput;
}): ExecutionSourcePack {
  const { context, plannerOutput } = params;
  const datasetContext = interpretCustomDatasetNote(context.customContext.datasetNote);

  return executionSourcePackSchema.parse({
    version: "v1",
    kind: "custom",
    paper: {
      id: context.hypothesis._id,
      title: context.hypothesis.title,
      summary: context.customContext.description,
      abstract: context.customContext.benchmark ?? null,
      paperType: null,
    },
    target: {
      targetClaim:
        context.hypothesis.expectedOutcome ||
        context.customContext.benchmark ||
        context.customContext.description,
      targetMetric: context.hypothesis.targetMetric,
      targetValue: context.hypothesis.targetValue,
      tolerance: context.hypothesis.tolerance,
    },
    repo: repoSummary(
      context.repoContext,
      plannerOutput.repoUrl ?? context.customContext.repoUrl ?? null
    ),
    datasets: plannerOutput.datasetPlan,
    acceptedSources: [
      "custom_description",
      ...(context.contextPapers.length > 0 ? ["context_papers"] : []),
      ...((plannerOutput.repoUrl ?? context.customContext.repoUrl) ? ["repository"] : []),
    ],
    contextSummary: [
      context.customContext.description,
      context.customContext.benchmark ? `Benchmark: ${context.customContext.benchmark}` : null,
      datasetContext.datasetNote ? `Dataset: ${datasetContext.datasetNote}` : null,
      datasetContext.setupNote ? `Setup: ${datasetContext.setupNote}` : null,
    ]
      .filter(Boolean)
      .join("\n"),
    plannerOutput,
    evidence: [
      {
        kind: "custom_context",
        label: context.hypothesis.title,
        summary: "Original custom experiment intake used to define the benchmark bundle.",
        url: null,
        content: safeJson({
          description: context.customContext.description,
          benchmark: context.customContext.benchmark,
          datasetNote: datasetContext.datasetNote,
          setupNote: datasetContext.setupNote,
          repoUrl: context.customContext.repoUrl,
        }),
      },
      ...(context.contextPapers.length
        ? context.contextPapers.map((paper) => ({
            kind: "supporting_paper" as const,
            label: paper.title,
            summary: "Saved context paper used as supporting synthesis evidence.",
            url: paper.pdfUrl ?? paper.officialRepoUrl ?? null,
            content: truncateText(
              [paper.aiSummary, paper.abstract].filter(Boolean).join("\n\n"),
              3000
            ),
          }))
        : []),
      {
        kind: "repository",
        label: plannerOutput.repoUrl ?? context.customContext.repoUrl ?? "repository",
        summary: "Repository evidence used to ground the normalized execution bundle.",
        url: plannerOutput.repoUrl ?? context.customContext.repoUrl ?? null,
        content: truncateText(context.repoContext?.readme ?? null, 8000),
      },
      {
        kind: "planner",
        label: "planner_output",
        summary: "Conservative execution planner output used as source evidence for bundle synthesis.",
        url: null,
        content: safeJson(plannerOutput),
      },
    ],
  });
}

function buildBundleConfig(
  sourcePack: ExecutionSourcePack,
  plannerOutput: ExecutionPlannerOutput,
  bundleRationale: string
) {
  return safeJson({
    sourcePack: {
      kind: sourcePack.kind,
      paper: sourcePack.paper,
      target: sourcePack.target,
      repo: {
        url: sourcePack.repo.url,
        ref: sourcePack.repo.ref,
        defaultBranch: sourcePack.repo.defaultBranch,
      },
      datasets: sourcePack.datasets,
      acceptedSources: sourcePack.acceptedSources,
      contextSummary: sourcePack.contextSummary,
    },
    plannerOutput: {
      repoUrl: plannerOutput.repoUrl,
      repoRef: plannerOutput.repoRef,
      datasetPlan: plannerOutput.datasetPlan,
      installPlan: plannerOutput.installPlan,
      commandGraph: plannerOutput.commandGraph,
      outputContracts: plannerOutput.outputContracts,
      metricRules: plannerOutput.metricRules,
      fallbackPlan: plannerOutput.fallbackPlan,
    },
    runtime: {
      bundleRationale,
      outputsDirectory: "outputs",
    },
  });
}

function formatRequirement(dependency: NormalizedExecutionBundle["dependencies"][number]) {
  if (!dependency.version) {
    return dependency.name;
  }

  return /^[<>=!~]/.test(dependency.version)
    ? `${dependency.name}${dependency.version}`
    : `${dependency.name}==${dependency.version}`;
}

function buildRequirementsText(dependencies: NormalizedExecutionBundle["dependencies"]) {
  if (!dependencies.length) {
    return "# No additional Python dependencies required by the generated bundle.\n";
  }

  return `${dependencies.map(formatRequirement).join("\n")}\n`;
}

function fallbackRunnerSource() {
  return [
    "from __future__ import annotations",
    "",
    "import json",
    "import shutil",
    "import subprocess",
    "from pathlib import Path",
    "",
    "ROOT = Path(__file__).resolve().parent",
    "CONFIG = json.loads((ROOT / \"bundle_config.json\").read_text())",
    "OUTPUTS_DIR = ROOT / \"outputs\"",
    "OUTPUTS_DIR.mkdir(parents=True, exist_ok=True)",
    "",
    "",
    "def _run(argv: list[str], cwd: Path, timeout: int) -> None:",
    "    print(f\"$ {' '.join(argv)}\", flush=True)",
    "    process = subprocess.Popen(",
    "        argv,",
    "        cwd=str(cwd),",
    "        stdout=subprocess.PIPE,",
    "        stderr=subprocess.STDOUT,",
    "        text=True,",
    "        bufsize=1,",
    "    )",
    "    recent_lines: list[str] = []",
    "    assert process.stdout is not None",
    "    for raw_line in process.stdout:",
    "        line = raw_line.rstrip()",
    "        if not line:",
    "            continue",
    "        print(line, flush=True)",
    "        recent_lines.append(line)",
    "        recent_lines = recent_lines[-50:]",
    "    return_code = process.wait(timeout=timeout)",
    "    if return_code != 0:",
    "        raise RuntimeError(",
    "            f\"Command failed with exit code {return_code}: {' '.join(argv)}\\n\"",
    "            + \"\\n\".join(recent_lines[-20:])",
    "        )",
    "",
    "",
    "def _prepare_workspace() -> Path:",
    "    workspace = ROOT / \"workspace\"",
    "    if workspace.exists():",
    "        shutil.rmtree(workspace)",
    "    workspace.mkdir(parents=True, exist_ok=True)",
    "    repo = CONFIG.get(\"sourcePack\", {}).get(\"repo\") or {}",
    "    repo_url = repo.get(\"url\")",
    "    repo_ref = repo.get(\"ref\") or repo.get(\"defaultBranch\")",
    "    repo_dir = workspace / \"repo\"",
    "    if not repo_url:",
    "        return ROOT",
    "    clone_cmd = [\"git\", \"clone\", \"--depth\", \"1\"]",
    "    if repo_ref:",
    "        clone_cmd.extend([\"--branch\", str(repo_ref)])",
    "    clone_cmd.extend([str(repo_url), str(repo_dir)])",
    "    _run(clone_cmd, workspace, 1800)",
    "    return repo_dir",
    "",
    "",
    "def main() -> None:",
    "    repo_dir = _prepare_workspace()",
    "    steps = (CONFIG.get(\"plannerOutput\") or {}).get(\"installPlan\", []) + (",
    "        (CONFIG.get(\"plannerOutput\") or {}).get(\"commandGraph\", [])",
    "    )",
    "    for step in steps:",
    "        argv = step.get(\"argv\") or []",
    "        if not argv:",
    "            continue",
    "        cwd = repo_dir / Path(step.get(\"cwd\") or \".\")",
    "        cwd.mkdir(parents=True, exist_ok=True)",
    "        _run(list(argv), cwd, int(step.get(\"timeoutSeconds\") or 1800))",
    "    summary = {",
    "        \"status\": \"completed\",",
    "        \"target\": CONFIG.get(\"sourcePack\", {}).get(\"target\"),",
    "        \"plannerOutput\": {",
    "            \"outputContracts\": (CONFIG.get(\"plannerOutput\") or {}).get(\"outputContracts\", []),",
    "            \"metricRules\": (CONFIG.get(\"plannerOutput\") or {}).get(\"metricRules\", []),",
    "        },",
    "    }",
    "    (OUTPUTS_DIR / \"bundle-summary.json\").write_text(json.dumps(summary, indent=2))",
    "    print(\"Normalized execution bundle completed.\", flush=True)",
    "",
    "",
    "if __name__ == \"__main__\":",
    "    main()",
    "",
  ].join("\n");
}

function isRuntimeBenchmarkTarget(sourcePack: ExecutionSourcePack) {
  const metric = sourcePack.target.targetMetric?.toLowerCase() ?? "";
  const combined = collectSourceSignals(sourcePack);

  return (
    metric.includes("runtime") ||
    metric.includes("latency") ||
    combined.includes("runtime") ||
    combined.includes("latency") ||
    combined.includes("throughput")
  );
}

function inferTransformersModelName(sourcePack: ExecutionSourcePack) {
  return inferWorkingModelName(sourcePack);
}

function buildTransformersRuntimeRunnerSource(modelName: string) {
  return [
    "import json",
    "import statistics",
    "import time",
    "from pathlib import Path",
    "",
    "import torch",
    "from transformers import AutoModel, AutoTokenizer",
    "",
    `MODEL_NAME = ${JSON.stringify(modelName)}`,
    "OUTPUTS_DIR = Path(\"outputs\")",
    "OUTPUTS_DIR.mkdir(parents=True, exist_ok=True)",
    "",
    "",
    "def _sample_inputs():",
    "    return [",
    "        \"DistilBERT runtime benchmark generated by ScholarFlow.\",",
    "        \"Measure the mean forward-pass latency on CPU for a compact inference workload.\",",
    "        \"The experiment records runtime_seconds and supporting metadata in outputs/metrics.json.\",",
    "    ]",
    "",
    "",
    "def main() -> None:",
    "    torch.set_num_threads(max(1, min(4, (torch.get_num_threads() or 1))))",
    "    tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)",
    "    model = AutoModel.from_pretrained(MODEL_NAME)",
    "    model.eval()",
    "",
    "    encoded = tokenizer(",
    "        _sample_inputs(),",
    "        return_tensors=\"pt\",",
    "        padding=True,",
    "        truncation=True,",
    "        max_length=128,",
    "    )",
    "",
    "    warmup_iterations = 2",
    "    measured_iterations = 5",
    "",
    "    with torch.no_grad():",
    "        for _ in range(warmup_iterations):",
    "            model(**encoded)",
    "",
    "    timings = []",
    "    with torch.no_grad():",
    "        for _ in range(measured_iterations):",
    "            started = time.perf_counter()",
    "            model(**encoded)",
    "            timings.append(time.perf_counter() - started)",
    "",
    "    mean_runtime = statistics.mean(timings)",
    "    report = {",
    "        \"status\": \"completed\",",
    "        \"metric\": \"runtime_seconds\",",
    "        \"runtime_seconds\": mean_runtime,",
    "        \"samples\": timings,",
    "        \"iterations\": measured_iterations,",
    "        \"model_name\": MODEL_NAME,",
    "        \"device\": \"cpu\",",
    "    }",
    "",
    "    (OUTPUTS_DIR / \"metrics.json\").write_text(json.dumps(report, indent=2))",
    "    (OUTPUTS_DIR / \"report.json\").write_text(",
    "        json.dumps(",
    "            {",
    "                \"summary\": f\"Measured {MODEL_NAME} mean runtime over {measured_iterations} CPU inference iterations.\",",
    "                \"runtime_seconds\": mean_runtime,",
    "            },",
    "            indent=2,",
    "        )",
    "    )",
    "    print(json.dumps(report), flush=True)",
    "",
    "",
    "if __name__ == \"__main__\":",
    "    main()",
    "",
  ].join("\n");
}

function buildTransformersClassificationRunnerSource(modelName: string) {
  return [
    "import json",
    "from pathlib import Path",
    "",
    "from transformers import pipeline",
    "",
    `MODEL_NAME = ${JSON.stringify(modelName)}`,
    "OUTPUTS_DIR = Path(\"outputs\")",
    "OUTPUTS_DIR.mkdir(parents=True, exist_ok=True)",
    "",
    "SAMPLES = [",
    "    {\"text\": \"I loved how fast and polished this model felt.\", \"label\": \"POSITIVE\"},",
    "    {\"text\": \"This was frustrating and full of errors.\", \"label\": \"NEGATIVE\"},",
    "    {\"text\": \"The result was excellent and very reliable.\", \"label\": \"POSITIVE\"},",
    "    {\"text\": \"The overall experience was disappointing.\", \"label\": \"NEGATIVE\"},",
    "]",
    "",
    "",
    "def main() -> None:",
    "    classifier = pipeline(\"text-classification\", model=MODEL_NAME)",
    "    predictions = classifier([sample[\"text\"] for sample in SAMPLES])",
    "    correct = 0",
    "    rows = []",
    "    for sample, prediction in zip(SAMPLES, predictions):",
    "        predicted = str(prediction.get(\"label\", \"\")).upper()",
    "        expected = str(sample[\"label\"]).upper()",
    "        if predicted == expected:",
    "            correct += 1",
    "        rows.append({",
    "            \"text\": sample[\"text\"],",
    "            \"expected\": expected,",
    "            \"predicted\": predicted,",
    "            \"score\": prediction.get(\"score\"),",
    "        })",
    "",
    "    accuracy = correct / len(SAMPLES) if SAMPLES else 0.0",
    "    metrics = {",
    "        \"status\": \"completed\",",
    "        \"metric\": \"accuracy\",",
    "        \"accuracy\": accuracy,",
    "        \"samples\": rows,",
    "        \"model_name\": MODEL_NAME,",
    "    }",
    "    (OUTPUTS_DIR / \"metrics.json\").write_text(json.dumps(metrics, indent=2))",
    "    (OUTPUTS_DIR / \"report.json\").write_text(",
    "        json.dumps(",
    "            {",
    "                \"summary\": f\"Generated a text-classification benchmark sample with {MODEL_NAME}.\",",
    "                \"accuracy\": accuracy,",
    "            },",
    "            indent=2,",
    "        )",
    "    )",
    "    print(json.dumps(metrics), flush=True)",
    "",
    "",
    "if __name__ == \"__main__\":",
    "    main()",
    "",
  ].join("\n");
}

function buildGenericSampleRunnerSource(sourcePack: ExecutionSourcePack) {
  const targetMetric = sourcePack.target.targetMetric ?? "sample_completed";
  const runtimeMetric = isRuntimeBenchmarkTarget(sourcePack);
  return [
    "import hashlib",
    "import json",
    "import time",
    "from pathlib import Path",
    "",
    "OUTPUTS_DIR = Path(\"outputs\")",
    "OUTPUTS_DIR.mkdir(parents=True, exist_ok=True)",
    "",
    `TARGET_METRIC = ${JSON.stringify(targetMetric)}`,
    `TARGET_CLAIM = ${JSON.stringify(sourcePack.target.targetClaim)}`,
    `CONTEXT_SUMMARY = ${JSON.stringify(sourcePack.contextSummary)}`,
    `RUNTIME_METRIC = ${runtimeMetric ? "True" : "False"}`,
    "",
    "",
    "def main() -> None:",
    "    started = time.perf_counter()",
    "    digest = \"\"",
    "    for idx in range(5000):",
    "        digest = hashlib.sha256(f\"{TARGET_CLAIM}:{idx}\".encode()).hexdigest()",
    "    elapsed = time.perf_counter() - started",
    "    metrics = {",
    "        \"status\": \"completed\",",
    "        \"metric\": TARGET_METRIC,",
    "        TARGET_METRIC: elapsed if RUNTIME_METRIC else None,",
    "        \"sample_completed\": True,",
    "        \"runtime_seconds\": elapsed,",
    "        \"digest\": digest,",
    "    }",
    "    report = {",
    "        \"summary\": \"Generated a benchmark sample from inferred context because no faithful runnable path was available.\",",
    "        \"targetClaim\": TARGET_CLAIM,",
    "        \"contextSummary\": CONTEXT_SUMMARY,",
    "        \"runtime_seconds\": elapsed,",
    "    }",
    "    (OUTPUTS_DIR / \"metrics.json\").write_text(json.dumps(metrics, indent=2))",
    "    (OUTPUTS_DIR / \"report.json\").write_text(json.dumps(report, indent=2))",
    "    print(json.dumps(metrics), flush=True)",
    "",
    "",
    "if __name__ == \"__main__\":",
    "    main()",
    "",
  ].join("\n");
}

function buildTransformersFallbackBundle(
  sourcePack: ExecutionSourcePack
): NormalizedExecutionBundle | null {
  if (!repoUsesTransformers(sourcePack)) {
    return null;
  }

  const taskFamily = inferTaskFamily(sourcePack);
  const modelName = inferTransformersModelName(sourcePack);
  const runtimeBundle = taskFamily === "runtime_benchmark";
  const classificationBundle = taskFamily === "text_classification";

  if (!runtimeBundle && !classificationBundle) {
    return null;
  }

  const classificationModel =
    modelName === "distilbert-base-uncased"
      ? "distilbert-base-uncased-finetuned-sst-2-english"
      : modelName;

  return normalizedExecutionBundleSchema.parse({
    version: "v1",
    strategy: "single_file",
    inferenceLevel: "api_reconstruction",
    rationale:
      runtimeBundle
        ? "Generated a compact Hugging Face Transformers runtime benchmark bundle because the task is recognizable but the repository is a library distribution rather than a runnable benchmark script."
        : "Generated a compact Hugging Face Transformers classification benchmark bundle because the task is recognizable but the repository is a library distribution rather than a runnable benchmark script.",
    bundleOriginSummary:
      runtimeBundle
        ? "API reconstruction using Hugging Face Transformers primitives and inferred runtime benchmark defaults."
        : "API reconstruction using a Hugging Face text-classification pipeline and inferred sample benchmark defaults.",
    credibilityScore: runtimeBundle ? 0.72 : 0.68,
    fallbackChainUsed: [
      "template_adapter",
      runtimeBundle ? "transformers_runtime" : "transformers_text_classification",
    ],
    entrypoint: "runner.py",
    workingDirectory: ".",
    installCommand: ["python", "-m", "pip", "install", "-r", "requirements.txt"],
    files: [
      {
        path: "runner.py",
        purpose: runtimeBundle
          ? "Self-contained runtime benchmark for a pretrained Transformers model inferred from the experiment context."
          : "Self-contained text-classification benchmark sample inferred from the experiment context.",
        content: runtimeBundle
          ? buildTransformersRuntimeRunnerSource(modelName)
          : buildTransformersClassificationRunnerSource(classificationModel),
      },
    ],
    dependencies: [
      {
        name: "transformers",
        version: ">=4.44.0",
        rationale: "Loads pretrained Hugging Face pipelines and models.",
      },
      {
        name: "torch",
        version: ">=2.2.0",
        rationale: "Runs inference for the generated Transformers benchmark bundle.",
      },
    ],
    assumptions: [
      `Used ${runtimeBundle ? modelName : classificationModel} as the inferred pretrained model for the generated benchmark bundle.`,
      "Generated a direct Python benchmark sample instead of executing the repository because the repository is a general-purpose library without a single benchmark entrypoint.",
      ...sourcePack.plannerOutput.assumptions,
    ],
    outputContracts: [
      {
        type: "json",
        pathHint: "outputs/metrics.json",
        description: "Structured benchmark metrics emitted by the generated bundle.",
      },
      {
        type: "json",
        pathHint: "outputs/report.json",
        description: "Human-readable summary of the generated benchmark run.",
      },
    ],
    metricRules: [
      {
        metricName:
          sourcePack.target.targetMetric ?? (runtimeBundle ? "runtime_seconds" : "accuracy"),
        sourceHint: "outputs/metrics.json",
        regex: null,
        filePattern: "outputs/metrics.json",
      },
    ],
  });
}

function buildGenericBenchmarkSampleBundle(
  sourcePack: ExecutionSourcePack
): NormalizedExecutionBundle {
  const taskFamily = inferTaskFamily(sourcePack);
  return normalizedExecutionBundleSchema.parse({
    version: "v1",
    strategy: "single_file",
    inferenceLevel: "benchmark_sample",
    rationale:
      "Generated a generic runnable benchmark sample because no faithful repository-backed or framework-specific execution path was available.",
    bundleOriginSummary:
      "Benchmark sample inferred from the target claim, context summary, and available evidence with minimal external dependencies.",
    credibilityScore: 0.32,
    fallbackChainUsed: ["benchmark_sample"],
    entrypoint: "runner.py",
    workingDirectory: ".",
    installCommand: ["python", "-m", "pip", "install", "-r", "requirements.txt"],
    files: [
      {
        path: "runner.py",
        purpose:
          "Minimal runnable benchmark sample that emits structured outputs even when only high-level experiment context is available.",
        content: buildGenericSampleRunnerSource(sourcePack),
      },
    ],
    dependencies: [],
    assumptions: [
      `Inferred ${taskFamily} as the closest task family from the available evidence.`,
      "Generated a working benchmark sample to preserve execution continuity despite missing faithful execution instructions.",
      ...sourcePack.plannerOutput.assumptions,
    ],
    outputContracts: [
      {
        type: "json",
        pathHint: "outputs/metrics.json",
        description: "Structured metrics emitted by the generic benchmark sample bundle.",
      },
      {
        type: "json",
        pathHint: "outputs/report.json",
        description: "Summary report emitted by the generic benchmark sample bundle.",
      },
    ],
    metricRules: [
      {
        metricName: sourcePack.target.targetMetric ?? "runtime_seconds",
        sourceHint: "outputs/metrics.json",
        regex: null,
        filePattern: "outputs/metrics.json",
      },
    ],
  });
}

function fallbackBundle(sourcePack: ExecutionSourcePack): NormalizedExecutionBundle {
  const plannerOutput = sourcePack.plannerOutput;
  const transformersFallbackBundle = buildTransformersFallbackBundle(sourcePack);

  if (transformersFallbackBundle) {
    return transformersFallbackBundle;
  }

  if (
    sourcePack.repo.url &&
    plannerOutput.commandGraph.some(
      (command) => command.phase === "run" || command.phase === "evaluate"
    )
  ) {
    return normalizedExecutionBundleSchema.parse({
      version: "v1",
      strategy: "multi_file",
      inferenceLevel: "repo_faithful",
      rationale:
        "Fallback normalized bundle that adapts the planner-approved repository execution path into a compact Python runner.",
      bundleOriginSummary:
        "Repository-backed adapter bundle built from inferred install and run commands gathered from repository evidence.",
      credibilityScore: 0.78,
      fallbackChainUsed: ["repo_adapter"],
      entrypoint: "runner.py",
      workingDirectory: ".",
      installCommand: ["python", "-m", "pip", "install", "-r", "requirements.txt"],
      files: [
        {
          path: "runner.py",
          purpose: "Compact execution harness that materializes the repository-backed plan inside the bundle workspace.",
          content: fallbackRunnerSource(),
        },
      ],
      dependencies: [],
      assumptions: [
        "Fell back to a repository-adapter bundle because a direct synthesized benchmark runner was not available.",
        ...plannerOutput.assumptions,
      ],
      outputContracts: plannerOutput.outputContracts.length
        ? plannerOutput.outputContracts
        : buildDefaultOutputContracts(),
      metricRules: plannerOutput.metricRules.length
        ? plannerOutput.metricRules
        : buildDefaultMetricRules(sourcePack.target.targetMetric),
    });
  }

  return buildGenericBenchmarkSampleBundle(sourcePack);
}

function normalizeBundlePath(path: string) {
  return path.replace(/^\.\/+/, "").replace(/^\/+/, "").trim();
}

function normalizeBundle(
  bundle: NormalizedExecutionBundle,
  sourcePack: ExecutionSourcePack
): NormalizedExecutionBundle {
  const files = bundle.files.map((file) => ({
    ...file,
    path: normalizeBundlePath(file.path),
    content: file.content.replace(/^```(?:python|json|txt)?\n?/i, "").replace(/\n```$/, ""),
  }));

  const fileMap = new Map(files.map((file) => [file.path, file]));
  if (!fileMap.has("bundle_config.json")) {
    fileMap.set("bundle_config.json", {
      path: "bundle_config.json",
      purpose: "Normalized source-pack and planner context consumed by the generated runner.",
      content: buildBundleConfig(sourcePack, sourcePack.plannerOutput, bundle.rationale),
    });
  }

  if (!fileMap.has("requirements.txt")) {
    fileMap.set("requirements.txt", {
      path: "requirements.txt",
      purpose: "Pinned Python dependencies for the normalized execution bundle.",
      content: buildRequirementsText(bundle.dependencies),
    });
  }

  let entrypoint = normalizeBundlePath(bundle.entrypoint || "runner.py");
  if (!fileMap.has(entrypoint)) {
    const fallbackEntrypoint = [...fileMap.values()].find((file) => file.path.endsWith(".py"));
    if (fallbackEntrypoint) {
      entrypoint = fallbackEntrypoint.path;
    } else {
      fileMap.set("runner.py", {
        path: "runner.py",
        purpose: "Fallback compact execution harness for the normalized bundle.",
        content: fallbackRunnerSource(),
      });
      entrypoint = "runner.py";
    }
  }

  return normalizedExecutionBundleSchema.parse({
    ...bundle,
    inferenceLevel: bundle.inferenceLevel ?? "api_reconstruction",
    bundleOriginSummary:
      bundle.bundleOriginSummary || bundle.rationale,
    credibilityScore:
      typeof bundle.credibilityScore === "number" ? bundle.credibilityScore : 0.65,
    fallbackChainUsed: bundle.fallbackChainUsed ?? [],
    entrypoint,
    files: [...fileMap.values()],
    outputContracts: bundle.outputContracts.length
      ? bundle.outputContracts
      : sourcePack.plannerOutput.outputContracts.length
        ? sourcePack.plannerOutput.outputContracts
        : buildDefaultOutputContracts(),
    metricRules: bundle.metricRules.length
      ? bundle.metricRules
      : sourcePack.plannerOutput.metricRules.length
        ? sourcePack.plannerOutput.metricRules
        : buildDefaultMetricRules(sourcePack.target.targetMetric),
  });
}

const PYTHON_STDLIB_IMPORTS = new Set([
  "__future__",
  "argparse",
  "asyncio",
  "base64",
  "collections",
  "contextlib",
  "csv",
  "dataclasses",
  "datetime",
  "functools",
  "glob",
  "hashlib",
  "io",
  "itertools",
  "json",
  "logging",
  "math",
  "os",
  "pathlib",
  "random",
  "re",
  "shlex",
  "shutil",
  "statistics",
  "string",
  "subprocess",
  "sys",
  "tempfile",
  "textwrap",
  "time",
  "traceback",
  "typing",
  "typing_extensions",
  "uuid",
]);

const IMPORT_PACKAGE_MAP: Record<string, string> = {
  PIL: "pillow",
  accelerate: "accelerate",
  bs4: "beautifulsoup4",
  cv2: "opencv-python",
  datasets: "datasets",
  matplotlib: "matplotlib",
  numpy: "numpy",
  pandas: "pandas",
  requests: "requests",
  scipy: "scipy",
  sentencepiece: "sentencepiece",
  sklearn: "scikit-learn",
  torch: "torch",
  torchvision: "torchvision",
  transformers: "transformers",
  yaml: "pyyaml",
};

const DEFAULT_PACKAGE_VERSIONS: Record<string, string> = {
  accelerate: ">=0.33.0",
  "beautifulsoup4": ">=4.12.0",
  datasets: ">=2.20.0",
  matplotlib: ">=3.9.0",
  numpy: ">=1.26.0",
  "opencv-python": ">=4.10.0",
  pandas: ">=2.2.0",
  pillow: ">=10.4.0",
  pyyaml: ">=6.0.0",
  requests: ">=2.32.0",
  scipy: ">=1.13.0",
  "scikit-learn": ">=1.5.0",
  sentencepiece: ">=0.2.0",
  torch: ">=2.2.0",
  torchvision: ">=0.17.0",
  transformers: ">=4.44.0",
};

function normalizePackageName(value: string) {
  return value.trim().toLowerCase().replace(/_/g, "-");
}

function inferPackageForImport(moduleName: string) {
  return IMPORT_PACKAGE_MAP[moduleName] ?? moduleName;
}

function collectPythonImports(bundle: NormalizedExecutionBundle) {
  const imports = new Set<string>();

  for (const file of bundle.files) {
    if (!file.path.endsWith(".py")) {
      continue;
    }

    for (const rawLine of file.content.split("\n")) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) {
        continue;
      }

      const importMatch = line.match(/^import\s+(.+)$/);
      if (importMatch) {
        importMatch[1]
          .split(",")
          .map((part) => part.trim().split(/\s+as\s+/i)[0]?.trim())
          .filter(Boolean)
          .forEach((part) => {
            const moduleName = part.split(".")[0];
            if (moduleName) {
              imports.add(moduleName);
            }
          });
        continue;
      }

      const fromMatch = line.match(/^from\s+([A-Za-z0-9_\.]+)\s+import\s+/);
      if (fromMatch) {
        const moduleName = fromMatch[1]?.split(".")[0];
        if (moduleName) {
          imports.add(moduleName);
        }
      }
    }
  }

  return [...imports];
}

function parseRequirementNames(bundle: NormalizedExecutionBundle) {
  const requirementNames = new Set<string>();

  bundle.dependencies.forEach((dependency) => {
    requirementNames.add(normalizePackageName(dependency.name));
  });

  const requirementsFile = bundle.files.find((file) => file.path === "requirements.txt");
  if (!requirementsFile) {
    return requirementNames;
  }

  for (const rawLine of requirementsFile.content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const match = line.match(/^([A-Za-z0-9._-]+)/);
    if (match?.[1]) {
      requirementNames.add(normalizePackageName(match[1]));
    }
  }

  return requirementNames;
}

function inferMissingDependencyPackages(bundle: NormalizedExecutionBundle) {
  const requirementNames = parseRequirementNames(bundle);
  const imports = collectPythonImports(bundle);

  return imports
    .filter((moduleName) => !PYTHON_STDLIB_IMPORTS.has(moduleName))
    .map((moduleName) => ({
      moduleName,
      packageName: inferPackageForImport(moduleName),
    }))
    .filter(
      ({ packageName }) => !requirementNames.has(normalizePackageName(packageName))
    );
}

export function buildCompactSynthesisPack(sourcePack: ExecutionSourcePack) {
  return {
    version: sourcePack.version,
    kind: sourcePack.kind,
    paper: {
      title: sourcePack.paper.title,
      summary: truncateText(sourcePack.paper.summary, 1200),
      abstract: truncateText(sourcePack.paper.abstract, 1200),
      paperType: sourcePack.paper.paperType,
    },
    target: sourcePack.target,
    repo: {
      url: sourcePack.repo.url,
      ref: sourcePack.repo.ref,
      defaultBranch: sourcePack.repo.defaultBranch,
      confidence: sourcePack.repo.confidence,
      description: truncateText(sourcePack.repo.description, 600),
      rootEntries: sourcePack.repo.rootEntries.slice(0, 40),
      treePaths: sourcePack.repo.treePaths.slice(0, 80),
      readmeExcerpt: truncateText(sourcePack.repo.readmeExcerpt, 4000),
    },
    datasets: sourcePack.datasets,
    acceptedSources: sourcePack.acceptedSources,
    contextSummary: truncateText(sourcePack.contextSummary, 2500),
    plannerOutput: {
      repoUrl: sourcePack.plannerOutput.repoUrl,
      repoRef: sourcePack.plannerOutput.repoRef,
      datasetPlan: sourcePack.plannerOutput.datasetPlan,
      installPlan: sourcePack.plannerOutput.installPlan.slice(0, 8),
      commandGraph: sourcePack.plannerOutput.commandGraph.slice(0, 8),
      outputContracts: sourcePack.plannerOutput.outputContracts.slice(0, 8),
      metricRules: sourcePack.plannerOutput.metricRules.slice(0, 8),
      assumptions: sourcePack.plannerOutput.assumptions.slice(0, 10),
      hardBlockers: sourcePack.plannerOutput.hardBlockers.slice(0, 4),
      fallbackPlan: sourcePack.plannerOutput.fallbackPlan.slice(0, 6),
    },
    evidence: sourcePack.evidence.slice(0, 8).map((evidence) => ({
      kind: evidence.kind,
      label: evidence.label,
      summary: evidence.summary,
      url: evidence.url,
      content: truncateText(evidence.content, 1500),
    })),
  };
}

async function callBundleSynthesisModel(
  compactSourcePack: ReturnType<typeof buildCompactSynthesisPack>,
  preferredStrategy: "single_file" | "multi_file"
): Promise<NormalizedExecutionBundle> {
  const prompt = [
    "You are synthesizing a compact Python execution bundle for an experiment.",
    "",
    "Create the smallest viable runnable bundle that can reproduce, benchmark, or sample the target behavior.",
    `Preferred strategy for this attempt: ${preferredStrategy}.`,
    "If exact implementation details are missing, infer defaults aggressively from the task family, framework, model names, and benchmark hints.",
    "The bundle should focus on the benchmark or evaluation path, not the full research infrastructure.",
    "Prefer direct Python APIs and common framework conventions over blocking on incomplete repo instructions.",
    "You may assume bundle_config.json and requirements.txt will be created automatically if omitted, but you should still include them if your runner needs custom structure.",
    "",
    "Return strict JSON with keys:",
    "- version",
    "- strategy",
    "- inferenceLevel",
    "- rationale",
    "- bundleOriginSummary",
    "- credibilityScore",
    "- fallbackChainUsed[]",
    "- entrypoint",
    "- workingDirectory",
    "- installCommand",
    "- files[] of { path, purpose, content }",
    "- dependencies[] of { name, version, rationale }",
    "- assumptions[]",
    "- outputContracts[] of { type, pathHint, description }",
    "- metricRules[] of { metricName, sourceHint, regex, filePattern }",
    "",
    "Source pack:",
    safeJson(compactSourcePack),
    "",
    "Rules:",
    "- All code must be Python or JSON/text config files.",
    "- Paths must be relative and safe. No absolute paths or traversal segments.",
    "- The entrypoint must be a Python file included in files[].",
    "- Favor structured outputs in outputs/metrics.json or outputs/report.json.",
    "- Prefer a working benchmark sample over returning an incomplete bundle.",
    "- Do not emit markdown fences.",
  ].join("\n");

  const response = await callClaude({
    prompt,
    systemPrompt:
      "You synthesize compact experiment runners. Return only valid JSON matching the requested schema.",
    model: "sonnet",
    maxTurns: 1,
    allowedTools: [],
  });

  return normalizedExecutionBundleSchema.parse(
    JSON.parse(extractJsonPayload(response)) as unknown
  );
}

export async function synthesizeExecutionBundle(params: {
  sourcePack: ExecutionSourcePack;
}): Promise<BundleSynthesisResult> {
  const compactSourcePack = buildCompactSynthesisPack(params.sourcePack);
  const diagnostics: BundleSynthesisDiagnostics = {
    modelAttempted: true,
    modelSucceeded: false,
    modelError: null,
    secondaryModelAttempted: false,
    secondaryModelSucceeded: false,
    secondaryModelError: null,
    fallbackAttempted: false,
    fallbackSucceeded: false,
    fallbackError: null,
    usedFallback: false,
    attempts: [],
    promptSourcePackBytes: safeJson(params.sourcePack).length,
    compactSourcePackBytes: safeJson(compactSourcePack).length,
    strategy: null,
    inferenceLevel: null,
  };

  try {
    diagnostics.attempts.push("single_file_model");
    const synthesized = await callBundleSynthesisModel(compactSourcePack, "single_file");
    const bundle = normalizeBundle(synthesized, params.sourcePack);
    diagnostics.modelSucceeded = true;
    diagnostics.strategy = bundle.strategy;
    diagnostics.inferenceLevel = bundle.inferenceLevel;
    return { bundle, diagnostics, compactSourcePack };
  } catch (modelError) {
    diagnostics.modelError = errorMessage(modelError);
    diagnostics.secondaryModelAttempted = true;

    try {
      diagnostics.attempts.push("multi_file_model");
      const synthesized = await callBundleSynthesisModel(compactSourcePack, "multi_file");
      const bundle = normalizeBundle(synthesized, params.sourcePack);
      diagnostics.secondaryModelSucceeded = true;
      diagnostics.strategy = bundle.strategy;
      diagnostics.inferenceLevel = bundle.inferenceLevel;
      return { bundle, diagnostics, compactSourcePack };
    } catch (secondaryModelError) {
      diagnostics.secondaryModelError = errorMessage(secondaryModelError);
      diagnostics.fallbackAttempted = true;
    }

    try {
      diagnostics.attempts.push("deterministic_fallback");
      const bundle = normalizeBundle(
        fallbackBundle(params.sourcePack),
        params.sourcePack
      );
      diagnostics.fallbackSucceeded = true;
      diagnostics.usedFallback = true;
      diagnostics.strategy = bundle.strategy;
      diagnostics.inferenceLevel = bundle.inferenceLevel;
      return { bundle, diagnostics, compactSourcePack };
    } catch (fallbackError) {
      diagnostics.fallbackError = errorMessage(fallbackError);
      throw withSynthesisDiagnostics(fallbackError, diagnostics);
    }
  }
}

export function validateExecutionBundle(params: {
  sourcePack: ExecutionSourcePack;
  bundle: NormalizedExecutionBundle;
}): BundleValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();
  const { sourcePack, bundle } = params;

  for (const file of bundle.files) {
    const path = normalizeBundlePath(file.path);
    if (!path || path.includes("..")) {
      errors.push(`Invalid bundle file path detected: ${file.path}`);
      continue;
    }
    if (seen.has(path)) {
      errors.push(`Duplicate bundle file path detected: ${path}`);
      continue;
    }
    seen.add(path);
    if (!file.content.trim()) {
      errors.push(`Bundle file ${path} is empty.`);
    }
  }

  if (!seen.has(bundle.entrypoint)) {
    errors.push(`Bundle entrypoint ${bundle.entrypoint} is not present in the file list.`);
  }

  const pythonFiles = bundle.files.filter((file) => file.path.endsWith(".py"));
  if (pythonFiles.length === 0) {
    errors.push("The normalized bundle does not contain any Python source files.");
  }

  const entrypointFile = bundle.files.find(
    (file) => normalizeBundlePath(file.path) === bundle.entrypoint
  );
  if (
    entrypointFile &&
    !/if __name__ == ["']__main__["']/.test(entrypointFile.content) &&
    !/def main\s*\(/.test(entrypointFile.content)
  ) {
    warnings.push(
      `Bundle entrypoint ${bundle.entrypoint} does not expose a conventional main() entrypoint.`
    );
  }

  if (!bundle.files.some((file) => file.path === "bundle_config.json")) {
    warnings.push("bundle_config.json was missing and had to be synthesized automatically.");
  }

  if (!bundle.files.some((file) => file.path === "requirements.txt")) {
    warnings.push("requirements.txt was missing and had to be synthesized automatically.");
  }

  if (!bundle.outputContracts.length) {
    warnings.push("The bundle did not define output contracts; defaults were used.");
  }

  if (!bundle.metricRules.length && sourcePack.target.targetMetric) {
    warnings.push(
      `No explicit metric extraction rules were provided for ${sourcePack.target.targetMetric}; default regex extraction will be used.`
    );
  }

  if (!sourcePack.repo.url) {
    warnings.push("The bundle does not have repository context; only synthesized code will be executed.");
  }

  if (bundle.inferenceLevel !== "repo_faithful") {
    warnings.push(
      `Bundle uses ${bundle.inferenceLevel} inference and may trade faithfulness for runnable coverage.`
    );
  }

  if (bundle.credibilityScore < 0.5) {
    warnings.push(
      "Bundle credibility is low; treat outputs as a working sample rather than a faithful reproduction."
    );
  }

  return bundleValidationReportSchema.parse({
    valid: errors.length === 0,
    warnings,
    errors,
    summary:
      errors.length === 0
        ? "Normalized bundle passed static validation."
        : "Normalized bundle failed static validation and cannot be submitted.",
  });
}

export function preflightExecutionBundle(params: {
  sourcePack: ExecutionSourcePack;
  bundle: NormalizedExecutionBundle;
  executionSpec: ExecutionSpec;
}): BundlePreflightReport {
  const { sourcePack, bundle, executionSpec } = params;
  const checks: BundlePreflightCheck[] = [];
  const warnings: string[] = [];
  let failureClass: string | null = null;
  let errorSummary: string | null = null;

  const entrypointExists = bundle.files.some(
    (file) => normalizeBundlePath(file.path) === normalizeBundlePath(bundle.entrypoint)
  );
  checks.push({
    name: "entrypoint_exists",
    source: "local",
    status: entrypointExists ? "passed" : "failed",
    summary: entrypointExists
      ? `Entrypoint ${bundle.entrypoint} is present in the bundle.`
      : `Entrypoint ${bundle.entrypoint} is missing from the bundle.`,
    details: null,
  });

  const pythonFiles = bundle.files.filter((file) => file.path.endsWith(".py"));
  checks.push({
    name: "python_files_present",
    source: "local",
    status: pythonFiles.length > 0 ? "passed" : "failed",
    summary:
      pythonFiles.length > 0
        ? `Bundle contains ${pythonFiles.length} Python file(s).`
        : "Bundle does not contain any Python source files.",
    details: null,
  });

  const configFile = bundle.files.find((file) => file.path === "bundle_config.json");
  if (!configFile) {
    checks.push({
      name: "bundle_config_json",
      source: "local",
      status: "failed",
      summary: "bundle_config.json is missing from the bundle.",
      details: null,
    });
  } else {
    try {
      JSON.parse(configFile.content);
      checks.push({
        name: "bundle_config_json",
        source: "local",
        status: "passed",
        summary: "bundle_config.json parses successfully.",
        details: null,
      });
    } catch (error) {
      checks.push({
        name: "bundle_config_json",
        source: "local",
        status: "failed",
        summary: "bundle_config.json is not valid JSON.",
        details: errorMessage(error),
      });
    }
  }

  const missingDependencyPackages = inferMissingDependencyPackages(bundle);
  checks.push({
    name: "requirements_coverage",
    source: "local",
    status: missingDependencyPackages.length === 0 ? "passed" : "failed",
    summary:
      missingDependencyPackages.length === 0
        ? "requirements.txt covers the imported third-party modules."
        : `requirements.txt is missing ${missingDependencyPackages
            .map(({ packageName }) => packageName)
            .join(", ")}.`,
    details:
      missingDependencyPackages.length === 0
        ? null
        : safeJson(missingDependencyPackages),
  });

  const hasOutputs = executionSpec.outputContracts.length > 0;
  checks.push({
    name: "output_contracts",
    source: "local",
    status: hasOutputs ? "passed" : "failed",
    summary: hasOutputs
      ? "Execution spec declares structured output contracts."
      : "Execution spec does not declare any output contracts.",
    details: hasOutputs ? null : safeJson(bundle.outputContracts),
  });

  const hasMetricSignals =
    executionSpec.metricRules.length > 0 ||
    !executionSpec.claim.targetMetric ||
    executionSpec.bundle.inferenceLevel === "benchmark_sample";
  checks.push({
    name: "metric_rules",
    source: "local",
    status: hasMetricSignals ? "passed" : "failed",
    summary: hasMetricSignals
      ? "Execution spec declares metric extraction signals."
      : "Execution spec is missing metric extraction rules for the requested target.",
    details: hasMetricSignals ? null : executionSpec.claim.targetMetric,
  });

  const validation = validateExecutionBundle({ sourcePack, bundle });
  if (validation.warnings.length > 0) {
    warnings.push(...validation.warnings);
  }
  if (!validation.valid) {
    checks.push({
      name: "static_bundle_validation",
      source: "local",
      status: "failed",
      summary: validation.summary,
      details: validation.errors.join("\n"),
    });
  } else {
    checks.push({
      name: "static_bundle_validation",
      source: "local",
      status: "passed",
      summary: validation.summary,
      details: validation.warnings.length ? validation.warnings.join("\n") : null,
    });
  }

  const failingChecks = checks.filter((check) => check.status === "failed");
  if (failingChecks.length > 0) {
    failureClass = "local_preflight_failed";
    errorSummary = failingChecks.map((check) => check.summary).join(" ");
  }

  return {
    ok: failingChecks.length === 0,
    failureClass,
    errorSummary,
    warnings,
    checks,
  };
}

async function callBundleRepairModel(params: {
  sourcePack: ExecutionSourcePack;
  bundle: NormalizedExecutionBundle;
  executionSpec: ExecutionSpec;
  report: BundlePreflightReport;
  attemptNumber: number;
}): Promise<NormalizedExecutionBundle> {
  const compactSourcePack = buildCompactSynthesisPack(params.sourcePack);
  const prompt = [
    "You are repairing a generated Python experiment bundle after preflight failures.",
    "",
    `Repair attempt: ${params.attemptNumber}.`,
    "Minimally patch the existing bundle to fix the concrete failures below.",
    "Preserve the current benchmark path, entrypoint, outputs, and metric semantics whenever possible.",
    "If requirements are missing, add them. If syntax or path issues exist, fix only those parts.",
    "",
    "Return strict JSON with keys:",
    "- version",
    "- strategy",
    "- inferenceLevel",
    "- rationale",
    "- bundleOriginSummary",
    "- credibilityScore",
    "- fallbackChainUsed[]",
    "- entrypoint",
    "- workingDirectory",
    "- installCommand",
    "- files[] of { path, purpose, content }",
    "- dependencies[] of { name, version, rationale }",
    "- assumptions[]",
    "- outputContracts[] of { type, pathHint, description }",
    "- metricRules[] of { metricName, sourceHint, regex, filePattern }",
    "",
    "Compact synthesis pack:",
    safeJson(compactSourcePack),
    "",
    "Current execution spec:",
    safeJson({
      runnerContractVersion: params.executionSpec.runnerContractVersion,
      inferenceLevel: params.executionSpec.inferenceLevel,
      bundleOriginSummary: params.executionSpec.bundleOriginSummary,
      claim: params.executionSpec.claim,
      outputContracts: params.executionSpec.outputContracts,
      metricRules: params.executionSpec.metricRules,
    }),
    "",
    "Current bundle:",
    safeJson(params.bundle),
    "",
    "Preflight failures:",
    safeJson(params.report),
    "",
    "Rules:",
    "- Return only valid JSON.",
    "- Keep all file paths relative and safe.",
    "- Ensure the entrypoint exists in files[].",
    "- Ensure the bundle can emit outputs/metrics.json or outputs/report.json.",
    "- Do not emit markdown fences.",
  ].join("\n");

  const response = await callClaude({
    prompt,
    systemPrompt:
      "You repair generated experiment bundles after preflight failures. Return only valid JSON matching the requested schema.",
    model: "sonnet",
    maxTurns: 1,
    allowedTools: [],
  });

  return normalizedExecutionBundleSchema.parse(
    JSON.parse(extractJsonPayload(response)) as unknown
  );
}

export async function repairExecutionBundle(params: {
  sourcePack: ExecutionSourcePack;
  bundle: NormalizedExecutionBundle;
  executionSpec: ExecutionSpec;
  report: BundlePreflightReport;
  attemptNumber: number;
}): Promise<{
  bundle: NormalizedExecutionBundle;
  repairSummary: string;
}> {
  let repairedBundle = normalizeBundle(params.bundle, params.sourcePack);
  const missingPackages = inferMissingDependencyPackages(repairedBundle);

  if (missingPackages.length > 0) {
    const existing = new Set(
      repairedBundle.dependencies.map((dependency) =>
        normalizePackageName(dependency.name)
      )
    );

    repairedBundle = normalizeBundle(
      {
        ...repairedBundle,
        dependencies: [
          ...repairedBundle.dependencies,
          ...missingPackages
            .filter(
              ({ packageName }) => !existing.has(normalizePackageName(packageName))
            )
            .map(({ moduleName, packageName }) => ({
              name: packageName,
              version: DEFAULT_PACKAGE_VERSIONS[packageName] ?? null,
              rationale: `Added automatically because generated code imports ${moduleName}.`,
            })),
        ],
        assumptions: [
          ...repairedBundle.assumptions,
          ...missingPackages.map(
            ({ moduleName, packageName }) =>
              `Added ${packageName} to requirements because generated code imports ${moduleName}.`
          ),
        ],
      },
      params.sourcePack
    );

    return {
      bundle: repairedBundle,
      repairSummary: `Added missing dependency coverage for ${missingPackages
        .map(({ packageName }) => packageName)
        .join(", ")}.`,
    };
  }

  try {
    const modelBundle = await callBundleRepairModel(params);
    return {
      bundle: normalizeBundle(modelBundle, params.sourcePack),
      repairSummary: "Applied model-guided repairs from preflight diagnostics.",
    };
  } catch (error) {
    return {
      bundle: repairedBundle,
      repairSummary: `Repair model could not improve the bundle: ${errorMessage(error)}`,
    };
  }
}

function buildTimeouts(computeTier: "small" | "standard" | "extended") {
  switch (computeTier) {
    case "small":
      return { jobSeconds: 3600, heartbeatSeconds: 90 };
    case "extended":
      return { jobSeconds: 43200, heartbeatSeconds: 180 };
    case "standard":
    default:
      return { jobSeconds: 14400, heartbeatSeconds: 120 };
  }
}

function supplementaryUrlsForPaper(paper: Paper): string[] {
  try {
    const parsed = JSON.parse(paper.supplementaryUrls ?? "[]") as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string")
      : [];
  } catch {
    return [];
  }
}

export function compileExecutionSpec(params: {
  context: ExecutionPlanningContext;
  sourcePack: ExecutionSourcePack;
  bundle: NormalizedExecutionBundle;
}): ExecutionSpec {
  const { context, sourcePack, bundle } = params;
  const settings = parseSettingsSnapshot(context.plan);
  const assumptionLedger = [
    ...new Set([...sourcePack.plannerOutput.assumptions, ...bundle.assumptions]),
  ];

  if (
    sourcePack.plannerOutput.hardBlockers.length > 0 &&
    bundle.inferenceLevel === "repo_faithful"
  ) {
    const blocker = sourcePack.plannerOutput.hardBlockers[0];
    throw new ExecutionPlanningBlockerError(
      blocker.blockerType,
      blocker.message,
      blocker.requiredInput
    );
  }

  if (
    sourcePack.datasets.accessMode === "credentials_required" &&
    !context.plan.datasetSpec &&
    bundle.inferenceLevel !== "benchmark_sample"
  ) {
    throw new ExecutionPlanningBlockerError(
      "dataset_credentials_required",
      "This reproduction appears to require dataset credentials that are not available in the current plan.",
      "Provide the required dataset credentials, access note, or a public-data alternative."
    );
  }

  const validation = validateExecutionBundle({ sourcePack, bundle });
  if (!validation.valid) {
    throw new ExecutionPlanningBlockerError(
      "invalid_execution_bundle",
      validation.errors.join(" "),
      "Refine the execution instructions or provide a narrower runnable benchmark path."
    );
  }

  return executionSpecSchema.parse({
    version: "v2",
    runnerContractVersion: "bundle-v2",
    paper: {
      id: context.paper._id,
      title: context.paper.title,
      paperType: context.paper.paperType ?? null,
    },
    claim: {
      targetClaim: context.plan.targetClaim,
      targetMetric: context.plan.targetMetric,
      targetValue: context.plan.targetValue,
      tolerance: context.plan.tolerance,
    },
    sources: {
      acceptedSources: parseAcceptedSources(context.plan),
      officialRepoUrl: context.paper.officialRepoUrl,
      pdfUrl: context.paper.pdfUrl,
      supplementaryUrls: supplementaryUrlsForPaper(context.paper),
    },
    repo: sourcePack.repo.url
      ? {
          url: sourcePack.repo.url,
          ref: sourcePack.repo.ref,
          confidence: sourcePack.repo.confidence,
          defaultBranch: sourcePack.repo.defaultBranch,
        }
      : null,
    sourcePack,
    inferenceLevel: bundle.inferenceLevel,
    bundleOriginSummary: bundle.bundleOriginSummary,
    assumptionLedger,
    credibilityScore: bundle.credibilityScore,
    fallbackChainUsed: bundle.fallbackChainUsed,
    bundle,
    environment: {
      backend: "modal",
      computeTier: settings.computeTier,
      workingDirectory: bundle.workingDirectory,
    },
    datasets: {
      summary: sourcePack.datasets.summary,
      accessMode: sourcePack.datasets.accessMode,
      datasetNames: sourcePack.datasets.datasetNames,
    },
    credentials: {
      required:
        sourcePack.datasets.accessMode === "credentials_required" &&
        bundle.inferenceLevel !== "benchmark_sample",
      note: context.plan.datasetSpec,
      requiredCredentials: sourcePack.datasets.requiredCredentials,
    },
    outputContracts: bundle.outputContracts,
    metricRules: bundle.metricRules,
    repairPolicy: {
      autoAssumeLowRisk: true,
      allowSupportingPapers: settings.allowSupportingPapers,
      humanApprovalOnBlocker: settings.humanApprovalOnBlocker,
    },
    callbacks: {
      url: `${context.appBaseUrl}/api/reproduction/runner-callback`,
    },
    timeouts: buildTimeouts(settings.computeTier),
  });
}

export function compileCustomExecutionSpec(params: {
  context: CustomExecutionPlanningContext;
  sourcePack: ExecutionSourcePack;
  bundle: NormalizedExecutionBundle;
}): ExecutionSpec {
  const { context, sourcePack, bundle } = params;
  const settings = parseSettingsSnapshot(context.customContext);
  const datasetContext = interpretCustomDatasetNote(context.customContext.datasetNote);
  const assumptionLedger = [
    ...new Set([...sourcePack.plannerOutput.assumptions, ...bundle.assumptions]),
  ];

  if (
    sourcePack.plannerOutput.hardBlockers.length > 0 &&
    bundle.inferenceLevel === "repo_faithful"
  ) {
    const blocker = sourcePack.plannerOutput.hardBlockers[0];
    throw new ExecutionPlanningBlockerError(
      blocker.blockerType,
      blocker.message,
      blocker.requiredInput
    );
  }

  if (
    sourcePack.datasets.accessMode === "credentials_required" &&
    !datasetContext.datasetNote &&
    bundle.inferenceLevel !== "benchmark_sample"
  ) {
    throw new ExecutionPlanningBlockerError(
      "dataset_credentials_required",
      "This custom experiment appears to require dataset credentials that are not available in the current plan.",
      "Provide the dataset credentials, access note, or a public-data alternative."
    );
  }

  const validation = validateExecutionBundle({ sourcePack, bundle });
  if (!validation.valid) {
    throw new ExecutionPlanningBlockerError(
      "invalid_execution_bundle",
      validation.errors.join(" "),
      "Refine the experiment description or provide a narrower runnable execution path."
    );
  }

  const repoUrl = sourcePack.repo.url;

  return executionSpecSchema.parse({
    version: "v2",
    runnerContractVersion: "bundle-v2",
    paper: {
      id: context.hypothesis._id,
      title: context.hypothesis.title,
      paperType: null,
    },
    claim: {
      targetClaim:
        context.hypothesis.expectedOutcome ||
        context.customContext.benchmark ||
        context.customContext.description,
      targetMetric: context.hypothesis.targetMetric,
      targetValue: context.hypothesis.targetValue,
      tolerance: context.hypothesis.tolerance,
    },
    sources: {
      acceptedSources: sourcePack.acceptedSources,
      officialRepoUrl: repoUrl,
      pdfUrl: null,
      supplementaryUrls: [],
    },
    repo: repoUrl
      ? {
          url: repoUrl,
          ref: sourcePack.repo.ref,
          confidence: sourcePack.repo.confidence,
          defaultBranch: sourcePack.repo.defaultBranch,
        }
      : null,
    sourcePack,
    inferenceLevel: bundle.inferenceLevel,
    bundleOriginSummary: bundle.bundleOriginSummary,
    assumptionLedger,
    credibilityScore: bundle.credibilityScore,
    fallbackChainUsed: bundle.fallbackChainUsed,
    bundle,
    environment: {
      backend: "modal",
      computeTier: settings.computeTier,
      workingDirectory: bundle.workingDirectory,
    },
    datasets: {
      summary: sourcePack.datasets.summary,
      accessMode: sourcePack.datasets.accessMode,
      datasetNames: sourcePack.datasets.datasetNames,
    },
    credentials: {
      required:
        sourcePack.datasets.accessMode === "credentials_required" &&
        bundle.inferenceLevel !== "benchmark_sample",
      note: datasetContext.datasetNote ?? datasetContext.setupNote,
      requiredCredentials: sourcePack.datasets.requiredCredentials,
    },
    outputContracts: bundle.outputContracts,
    metricRules: bundle.metricRules,
    repairPolicy: {
      autoAssumeLowRisk: true,
      allowSupportingPapers: settings.allowSupportingPapers,
      humanApprovalOnBlocker: settings.humanApprovalOnBlocker,
    },
    callbacks: {
      url: `${context.appBaseUrl}/api/reproduction/runner-callback`,
    },
    timeouts: buildTimeouts(settings.computeTier),
  });
}
