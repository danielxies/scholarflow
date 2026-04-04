import * as dbOps from "@/lib/db";

const MAX_CONTEXT_CHARS = 9000;
const MAX_NOTES_CHARS = 3200;
const MAX_MAIN_TEX_CHARS = 3200;
const MAX_EXTRA_FILE_CHARS = 1200;
const MAX_USER_MESSAGE_CHARS = 1400;

type ProjectFile = ReturnType<typeof dbOps.getFiles>[number];

function compactWhitespace(value: string): string {
  return value
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function truncate(value: string, limit: number): string {
  if (value.length <= limit) {
    return value;
  }

  return `${value.slice(0, limit)}\n... (truncated)`;
}

function stripLatex(content: string): string {
  return compactWhitespace(
    content
      .replace(/(?<!\\)%.*$/gm, "")
      .replace(/\\begin\{(?:figure|table|equation|align|itemize|enumerate)\}[\s\S]*?\\end\{(?:figure|table|equation|align|itemize|enumerate)\}/g, " ")
      .replace(/\\(?:cite|ref|label|footnote|url|href)(?:\[[^\]]*\])?\{[^}]*\}/g, " ")
      .replace(/\\[a-zA-Z*]+(?:\[[^\]]*\])?\{([^}]*)\}/g, "$1")
      .replace(/\\[a-zA-Z*]+/g, " ")
      .replace(/[{}]/g, " ")
  );
}

function extractLatexCommand(content: string, command: string): string | null {
  const match = content.match(
    new RegExp(`\\\\${command}(?:\\[[^\\]]*\\])?\\{([\\s\\S]*?)\\}`)
  );

  return match?.[1] ? compactWhitespace(match[1]) : null;
}

function extractLatexEnvironment(content: string, name: string): string | null {
  const match = content.match(
    new RegExp(`\\\\begin\\{${name}\\}([\\s\\S]*?)\\\\end\\{${name}\\}`)
  );

  return match?.[1] ? compactWhitespace(stripLatex(match[1])) : null;
}

function extractLatexSection(
  content: string,
  titles: string[]
): string | null {
  const matches = Array.from(
    content.matchAll(
      /\\section\*?\{([^}]*)\}([\s\S]*?)(?=\\section\*?\{|\\end\{document\}|$)/g
    )
  );

  for (const match of matches) {
    const title = compactWhitespace((match[1] ?? "").toLowerCase());
    if (titles.some((candidate) => title.includes(candidate))) {
      return compactWhitespace(stripLatex(match[2] ?? ""));
    }
  }

  return null;
}

function buildMainTexContext(content: string): string {
  const title = extractLatexCommand(content, "title");
  const abstract = extractLatexEnvironment(content, "abstract");
  const introduction = extractLatexSection(content, [
    "introduction",
    "overview",
    "problem",
  ]);
  const conclusion = extractLatexSection(content, [
    "conclusion",
    "discussion",
    "future work",
  ]);

  const parts = [
    title ? `Title: ${title}` : "",
    abstract ? `Abstract:\n${abstract}` : "",
    introduction ? `Introduction:\n${introduction}` : "",
    conclusion ? `Conclusion:\n${conclusion}` : "",
  ].filter(Boolean);

  const fallback = parts.length > 0 ? parts.join("\n\n") : stripLatex(content);
  return truncate(fallback, MAX_MAIN_TEX_CHARS);
}

function buildGenericFileContext(file: ProjectFile): string | null {
  if (!file.content?.trim()) {
    return null;
  }

  if (file.name === "main.tex") {
    return buildMainTexContext(file.content);
  }

  return truncate(compactWhitespace(file.content), MAX_EXTRA_FILE_CHARS);
}

function isRootTextFile(file: ProjectFile): boolean {
  return (
    file.type === "file" &&
    (file.parentId === null || file.parentId === undefined) &&
    /\.(md|txt|tex)$/i.test(file.name) &&
    !file.name.endsWith(".bib")
  );
}

function buildRecentUserContext(projectId: string): string | null {
  const conversations = dbOps.getConversationsByProject(projectId).slice(0, 2);
  const messages = conversations.flatMap((conversation) =>
    dbOps
      .getRecentMessages(conversation._id, 8)
      .filter((message) => message.role === "user" && message.content.trim() !== "")
      .map((message) => compactWhitespace(message.content))
  );

  if (messages.length === 0) {
    return null;
  }

  return truncate(messages.slice(-6).join("\n- "), MAX_USER_MESSAGE_CHARS);
}

export function buildProjectRelevanceContext(projectId: string): string {
  const project = dbOps.getProjectById(projectId);
  const files = dbOps.getFiles(projectId).filter(isRootTextFile);
  const notesFile = files.find((file) => file.name === "notes.md");
  const mainTexFile = files.find((file) => file.name === "main.tex");
  const extraFiles = files.filter(
    (file) => file.name !== "notes.md" && file.name !== "main.tex"
  );

  const sections = [
    project?.name ? `Project: ${project.name}` : "Project context",
  ];

  if (notesFile?.content?.trim()) {
    sections.push(
      `notes.md:\n${truncate(compactWhitespace(notesFile.content), MAX_NOTES_CHARS)}`
    );
  }

  if (mainTexFile?.content?.trim()) {
    sections.push(`main.tex:\n${buildMainTexContext(mainTexFile.content)}`);
  }

  extraFiles
    .slice(0, 3)
    .map((file) => {
      const content = buildGenericFileContext(file);
      return content ? `${file.name}:\n${content}` : null;
    })
    .filter(Boolean)
    .forEach((section) => {
      sections.push(section as string);
    });

  const recentUserContext = buildRecentUserContext(projectId);
  if (recentUserContext) {
    sections.push(`Recent user messages:\n- ${recentUserContext}`);
  }

  const context = compactWhitespace(sections.join("\n\n"));
  return truncate(context, MAX_CONTEXT_CHARS);
}
