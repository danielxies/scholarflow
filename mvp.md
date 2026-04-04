# ScholarFlow — Cursor for Academic Research

## Hackathon Submission: Best Automation Project

> **One-liner pitch:** ScholarFlow automates the entire academic paper writing workflow — literature discovery, citation management, LaTeX editing, and AI-assisted drafting — in a single browser-based IDE that professors actually want to use.

---

## 1. Base Framework: Polaris (Code With Antonio's Cursor Clone)

**Repo:** `https://github.com/code-with-antonio/polaris`

**Video tutorial:** `https://youtu.be/Xf9rHPNBMyQ`

### Tech Stack (inherited from Polaris)

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS 4 | App framework |
| Editor | CodeMirror 6 + custom extensions | Code/LaTeX editing |
| Backend DB | Convex (real-time) | File storage, conversations, projects |
| Background Jobs | Inngest | Non-blocking AI tasks |
| AI | Claude Sonnet 4 (Anthropic API) | All AI features |
| Auth | Clerk (GitHub OAuth) | User auth |
| UI Components | shadcn/ui, Radix UI | Polished UI |

### What we keep from Polaris
- ✅ Project IDE layout (3-panel: sidebar, editor, chat)
- ✅ File explorer (full tree with create/rename/delete)
- ✅ CodeMirror 6 editor (syntax highlighting, minimap, folding)
- ✅ AI conversation sidebar (message history, streaming)
- ✅ AI suggestion system (ghost text, Cmd+K quick edit)
- ✅ Convex real-time database layer
- ✅ Inngest background job processing
- ✅ Clerk authentication
- ✅ Tab-based file navigation
- ✅ shadcn/ui component library

### What we change / add
- 🔄 **Code editor → LaTeX editor** (swap syntax highlighting to LaTeX mode)
- 🔄 **Code preview → PDF preview** (swap WebContainer for LaTeX→PDF rendering)
- 🔄 **Code suggestions → Writing suggestions** (academic prose, not code)
- ➕ **Paper search tool** (Semantic Scholar API integration)
- ➕ **Literature review agent** (summarize papers, find gaps)
- ➕ **Auto-citation tool** (insert `\cite{}` + update `.bib` file)
- ➕ **Section drafting tool** (generate LaTeX for intro, related work, etc.)
- ➕ **Upload `.tex` ZIP** (import existing paper projects)
- ➕ **Create from idea** (AI generates full paper scaffold from a research question)

### What we remove / skip
- ❌ WebContainer (in-browser code execution) — not needed
- ❌ GitHub import/export — not needed for hackathon
- ❌ Billing/SaaS layer — not needed for hackathon
- ❌ Firecrawl integration — replace with Semantic Scholar API
- ❌ Sentry error tracking — not needed for hackathon

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      ScholarFlow IDE                         │
├──────────┬──────────────────────────┬───────────────────────┤
│  LEFT    │        CENTER            │       RIGHT           │
│          │                          │                       │
│  File    │   LaTeX Editor           │   AI Agent Chat       │
│  Tree    │   (CodeMirror 6)         │                       │
│          │                          │   - Search papers     │
│  .tex    │   ─── OR ───             │   - Summarize papers  │
│  .bib    │                          │   - Write sections    │
│  .cls    │   PDF Preview            │   - Insert citations  │
│  .sty    │   (compiled output)      │   - Review drafts     │
│          │                          │   - Create from idea  │
│          │                          │                       │
├──────────┴──────────────────────────┴───────────────────────┤
│                    Status Bar / Toolbar                       │
│  [Compile PDF] [Word Count] [Citation Count] [AI Credits]    │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Feature Breakdown & Implementation Plan

### Feature 1: LaTeX Editor (adapt from Polaris)

**What to change in Polaris:**
- In `src/features/editor/extensions/` — swap the JavaScript/TypeScript CodeMirror language modes for LaTeX
- Install `@codemirror/lang-latex` or use `@codemirror/legacy-modes` with StreamLanguage for LaTeX
- Keep: line numbers, minimap, bracket matching, code folding, auto-save
- Add: LaTeX-specific snippets (begin/end environment, section, figure, table)

**CodeMirror LaTeX setup:**
```typescript
import { StreamLanguage } from "@codemirror/language";
import { stex } from "@codemirror/legacy-modes/mode/stex";

const latexLanguage = StreamLanguage.define(stex);
```

**Key files to modify:**
- `src/features/editor/extensions/` — add LaTeX language support
- `src/features/editor/` — update editor config defaults

