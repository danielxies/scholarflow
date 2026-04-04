import fs from "fs";
import path from "path";

const SKILLS_DIR = path.resolve(process.cwd(), "data/skills");

// Directories at the top level that are not skill categories
const IGNORED_DIRS = new Set([
  "anthropic_official_docs",
  "dev_data",
  "docs",
  "demos",
  "packages",
]);

export interface SkillMetadata {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  license: string;
  tags: string[];
  dependencies: string[];
  category: string;
  categoryNumber: number;
  categoryName: string;
  contentPath: string;
}

export interface SkillContent extends SkillMetadata {
  content: string;
  references: string[];
}

interface ParsedFrontmatter {
  metadata: Record<string, unknown>;
  body: string;
}

/**
 * Parse YAML frontmatter from a raw SKILL.md string.
 * Expects the file to start with `---` followed by YAML, closed by `---`.
 */
export function parseFrontmatter(raw: string): ParsedFrontmatter {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);

  if (!match) {
    return { metadata: {}, body: raw };
  }

  const yamlBlock = match[1];
  const body = match[2];

  const metadata: Record<string, unknown> = {};

  for (const line of yamlBlock.split("\n")) {
    const kvMatch = line.match(/^(\w[\w-]*)\s*:\s*(.+)$/);
    if (!kvMatch) continue;

    const key = kvMatch[1];
    let value: unknown = kvMatch[2].trim();

    // Parse YAML arrays: [item1, item2, item3]
    if (typeof value === "string" && value.startsWith("[") && value.endsWith("]")) {
      const inner = value.slice(1, -1);
      value = inner
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }

    metadata[key] = value;
  }

  return { metadata, body };
}

/**
 * Parse a category directory name like "03-fine-tuning" into its number and
 * human-readable name.
 */
function parseCategoryDir(dirName: string): {
  categoryNumber: number;
  categoryName: string;
} {
  const match = dirName.match(/^(\d+)-(.+)$/);
  if (!match) {
    return { categoryNumber: 0, categoryName: dirName };
  }

  const categoryNumber = parseInt(match[1], 10);
  const rawName = match[2];

  // Convert kebab-case to Title-Case, preserving hyphens as spaces
  const categoryName = rawName
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

  // Re-insert hyphens for multi-word compound names that are commonly hyphenated
  // e.g. "Fine Tuning" -> "Fine-Tuning", "Post Training" -> "Post-Training"
  const hyphenatedName = categoryName.replace(
    /\b(Fine|Post|Multi|Pre|Self|Semi|Re)\s/g,
    "$1-"
  );

  return { categoryNumber, categoryName: hyphenatedName };
}

/**
 * Build a SkillMetadata object from a parsed frontmatter and location info.
 */
function buildSkillMetadata(
  id: string,
  category: string,
  contentPath: string,
  metadata: Record<string, unknown>
): SkillMetadata {
  const { categoryNumber, categoryName } = parseCategoryDir(category);

  const asStringArray = (val: unknown): string[] => {
    if (Array.isArray(val)) return val.map(String);
    return [];
  };

  return {
    id,
    name: String(metadata.name ?? id),
    description: String(metadata.description ?? ""),
    version: String(metadata.version ?? "0.0.0"),
    author: String(metadata.author ?? ""),
    license: String(metadata.license ?? ""),
    tags: asStringArray(metadata.tags),
    dependencies: asStringArray(metadata.dependencies),
    category,
    categoryNumber,
    categoryName,
    contentPath,
  };
}

// Module-level cache
let cachedSkills: SkillMetadata[] | null = null;

/**
 * Scan the skills directory recursively and return metadata for every skill.
 * Results are cached in a module-level variable for the lifetime of the process.
 */
