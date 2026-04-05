import { z } from "zod";
import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import {
  adjectives,
  animals,
  colors,
  uniqueNamesGenerator,
} from "unique-names-generator";

import { LATEX_TEMPLATES } from "@/lib/latex-templates";
import { db } from "@/lib/local-db/client";

const TEMPLATE_VALUES = ["plain", "acm", "ieee", "neurips"] as const;

type TemplateName = (typeof TEMPLATE_VALUES)[number];

const requestSchema = z.object({
  idea: z.string().trim().min(1).optional(),
  prompt: z.string().trim().min(1).optional(),
  template: z.enum(TEMPLATE_VALUES).optional(),
}).refine((value) => value.idea || value.prompt, {
  message: "Either idea or prompt is required",
});

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim().replace(/[. ]+$/, "");
}

function escapeLatex(value: string): string {
  return value
    .replace(/\\/g, "\\textbackslash{}")
    .replace(/([{}$&#_%])/g, "\\$1")
    .replace(/~/g, "\\textasciitilde{}")
    .replace(/\^/g, "\\textasciicircum{}");
}

function titleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      if (word.toUpperCase() === word && word.length > 1) {
        return word;
      }

      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

function deriveTitle(idea: string): string {
  const normalized = normalizeText(idea)
    .replace(/^i want to (build|create|design)\s+/i, "")
    .replace(/^build\s+/i, "")
    .replace(/^a system that('?s| is)\s+/i, "")
    .replace(/^system that('?s| is)\s+/i, "");

  const words = normalized
    .replace(/[^\w\s-]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 12);

  if (words.length === 0) {
    return "Research Paper Draft";
  }

  return titleCase(words.join(" "));
}

function extractLegacyRequest(prompt: string): {
  idea: string;
  template: TemplateName;
} {
  const match = prompt.match(
    /^Create a\s+(plain|acm|ieee|neurips)\s+template paper about:\s*([\s\S]*?)\s*Use the createProjectFromIdea tool/i
  );

  if (!match) {
    return {
      idea: normalizeText(prompt),
      template: "plain",
    };
  }

  return {
    idea: normalizeText(match[2]),
    template: match[1].toLowerCase() as TemplateName,
  };
}

function buildMainTex(template: TemplateName, idea: string): string {
  const title = escapeLatex(deriveTitle(idea));
  const escapedIdea = escapeLatex(normalizeText(idea));
  const abstractText =
    `This draft explores ${escapedIdea}. Replace this placeholder abstract ` +
    "with a concise summary of the problem, proposed approach, and expected contributions.";

  return LATEX_TEMPLATES[template]
    .replace("Your Paper Title", title)
    .replace("Your abstract here.", abstractText)
    .replace(
      "\\section{Introduction}\n% Introduce the problem and motivation.",
      `\\section{Introduction}\nThis draft investigates ${escapedIdea}.\n\n% Introduce the problem and motivation.`
    )
    .replaceAll("Author Name", "Anonymous Author")
    .replaceAll("University Name", "Institution")
    .replaceAll("email@example.com", "author@example.com");
}

function buildNotes(idea: string, template: TemplateName): string {
  return [
    "# Project Brief",
    "",
    `Template: ${template}`,
    "",
    "## Initial Idea",
    idea,
    "",
    "## Next Steps",
    "- Refine the title and abstract in `main.tex`.",
    "- Add citations to `references.bib`.",
    "- Use the conversation panel to expand sections or plan experiments.",
    "",
  ].join("\n");
}

export async function POST(request: Request) {
  const userId = await getSessionUserId();


  const body = await request.json();
  const parsed = requestSchema.parse(body);
  const legacy = parsed.prompt ? extractLegacyRequest(parsed.prompt) : null;
  const idea = normalizeText(parsed.idea ?? legacy?.idea ?? "");
  const template = parsed.template ?? legacy?.template ?? "plain";

  // Generate a random project name
  const derivedTitle = deriveTitle(idea);
  const projectName =
    derivedTitle !== "Research Paper Draft"
      ? derivedTitle
      : uniqueNamesGenerator({
          dictionaries: [adjectives, animals, colors],
          separator: "-",
          length: 3,
        });

  // Create project and conversation together
  const { projectId, conversationId } = (await db.mutation(
    "system.createProjectWithConversation",
    {
      projectName,
      conversationTitle: "Project scaffold",
      ownerId: userId,
      template,
    }
  )) as { projectId: string; conversationId: string };

  await db.mutation("system.createFiles", {
    projectId,
    files: [
      {
        name: "main.tex",
        content: buildMainTex(template, idea),
      },
      {
        name: "references.bib",
        content: "% Add BibTeX entries here.\n",
      },
      {
        name: "notes.md",
        content: buildNotes(idea, template),
      },
    ],
  });

  await db.mutation("system.createMessage", {
    conversationId,
    projectId,
    role: "assistant",
    content:
      `Created a ${template} paper scaffold with ` +
      "`main.tex`, `references.bib`, and `notes.md`.",
  });

  return NextResponse.json({ projectId });
}
