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
  rationale: z.string().min(1),
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

export interface SerializedExecutionPlanningBlocker {
  blockerType: string;
  message: string;
  requiredInput: string | null;
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
    hardBlockers: repoUrl
      ? []
      : [
          {
            blockerType: "missing_execution_path",
            message:
              "No official repository URL or credible repository-backed execution path is available for this paper.",
            requiredInput:
              "Provide an official repository URL or concrete execution instructions to continue.",
          },
        ],
    fallbackPlan: [
      "If direct synthesis fails, generate a normalized bundle that adapts the repository-backed execution path into a compact runner.",
    ],
  };
}

function buildCustomFallbackPlannerOutput(
  context: CustomExecutionPlanningContext
): ExecutionPlannerOutput {
  const repoUrl = context.customContext.repoUrl ?? context.repoContext?.repoUrl ?? null;
  const datasetMode = context.customContext.datasetNote ? "credentials_required" : "public";

  return {
    repoUrl,
    repoRef: context.repoContext?.defaultBranch ?? null,
    repoConfidence: repoUrl ? 0.5 : 0.1,
    datasetPlan: {
      summary: context.customContext.datasetNote
        ? "Use the experiment dataset note as the primary access constraint unless the repository indicates public data."
        : "Assume public dataset access unless the provided repository or benchmark note indicates otherwise.",
      accessMode: datasetMode,
      datasetNames: [],
      requiredCredentials: context.customContext.datasetNote ? ["dataset_credentials"] : [],
    },
    installPlan: buildFallbackInstallPlan(context.repoContext),
    commandGraph: buildFallbackRunCommands(context.repoContext),
    outputContracts: buildDefaultOutputContracts(),
    metricRules: buildDefaultMetricRules(context.hypothesis.targetMetric),
    assumptions: [
      "Used repository defaults and benchmark notes when the custom experiment description did not specify an exact execution path.",
      "Selected the first credible repository-backed execution path available from the provided repo context.",
    ],
    hardBlockers: repoUrl
      ? []
      : [
          {
            blockerType: "missing_execution_path",
            message:
              "No repository-backed execution path could be identified for this custom experiment.",
            requiredInput:
              "Provide a GitHub repository URL or concrete execution instructions to continue.",
          },
        ],
    fallbackPlan: [
      "If direct synthesis fails, generate a normalized bundle that adapts the repository-backed execution path into a compact runner.",
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
    "- Prefer official repository defaults over speculation.",
    "- Only ask for human input on true hard blockers such as gated datasets or no credible execution path.",
    "- Use argv arrays only. Do not emit shell operators, heredocs, env assignments, or chained commands.",
    "- Favor evaluation commands over full retraining if the repository clearly supports evaluation or checkpoint use.",
    "- Be conservative and do not invent commands that are not grounded in repository evidence.",
  ].join("\n");

  const response = await callClaude({
    prompt,
    systemPrompt:
      "You are a conservative ML reproduction planner. Return only valid JSON matching the requested schema.",
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
  const prompt = [
    `Experiment title: ${context.hypothesis.title}`,
    `Description: ${context.customContext.description}`,
    `Benchmark note: ${context.customContext.benchmark ?? "none"}`,
    `Provided repository URL: ${context.customContext.repoUrl ?? "none"}`,
    `Dataset note: ${context.customContext.datasetNote ?? "none"}`,
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
    "- Prefer the provided repository over inferred repositories.",
    "- Only ask for human input on true hard blockers such as gated datasets or no credible execution path.",
    "- Use argv arrays only. Do not emit shell operators, heredocs, env assignments, or chained commands.",
    "- Be conservative and do not invent commands that are not grounded in repository or benchmark evidence.",
  ].join("\n");

  try {
    const response = await callClaude({
      prompt,
      systemPrompt:
        "You plan conservative executable custom experiments. Return only valid JSON.",
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
      context.customContext.datasetNote ? `Dataset: ${context.customContext.datasetNote}` : null,
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
          datasetNote: context.customContext.datasetNote,
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

function fallbackBundle(sourcePack: ExecutionSourcePack): NormalizedExecutionBundle {
  const plannerOutput = sourcePack.plannerOutput;

  if (!sourcePack.repo.url) {
    throw new ExecutionPlanningBlockerError(
      "missing_execution_path",
      "The normalized bundle could not be synthesized because no repository-backed execution path was available.",
      "Provide a repository URL or concrete execution instructions to continue."
    );
  }

  if (
    !plannerOutput.commandGraph.some(
      (command) => command.phase === "run" || command.phase === "evaluate"
    )
  ) {
    throw new ExecutionPlanningBlockerError(
      "missing_execution_path",
      "The normalized bundle could not be synthesized because no credible runnable command was identified.",
      "Provide a runnable entrypoint or a more specific benchmark execution path."
    );
  }

  return normalizedExecutionBundleSchema.parse({
    version: "v1",
    strategy: "multi_file",
    rationale:
      "Fallback normalized bundle that adapts the planner-approved repository execution path into a compact Python runner.",
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

async function callBundleSynthesisModel(
  sourcePack: ExecutionSourcePack
): Promise<NormalizedExecutionBundle> {
  const prompt = [
    "You are synthesizing a compact Python execution bundle for an experiment.",
    "",
    "Create the smallest viable bundle that can reproduce or benchmark the target behavior.",
    "Prefer a single-file runner when feasible. Use multi-file only when helper modules make the implementation materially clearer.",
    "The bundle should focus on the benchmark or evaluation path, not the full research infrastructure.",
    "Direct Python APIs are preferred. Repository-backed subprocess orchestration is acceptable only when it is the most faithful path available.",
    "You may assume bundle_config.json and requirements.txt will be created automatically if omitted, but you should still include them if your runner needs custom structure.",
    "",
    "Return strict JSON with keys:",
    "- version",
    "- strategy",
    "- rationale",
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
    safeJson(sourcePack),
    "",
    "Rules:",
    "- All code must be Python or JSON/text config files.",
    "- Paths must be relative and safe. No absolute paths or traversal segments.",
    "- The entrypoint must be a Python file included in files[].",
    "- Favor structured outputs in outputs/metrics.json or outputs/report.json.",
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
}): Promise<NormalizedExecutionBundle> {
  try {
    const synthesized = await callBundleSynthesisModel(params.sourcePack);
    return normalizeBundle(synthesized, params.sourcePack);
  } catch {
    return normalizeBundle(fallbackBundle(params.sourcePack), params.sourcePack);
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

  if (sourcePack.plannerOutput.hardBlockers.length > 0) {
    const blocker = sourcePack.plannerOutput.hardBlockers[0];
    throw new ExecutionPlanningBlockerError(
      blocker.blockerType,
      blocker.message,
      blocker.requiredInput
    );
  }

  if (
    sourcePack.datasets.accessMode === "credentials_required" &&
    !context.plan.datasetSpec
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
      required: sourcePack.datasets.accessMode === "credentials_required",
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

  if (sourcePack.plannerOutput.hardBlockers.length > 0) {
    const blocker = sourcePack.plannerOutput.hardBlockers[0];
    throw new ExecutionPlanningBlockerError(
      blocker.blockerType,
      blocker.message,
      blocker.requiredInput
    );
  }

  if (
    sourcePack.datasets.accessMode === "credentials_required" &&
    !context.customContext.datasetNote
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
      required: sourcePack.datasets.accessMode === "credentials_required",
      note: context.customContext.datasetNote ?? null,
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