### Feature 2: PDF Preview (replace WebContainer)

**Options (pick one):**

| Approach | Pros | Cons |
|----------|------|------|
| **Server-side pdflatex** | Real compilation, handles all LaTeX | Needs TeX Live installed on server |
| **latex.js (client-side)** | No server needed, instant preview | Limited LaTeX support |
| **Overleaf CLSI (if available)** | Full compilation | May not be publicly available |
| **SwiftLaTeX (WASM)** | Client-side, decent coverage | Large WASM bundle |

**Recommended approach for hackathon: Server-side pdflatex via API route**

```
User clicks "Compile" 
  → POST /api/compile with .tex + .bib content
  → Server writes temp files, runs `pdflatex` + `bibtex` + `pdflatex` x2
  → Returns compiled PDF as blob
  → Frontend renders in <iframe> or react-pdf
```

**Implementation:**
- Create `src/app/api/compile/route.ts`
- Use `child_process.exec` to run pdflatex
- Need TeX Live installed on deploy server (or use a Docker container)
- For Vercel deploy: use a serverless function with a TeX Live layer, OR use an external compilation service like `https://latexonline.cc/` API

**Simpler alternative for demo:** Use `latex.js` for client-side rendering (limited but looks good):
```bash
npm install latex.js
```

**Display PDF:**
```bash
npm install react-pdf
# or just use an iframe with the PDF blob URL
```

### Feature 3: AI Agent Tools (the core automation)

This is where we differentiate. The AI chat panel (already built in Polaris as the conversation sidebar) gets new **tools** that the Claude agent can call.

**Polaris already has:** conversation system, message streaming, AI agent architecture with tool calling via Inngest background jobs.

**We add these tools:**

#### Tool 1: `search_papers`
```typescript
{
  name: "search_papers",
  description: "Search for academic papers on Semantic Scholar",
  parameters: {
    query: string,        // search query
    year_range?: string,  // e.g. "2020-2024"
    limit?: number        // max results (default 10)
  }
}
```
**Implementation:** Hit `https://api.semanticscholar.org/graph/v1/paper/search?query=...&fields=title,abstract,authors,year,citationCount,url,externalIds`

#### Tool 2: `summarize_paper`
```typescript
{
  name: "summarize_paper",
  description: "Get detailed summary of a specific paper",
  parameters: {
    paper_id: string,     // Semantic Scholar paper ID
    focus?: string        // what aspect to focus on
  }
}
```
**Implementation:** Fetch paper details from Semantic Scholar, pass abstract + metadata to Claude for summary.

#### Tool 3: `write_section`
```typescript
{
  name: "write_section",
  description: "Draft a LaTeX section for the paper",
  parameters: {
    section_type: "introduction" | "related_work" | "methodology" | "results" | "conclusion" | "abstract" | "custom",
    topic: string,
    context?: string,     // additional context from user
    papers?: string[],    // paper IDs to reference
    style?: string        // writing style notes
  }
}
```
**Implementation:** Claude generates LaTeX with `\cite{}` references based on the papers found.

#### Tool 4: `insert_citation`
```typescript
{
  name: "insert_citation",
  description: "Add a citation to the paper and update the .bib file",
  parameters: {
    paper_id: string,     // Semantic Scholar paper ID
    cite_key?: string     // custom citation key
  }
}
```
**Implementation:**
1. Fetch paper metadata from Semantic Scholar
2. Generate BibTeX entry
3. Append to the project's `.bib` file (via Convex mutation)
4. Return `\cite{key}` for the user to insert

#### Tool 5: `review_draft`
```typescript
{
  name: "review_draft",
  description: "Review and provide feedback on the current paper draft",
  parameters: {
    focus?: "clarity" | "structure" | "citations" | "methodology" | "grammar" | "all"
  }
}
```
**Implementation:** Read all `.tex` files in the project, send to Claude with academic review prompt.

#### Tool 6: `create_project_from_idea`
```typescript
{
  name: "create_project_from_idea",
  description: "Generate a full paper scaffold from a research idea",
  parameters: {
    idea: string,
    paper_type?: "conference" | "journal" | "workshop" | "thesis",
    template?: "acm" | "ieee" | "neurips" | "arxiv" | "custom"
  }
}
```
**Implementation:**
1. Claude generates a paper outline
2. Creates `main.tex` with proper template/class
3. Creates `references.bib` (empty or with seed papers)
4. Creates section files if using `\input{}`
5. All saved to Convex

### Feature 4: Upload .tex ZIP

**New feature not in Polaris.** Allow professors to upload an existing paper project.

