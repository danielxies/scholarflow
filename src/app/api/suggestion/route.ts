import { getSessionUserId } from "@/lib/session";
import { NextResponse } from "next/server";

import { callClaude } from "@/lib/claude-client";

const SUGGESTION_PROMPT = `You are an academic writing and LaTeX suggestion assistant.

<context>
<file_name>{fileName}</file_name>
<previous_lines>
{previousLines}
</previous_lines>
<current_line number="{lineNumber}">{currentLine}</current_line>
<before_cursor>{textBeforeCursor}</before_cursor>
<after_cursor>{textAfterCursor}</after_cursor>
<next_lines>
{nextLines}
</next_lines>
<full_document>
{code}
</full_document>
</context>

<instructions>
Follow these steps IN ORDER:

1. First, look at next_lines. If next_lines contains ANY text, check if it continues from where the cursor is. If it does, return ONLY the exact text: EMPTY

2. Check if before_cursor ends with a complete statement or line. If yes, return ONLY the exact text: EMPTY

3. Only if steps 1 and 2 don't apply: return ONLY the completion text to insert at the cursor position. No explanation, no quotes, just the raw text to insert.

For LaTeX files (.tex, .bib, .sty, .cls):
- Complete LaTeX commands, environments, and citations
- Suggest appropriate academic phrasing
- Complete \\begin{} with matching \\end{} blocks

Your suggestion is inserted immediately after the cursor, so never suggest text that's already in the file.
Return ONLY the suggestion text or EMPTY. Nothing else.
</instructions>`;

export async function POST(request: Request) {
  try {
    const userId = await getSessionUserId();

    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403 },
      );
    }

    const {
      fileName,
      code,
      currentLine,
      previousLines,
      textBeforeCursor,
      textAfterCursor,
      nextLines,
      lineNumber,
    } = await request.json();

    if (!code) {
      return NextResponse.json(
        { error: "Content is required" },
        { status: 400 }
      );
    }

    const prompt = SUGGESTION_PROMPT
      .replace("{fileName}", fileName)
      .replace("{code}", code)
      .replace("{currentLine}", currentLine)
      .replace("{previousLines}", previousLines || "")
      .replace("{textBeforeCursor}", textBeforeCursor)
      .replace("{textAfterCursor}", textAfterCursor)
      .replace("{nextLines}", nextLines || "")
      .replace("{lineNumber}", lineNumber.toString());

    let result: string;
    try {
      result = await callClaude({
        prompt,
        model: "haiku",
        maxTurns: 1,
        allowedTools: [],
      });
    } catch (error) {
      console.error("Suggestion backend error: ", error);
      return NextResponse.json({ suggestion: "" });
    }

    const suggestion = result.trim() === "EMPTY" ? "" : result.trim();

    return NextResponse.json({ suggestion });
  } catch (error) {
    console.error("Suggestion error: ", error);
    return NextResponse.json(
      { error: "Failed to generate suggestion" },
      { status: 500 },
    );
  }
}
