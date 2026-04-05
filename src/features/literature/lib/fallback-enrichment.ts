import * as dbOps from "@/lib/db";

export interface FallbackEnrichment {
  summary: string;
  paperType: string;
  supportabilityLabel:
    | "high_support"
    | "medium_support"
    | "low_support"
    | "unsupported";
  reproducibilityClass:
    | "fully_supported"
    | "partially_supported"
    | "not_reproducible";
  supportabilityScore: number;
  supportabilityReason: string;
  officialRepoUrl: string | null;
  pdfUrl: string | null;
}

export function inferPdfUrl(
  paper: NonNullable<ReturnType<typeof dbOps.getPaperById>>
): string | null {
  if (paper.arxivId) {
    return `https://arxiv.org/pdf/${paper.arxivId}.pdf`;
  }

  return null;
}

export function extractGithubUrl(
  paper: NonNullable<ReturnType<typeof dbOps.getPaperById>>
): string | null {
  const haystacks = [paper.url, paper.abstract, paper.tldr, paper.notes];
  const pattern = /(https?:\/\/github\.com\/[^\s)]+)|(github\.com\/[^\s)]+)/i;

  for (const value of haystacks) {
    if (!value) continue;
    const match = value.match(pattern);
    if (!match) continue;
    const url = match[0].startsWith("http") ? match[0] : `https://${match[0]}`;
    return url.replace(/[).,;]+$/, "");
  }

  return null;
}

function inferPaperType(
  paper: NonNullable<ReturnType<typeof dbOps.getPaperById>>
) {
  const haystack = [
    paper.title,
    paper.abstract ?? "",
    paper.primaryTopic ?? "",
    paper.publicationType ?? "",
  ]
    .join(" ")
    .toLowerCase();

  const mlBenchmarkSignals = [
    "benchmark",
    "accuracy",
    "imagenet",
    "cifar",
    "leaderboard",
    "few-shot",
    "llm",
    "transformer",
    "vision",
  ];
  const systemsSignals = [
    "distributed",
    "latency",
    "throughput",
    "cluster",
    "scheduling",
    "database",
    "operating system",
    "network",
    "systems",
  ];
  const bioSignals = [
    "biology",
    "biomedical",
    "protein",
    "genome",
    "cell",
    "drug",
    "wet lab",
    "clinical",
  ];
  const algorithmSignals = [
    "optimization",
    "algorithm",
    "proof",
    "theorem",
    "approximation",
    "method",
  ];

  if (bioSignals.some((signal) => haystack.includes(signal))) {
    return "bio";
  }

  if (systemsSignals.some((signal) => haystack.includes(signal))) {
    return "systems";
  }

  if (mlBenchmarkSignals.some((signal) => haystack.includes(signal))) {
    return "ml_benchmark";
  }

  if (algorithmSignals.some((signal) => haystack.includes(signal))) {
    return "algorithm";
  }

  return "other";
}

function buildFallbackSummary(
  paper: NonNullable<ReturnType<typeof dbOps.getPaperById>>,
  paperType: string,
  supportabilityReason: string
) {
  const lead = `${paper.title} is classified as a ${paperType.replace(/_/g, " ")} paper${paper.year ? ` from ${paper.year}` : ""}${paper.venue ? ` published in ${paper.venue}` : ""}.`;
  const abstract = paper.abstract?.trim();
  const abstractSentence = abstract
    ? abstract.length > 320
      ? `${abstract.slice(0, 317).trimEnd()}...`
      : abstract
    : "The saved metadata does not include an abstract, so this summary is based on available paper metadata only.";

  return `${lead} ${abstractSentence} ${supportabilityReason}`;
}

export function buildFallbackEnrichment(
  paper: NonNullable<ReturnType<typeof dbOps.getPaperById>>
): FallbackEnrichment {
  const paperType = inferPaperType(paper);
  const officialRepoUrl = extractGithubUrl(paper);
  const pdfUrl = inferPdfUrl(paper);
  const hasOfficialRepo = Boolean(officialRepoUrl);

  let supportabilityLabel: FallbackEnrichment["supportabilityLabel"] =
    "low_support";
  let reproducibilityClass: FallbackEnrichment["reproducibilityClass"] =
    "partially_supported";
  let supportabilityScore = 45;
  let supportabilityReason =
    "This paper was classified with a conservative metadata-only fallback because the AI enrichment step was unavailable.";

  if (paperType === "ml_benchmark") {
    if (hasOfficialRepo) {
      supportabilityLabel = "high_support";
      reproducibilityClass = "fully_supported";
      supportabilityScore = 82;
      supportabilityReason =
        "The paper appears ML benchmark oriented and an official repository was detected, so a native reproduction attempt is likely feasible in v1.";
    } else {
      supportabilityLabel = "medium_support";
      reproducibilityClass = "partially_supported";
      supportabilityScore = 64;
      supportabilityReason =
        "The paper appears ML benchmark oriented, but no official repository was detected from saved metadata, so reproduction is possible but less reliable.";
    }
  } else if (paperType === "algorithm") {
    supportabilityLabel = hasOfficialRepo ? "medium_support" : "low_support";
    reproducibilityClass = "partially_supported";
    supportabilityScore = hasOfficialRepo ? 60 : 42;
    supportabilityReason = hasOfficialRepo
      ? "This algorithm paper has a likely execution path through detected repository artifacts, but reproduction still depends on method details and evaluation clarity."
      : "This algorithm paper lacks an obvious official code path in saved metadata, so only a partial reproduction attempt is currently supportable.";
  } else if (paperType === "systems" || paperType === "bio") {
    supportabilityLabel = hasOfficialRepo ? "low_support" : "unsupported";
    reproducibilityClass = hasOfficialRepo
      ? "partially_supported"
      : "not_reproducible";
    supportabilityScore = hasOfficialRepo ? 30 : 12;
    supportabilityReason =
      paperType === "systems"
        ? "Systems papers usually need environment or infrastructure details that are not reliably automatable from metadata alone."
        : "Bio and biomedical papers often depend on unavailable wet-lab or proprietary assets, which makes autonomous reproduction unreliable in v1.";
  }

  return {
    summary: buildFallbackSummary(paper, paperType, supportabilityReason),
    paperType,
    supportabilityLabel,
    reproducibilityClass,
    supportabilityScore,
    supportabilityReason,
    officialRepoUrl,
    pdfUrl,
  };
}