**Implementation:**
- Add upload button in project creation flow
- Accept `.zip` file containing `.tex`, `.bib`, `.cls`, `.sty`, images
- Extract files, create project in Convex
- Map file tree to the file explorer

```typescript
// src/app/api/upload/route.ts
import JSZip from 'jszip';

export async function POST(req: Request) {
  const formData = await req.formData();
  const file = formData.get('file') as File;
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  // Extract and create files in Convex...
}
```

---

## 4. Semantic Scholar API Reference

**Base URL:** `https://api.semanticscholar.org/graph/v1`

**No auth required** for basic usage (rate limited to 100 req/5 min).
For higher limits, request an API key at `https://www.semanticscholar.org/product/api`.

### Key Endpoints

**Search papers:**
```
GET /paper/search?query=transformer+attention&limit=10&fields=title,abstract,authors,year,citationCount,url,externalIds,tldr
```

**Get paper details:**
```
GET /paper/{paper_id}?fields=title,abstract,authors,year,citationCount,references,citations,tldr,externalIds
```

**Get BibTeX (via external IDs):**
Use the `externalIds.DOI` to fetch BibTeX from `https://doi.org/{doi}` with `Accept: application/x-bibtex` header.

---

## 5. Step-by-Step Build Order

### Phase 0: Clone & Strip (30 min)
1. `git clone https://github.com/code-with-antonio/polaris.git scholarflow`
2. `cd scholarflow && npm install`
3. Remove WebContainer-related code (`src/features/preview/`)
4. Remove GitHub integration code
5. Remove billing/stripe code
6. Remove Firecrawl integration
7. Remove Sentry (optional — can keep for debugging)
8. Update branding: "Polaris" → "ScholarFlow" everywhere
9. Set up `.env.local` with Clerk + Convex + Anthropic keys
10. Verify it runs: `npx convex dev` + `npm run dev` + `npx inngest-cli@latest dev`

### Phase 1: LaTeX Editor (1-2 hours)
1. Install LaTeX CodeMirror mode
2. Swap language extensions in editor config
3. Add LaTeX snippets (optional but nice for demo)
4. Add `.tex` and `.bib` to file icon mapping
5. Test: create a project, add a `.tex` file, verify syntax highlighting

### Phase 2: PDF Preview (2-3 hours)
1. Create `/api/compile` route
2. Set up TeX Live on your dev machine (or use latex.js for client-side)
3. Replace the WebContainer preview panel with PDF viewer
4. Add "Compile" button in toolbar
5. Wire up: edit .tex → click compile → see PDF
6. Test: compile a simple LaTeX doc

### Phase 3: AI Tools - Paper Search (1-2 hours)
1. Create Semantic Scholar API utility (`src/lib/semantic-scholar.ts`)
2. Add `search_papers` tool to the AI agent tool definitions
3. Render paper search results in the chat UI (title, authors, year, citation count, abstract snippet)
4. Add "Cite this" button on each search result
5. Test: ask AI to find papers about "transformer attention mechanisms"

### Phase 4: AI Tools - Citation Management (1-2 hours)
1. Add `insert_citation` tool
2. Implement BibTeX generation from Semantic Scholar metadata
3. Wire up: AI inserts `\cite{key}` + appends BibTeX entry to `.bib`
4. Test: ask AI to cite a paper, verify .bib updates

### Phase 5: AI Tools - Writing Assistant (1-2 hours)
1. Add `write_section` tool
2. Implement with strong LaTeX-specific system prompt
3. Wire up: AI generates LaTeX, inserts into current file
4. Add `review_draft` tool
5. Test: ask AI to write an introduction about your topic

### Phase 6: Project Creation (1-2 hours)
1. Add `create_project_from_idea` tool/flow
2. Add ZIP upload for existing projects
3. Add template selection (ACM, IEEE, NeurIPS, plain)
4. Include pre-built LaTeX templates as defaults
5. Test: create a project from scratch with AI

### Phase 7: Polish & Demo Prep (1-2 hours)
1. Update landing page with ScholarFlow branding
2. Add demo project with a sample paper
3. Prepare demo script (see below)
4. Deploy to Vercel
5. Test the full flow end-to-end

---

## 6. Demo Script (for hackathon judges)

**Target audience:** Professor judges who write papers

### Demo Flow (5 minutes)

1. **"Let me show you how professors write papers today"** (10 sec)
   - Open Overleaf in one tab, Google Scholar in another, Zotero in a third
   - "Three tools, constant tab-switching, manual copy-paste of citations"

