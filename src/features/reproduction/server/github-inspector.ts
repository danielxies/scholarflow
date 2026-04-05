const GITHUB_API_BASE = "https://api.github.com";

export interface GitHubRepositoryContext {
  repoUrl: string;
  owner: string;
  repo: string;
  defaultBranch: string | null;
  description: string | null;
  readme: string | null;
  rootEntries: string[];
  treePaths: string[];
}

function cleanEnv(value: string | undefined): string {
  return value?.trim() ?? "";
}

function buildHeaders(): HeadersInit {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "scholarflow-reproduction",
  };
  const token = cleanEnv(process.env.GITHUB_TOKEN);
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

function parseGitHubRepo(repoUrl: string) {
  try {
    const url = new URL(repoUrl);
    if (url.hostname !== "github.com" && url.hostname !== "www.github.com") {
      return null;
    }

    const [owner, repo] = url.pathname
      .replace(/^\/+/, "")
      .replace(/\.git$/, "")
      .split("/")
      .filter(Boolean);

    if (!owner || !repo) {
      return null;
    }

    return { owner, repo };
  } catch {
    return null;
  }
}

async function fetchJson<T>(path: string): Promise<T | null> {
  try {
    const response = await fetch(`${GITHUB_API_BASE}${path}`, {
      headers: buildHeaders(),
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as T;
  } catch {
    return null;
  }
}

async function fetchReadme(owner: string, repo: string): Promise<string | null> {
  try {
    const response = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}/readme`, {
      headers: {
        ...buildHeaders(),
        Accept: "application/vnd.github.raw+json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    return await response.text();
  } catch {
    return null;
  }
}

async function fetchTreePaths(
  owner: string,
  repo: string,
  ref: string | null
): Promise<string[]> {
  if (!ref) {
    return [];
  }

  const tree = await fetchJson<{
    tree?: Array<{ path?: string; type?: string }>;
  }>(`/repos/${owner}/${repo}/git/trees/${encodeURIComponent(ref)}?recursive=1`);

  return (tree?.tree ?? [])
    .filter((entry) => entry.type === "blob" && typeof entry.path === "string")
    .map((entry) => entry.path as string);
}

export async function inspectGitHubRepository(
  repoUrl: string | null | undefined
): Promise<GitHubRepositoryContext | null> {
  if (!repoUrl) {
    return null;
  }

  const parsed = parseGitHubRepo(repoUrl);
  if (!parsed) {
    return null;
  }

  const repoMetadata = await fetchJson<{
    default_branch?: string;
    description?: string | null;
  }>(`/repos/${parsed.owner}/${parsed.repo}`);

  const rootEntries = await fetchJson<Array<{ name?: string }>>(
    `/repos/${parsed.owner}/${parsed.repo}/contents`
  );

  const readme = await fetchReadme(parsed.owner, parsed.repo);
  const treePaths = await fetchTreePaths(
    parsed.owner,
    parsed.repo,
    repoMetadata?.default_branch ?? null
  );

  return {
    repoUrl,
    owner: parsed.owner,
    repo: parsed.repo,
    defaultBranch: repoMetadata?.default_branch ?? null,
    description: repoMetadata?.description ?? null,
    readme,
    rootEntries: (rootEntries ?? [])
      .map((entry) => entry.name)
      .filter((name): name is string => Boolean(name)),
    treePaths,
  };
}
