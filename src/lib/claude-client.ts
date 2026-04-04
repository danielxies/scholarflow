const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_AGENT_PATH = "/api/claude/run";
const DEFAULT_MAX_TOKENS = 4096;

const RAW_CLAUDE_AGENT_URL = process.env.CLAUDE_AGENT_URL?.trim() ?? "";
const CLAUDE_BACKEND = (
  process.env.CLAUDE_BACKEND?.trim().toLowerCase() ?? "auto"
) as "auto" | "url" | "anthropic";
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY?.trim() ?? "";

interface ClaudeRequest {
  prompt: string;
  systemPrompt?: string;
  model?: "sonnet" | "opus" | "haiku";
  maxTurns?: number;
  allowedTools?: string[];
}

interface AnthropicTextBlock {
  type: string;
  text?: string;
}

function resolveClaudeAgentUrl(): string {
  if (!RAW_CLAUDE_AGENT_URL) {
    return "";
  }

  try {
    const parsed = new URL(RAW_CLAUDE_AGENT_URL);
    if (parsed.pathname === "/" || parsed.pathname === "") {
      parsed.pathname = DEFAULT_AGENT_PATH;
    }
    return parsed.toString();
  } catch {
    return RAW_CLAUDE_AGENT_URL;
  }
}

function resolveBackend(): "url" | "anthropic" {
  if (CLAUDE_BACKEND === "url") {
    return "url";
  }

  if (CLAUDE_BACKEND === "anthropic") {
    return "anthropic";
  }

  return RAW_CLAUDE_AGENT_URL ? "url" : "anthropic";
}

function resolveAnthropicModel(
  model: ClaudeRequest["model"]
): string {
  switch (model) {
    case "opus":
      return "claude-opus-4-1-20250805";
    case "haiku":
      return "claude-3-5-haiku-20241022";
    case "sonnet":
    default:
      return "claude-sonnet-4-20250514";
  }
}

async function callClaudeAgent({
  prompt,
  systemPrompt,
  model = "sonnet",
  maxTurns = 1,
  allowedTools = [],
}: ClaudeRequest): Promise<string> {
  const claudeAgentUrl = resolveClaudeAgentUrl();
  if (!claudeAgentUrl) {
    throw new Error(
      "CLAUDE_BACKEND is set to url, but CLAUDE_AGENT_URL is not configured."
    );
  }

  const body: Record<string, unknown> = {
    prompt,
    model,
    max_turns: maxTurns,
    allowed_tools: allowedTools,
  };

  if (systemPrompt) {
    body.system_prompt = systemPrompt;
  }

  const res = await fetch(claudeAgentUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const responseText = await res.text();

  if (!res.ok) {
    throw new Error(`Claude agent error ${res.status}: ${responseText}`);
  }

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(responseText) as Record<string, unknown>;
  } catch {
    const contentType = res.headers.get("content-type") ?? "unknown";
    const preview = responseText.replace(/\s+/g, " ").slice(0, 160);
    throw new Error(
      `Claude endpoint returned ${contentType}, not JSON. Check CLAUDE_AGENT_URL (${claudeAgentUrl}). Response preview: ${preview}`
    );
  }

  if (typeof data.result === "string") {
    return data.result;
  }

  if (data.type === "result" && data.is_error) {
    throw new Error(`Claude agent error: ${data.subtype || "unknown"}`);
  }

  return JSON.stringify(data);
}

async function callAnthropicApi({
  prompt,
  systemPrompt,
  model = "sonnet",
  allowedTools = [],
}: ClaudeRequest): Promise<string> {
  if (!ANTHROPIC_API_KEY) {
    throw new Error(
      "Claude backend is set to anthropic, but ANTHROPIC_API_KEY is not configured."
    );
  }

  if (allowedTools.length > 0) {
    throw new Error(
      "Direct Anthropic fallback does not support allowedTools. Configure CLAUDE_AGENT_URL for agent-backed tool use."
    );
  }

  const body: Record<string, unknown> = {
    model: resolveAnthropicModel(model),
    max_tokens: DEFAULT_MAX_TOKENS,
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
  };

  if (systemPrompt) {
    body.system = systemPrompt;
  }

  const res = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify(body),
  });

  const responseText = await res.text();

  if (!res.ok) {
    throw new Error(`Anthropic API error ${res.status}: ${responseText}`);
  }

  let data: {
    content?: AnthropicTextBlock[];
    error?: { message?: string };
  };

  try {
    data = JSON.parse(responseText) as {
      content?: AnthropicTextBlock[];
      error?: { message?: string };
    };
  } catch {
    const contentType = res.headers.get("content-type") ?? "unknown";
    const preview = responseText.replace(/\s+/g, " ").slice(0, 160);
    throw new Error(
      `Anthropic API returned ${contentType}, not JSON. Response preview: ${preview}`
    );
  }

  if (data.error?.message) {
    throw new Error(`Anthropic API error: ${data.error.message}`);
  }

  const text = (data.content ?? [])
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text ?? "")
    .join("");

  if (!text) {
    throw new Error("Anthropic API returned no text content.");
  }

  return text;
}

export async function callClaude({
  prompt,
  systemPrompt,
  model = "sonnet",
  maxTurns = 1,
  allowedTools = [],
}: ClaudeRequest): Promise<string> {
  const backend = resolveBackend();

  if (backend === "url") {
    return callClaudeAgent({
      prompt,
      systemPrompt,
      model,
      maxTurns,
      allowedTools,
    });
  }

  return callAnthropicApi({
    prompt,
    systemPrompt,
    model,
    maxTurns,
    allowedTools,
  });
}
