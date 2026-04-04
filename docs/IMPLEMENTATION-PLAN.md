# ScholarFlow Research Platform -- Implementation Plan

**Date**: 2026-04-03
**Scope**: Add research skills, experiment planning, literature synthesis, and autoresearch agent on top of existing ScholarFlow codebase. No billing.
**Codebase**: Next.js 16 + SQLite (better-sqlite3) + Inngest + Claude API + CodeMirror 6 + Clerk auth

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Database Changes (SQLite)](#2-database-changes-sqlite)
3. [Skills Engine](#3-skills-engine)
4. [Literature Engine Enhancements](#4-literature-engine-enhancements)
5. [Experiment Tracking System](#5-experiment-tracking-system)
6. [Autoresearch Agent](#6-autoresearch-agent)
7. [Research Memory System](#7-research-memory-system)
8. [UI Components & Pages](#8-ui-components--pages)
9. [Agent Tool Extensions](#9-agent-tool-extensions)
10. [API Routes](#10-api-routes)
11. [File-by-File Implementation Guide](#11-file-by-file-implementation-guide)
12. [Implementation Order](#12-implementation-order)

---

## 1. Architecture Overview

### Current Architecture
```
src/app/api/db/[...path]/route.ts   <-- Central DB API dispatcher
src/lib/db.ts                        <-- All SQLite operations (better-sqlite3)
src/lib/local-db/hooks.ts            <-- useLocalQuery (1s polling), useLocalMutation
src/lib/local-db/client.ts           <-- db.query() / db.mutation() wrappers
src/lib/claude-client.ts             <-- callClaude(prompt, model)
src/features/conversations/inngest/  <-- Agent loop (process-message.ts)
src/lib/semantic-scholar.ts          <-- Already integrated paper search
src/lib/bibtex.ts                    <-- Already integrated citation management
```

### What We're Adding
```
src/lib/db.ts                        <-- ADD: skills, hypotheses, experiments, research state, memory tables
src/lib/skills-loader.ts             <-- NEW: Load/parse SKILL.md files from vendored repo
src/features/skills/                 <-- NEW: Skills catalog UI
src/features/experiments/            <-- NEW: Experiment tracking UI
src/features/research/               <-- NEW: Autoresearch dashboard + memory
src/features/literature/             <-- NEW: Enhanced literature UI (search is already in agent tools)
src/features/conversations/inngest/  <-- MODIFY: Add autoresearch Inngest functions + new agent tools
data/skills/                         <-- NEW: Vendored AI-Research-SKILLs repo (markdown files)
```

### Data Flow
```
User opens project
  --> Project page now has tabs: Editor | Literature | Experiments | Skills
  --> "Skills" tab: browse/activate skills for this project
  --> "Literature" tab: search papers, build library, generate surveys
  --> "Experiments" tab: view hypotheses, experiments, findings, Karpathy plot
  --> AI chat sidebar: now context-aware of active skills + research state
  --> "Start Research" button: kicks off autoresearch Inngest pipeline
      --> bootstrap: literature survey -> hypotheses
      --> inner loop: experiment -> measure -> record (repeats)
      --> outer loop: synthesize -> decide direction (periodic)
      --> finalize: draft paper sections
```

---

## 2. Database Changes (SQLite)

All changes go in `src/lib/db.ts`. The existing pattern uses `db.prepare(SQL).run/get/all()` with `crypto.randomUUID()` for IDs.

### New Tables

Add these to the `initializeDatabase()` function (currently at ~line 30 in db.ts) inside the existing migration block:

```sql
-- Skills activated per project
CREATE TABLE IF NOT EXISTS project_skills (
  _id TEXT PRIMARY KEY,
  _creationTime INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000),
  projectId TEXT NOT NULL REFERENCES projects(_id) ON DELETE CASCADE,
  skillId TEXT NOT NULL,           -- e.g. "grpo-rl-training"
  skillName TEXT NOT NULL,         -- e.g. "GRPO RL Training"
  category TEXT NOT NULL,          -- e.g. "06-post-training"
  activatedAt INTEGER NOT NULL,
  UNIQUE(projectId, skillId)
);
CREATE INDEX IF NOT EXISTS idx_project_skills_project ON project_skills(projectId);

-- Hypotheses for a research project
CREATE TABLE IF NOT EXISTS hypotheses (
  _id TEXT PRIMARY KEY,
  _creationTime INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000),
  projectId TEXT NOT NULL REFERENCES projects(_id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'proposed'
    CHECK(status IN ('proposed','active','completed','failed','abandoned')),
  rationale TEXT NOT NULL DEFAULT '',
  expectedOutcome TEXT NOT NULL DEFAULT '',
  actualOutcome TEXT,
  priority INTEGER NOT NULL DEFAULT 0,
  createdAt INTEGER NOT NULL,
  completedAt INTEGER
);
CREATE INDEX IF NOT EXISTS idx_hypotheses_project ON hypotheses(projectId);
CREATE INDEX IF NOT EXISTS idx_hypotheses_status ON hypotheses(projectId, status);

-- Individual experiments under a hypothesis
CREATE TABLE IF NOT EXISTS experiments (
  _id TEXT PRIMARY KEY,
  _creationTime INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000),
  projectId TEXT NOT NULL REFERENCES projects(_id) ON DELETE CASCADE,
  hypothesisId TEXT NOT NULL REFERENCES hypotheses(_id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  protocol TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'planned'
    CHECK(status IN ('planned','running','completed','failed','cancelled')),
  skillsUsed TEXT NOT NULL DEFAULT '[]',   -- JSON array of skill IDs
  config TEXT NOT NULL DEFAULT '{}',        -- JSON experiment config
  results TEXT,                             -- markdown results
  metrics TEXT DEFAULT '{}',               -- JSON { metricName: number }
  logs TEXT,                               -- execution logs
  startedAt INTEGER,
  completedAt INTEGER
);
CREATE INDEX IF NOT EXISTS idx_experiments_project ON experiments(projectId);
CREATE INDEX IF NOT EXISTS idx_experiments_hypothesis ON experiments(hypothesisId);

-- Research state per project (singleton per project)
CREATE TABLE IF NOT EXISTS research_state (
  _id TEXT PRIMARY KEY,
  _creationTime INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000),
  projectId TEXT NOT NULL UNIQUE REFERENCES projects(_id) ON DELETE CASCADE,
  phase TEXT NOT NULL DEFAULT 'idle'
    CHECK(phase IN ('idle','bootstrap','inner_loop','outer_loop','finalizing','completed')),
  currentHypothesisId TEXT,
  findings TEXT NOT NULL DEFAULT '',         -- evolving findings markdown
  researchQuestion TEXT NOT NULL DEFAULT '',
  directionDecision TEXT
    CHECK(directionDecision IN ('DEEPEN','BROADEN','PIVOT','CONCLUDE', NULL)),
  experimentCount INTEGER NOT NULL DEFAULT 0,
  innerLoopCount INTEGER NOT NULL DEFAULT 0,
  outerLoopCount INTEGER NOT NULL DEFAULT 0,
  lastUpdated INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_research_state_project ON research_state(projectId);

-- Research log entries (append-only timeline)
CREATE TABLE IF NOT EXISTS research_log (
  _id TEXT PRIMARY KEY,
  _creationTime INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000),
  projectId TEXT NOT NULL REFERENCES projects(_id) ON DELETE CASCADE,
  timestamp INTEGER NOT NULL,
  action TEXT NOT NULL,              -- e.g. "hypothesis_created", "experiment_started", "direction_decided"
  phase TEXT NOT NULL,               -- current phase when log was written
  details TEXT NOT NULL,             -- markdown description
  relatedId TEXT                     -- optional hypothesisId or experimentId
);
CREATE INDEX IF NOT EXISTS idx_research_log_project ON research_log(projectId);

-- Research memory (persistent insights across sessions)
CREATE TABLE IF NOT EXISTS research_memory (
  _id TEXT PRIMARY KEY,
  _creationTime INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000),
  projectId TEXT NOT NULL REFERENCES projects(_id) ON DELETE CASCADE,
  type TEXT NOT NULL
    CHECK(type IN ('discovery','dead_end','decision','insight','context')),
  content TEXT NOT NULL,
  source TEXT,                       -- "conversation", "experiment", "literature", "autoresearch"
  pinned INTEGER NOT NULL DEFAULT 0,
  createdAt INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_research_memory_project ON research_memory(projectId);
CREATE INDEX IF NOT EXISTS idx_research_memory_type ON research_memory(projectId, type);

-- Paper library per project (enhances existing semantic scholar integration)
CREATE TABLE IF NOT EXISTS papers (
  _id TEXT PRIMARY KEY,
  _creationTime INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000),
  projectId TEXT NOT NULL REFERENCES projects(_id) ON DELETE CASCADE,
  semanticScholarId TEXT,
  arxivId TEXT,
  doi TEXT,
  title TEXT NOT NULL,
  authors TEXT NOT NULL DEFAULT '[]',  -- JSON array
  abstract TEXT,
  year INTEGER,
  venue TEXT,
  citationCount INTEGER DEFAULT 0,
  tldr TEXT,
  url TEXT,
  notes TEXT,                          -- user notes
  tags TEXT NOT NULL DEFAULT '[]',     -- JSON array of user tags
  addedAt INTEGER NOT NULL,
  UNIQUE(projectId, semanticScholarId)
);
CREATE INDEX IF NOT EXISTS idx_papers_project ON papers(projectId);
```

### New DB Operations

Add these functions to `src/lib/db.ts` following the existing patterns (e.g., `getProjects`, `createProject`, etc.):

```typescript
// ============================================================
// PROJECT SKILLS
// ============================================================

export function getProjectSkills(projectId: string) {
  return db.prepare(`
    SELECT * FROM project_skills WHERE projectId = ? ORDER BY activatedAt DESC
  `).all(projectId) as ProjectSkill[];
}

export function activateSkill(projectId: string, skillId: string, skillName: string, category: string) {
  const id = crypto.randomUUID();
  const now = Date.now();
  db.prepare(`
    INSERT OR IGNORE INTO project_skills (_id, projectId, skillId, skillName, category, activatedAt)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, projectId, skillId, skillName, category, now);
  return id;
}

export function deactivateSkill(projectId: string, skillId: string) {
  db.prepare(`DELETE FROM project_skills WHERE projectId = ? AND skillId = ?`).run(projectId, skillId);
}

// ============================================================
// HYPOTHESES
// ============================================================

export function getHypotheses(projectId: string) {
  return db.prepare(`
    SELECT * FROM hypotheses WHERE projectId = ? ORDER BY createdAt DESC
  `).all(projectId) as Hypothesis[];
}

export function getHypothesisById(id: string) {
  return db.prepare(`SELECT * FROM hypotheses WHERE _id = ?`).get(id) as Hypothesis | undefined;
}

export function createHypothesis(
  projectId: string,
  title: string,
  description: string,
  rationale: string,
  expectedOutcome: string
) {
  const id = crypto.randomUUID();
  const now = Date.now();
  db.prepare(`
    INSERT INTO hypotheses (_id, projectId, title, description, rationale, expectedOutcome, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, projectId, title, description, rationale, expectedOutcome, now);
  return id;
}

export function updateHypothesisStatus(id: string, status: string, actualOutcome?: string) {
  const completedAt = ['completed', 'failed', 'abandoned'].includes(status) ? Date.now() : null;
  db.prepare(`
    UPDATE hypotheses SET status = ?, actualOutcome = COALESCE(?, actualOutcome), completedAt = COALESCE(?, completedAt)
    WHERE _id = ?
  `).run(status, actualOutcome ?? null, completedAt, id);
}

// ============================================================
// EXPERIMENTS
// ============================================================

export function getExperiments(projectId: string) {
  return db.prepare(`
    SELECT * FROM experiments WHERE projectId = ? ORDER BY _creationTime DESC
  `).all(projectId) as Experiment[];
}

export function getExperimentsByHypothesis(hypothesisId: string) {
  return db.prepare(`
    SELECT * FROM experiments WHERE hypothesisId = ? ORDER BY _creationTime ASC
  `).all(hypothesisId) as Experiment[];
}

export function createExperiment(
  projectId: string,
  hypothesisId: string,
  name: string,
  protocol: string,
  skillsUsed: string[],
  config: Record<string, unknown>
) {
  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO experiments (_id, projectId, hypothesisId, name, protocol, skillsUsed, config)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, projectId, hypothesisId, name, protocol, JSON.stringify(skillsUsed), JSON.stringify(config));
  return id;
}

export function updateExperimentStatus(id: string, status: string) {
  const startedAt = status === 'running' ? Date.now() : null;
  const completedAt = ['completed', 'failed', 'cancelled'].includes(status) ? Date.now() : null;
  db.prepare(`
    UPDATE experiments SET status = ?,
      startedAt = COALESCE(?, startedAt),
      completedAt = COALESCE(?, completedAt)
    WHERE _id = ?
  `).run(status, startedAt, completedAt, id);
}

export function updateExperimentResults(id: string, results: string, metrics: Record<string, number>) {
  db.prepare(`
    UPDATE experiments SET results = ?, metrics = ?, status = 'completed', completedAt = ?
    WHERE _id = ?
  `).run(results, JSON.stringify(metrics), Date.now(), id);
}

// ============================================================
// RESEARCH STATE
// ============================================================

export function getResearchState(projectId: string) {
  return db.prepare(`SELECT * FROM research_state WHERE projectId = ?`).get(projectId) as ResearchState | undefined;
}

export function upsertResearchState(projectId: string, updates: Partial<ResearchState>) {
  const existing = getResearchState(projectId);
  const now = Date.now();
  if (existing) {
    const fields = Object.entries(updates)
      .filter(([k]) => k !== '_id' && k !== 'projectId')
      .map(([k]) => `${k} = ?`);
    const values = Object.entries(updates)
      .filter(([k]) => k !== '_id' && k !== 'projectId')
      .map(([, v]) => v);
    db.prepare(`
      UPDATE research_state SET ${fields.join(', ')}, lastUpdated = ? WHERE projectId = ?
    `).run(...values, now, projectId);
  } else {
    const id = crypto.randomUUID();
    db.prepare(`
      INSERT INTO research_state (_id, projectId, phase, findings, researchQuestion, lastUpdated)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, projectId, updates.phase ?? 'idle', updates.findings ?? '', updates.researchQuestion ?? '', now);
  }
}

// ============================================================
// RESEARCH LOG
// ============================================================

export function getResearchLog(projectId: string, limit = 50) {
  return db.prepare(`
    SELECT * FROM research_log WHERE projectId = ? ORDER BY timestamp DESC LIMIT ?
  `).all(projectId, limit) as ResearchLogEntry[];
}

export function addResearchLogEntry(
  projectId: string,
  action: string,
  phase: string,
  details: string,
  relatedId?: string
) {
  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO research_log (_id, projectId, timestamp, action, phase, details, relatedId)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, projectId, Date.now(), action, phase, details, relatedId ?? null);
  return id;
}

// ============================================================
// RESEARCH MEMORY
// ============================================================

export function getResearchMemory(projectId: string) {
  return db.prepare(`
    SELECT * FROM research_memory WHERE projectId = ? ORDER BY pinned DESC, createdAt DESC
  `).all(projectId) as ResearchMemoryEntry[];
}

export function getResearchMemoryByType(projectId: string, type: string) {
  return db.prepare(`
    SELECT * FROM research_memory WHERE projectId = ? AND type = ? ORDER BY createdAt DESC
  `).all(projectId, type) as ResearchMemoryEntry[];
}

export function addResearchMemory(
  projectId: string,
  type: string,
  content: string,
  source?: string
) {
  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO research_memory (_id, projectId, type, content, source, createdAt)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, projectId, type, content, source ?? null, Date.now());
  return id;
}

export function toggleMemoryPin(id: string) {
  db.prepare(`UPDATE research_memory SET pinned = 1 - pinned WHERE _id = ?`).run(id);
}

export function deleteResearchMemory(id: string) {
  db.prepare(`DELETE FROM research_memory WHERE _id = ?`).run(id);
}

// ============================================================
// PAPERS (project library)
// ============================================================

export function getProjectPapers(projectId: string) {
  return db.prepare(`
    SELECT * FROM papers WHERE projectId = ? ORDER BY addedAt DESC
  `).all(projectId) as Paper[];
}

export function addPaper(projectId: string, paper: Omit<Paper, '_id' | '_creationTime' | 'projectId'>) {
  const id = crypto.randomUUID();
  db.prepare(`
    INSERT OR IGNORE INTO papers (
      _id, projectId, semanticScholarId, arxivId, doi, title, authors,
      abstract, year, venue, citationCount, tldr, url, notes, tags, addedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, projectId, paper.semanticScholarId ?? null, paper.arxivId ?? null,
    paper.doi ?? null, paper.title, JSON.stringify(paper.authors ?? []),
    paper.abstract ?? null, paper.year ?? null, paper.venue ?? null,
    paper.citationCount ?? 0, paper.tldr ?? null, paper.url ?? null,
    paper.notes ?? null, JSON.stringify(paper.tags ?? []), paper.addedAt ?? Date.now()
  );
  return id;
}

export function updatePaperNotes(id: string, notes: string) {
  db.prepare(`UPDATE papers SET notes = ? WHERE _id = ?`).run(notes, id);
}

export function removePaper(id: string) {
  db.prepare(`DELETE FROM papers WHERE _id = ?`).run(id);
}
```

### TypeScript Types

Add to `src/lib/local-db/types.ts`:

```typescript
export interface ProjectSkill {
  _id: string;
  _creationTime: number;
  projectId: string;
  skillId: string;
  skillName: string;
  category: string;
  activatedAt: number;
}

export interface Hypothesis {
  _id: string;
  _creationTime: number;
  projectId: string;
  title: string;
  description: string;
  status: 'proposed' | 'active' | 'completed' | 'failed' | 'abandoned';
  rationale: string;
  expectedOutcome: string;
  actualOutcome: string | null;
  priority: number;
  createdAt: number;
  completedAt: number | null;
}

export interface Experiment {
  _id: string;
  _creationTime: number;
  projectId: string;
  hypothesisId: string;
  name: string;
  protocol: string;
  status: 'planned' | 'running' | 'completed' | 'failed' | 'cancelled';
  skillsUsed: string;   // JSON array
  config: string;        // JSON object
  results: string | null;
  metrics: string;       // JSON object
  logs: string | null;
  startedAt: number | null;
  completedAt: number | null;
}

export interface ResearchState {
  _id: string;
  _creationTime: number;
  projectId: string;
  phase: 'idle' | 'bootstrap' | 'inner_loop' | 'outer_loop' | 'finalizing' | 'completed';
  currentHypothesisId: string | null;
  findings: string;
  researchQuestion: string;
  directionDecision: 'DEEPEN' | 'BROADEN' | 'PIVOT' | 'CONCLUDE' | null;
  experimentCount: number;
  innerLoopCount: number;
  outerLoopCount: number;
  lastUpdated: number;
}

export interface ResearchLogEntry {
  _id: string;
  _creationTime: number;
  projectId: string;
  timestamp: number;
  action: string;
  phase: string;
  details: string;
  relatedId: string | null;
}

export interface ResearchMemoryEntry {
  _id: string;
  _creationTime: number;
  projectId: string;
  type: 'discovery' | 'dead_end' | 'decision' | 'insight' | 'context';
  content: string;
  source: string | null;
  pinned: number;  // 0 or 1
  createdAt: number;
}

export interface Paper {
  _id: string;
  _creationTime: number;
  projectId: string;
  semanticScholarId: string | null;
  arxivId: string | null;
  doi: string | null;
  title: string;
  authors: string;  // JSON array
  abstract: string | null;
  year: number | null;
  venue: string | null;
  citationCount: number;
  tldr: string | null;
  url: string | null;
  notes: string | null;
  tags: string;     // JSON array
  addedAt: number;
}
```

---

## 3. Skills Engine

### 3.1 Vendor the Skills Repo

Clone the AI-Research-SKILLs repo into the project as static data:

```bash
# One-time setup -- clone into data/skills/
git clone --depth 1 https://github.com/Orchestra-Research/AI-Research-SKILLs.git data/skills
# Remove .git to avoid submodule issues
rm -rf data/skills/.git
# Add to .gitignore if you don't want to commit 87 skills (or commit them for offline access)
```

Alternatively, fetch skills at build time via a script. The vendored approach is simpler.

### 3.2 Skills Loader (`src/lib/skills-loader.ts`)

This module reads the vendored SKILL.md files, parses YAML frontmatter, and builds an index.

```typescript
// src/lib/skills-loader.ts

import fs from 'fs';
import path from 'path';

const SKILLS_DIR = path.join(process.cwd(), 'data', 'skills', 'skills');

export interface SkillMetadata {
  id: string;              // directory name, e.g. "grpo-rl-training"
  name: string;            // from frontmatter
  description: string;
  version: string;
  author: string;
  license: string;
  tags: string[];
  dependencies: string[];
  category: string;        // parent directory, e.g. "06-post-training"
  categoryNumber: number;
  categoryName: string;    // human readable, e.g. "Post-Training"
  contentPath: string;     // absolute path to SKILL.md
}

export interface SkillContent extends SkillMetadata {
  content: string;         // full markdown body (without frontmatter)
  references: string[];    // list of reference file paths
}

// Parse YAML frontmatter from SKILL.md
function parseFrontmatter(raw: string): { metadata: Record<string, any>; body: string } {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { metadata: {}, body: raw };

  const yamlBlock = match[1];
  const body = match[2];
  const metadata: Record<string, any> = {};

  for (const line of yamlBlock.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    let value = line.slice(colonIdx + 1).trim();

    // Handle arrays: [item1, item2]
    if (value.startsWith('[') && value.endsWith(']')) {
      metadata[key] = value.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, ''));
    } else {
      metadata[key] = value.replace(/^["']|["']$/g, '');
    }
  }

  return { metadata, body };
}

// Extract category info from directory name like "06-post-training"
function parseCategory(dirName: string): { number: number; name: string } {
  const match = dirName.match(/^(\d+)-(.+)$/);
  if (!match) return { number: 99, name: dirName };
  return {
    number: parseInt(match[1]),
    name: match[2].split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
  };
}

let _skillsCache: SkillMetadata[] | null = null;

// Get all skill metadata (cached after first load)
export function getAllSkills(): SkillMetadata[] {
  if (_skillsCache) return _skillsCache;

  const skills: SkillMetadata[] = [];

  if (!fs.existsSync(SKILLS_DIR)) {
    console.warn('Skills directory not found at', SKILLS_DIR);
    return [];
  }

  const categoryDirs = fs.readdirSync(SKILLS_DIR).filter(d =>
    fs.statSync(path.join(SKILLS_DIR, d)).isDirectory()
  ).sort();

  for (const categoryDir of categoryDirs) {
    const categoryPath = path.join(SKILLS_DIR, categoryDir);
    const cat = parseCategory(categoryDir);

    const skillDirs = fs.readdirSync(categoryPath).filter(d =>
      fs.statSync(path.join(categoryPath, d)).isDirectory()
    );

    for (const skillDir of skillDirs) {
      const skillPath = path.join(categoryPath, skillDir, 'SKILL.md');
      if (!fs.existsSync(skillPath)) continue;

      const raw = fs.readFileSync(skillPath, 'utf-8');
      const { metadata } = parseFrontmatter(raw);

      skills.push({
        id: skillDir,
        name: metadata.name || skillDir,
        description: metadata.description || '',
        version: metadata.version || '1.0.0',
        author: metadata.author || 'Orchestra Research',
        license: metadata.license || 'MIT',
        tags: metadata.tags || [],
        dependencies: metadata.dependencies || [],
        category: categoryDir,
        categoryNumber: cat.number,
        categoryName: cat.name,
        contentPath: skillPath,
      });
    }
  }

  _skillsCache = skills;
  return skills;
}

// Get full skill content by ID
export function getSkillContent(skillId: string): SkillContent | null {
  const skills = getAllSkills();
  const skill = skills.find(s => s.id === skillId);
  if (!skill) return null;

  const raw = fs.readFileSync(skill.contentPath, 'utf-8');
  const { body } = parseFrontmatter(raw);

  // Find reference files
  const refDir = path.join(path.dirname(skill.contentPath), 'references');
  const references: string[] = [];
  if (fs.existsSync(refDir)) {
    references.push(...fs.readdirSync(refDir)
      .filter(f => f.endsWith('.md'))
      .map(f => path.join(refDir, f))
    );
  }

  return { ...skill, content: body, references };
}

// Get skills by category
export function getSkillsByCategory(): Record<string, SkillMetadata[]> {
  const skills = getAllSkills();
  const grouped: Record<string, SkillMetadata[]> = {};
  for (const s of skills) {
    const key = `${s.categoryNumber.toString().padStart(2, '0')}-${s.categoryName}`;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(s);
  }
  return grouped;
}

// Search skills by keyword
export function searchSkills(query: string): SkillMetadata[] {
  const q = query.toLowerCase();
  return getAllSkills().filter(s =>
    s.name.toLowerCase().includes(q) ||
    s.description.toLowerCase().includes(q) ||
    s.tags.some(t => t.toLowerCase().includes(q)) ||
    s.categoryName.toLowerCase().includes(q)
  );
}

// Build system prompt context from active skills
export function buildSkillsContext(skillIds: string[]): string {
  const parts: string[] = [];
  for (const id of skillIds) {
    const skill = getSkillContent(id);
    if (!skill) continue;
    parts.push(`## Skill: ${skill.name} (${skill.categoryName})\n\n${skill.content}`);
  }
  return parts.join('\n\n---\n\n');
}
```

### 3.3 Skills API Routes

Add to the existing `src/app/api/db/[...path]/route.ts` handler map, or create a dedicated route:

**New file: `src/app/api/skills/route.ts`**
```typescript
// GET /api/skills -- list all skills (with optional search)
// GET /api/skills?category=06-post-training -- filter by category
// GET /api/skills?q=fine-tuning -- search
```

**New file: `src/app/api/skills/[skillId]/route.ts`**
```typescript
// GET /api/skills/grpo-rl-training -- get full skill content
```

**New file: `src/app/api/projects/[projectId]/skills/route.ts`**
```typescript
// GET -- list active skills for project
// POST { skillId } -- activate skill
// DELETE { skillId } -- deactivate skill
```

### 3.4 How Skills Feed into the AI Agent

**Modify `src/features/conversations/inngest/process-message.ts`:**

In the agent loop (currently ~line 351), before building the prompt, fetch active skills and prepend their content to the system prompt:

```typescript
// After fetching conversation + messages, before the agent loop:
const projectSkills = dbOps.getProjectSkills(projectId);
const activeSkillIds = projectSkills.map(s => s.skillId);
const skillsContext = buildSkillsContext(activeSkillIds);

const researchState = dbOps.getResearchState(projectId);
const memories = dbOps.getResearchMemory(projectId);

// Build enhanced system prompt
const enhancedSystemPrompt = [
  CODING_AGENT_SYSTEM_PROMPT,
  activeSkillIds.length > 0 ? `\n\n# Active Research Skills\n\n${skillsContext}` : '',
  researchState ? `\n\n# Current Research State\nPhase: ${researchState.phase}\nQuestion: ${researchState.researchQuestion}\nFindings:\n${researchState.findings}` : '',
  memories.length > 0 ? `\n\n# Research Memory\n${memories.map(m => `- [${m.type}] ${m.content}`).join('\n')}` : '',
].join('');
```

---

## 4. Literature Engine Enhancements

The codebase already has `src/lib/semantic-scholar.ts` with `searchPapers()` and `getPaper()`, and the agent already has `searchPapers` and `summarizePaper` tools. We need to add:

### 4.1 Paper Library UI

Papers are already searchable via the agent chat. The enhancement is a dedicated UI for browsing and managing the project's paper library.

**New files:**
```
src/features/literature/
  components/
    literature-view.tsx          # Main literature tab content
    paper-search.tsx             # Search bar + results
    paper-card.tsx               # Paper preview card
    paper-detail-dialog.tsx      # Full paper details modal
    paper-library.tsx            # Project's saved papers
    literature-survey.tsx        # Generated survey view
  hooks/
    use-papers.ts                # useLocalQuery/Mutation for papers table
    use-paper-search.ts          # Client-side search via /api/papers/search
```

### 4.2 Literature Survey Generation

**New Inngest function: `src/features/literature/inngest/generate-survey.ts`**

Takes all papers in a project's library, feeds their abstracts + TLDRs to Claude, asks for a literature survey markdown document. Stores result in the project's files as `literature-survey.md`.

### 4.3 New API Routes

**`src/app/api/papers/search/route.ts`** -- Proxy to Semantic Scholar (already exists as agent tool, now exposed as API)

**Add to DB API dispatcher** -- CRUD for `papers` table:
- `papers.getByProject` -> `dbOps.getProjectPapers(projectId)`
- `papers.add` -> `dbOps.addPaper(projectId, paper)`
- `papers.updateNotes` -> `dbOps.updatePaperNotes(id, notes)`
- `papers.remove` -> `dbOps.removePaper(id)`

---

## 5. Experiment Tracking System

### 5.1 UI Components

```
src/features/experiments/
  components/
    experiments-view.tsx         # Main experiments tab content
    hypothesis-board.tsx         # Kanban-style board: proposed | active | completed | failed
    hypothesis-card.tsx          # Individual hypothesis with expand/collapse
    hypothesis-create-dialog.tsx # Form to create hypothesis
    experiment-list.tsx          # Experiments under a hypothesis
    experiment-card.tsx          # Individual experiment status
    experiment-detail.tsx        # Full experiment view: protocol, results, metrics
    experiment-timeline.tsx      # Chronological timeline of all experiments
    findings-panel.tsx           # Evolving findings markdown viewer
    karpathy-plot.tsx            # Recharts line chart of metrics over experiments
    research-log-view.tsx        # Append-only timeline of all research actions
  hooks/
    use-hypotheses.ts            # CRUD hooks for hypotheses table
    use-experiments.ts           # CRUD hooks for experiments table
    use-research-state.ts        # Hook for research_state singleton
    use-research-log.ts          # Hook for research_log entries
```

### 5.2 Karpathy Plot (Optimization Trajectory)

Uses `recharts` (already a dependency). Reads all experiments for the project, extracts metrics from their JSON `metrics` field, plots metric values on Y-axis vs experiment number on X-axis.

```typescript
// src/features/experiments/components/karpathy-plot.tsx
// Uses: import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
// Data: experiments sorted by startedAt, each point = { experiment: number, [metricName]: value }
```

### 5.3 Hypothesis Board

A kanban-style board (can use simple column layout, no drag library needed):

```
| Proposed      | Active        | Completed     | Failed        |
|---------------|---------------|---------------|---------------|
| Hypothesis A  | Hypothesis C  | Hypothesis B  | Hypothesis D  |
|  2 experiments|  1 running    |  3 experiments|  1 experiment |
|  [Start]      |  [View]       |  metric: 0.92 |  [Details]    |
```

### 5.4 DB API Additions

Add to `src/app/api/db/[...path]/route.ts` or `src/lib/local-db/client.ts`:

```typescript
// Queries
'hypotheses.getByProject':    (args) => dbOps.getHypotheses(args.projectId),
'hypotheses.getById':         (args) => dbOps.getHypothesisById(args.id),
'experiments.getByProject':   (args) => dbOps.getExperiments(args.projectId),
'experiments.getByHypothesis':(args) => dbOps.getExperimentsByHypothesis(args.hypothesisId),
'researchState.get':          (args) => dbOps.getResearchState(args.projectId),
'researchLog.get':            (args) => dbOps.getResearchLog(args.projectId, args.limit),
'researchMemory.get':         (args) => dbOps.getResearchMemory(args.projectId),
'researchMemory.getByType':   (args) => dbOps.getResearchMemoryByType(args.projectId, args.type),
'papers.getByProject':        (args) => dbOps.getProjectPapers(args.projectId),

// Mutations
'hypotheses.create':          (args) => dbOps.createHypothesis(args.projectId, args.title, args.description, args.rationale, args.expectedOutcome),
'hypotheses.updateStatus':    (args) => dbOps.updateHypothesisStatus(args.id, args.status, args.actualOutcome),
'experiments.create':         (args) => dbOps.createExperiment(args.projectId, args.hypothesisId, args.name, args.protocol, args.skillsUsed, args.config),
'experiments.updateStatus':   (args) => dbOps.updateExperimentStatus(args.id, args.status),
'experiments.updateResults':  (args) => dbOps.updateExperimentResults(args.id, args.results, args.metrics),
'researchState.upsert':       (args) => dbOps.upsertResearchState(args.projectId, args.updates),
'researchLog.add':            (args) => dbOps.addResearchLogEntry(args.projectId, args.action, args.phase, args.details, args.relatedId),
'researchMemory.add':         (args) => dbOps.addResearchMemory(args.projectId, args.type, args.content, args.source),
'researchMemory.togglePin':   (args) => dbOps.toggleMemoryPin(args.id),
'researchMemory.delete':      (args) => dbOps.deleteResearchMemory(args.id),
'papers.add':                 (args) => dbOps.addPaper(args.projectId, args.paper),
'papers.updateNotes':         (args) => dbOps.updatePaperNotes(args.id, args.notes),
'papers.remove':              (args) => dbOps.removePaper(args.id),
'projectSkills.get':          (args) => dbOps.getProjectSkills(args.projectId),
'projectSkills.activate':     (args) => dbOps.activateSkill(args.projectId, args.skillId, args.skillName, args.category),
'projectSkills.deactivate':   (args) => dbOps.deactivateSkill(args.projectId, args.skillId),
```

---

## 6. Autoresearch Agent

This is the core orchestration -- an Inngest-powered pipeline that runs the two-loop autoresearch cycle.

### 6.1 Event Definitions

**New file: `src/features/research/inngest/events.ts`**

```typescript
export const RESEARCH_EVENTS = {
  START: 'research/start',           // User clicks "Start Research"
  CANCEL: 'research/cancel',         // User clicks "Stop Research"
  BOOTSTRAP_COMPLETE: 'research/bootstrap-complete',
  INNER_LOOP_TICK: 'research/inner-loop-tick',
  OUTER_LOOP_TICK: 'research/outer-loop-tick',
  FINALIZE: 'research/finalize',
  DIRECTION_OVERRIDE: 'research/direction-override',  // Human intervention
};
```

### 6.2 Bootstrap Function

**New file: `src/features/research/inngest/bootstrap.ts`**

```typescript
// Inngest function: research-bootstrap
// Triggered by: research/start event
// Steps:
//   1. Set research state to "bootstrap"
//   2. Read the project's research question (from event data or research state)
//   3. Load autoresearch SKILL.md as context
//   4. Call Claude with bootstrap prompt:
//      - "Given this research question: {question}"
//      - "Search for relevant papers using the searchPapers tool"
//      - "Identify 3-5 testable hypotheses"
//      - "Define primary evaluation metric"
//      - "Output structured JSON: { hypotheses: [...], metric: string, literatureSummary: string }"
//   5. Parse response, create Hypothesis records in DB
//   6. Update research state: phase = 'inner_loop', findings = initial summary
//   7. Log entry: "bootstrap_complete"
//   8. Send research/inner-loop-tick event to start first experiment
```

### 6.3 Inner Loop Function

**New file: `src/features/research/inngest/inner-loop.ts`**

```typescript
// Inngest function: research-inner-loop
// Triggered by: research/inner-loop-tick event
// CancelOn: research/cancel event
// Steps:
//   1. Load research state, find active hypothesis (or pick highest-priority proposed one)
//   2. Load active skills for project
//   3. Call Claude with inner loop prompt:
//      - "Current hypothesis: {title} - {description}"
//      - "Previous experiments: {list with results}"
//      - "Active skills: {skill names + SKILL.md content}"
//      - "Design an experiment to test this hypothesis"
//      - "Output: { experimentName, protocol, skillsToUse, config }"
//   4. Create experiment record with status='planned', protocol logged FIRST
//   5. Log entry: "experiment_planned"
//   6. Update experiment status to 'running'
//   7. Call Claude with execution prompt:
//      - "Execute this experiment protocol: {protocol}"
//      - "Use these tools: createFiles, updateFile, etc."
//      - "Report results as: { results: string, metrics: { [name]: number } }"
//   8. Parse results, update experiment record
//   9. Update hypothesis if conclusive
//   10. Update research state: experimentCount++, innerLoopCount++
//   11. Log entry: "experiment_completed" or "experiment_failed"
//   12. Check if outer loop needed (every 3-5 inner loops):
//       - If yes: send research/outer-loop-tick
//       - If no: send research/inner-loop-tick (continue)
```

### 6.4 Outer Loop Function

**New file: `src/features/research/inngest/outer-loop.ts`**

```typescript
// Inngest function: research-outer-loop
// Triggered by: research/outer-loop-tick event
// Steps:
//   1. Load all hypotheses + experiments + research memory
//   2. Call Claude with synthesis prompt:
//      - "Review all results so far: {experiments with metrics}"
//      - "Current findings: {findings markdown}"
//      - "Research memories: {memories}"
//      - "Decide direction: DEEPEN (more experiments on current), BROADEN (new hypotheses),
//         PIVOT (abandon current direction), or CONCLUDE (ready to write paper)"
//      - "Output: { direction, updatedFindings, newHypotheses?, reasoning }"
//   3. Update research state: direction, findings, outerLoopCount++
//   4. If CONCLUDE: send research/finalize event
//   5. If PIVOT/BROADEN: create new hypotheses, abandon current
//   6. If DEEPEN: continue with current hypotheses
//   7. Send research/inner-loop-tick to continue
//   8. Log entry: "outer_loop_complete", "direction_decided"
//   9. Add research memory: insight from synthesis
```

### 6.5 Finalize Function

**New file: `src/features/research/inngest/finalize.ts`**

```typescript
// Inngest function: research-finalize
// Triggered by: research/finalize event
// Steps:
//   1. Load all findings, experiments, hypotheses, papers
//   2. Load ml-paper-writing SKILL.md for paper writing guidance
//   3. Call Claude to draft paper sections:
//      - Abstract, Introduction, Related Work, Methods, Results, Discussion, Conclusion
//   4. Create/update LaTeX files in the project
//   5. Update research state: phase = 'completed'
//   6. Log entry: "research_finalized"
//   7. Add research memory: final summary
```

### 6.6 API Route for Research Control

**New file: `src/app/api/research/route.ts`**

```typescript
// POST /api/research
// Body: { action: 'start' | 'stop' | 'override', projectId, ... }
// 'start': Send research/start event to Inngest with { projectId, researchQuestion }
// 'stop': Send research/cancel event to Inngest, update state to 'idle'
// 'override': Send research/direction-override with { projectId, direction, reason }
```

### 6.7 Register with Inngest

**Modify `src/app/api/inngest/route.ts`:**

```typescript
import { processMessage } from "@/features/conversations/inngest/process-message";
import { researchBootstrap } from "@/features/research/inngest/bootstrap";
import { researchInnerLoop } from "@/features/research/inngest/inner-loop";
import { researchOuterLoop } from "@/features/research/inngest/outer-loop";
import { researchFinalize } from "@/features/research/inngest/finalize";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    processMessage,
    researchBootstrap,
    researchInnerLoop,
    researchOuterLoop,
    researchFinalize,
  ],
});
```

---

## 7. Research Memory System

### 7.1 Auto-Extraction

The AI agent should automatically extract and save memories during:
- **Conversations**: After each completed message, check if the response contains a discovery, decision, or insight
- **Experiments**: After each experiment, save result as discovery or dead_end
- **Outer Loop**: After each synthesis, save updated understanding as insight

### 7.2 Memory Injection

Before each AI call (in process-message.ts), load relevant memories and inject them into the system prompt (already shown in section 3.4).

### 7.3 UI Components

```
src/features/research/components/
  research-memory-panel.tsx      # Sidebar panel showing all memories
  memory-card.tsx                # Individual memory with pin/delete actions
  memory-filter.tsx              # Filter by type (discovery, dead_end, insight, etc.)
```

---

## 8. UI Components & Pages

### 8.1 Project Page Tabs

**Modify `src/features/projects/components/project-id-view.tsx`:**

Currently has two views: `editor` and `preview`. Change to a tabbed layout:

```typescript
type ProjectView = 'editor' | 'literature' | 'experiments' | 'skills' | 'preview';

// Tab bar: Editor | Literature | Experiments | Skills | PDF Preview
// Each tab renders its own view component
```

### 8.2 New Tab Components

**Literature Tab (`src/features/literature/components/literature-view.tsx`):**
```
+--------------------------------------------------+
| Search Papers: [____________________] [Search]   |
|                                                   |
| Results (from Semantic Scholar)       | My Library|
| +----------------------------------+ | +--------+|
| | Paper Title 1                    | | | Paper A ||
| | Authors, Year, Venue             | | | Paper B ||
| | Abstract excerpt...              | | | Paper C ||
| | Citations: 234  [+ Add to lib]   | | |         ||
| +----------------------------------+ | |         ||
| | Paper Title 2                    | | |         ||
| | ...                              | | |         ||
| +----------------------------------+ | +--------+|
+--------------------------------------------------+
| [Generate Literature Survey from Library]         |
+--------------------------------------------------+
```

**Experiments Tab (`src/features/experiments/components/experiments-view.tsx`):**
```
+--------------------------------------------------+
| Research: [question]  Phase: inner_loop  [Stop]   |
|                                                   |
| +-- Hypotheses Board ---------------------------+|
| | Proposed  | Active    | Completed | Failed    ||
| | [H1]      | [H3]     | [H2]      | [H4]      ||
| | [H5]      |          |           |            ||
| +-----------------------------------------------+|
|                                                   |
| +-- Optimization Trajectory --------------------+|
| |  0.9 |       *                                ||
| |  0.8 |   *       *   *                        ||
| |  0.7 | *                                      ||
| |  0.6 +---+---+---+---+---                     ||
| |        E1  E2  E3  E4  E5                     ||
| +-----------------------------------------------+|
|                                                   |
| +-- Research Log --------------------------------+|
| | 10:32 - Experiment E5 completed (metric: 0.91) ||
| | 10:15 - Started experiment E5 on H3           ||
| | 09:48 - Outer loop: DEEPEN on H3              ||
| | ...                                            ||
| +-----------------------------------------------+|
|                                                   |
| +-- Findings -----------------------------------+|
| | ## Key Findings                                ||
| | 1. LoRA rank-1 outperforms full fine-tuning... ||
| | 2. Norm heterogeneity predicts...              ||
| +-----------------------------------------------+|
+--------------------------------------------------+
```

**Skills Tab (`src/features/skills/components/skills-view.tsx`):**
```
+--------------------------------------------------+
| Browse Skills  [search________________]          |
|                                                   |
| Categories: [All] [Fine-Tuning] [Post-Training]  |
|   [Interpretability] [Optimization] [Inference]   |
|   [RAG] [Agents] [Multimodal] ...                 |
|                                                   |
| +-- grpo-rl-training ------------- [+ Activate] +|
| | Group Relative Policy Optimization             ||
| | Tags: GRPO, RL, Post-Training                  ||
| | Used for: Reinforcement learning from...       ||
| +-----------------------------------------------+|
| +-- transformerlens --------------- [Activated] -+|
| | TransformerLens Interpretability               ||
| | Tags: Mechanistic Interpretability, Hooks      ||
| +-----------------------------------------------+|
| ...                                               |
+--------------------------------------------------+
```

### 8.3 Research Sidebar Enhancement

**Modify `src/features/conversations/components/conversation-sidebar.tsx`:**

Add a collapsible "Research" section above or below the conversations list:

```
+-- Sidebar --------+
| Research           |
|  Phase: inner_loop |
|  Experiments: 5    |
|  [View Dashboard]  |
|                    |
| Active Skills (3)  |
|  - GRPO Training   |
|  - TransformerLens |
|  - ML Paper Writing|
|  [Manage Skills]   |
|                    |
| Memory (12 items)  |
|  [View All]        |
|                    |
| Conversations      |
|  - Chat 1          |
|  - Chat 2          |
|  [New Chat]        |
+--------------------+
```

### 8.4 Start Research Flow

**New component: `src/features/research/components/start-research-dialog.tsx`**

A modal dialog triggered by a "Start Research" button:
1. Text area for research question
2. Skill selector (quick-add relevant skills)
3. Optional: add starting papers from library
4. "Begin Research" button -> sends `research/start` event

---

## 9. Agent Tool Extensions

### 9.1 New Tools for process-message.ts

Add these to the tool definitions in `src/features/conversations/inngest/process-message.ts` (currently at ~line 70):

```typescript
// Add to the tools description in CODING_AGENT_SYSTEM_PROMPT (constants.ts):

// Hypothesis Management
`- createHypothesis: Create a new research hypothesis. Args: { title, description, rationale, expectedOutcome }`,
`- updateHypothesisStatus: Update hypothesis status. Args: { hypothesisId, status: "proposed"|"active"|"completed"|"failed"|"abandoned", actualOutcome? }`,
`- listHypotheses: List all hypotheses for the current project. Args: {}`,

// Experiment Management
`- createExperiment: Create and plan an experiment. Args: { hypothesisId, name, protocol, skillsUsed: string[], config: {} }`,
`- updateExperimentResults: Record experiment results. Args: { experimentId, results: string, metrics: { [name]: number } }`,
`- listExperiments: List experiments. Args: { hypothesisId? }`,

// Research State
`- getResearchState: Get current research state. Args: {}`,
`- updateResearchState: Update research phase/findings. Args: { phase?, findings?, researchQuestion?, directionDecision? }`,

// Research Memory
`- addResearchMemory: Save an insight/discovery/dead_end. Args: { type: "discovery"|"dead_end"|"decision"|"insight"|"context", content, source? }`,
`- getResearchMemory: Recall research memories. Args: { type? }`,

// Research Log
`- addResearchLog: Log a research action. Args: { action, details, relatedId? }`,

// Paper Library
`- addPaperToLibrary: Save a paper to the project library. Args: { semanticScholarId?, title, authors, abstract?, year?, venue?, doi?, url? }`,
`- listLibraryPapers: List all papers in the project library. Args: {}`,
```

### 9.2 Tool Implementations

Add to the `executeTool()` function in process-message.ts:

```typescript
case 'createHypothesis':
  return dbOps.createHypothesis(
    projectId, args.title, args.description, args.rationale, args.expectedOutcome
  );

case 'updateHypothesisStatus':
  dbOps.updateHypothesisStatus(args.hypothesisId, args.status, args.actualOutcome);
  return `Hypothesis updated to ${args.status}`;

case 'listHypotheses':
  return JSON.stringify(dbOps.getHypotheses(projectId));

case 'createExperiment':
  return dbOps.createExperiment(
    projectId, args.hypothesisId, args.name, args.protocol, args.skillsUsed, args.config
  );

case 'updateExperimentResults':
  dbOps.updateExperimentResults(args.experimentId, args.results, args.metrics);
  return 'Experiment results recorded';

case 'listExperiments':
  return JSON.stringify(
    args.hypothesisId
      ? dbOps.getExperimentsByHypothesis(args.hypothesisId)
      : dbOps.getExperiments(projectId)
  );

case 'getResearchState':
  return JSON.stringify(dbOps.getResearchState(projectId) ?? { phase: 'idle' });

case 'updateResearchState':
  dbOps.upsertResearchState(projectId, args);
  return 'Research state updated';

case 'addResearchMemory':
  return dbOps.addResearchMemory(projectId, args.type, args.content, args.source);

case 'getResearchMemory':
  return JSON.stringify(
    args.type
      ? dbOps.getResearchMemoryByType(projectId, args.type)
      : dbOps.getResearchMemory(projectId)
  );

case 'addResearchLog': {
  const state = dbOps.getResearchState(projectId);
  return dbOps.addResearchLogEntry(projectId, args.action, state?.phase ?? 'idle', args.details, args.relatedId);
}

case 'addPaperToLibrary':
  return dbOps.addPaper(projectId, { ...args, addedAt: Date.now() });

case 'listLibraryPapers':
  return JSON.stringify(dbOps.getProjectPapers(projectId));
```

---

## 10. API Routes

### Summary of ALL new/modified API routes:

| Route | Method | Purpose | Handler |
|-------|--------|---------|---------|
| `/api/skills` | GET | List all available skills (with search/filter) | `skills-loader.getAllSkills()` or `searchSkills()` |
| `/api/skills/[skillId]` | GET | Get full skill content | `skills-loader.getSkillContent()` |
| `/api/skills/categories` | GET | Get skills grouped by category | `skills-loader.getSkillsByCategory()` |
| `/api/research` | POST | Start/stop/override research | Inngest event dispatch |
| `/api/papers/search` | GET | Search Semantic Scholar | `semanticScholar.searchPapers()` |
| `/api/db/[...path]` | POST | Extended with all new table operations | See section 5.4 |
| `/api/inngest` | ALL | Extended with research functions | See section 6.7 |

### New Route Files to Create

**`src/app/api/skills/route.ts`**
```typescript
import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getAllSkills, searchSkills, getSkillsByCategory } from '@/lib/skills-loader';

export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');
  const grouped = searchParams.get('grouped');

  if (query) {
    return NextResponse.json(searchSkills(query));
  }
  if (grouped === 'true') {
    return NextResponse.json(getSkillsByCategory());
  }
  return NextResponse.json(getAllSkills());
}
```

**`src/app/api/skills/[skillId]/route.ts`**
```typescript
import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getSkillContent } from '@/lib/skills-loader';

