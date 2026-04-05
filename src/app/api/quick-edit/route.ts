import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";

import { callClaude } from "@/lib/claude-client";

const QUICK_EDIT_PROMPT = `You are an academic writing assistant. Edit the selected text based on the user's instruction.

<context>
<selected_text>
{selectedCode}
</selected_text>
<full_document_context>
{fullCode}
</full_document_context>
</context>

<instruction>
{instruction}
</instruction>

<instructions>
Return ONLY the edited version of the selected text.
Maintain the same indentation level as the original.
Do not include any explanations or comments unless requested.
If the instruction is unclear or cannot be applied, return the original text unchanged.
When editing LaTeX, preserve proper formatting and citation references.
Return ONLY the edited text. No markdown code blocks, no explanations.
</instructions>`;

export async function POST(request: Request) {
  try {
    const userId = await getSessionUserId();
    const { selectedCode, fullCode, instruction } = await request.json();

    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 400 }
      );
    }

    if (!selectedCode) {
      return NextResponse.json(
        { error: "Selected text is required" },
        { status: 400 }
      );
    }

    if (!instruction) {
      return NextResponse.json(
        { error: "Instruction is required" },
        { status: 400 }
      );
    }

    const prompt = QUICK_EDIT_PROMPT
      .replace("{selectedCode}", selectedCode)
      .replace("{fullCode}", fullCode || "")
      .replace("{instruction}", instruction);

    const result = await callClaude({
      prompt,
      model: "sonnet",
      maxTurns: 1,
      allowedTools: [],
    });

    return NextResponse.json({ editedCode: result.trim() });
  } catch (error) {
    console.error("Edit error:", error);
    return NextResponse.json(
      { error: "Failed to generate edit" },
      { status: 500 }
    );
  }
}
