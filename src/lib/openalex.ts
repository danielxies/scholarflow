const BASE_URL = "https://api.openalex.org";
const OPENALEX_API_KEY = process.env.OPENALEX_API_KEY?.trim() ?? "";

export class OpenAlexError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "OpenAlexError";
    this.status = status;
  }
}

export interface LiteratureTopic {
  id: string;
  name: string;
  score: number | null;
}

export interface LiteratureAuthor {
  name: string;
}

export interface LiteratureSearchResult {
  provider: "openalex";
  openAlexId: string;
  title: string;
  authors: LiteratureAuthor[];
  abstract: string | null;
  year: number | null;
  venue: string | null;
  citationCount: number;
  url: string | null;
  doi: string | null;
  arxivId: string | null;
  primaryTopic: string | null;
  topics: LiteratureTopic[];
  publicationType: string | null;
  relevanceScore: number | null;
  relevanceReason: string | null;
  relevanceStatus: "idle" | "scoring" | "scored" | "failed";
}

interface OpenAlexListResponse<T> {
  results?: T[];
}

interface OpenAlexTopic {
  id?: string | null;
  display_name?: string | null;
  score?: number | null;
}

interface OpenAlexLocation {
  landing_page_url?: string | null;
  source?: {
    display_name?: string | null;
  } | null;
}

interface OpenAlexAuthorship {
  author?: {
    display_name?: string | null;
  } | null;
}

interface OpenAlexWork {
  id?: string | null;
  display_name?: string | null;
  authorships?: OpenAlexAuthorship[] | null;
  publication_year?: number | null;
  primary_location?: OpenAlexLocation | null;
  cited_by_count?: number | null;
  abstract_inverted_index?: Record<string, number[]> | null;
  doi?: string | null;
  ids?: Record<string, string | null> | null;
  topics?: OpenAlexTopic[] | null;
  primary_topic?: OpenAlexTopic | null;
  type?: string | null;
  relevance_score?: number | null;
}

function createParams(
  params: Record<string, string | number | undefined>
): URLSearchParams {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === "") return;
    searchParams.set(key, String(value));
  });

  if (OPENALEX_API_KEY) {
    searchParams.set("api_key", OPENALEX_API_KEY);
  }

  return searchParams;
}

async function fetchOpenAlex<T>(
  path: string,
  params: URLSearchParams
): Promise<T> {
  const url = `${BASE_URL}${path}?${params.toString()}`;
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
  });

  const responseText = await response.text();

  if (!response.ok) {
    let message = responseText;
    try {
      const parsed = JSON.parse(responseText) as { error?: string; message?: string };
      message = parsed.message ?? parsed.error ?? responseText;
    } catch {
      // Ignore JSON parse failures and keep raw text.
    }

    throw new OpenAlexError(
      response.status,
      message || `OpenAlex API error ${response.status}`
    );
  }

  try {
    return JSON.parse(responseText) as T;
  } catch {
    throw new OpenAlexError(
      response.status,
      "OpenAlex API returned invalid JSON"
    );
  }
}

export function normalizeOpenAlexId(id: string | null | undefined): string | null {
  if (!id) return null;
  const trimmed = id.trim();
  if (!trimmed) return null;

  const match = trimmed.match(/([WAISKTFP]\d+)$/i);
  return match ? match[1].toUpperCase() : trimmed;
}

export function normalizeDoi(doi: string | null | undefined): string | null {
  if (!doi) return null;

  return doi
    .trim()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")
    .replace(/^doi:/i, "")
    .trim()
    .toLowerCase() || null;
}

function buildAbstract(
  abstractIndex: Record<string, number[]> | null | undefined
): string | null {
  if (!abstractIndex) return null;

  const entries = Object.entries(abstractIndex);
  if (entries.length === 0) return null;

  const maxPosition = entries.reduce((max, [, positions]) => {
    const localMax = positions.reduce((innerMax, value) => Math.max(innerMax, value), 0);
    return Math.max(max, localMax);
  }, 0);

  const words = new Array<string>(maxPosition + 1);
  for (const [word, positions] of entries) {
    positions.forEach((position) => {
      words[position] = word;
    });
  }

  const abstract = words.filter(Boolean).join(" ").trim();
  return abstract || null;
}