export async function GET(request: Request, { params }: { params: Promise<{ skillId: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { skillId } = await params;
  const skill = getSkillContent(skillId);
  if (!skill) return NextResponse.json({ error: 'Skill not found' }, { status: 404 });

  return NextResponse.json(skill);
}
```

**`src/app/api/research/route.ts`**
```typescript
import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { inngest } from '@/features/conversations/inngest/client';
import * as dbOps from '@/lib/db';

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { action, projectId, researchQuestion, direction, reason } = await request.json();

  switch (action) {
    case 'start':
      dbOps.upsertResearchState(projectId, {
        phase: 'bootstrap',
        researchQuestion,
      });
      await inngest.send({
        name: 'research/start',
        data: { projectId, researchQuestion, userId },
      });
      return NextResponse.json({ success: true });

    case 'stop':
      dbOps.upsertResearchState(projectId, { phase: 'idle' });
      await inngest.send({
        name: 'research/cancel',
        data: { projectId },
      });
      return NextResponse.json({ success: true });

    case 'override':
      await inngest.send({
        name: 'research/direction-override',
        data: { projectId, direction, reason },
      });
      return NextResponse.json({ success: true });

    default:
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }
}
```

**`src/app/api/papers/search/route.ts`**
```typescript
import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { searchPapers } from '@/lib/semantic-scholar';

export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q') ?? '';
  const limit = parseInt(searchParams.get('limit') ?? '10');
  const yearStart = searchParams.get('yearStart');
  const yearEnd = searchParams.get('yearEnd');

  const results = await searchPapers(query, {
    limit,
    year: yearStart && yearEnd ? `${yearStart}-${yearEnd}` : undefined,
  });

  return NextResponse.json(results);
}
```

---

## 11. File-by-File Implementation Guide

### Files to CREATE (new)

| # | File Path | Purpose | Lines (est.) |
|---|-----------|---------|-------------|
| 1 | `data/skills/` (directory) | Vendored AI-Research-SKILLs repo | ~130,000 (markdown) |
| 2 | `src/lib/skills-loader.ts` | Parse/index/search SKILL.md files | ~180 |
| 3 | `src/app/api/skills/route.ts` | List/search skills API | ~25 |
| 4 | `src/app/api/skills/[skillId]/route.ts` | Get skill content API | ~20 |
| 5 | `src/app/api/research/route.ts` | Research start/stop/override API | ~50 |
| 6 | `src/app/api/papers/search/route.ts` | Paper search proxy API | ~25 |
| 7 | `src/features/skills/components/skills-view.tsx` | Skills catalog tab UI | ~150 |
| 8 | `src/features/skills/components/skill-card.tsx` | Skill preview card | ~60 |
| 9 | `src/features/skills/components/skill-detail-dialog.tsx` | Full skill viewer modal | ~100 |
| 10 | `src/features/skills/components/category-filter.tsx` | Category pills/filter bar | ~50 |
| 11 | `src/features/skills/hooks/use-skills.ts` | Fetch skills from API + project skills | ~60 |
| 12 | `src/features/literature/components/literature-view.tsx` | Literature tab UI | ~150 |
| 13 | `src/features/literature/components/paper-search.tsx` | Search bar + results list | ~100 |
| 14 | `src/features/literature/components/paper-card.tsx` | Paper preview card | ~70 |
| 15 | `src/features/literature/components/paper-detail-dialog.tsx` | Full paper modal | ~80 |
| 16 | `src/features/literature/components/paper-library.tsx` | Saved papers list | ~80 |
| 17 | `src/features/literature/hooks/use-papers.ts` | Paper search + library hooks | ~50 |
| 18 | `src/features/experiments/components/experiments-view.tsx` | Experiments tab UI | ~200 |
| 19 | `src/features/experiments/components/hypothesis-board.tsx` | Kanban hypothesis board | ~150 |
| 20 | `src/features/experiments/components/hypothesis-card.tsx` | Hypothesis status card | ~80 |
| 21 | `src/features/experiments/components/hypothesis-create-dialog.tsx` | Create hypothesis form | ~100 |
| 22 | `src/features/experiments/components/experiment-card.tsx` | Experiment status card | ~70 |
| 23 | `src/features/experiments/components/experiment-detail.tsx` | Experiment detail view | ~120 |
| 24 | `src/features/experiments/components/experiment-timeline.tsx` | Chronological timeline | ~100 |
| 25 | `src/features/experiments/components/findings-panel.tsx` | Evolving findings markdown | ~60 |
| 26 | `src/features/experiments/components/karpathy-plot.tsx` | Recharts optimization chart | ~80 |
| 27 | `src/features/experiments/components/research-log-view.tsx` | Append-only action log | ~70 |
| 28 | `src/features/experiments/hooks/use-hypotheses.ts` | Hypothesis CRUD hooks | ~40 |
| 29 | `src/features/experiments/hooks/use-experiments.ts` | Experiment CRUD hooks | ~40 |
| 30 | `src/features/experiments/hooks/use-research-state.ts` | Research state hook | ~30 |
| 31 | `src/features/experiments/hooks/use-research-log.ts` | Research log hook | ~20 |
| 32 | `src/features/research/components/start-research-dialog.tsx` | Start research modal | ~120 |
| 33 | `src/features/research/components/research-status-bar.tsx` | Inline status in sidebar | ~60 |
| 34 | `src/features/research/components/research-memory-panel.tsx` | Memory viewer panel | ~100 |
| 35 | `src/features/research/components/memory-card.tsx` | Individual memory card | ~50 |
| 36 | `src/features/research/inngest/events.ts` | Event name constants | ~15 |
| 37 | `src/features/research/inngest/bootstrap.ts` | Bootstrap Inngest function | ~150 |
| 38 | `src/features/research/inngest/inner-loop.ts` | Inner loop Inngest function | ~200 |
| 39 | `src/features/research/inngest/outer-loop.ts` | Outer loop Inngest function | ~150 |
| 40 | `src/features/research/inngest/finalize.ts` | Finalize Inngest function | ~120 |
| 41 | `src/features/research/inngest/prompts.ts` | System prompts for each phase | ~200 |

### Files to MODIFY (existing)

| # | File Path | Changes | Section |
|---|-----------|---------|---------|
| 1 | `src/lib/db.ts` | Add 7 new tables + ~25 new operations | Section 2 |
| 2 | `src/lib/local-db/types.ts` | Add 7 new type interfaces | Section 2 |
| 3 | `src/lib/local-db/client.ts` | Add new dispatch routes for new tables | Section 5.4 |
| 4 | `src/app/api/db/[...path]/route.ts` | Add ~25 new query/mutation handlers | Section 5.4 |
| 5 | `src/app/api/inngest/route.ts` | Register 4 new Inngest functions | Section 6.7 |
| 6 | `src/features/conversations/inngest/process-message.ts` | Add ~15 new tools + skills context injection | Sections 3.4, 9 |
| 7 | `src/features/conversations/inngest/constants.ts` | Expand system prompt with research tools | Section 9.1 |
| 8 | `src/features/projects/components/project-id-view.tsx` | Add tab bar: Editor, Literature, Experiments, Skills, Preview | Section 8.1 |
| 9 | `src/features/conversations/components/conversation-sidebar.tsx` | Add research status + skills summary section | Section 8.3 |

---

## 12. Implementation Order

### Step 1: Database & Types (Day 1)
1. Add all new tables to `src/lib/db.ts` `initializeDatabase()`
2. Add all new type interfaces to `src/lib/local-db/types.ts`
3. Add all new DB operations to `src/lib/db.ts`
4. Add dispatch routes to `src/lib/local-db/client.ts`
5. Add handlers to `src/app/api/db/[...path]/route.ts`
6. **Test**: Verify tables are created on app start, CRUD works via API

### Step 2: Skills Engine (Days 2-3)
1. Clone AI-Research-SKILLs repo into `data/skills/`
2. Create `src/lib/skills-loader.ts`
3. Create `/api/skills` routes
4. Create `src/features/skills/` components and hooks
5. Add Skills tab to project-id-view.tsx
6. **Test**: Browse skills, activate/deactivate per project

### Step 3: Skills -> Agent Integration (Day 4)
1. Modify `process-message.ts` to load active skills and inject into system prompt
2. Test that AI responses are informed by active skills
3. **Test**: Activate "ml-paper-writing" skill, ask AI about writing a paper -- should use skill knowledge

### Step 4: Literature UI (Days 5-6)
1. Create `/api/papers/search` route
2. Create `src/features/literature/` components and hooks
3. Add Literature tab to project-id-view.tsx
4. Add paper library CRUD (add/remove/notes)
5. **Test**: Search papers, add to library, view library

### Step 5: Experiment Tracking UI (Days 7-9)
1. Create `src/features/experiments/` components and hooks
2. Build hypothesis board (kanban columns)
3. Build experiment cards and detail views
4. Build Karpathy plot with recharts
5. Build research log timeline
6. Build findings panel
7. Add Experiments tab to project-id-view.tsx
8. **Test**: Manually create hypotheses/experiments, view in UI

### Step 6: Agent Research Tools (Day 10)
1. Add all new tools to `process-message.ts` (createHypothesis, createExperiment, etc.)
2. Update system prompt in constants.ts with new tool descriptions
3. **Test**: Ask AI to "create a hypothesis about LoRA efficiency" -- should use createHypothesis tool

### Step 7: Autoresearch Pipeline (Days 11-14)
1. Create Inngest event definitions
2. Create bootstrap function
3. Create inner loop function
4. Create outer loop function
5. Create finalize function
6. Create research prompts
7. Register all with Inngest
8. Create `/api/research` route
9. Create start-research-dialog.tsx
10. Add research status to sidebar
11. **Test**: Start research, watch bootstrap -> hypotheses -> experiments flow

### Step 8: Research Memory (Day 15)
1. Create memory panel components
2. Wire up auto-extraction in agent responses
3. Wire up memory injection in system prompts
4. **Test**: Run research, verify memories are saved and recalled

### Step 9: Polish & Integration (Days 16-18)
1. Loading states, error handling, empty states for all new views
2. Responsive layout adjustments
3. Real-time updates for experiment status (1s polling already handles this)
4. Keyboard shortcuts for tab switching
5. Research state indicators in project list (homepage)

---

## Appendix: Component Dependency Graph

```
project-id-view.tsx (MODIFIED)
  |-- [Tab: Editor] -> editor-view.tsx (existing)
  |-- [Tab: Literature] -> literature-view.tsx (NEW)
  |     |-- paper-search.tsx
  |     |-- paper-library.tsx
  |     |     |-- paper-card.tsx
  |     |     |-- paper-detail-dialog.tsx
  |-- [Tab: Experiments] -> experiments-view.tsx (NEW)
  |     |-- hypothesis-board.tsx
  |     |     |-- hypothesis-card.tsx
  |     |     |-- hypothesis-create-dialog.tsx
  |     |-- experiment-timeline.tsx
  |     |     |-- experiment-card.tsx
  |     |     |-- experiment-detail.tsx
  |     |-- karpathy-plot.tsx
  |     |-- findings-panel.tsx
  |     |-- research-log-view.tsx
  |-- [Tab: Skills] -> skills-view.tsx (NEW)
  |     |-- category-filter.tsx
  |     |-- skill-card.tsx
  |     |-- skill-detail-dialog.tsx
  |-- [Tab: Preview] -> latex-preview.tsx (existing)

conversation-sidebar.tsx (MODIFIED)
  |-- research-status-bar.tsx (NEW)
  |-- start-research-dialog.tsx (NEW)
  |-- research-memory-panel.tsx (NEW)
  |     |-- memory-card.tsx

process-message.ts (MODIFIED)
  |-- skills-loader.ts (NEW) -- injects skill context
  |-- db.ts (MODIFIED) -- new tool implementations
  |-- Research Inngest functions (NEW)
        |-- bootstrap.ts
        |-- inner-loop.ts
        |-- outer-loop.ts
        |-- finalize.ts
        |-- prompts.ts
```