2. **"Now let me show you ScholarFlow"** (10 sec)
   - Open ScholarFlow, show the clean IDE layout

3. **"Start from an idea"** (45 sec)
   - Type in chat: "I want to write a paper about using LLMs for automated code review"
   - AI creates project scaffold with proper LaTeX template
   - Show the generated file tree: main.tex, references.bib, sections/

4. **"AI-powered literature review"** (60 sec)
   - Ask chat: "Find me the top 10 most cited papers about LLM code review from the last 3 years"
   - Show papers appearing in chat with titles, authors, citation counts
   - Click "Cite" on a couple papers → .bib file updates in real-time

5. **"Write with AI assistance"** (60 sec)
   - Ask: "Write me a related work section based on the papers we found"
   - AI generates LaTeX with proper `\cite{}` references
   - Content appears in the editor
   - Hit Cmd+K on a paragraph: "Make this more concise" → inline edit

6. **"Compile and see results"** (30 sec)
   - Click "Compile PDF"
   - PDF renders in the preview pane with proper citations and bibliography

7. **"This is the automation"** (30 sec)
   - "What used to take hours — finding papers, formatting citations, writing BibTeX entries, compiling — now happens in one place with AI assistance"
   - "Every professor, grad student, and researcher can use this"

---

## 7. Key Files to Modify in Polaris

```
src/
├── app/
│   ├── api/
│   │   ├── compile/route.ts          ← NEW: LaTeX compilation endpoint
│   │   ├── messages/route.ts         ← MODIFY: add new AI tools
│   │   ├── suggestion/route.ts       ← MODIFY: academic writing suggestions
│   │   └── quick-edit/route.ts       ← KEEP: works for LaTeX too
│   └── projects/
│       └── [projectId]/              ← MODIFY: update IDE layout
├── features/
│   ├── editor/
│   │   └── extensions/               ← MODIFY: swap to LaTeX language
│   ├── preview/                      ← REPLACE: WebContainer → PDF viewer
│   ├── conversations/                ← MODIFY: add tool result rendering
│   └── projects/                     ← MODIFY: add template selection
├── lib/
│   ├── semantic-scholar.ts           ← NEW: Semantic Scholar API client
│   ├── bibtex.ts                     ← NEW: BibTeX generation utilities
│   └── latex-templates.ts            ← NEW: paper templates (ACM, IEEE, etc.)
└── components/
    └── ai-elements/                  ← MODIFY: render paper search results

convex/
├── schema.ts                         ← MODIFY: add paper/citation fields
├── files.ts                          ← KEEP: file operations work as-is
└── conversations.ts                  ← KEEP: conversation ops work as-is
```

---

## 8. Environment Variables Needed

```env
# Clerk (auth)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=

# Convex (database)
NEXT_PUBLIC_CONVEX_URL=
CONVEX_DEPLOYMENT=
POLARIS_CONVEX_INTERNAL_KEY=

# Anthropic (AI)
ANTHROPIC_API_KEY=

# Semantic Scholar (optional, for higher rate limits)
SEMANTIC_SCHOLAR_API_KEY=
```

---

## 9. Deployment Notes

**For Vercel:**
- The Next.js app deploys fine to Vercel
- Convex runs as a separate service (free tier is enough)
- Inngest has a Vercel integration
- **Challenge:** TeX Live is ~4GB and won't fit in a Vercel serverless function
  - **Solution A:** Use `latex.js` for client-side rendering (limited but works for demo)
  - **Solution B:** Use an external LaTeX compilation API
  - **Solution C:** Deploy the compile endpoint on a separate server (Railway/Render with Docker + TeX Live)

**For Docker (recommended for full TeX support):**
```dockerfile
FROM node:20-slim
RUN apt-get update && apt-get install -y texlive-full
# ... rest of your app setup
```

---

## 10. Why This Wins "Best Automation"

| Manual Process | ScholarFlow Automation |
|---|---|
| Google Scholar → copy title → search BibTeX → paste into .bib | "Find papers about X" → one-click cite |
| Read 20 papers, take notes, write related work manually | "Summarize these papers and write related work" |
| Switch between Overleaf, Zotero, Google Scholar constantly | Everything in one IDE |
| Manually format BibTeX entries | Auto-generated from Semantic Scholar metadata |
| Run pdflatex locally or wait for Overleaf compile | One-click compile in the IDE |
| Start paper from scratch, copy template | "Create a NeurIPS paper about X" → full scaffold |

**The judges are professors. They live this pain every day. This is the demo that makes them say "I want this."**