function deriveArxivId(work: OpenAlexWork): string | null {
  const landingPageUrl = work.primary_location?.landing_page_url;
  if (!landingPageUrl) return null;

  const match = landingPageUrl.match(/arxiv\.org\/abs\/([^/?#]+)/i);
  return match ? match[1] : null;
}

function mapTopics(
  topics: OpenAlexTopic[] | null | undefined
): LiteratureTopic[] {
  return (topics ?? [])
    .filter((topic) => topic.display_name)
    .slice(0, 5)
    .map((topic) => ({
      id:
        normalizeOpenAlexId(topic.id ?? "") ??
        topic.display_name
          ?.trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "") ??
        "unknown-topic",
      name: topic.display_name ?? "Unknown topic",
      score: topic.score ?? null,
    }));
}

export function buildOpenAlexUrl(
  openAlexId: string | null | undefined
): string | null {
  const normalized = normalizeOpenAlexId(openAlexId);
  return normalized ? `https://openalex.org/${normalized}` : null;
}

export function mapOpenAlexWork(
  work: OpenAlexWork
): LiteratureSearchResult {
  const openAlexId = normalizeOpenAlexId(work.id) ?? "UNKNOWN";
  const doi = normalizeDoi(work.doi ?? work.ids?.doi);
  const topics = mapTopics(work.topics);
  const primaryTopic =
    work.primary_topic?.display_name ??
    topics[0]?.name ??
    null;

  return {
    provider: "openalex",
    openAlexId,
    title: work.display_name?.trim() || "Untitled",
    authors: (work.authorships ?? [])
      .map((authorship) => authorship.author?.display_name?.trim())
      .filter(Boolean)
      .map((name) => ({ name: name as string })),
    abstract: buildAbstract(work.abstract_inverted_index),
    year: work.publication_year ?? null,
    venue: work.primary_location?.source?.display_name?.trim() ?? null,
    citationCount: work.cited_by_count ?? 0,
    url:
      work.primary_location?.landing_page_url?.trim() ??
      (doi ? `https://doi.org/${doi}` : null),
    doi,
    arxivId: deriveArxivId(work),
    primaryTopic,
    topics,
    publicationType: work.type ?? null,
    relevanceScore: null,
    relevanceReason: null,
    relevanceStatus: "idle",
  };
}

export async function searchWorks(
  query: string,
  options: { limit?: number; yearRange?: string } = {}
): Promise<LiteratureSearchResult[]> {
  const { limit = 10, yearRange } = options;
  const filters: string[] = [];

  if (yearRange) {
    const [yearStart = "", yearEnd = ""] = yearRange.split("-", 2);
    if (yearStart) {
      filters.push(`from_publication_date:${yearStart}-01-01`);
    }
    if (yearEnd) {
      filters.push(`to_publication_date:${yearEnd}-12-31`);
    }
  }

  const params = createParams({
    search: query,
    per_page: limit,
    filter: filters.length > 0 ? filters.join(",") : undefined,
  });

  const response = await fetchOpenAlex<OpenAlexListResponse<OpenAlexWork>>(
    "/works",
    params
  );

  return (response.results ?? []).map(mapOpenAlexWork);
}

export async function getWork(
  openAlexId: string
): Promise<LiteratureSearchResult> {
  const normalizedId = normalizeOpenAlexId(openAlexId);
  if (!normalizedId) {
    throw new OpenAlexError(400, "Invalid OpenAlex work ID");
  }

  const response = await fetchOpenAlex<OpenAlexWork>(
    `/works/${normalizedId}`,
    createParams({})
  );

  return mapOpenAlexWork(response);
}
