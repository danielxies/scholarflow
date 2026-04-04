interface CitationAuthor {
  name: string;
}

export interface CitationPaper {
  title: string;
  authors: CitationAuthor[];
  year: number | null;
  venue: string | null;
  doi: string | null;
  url: string | null;
  publicationType?: string | null;
}

/**
 * Generate a citation key from paper metadata.
 * Format: firstAuthorLastName + year (e.g., "vaswani2017")
 */
export function generateCiteKey(paper: CitationPaper): string {
  const firstAuthor = paper.authors?.[0]?.name ?? "unknown";
  const lastName = firstAuthor.split(" ").pop()?.toLowerCase() ?? "unknown";
  const year = paper.year ?? "nd";
  // Remove non-alphanumeric characters
  const cleanName = lastName.replace(/[^a-z0-9]/g, "");
  return `${cleanName}${year}`;
}

/**
 * Generate a BibTeX entry from paper metadata.
 */
export function generateBibtexEntry(
  paper: CitationPaper,
  citeKey?: string
): string {
  const key = citeKey ?? generateCiteKey(paper);
  const authors = paper.authors?.map((a) => a.name).join(" and ") ?? "Unknown";
  const title = paper.title ?? "Untitled";
  const year = paper.year ?? "";
  const venue = paper.venue ?? "";
  const doi = paper.doi ?? "";
  const entryType =
    paper.publicationType === "book" ? "book" : "inproceedings";

  const fields: string[] = [
    `  author    = {${authors}}`,
    `  title     = {${title}}`,
    `  year      = {${year}}`,
  ];

  if (venue) {
    fields.push(`  booktitle = {${venue}}`);
  }

  if (doi) {
    fields.push(`  doi       = {${doi}}`);
  }

  if (paper.url) {
    fields.push(`  url       = {${paper.url}}`);
  }

  return `@${entryType}{${key},\n${fields.join(",\n")}\n}`;
}

export async function fetchBibtex(doi: string): Promise<string | null> {
  try {
    const res = await fetch(`https://doi.org/${doi}`, {
      headers: { Accept: "application/x-bibtex" },
      redirect: "follow",
    });

    if (!res.ok) {
      return null;
    }

    return res.text();
  } catch {
    return null;
  }
}

/**
 * Check if a cite key already exists in a .bib file content.
 */
export function citeKeyExists(bibContent: string, citeKey: string): boolean {
  const regex = new RegExp(`@\\w+\\{${escapeRegex(citeKey)},`, "m");
  return regex.test(bibContent);
}

/**
 * Append a BibTeX entry to existing .bib content.
 */
export function appendBibtexEntry(
  existingBib: string,
  newEntry: string
): string {
  const trimmed = existingBib.trimEnd();
  if (trimmed.length === 0) return newEntry + "\n";
  return trimmed + "\n\n" + newEntry + "\n";
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