export function getAllSkills(): SkillMetadata[] {
  if (cachedSkills) return cachedSkills;

  const skills: SkillMetadata[] = [];

  let topLevelEntries: string[];
  try {
    topLevelEntries = fs.readdirSync(SKILLS_DIR);
  } catch {
    cachedSkills = [];
    return [];
  }

  for (const entry of topLevelEntries) {
    // Skip non-directories and ignored directories
    if (IGNORED_DIRS.has(entry)) continue;

    const entryPath = path.join(SKILLS_DIR, entry);
    if (!fs.statSync(entryPath).isDirectory()) continue;

    // Skip directories that don't match the numbered category pattern
    if (!/^\d+-.+$/.test(entry)) continue;

    // Check if SKILL.md exists directly in the category dir (e.g. 0-autoresearch-skill/SKILL.md)
    const directSkillPath = path.join(entryPath, "SKILL.md");
    if (fs.existsSync(directSkillPath)) {
      // Check if there are subdirectories that are skills themselves
      const subEntries = fs.readdirSync(entryPath);
      const hasSubSkills = subEntries.some((sub) => {
        const subPath = path.join(entryPath, sub);
        return (
          fs.statSync(subPath).isDirectory() &&
          fs.existsSync(path.join(subPath, "SKILL.md"))
        );
      });

      if (!hasSubSkills) {
        // This category IS a skill (e.g. 0-autoresearch-skill)
        const raw = fs.readFileSync(directSkillPath, "utf-8");
        const { metadata } = parseFrontmatter(raw);
        const id = entry.replace(/^\d+-/, "");
        skills.push(buildSkillMetadata(id, entry, directSkillPath, metadata));
        continue;
      }
    }

    // Standard pattern: category dir containing skill subdirectories
    const subEntries = fs.readdirSync(entryPath);

    for (const sub of subEntries) {
      const subPath = path.join(entryPath, sub);
      if (!fs.statSync(subPath).isDirectory()) continue;

      const skillMdPath = path.join(subPath, "SKILL.md");
      if (!fs.existsSync(skillMdPath)) continue;

      const raw = fs.readFileSync(skillMdPath, "utf-8");
      const { metadata } = parseFrontmatter(raw);
      skills.push(buildSkillMetadata(sub, entry, skillMdPath, metadata));
    }
  }

  // Sort by category number, then by name
  skills.sort((a, b) => {
    if (a.categoryNumber !== b.categoryNumber)
      return a.categoryNumber - b.categoryNumber;
    return a.name.localeCompare(b.name);
  });

  cachedSkills = skills;
  return skills;
}

/**
 * Return full content for a specific skill, including the markdown body and
 * a list of reference file names.
 */
export function getSkillContent(skillId: string): SkillContent | null {
  const skills = getAllSkills();
  const skill = skills.find((s) => s.id === skillId);

  if (!skill) return null;

  const raw = fs.readFileSync(skill.contentPath, "utf-8");
  const { body } = parseFrontmatter(raw);

  // Collect reference file names
  const references: string[] = [];
  const refsDir = path.join(path.dirname(skill.contentPath), "references");

  if (fs.existsSync(refsDir) && fs.statSync(refsDir).isDirectory()) {
    const refEntries = fs.readdirSync(refsDir);
    for (const refEntry of refEntries) {
      const refPath = path.join(refsDir, refEntry);
      if (fs.statSync(refPath).isFile()) {
        references.push(refEntry);
      }
    }
  }

  return {
    ...skill,
    content: body,
    references,
  };
}

/**
 * Group all skills by their category directory name.
 */
export function getSkillsByCategory(): Record<string, SkillMetadata[]> {
  const skills = getAllSkills();
  const grouped: Record<string, SkillMetadata[]> = {};

  for (const skill of skills) {
    if (!grouped[skill.category]) {
      grouped[skill.category] = [];
    }
    grouped[skill.category].push(skill);
  }

  return grouped;
}

/**
 * Search skills by keyword, matching against name, description, tags, and
 * category name. Case-insensitive.
 */
export function searchSkills(query: string): SkillMetadata[] {
  const skills = getAllSkills();
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);

  if (terms.length === 0) return skills;

  return skills.filter((skill) => {
    const searchable = [
      skill.name,
      skill.description,
      skill.categoryName,
      skill.category,
      ...skill.tags,
    ]
      .join(" ")
      .toLowerCase();

    return terms.every((term) => searchable.includes(term));
  });
}

/**
 * Concatenate truncated SKILL.md bodies for the given skill IDs, suitable for
 * injecting as context into an LLM prompt.
 */
export function buildSkillsContext(
  skillIds: string[],
  maxLines: number = 150
): string {
  const parts: string[] = [];

  for (const id of skillIds) {
    const skill = getSkillContent(id);
    if (!skill) continue;

    const lines = skill.content.split("\n");
    const truncated = lines.slice(0, maxLines).join("\n");
    const suffix = lines.length > maxLines ? "\n\n[... truncated]" : "";

    parts.push(
      `## Skill: ${skill.name} (${skill.category})\n\n${truncated}${suffix}`
    );
  }

  return parts.join("\n\n---\n\n");
}
