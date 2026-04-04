import Database from "better-sqlite3";
import crypto from "crypto";
import path from "path";
import fs from "fs";

// ---------------------------------------------------------------------------
// Singleton database instance
// ---------------------------------------------------------------------------

const DB_PATH = path.join(process.cwd(), "data", "scholarflow.db");

let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (_db) return _db;

  // Ensure the data directory exists
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  _db = new Database(DB_PATH);

  // Performance pragmas
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");

  initSchema(_db);

  return _db;
}

// ---------------------------------------------------------------------------
// Schema initialisation
// ---------------------------------------------------------------------------

function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id        TEXT PRIMARY KEY,
      name      TEXT NOT NULL,
      ownerId   TEXT NOT NULL,
      updatedAt INTEGER NOT NULL,
      template  TEXT,
      topic     TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_projects_owner
      ON projects (ownerId, updatedAt DESC);

    CREATE TABLE IF NOT EXISTS files (
      id        TEXT PRIMARY KEY,
      projectId TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      parentId  TEXT REFERENCES files(id) ON DELETE CASCADE,
      name      TEXT NOT NULL,
      type      TEXT NOT NULL CHECK(type IN ('file', 'folder')),
      content   TEXT,
      updatedAt INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_files_project
      ON files (projectId);
    CREATE INDEX IF NOT EXISTS idx_files_parent
      ON files (parentId);
    CREATE INDEX IF NOT EXISTS idx_files_project_parent
      ON files (projectId, parentId);

    CREATE TABLE IF NOT EXISTS conversations (
      id        TEXT PRIMARY KEY,
      projectId TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      title     TEXT NOT NULL,
      updatedAt INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_conversations_project
      ON conversations (projectId, updatedAt DESC);

    CREATE TABLE IF NOT EXISTS messages (
      id              TEXT PRIMARY KEY,
      conversationId  TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      projectId       TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      role            TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
      content         TEXT NOT NULL,
      status          TEXT CHECK(status IN ('processing', 'completed', 'cancelled'))
    );

    CREATE INDEX IF NOT EXISTS idx_messages_conversation
      ON messages (conversationId);
    CREATE INDEX IF NOT EXISTS idx_messages_project_status
      ON messages (projectId, status);

    -- Research: skills activated per project
    CREATE TABLE IF NOT EXISTS project_skills (
      id          TEXT PRIMARY KEY,
      projectId   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      skillId     TEXT NOT NULL,
      skillName   TEXT NOT NULL,
      category    TEXT NOT NULL,
      activatedAt INTEGER NOT NULL,
      UNIQUE(projectId, skillId)
    );
    CREATE INDEX IF NOT EXISTS idx_project_skills_project
      ON project_skills (projectId);

    -- Research: hypotheses
    CREATE TABLE IF NOT EXISTS hypotheses (
      id              TEXT PRIMARY KEY,
      projectId       TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      title           TEXT NOT NULL,
      description     TEXT NOT NULL,
      status          TEXT NOT NULL DEFAULT 'proposed'
                        CHECK(status IN ('proposed','active','completed','failed','abandoned')),
      rationale       TEXT NOT NULL DEFAULT '',
      expectedOutcome TEXT NOT NULL DEFAULT '',
      actualOutcome   TEXT,
      priority        INTEGER NOT NULL DEFAULT 0,
      createdAt       INTEGER NOT NULL,
      completedAt     INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_hypotheses_project
      ON hypotheses (projectId);
    CREATE INDEX IF NOT EXISTS idx_hypotheses_status
      ON hypotheses (projectId, status);

    -- Research: experiments under hypotheses
    CREATE TABLE IF NOT EXISTS experiments (
      id            TEXT PRIMARY KEY,
      projectId     TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      hypothesisId  TEXT NOT NULL REFERENCES hypotheses(id) ON DELETE CASCADE,
      name          TEXT NOT NULL,
      protocol      TEXT NOT NULL DEFAULT '',
      status        TEXT NOT NULL DEFAULT 'planned'
                      CHECK(status IN ('planned','running','completed','failed','cancelled')),
      skillsUsed    TEXT NOT NULL DEFAULT '[]',
      config        TEXT NOT NULL DEFAULT '{}',
      results       TEXT,
      metrics       TEXT DEFAULT '{}',
      logs          TEXT,
      startedAt     INTEGER,
      completedAt   INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_experiments_project
      ON experiments (projectId);
    CREATE INDEX IF NOT EXISTS idx_experiments_hypothesis
      ON experiments (hypothesisId);

    -- Research: state machine (singleton per project)
    CREATE TABLE IF NOT EXISTS research_state (
      id                  TEXT PRIMARY KEY,
      projectId           TEXT NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
      phase               TEXT NOT NULL DEFAULT 'idle'
                            CHECK(phase IN ('idle','bootstrap','inner_loop','outer_loop','finalizing','completed')),
      currentHypothesisId TEXT,
      findings            TEXT NOT NULL DEFAULT '',
      researchQuestion    TEXT NOT NULL DEFAULT '',
      directionDecision   TEXT CHECK(directionDecision IN ('DEEPEN','BROADEN','PIVOT','CONCLUDE', NULL)),
      experimentCount     INTEGER NOT NULL DEFAULT 0,
      innerLoopCount      INTEGER NOT NULL DEFAULT 0,
      outerLoopCount      INTEGER NOT NULL DEFAULT 0,
      lastUpdated         INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_research_state_project
      ON research_state (projectId);

    -- Research: append-only log
    CREATE TABLE IF NOT EXISTS research_log (
      id          TEXT PRIMARY KEY,
      projectId   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      timestamp   INTEGER NOT NULL,
      action      TEXT NOT NULL,
      phase       TEXT NOT NULL,
      details     TEXT NOT NULL,
      relatedId   TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_research_log_project
      ON research_log (projectId);

    -- Research: persistent memory / insights
    CREATE TABLE IF NOT EXISTS research_memory (
      id        TEXT PRIMARY KEY,
      projectId TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      type      TEXT NOT NULL
                  CHECK(type IN ('discovery','dead_end','decision','insight','context')),
      content   TEXT NOT NULL,
      source    TEXT,
      pinned    INTEGER NOT NULL DEFAULT 0,
      createdAt INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_research_memory_project
      ON research_memory (projectId);
    CREATE INDEX IF NOT EXISTS idx_research_memory_type
      ON research_memory (projectId, type);

    -- Research: paper library per project
    CREATE TABLE IF NOT EXISTS papers (
      id                TEXT PRIMARY KEY,
      projectId         TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      provider          TEXT,
      openAlexId        TEXT,
      semanticScholarId TEXT,
      arxivId           TEXT,
      doi               TEXT,
      title             TEXT NOT NULL,
      authors           TEXT NOT NULL DEFAULT '[]',
      abstract          TEXT,
      year              INTEGER,
      venue             TEXT,
      citationCount     INTEGER DEFAULT 0,
      tldr              TEXT,
      url               TEXT,
      publicationType   TEXT,
      primaryTopic      TEXT,
      aiSummary         TEXT,
      relevanceScore    INTEGER,
      relevanceReason   TEXT,
      summaryStatus     TEXT,
      notes             TEXT,
      tags              TEXT NOT NULL DEFAULT '[]',
      addedAt           INTEGER NOT NULL,
      UNIQUE(projectId, semanticScholarId)
    );
    CREATE INDEX IF NOT EXISTS idx_papers_project
      ON papers (projectId);
    CREATE INDEX IF NOT EXISTS idx_papers_project_doi
      ON papers (projectId, doi);
  `);

  ensureColumn(db, "projects", "topic", "TEXT");
  ensureColumn(db, "papers", "provider", "TEXT");
  ensureColumn(db, "papers", "openAlexId", "TEXT");
  ensureColumn(db, "papers", "publicationType", "TEXT");
  ensureColumn(db, "papers", "primaryTopic", "TEXT");
  ensureColumn(db, "papers", "aiSummary", "TEXT");
  ensureColumn(db, "papers", "relevanceScore", "INTEGER");
  ensureColumn(db, "papers", "relevanceReason", "TEXT");
  ensureColumn(db, "papers", "summaryStatus", "TEXT");

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_papers_project_openalex
      ON papers (projectId, openAlexId)
      WHERE openAlexId IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_papers_project_doi
      ON papers (projectId, doi);
    UPDATE papers
    SET provider = 'semantic-scholar'
    WHERE provider IS NULL AND semanticScholarId IS NOT NULL;
    UPDATE papers
    SET provider = 'openalex'
    WHERE provider IS NULL AND openAlexId IS NOT NULL;
  `);
}

function ensureColumn(
  db: Database.Database,
  tableName: string,
  columnName: string,
  definition: string
): void {
  const columns = db
    .prepare(`PRAGMA table_info(${tableName})`)
    .all() as { name: string }[];

  if (columns.some((column) => column.name === columnName)) {
    return;
  }

  db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
}

// ---------------------------------------------------------------------------
// Type helpers (internal DB row shapes)
// ---------------------------------------------------------------------------

interface ProjectRow {
  id: string;
  name: string;
  ownerId: string;
  updatedAt: number;
  template?: string | null;
  topic?: string | null;
}

interface FileRowInternal {
  id: string;
  projectId: string;
  parentId?: string | null;
  name: string;
  type: "file" | "folder";
  content?: string | null;
  updatedAt: number;
}

interface ConversationRow {
  id: string;
  projectId: string;
  title: string;
  updatedAt: number;
}

interface MessageRow {
  id: string;
  conversationId: string;
  projectId: string;
  role: "user" | "assistant";
  content: string;
  status?: string | null;
}

interface ProjectSkillRow {
  id: string;
  projectId: string;
  skillId: string;
  skillName: string;
  category: string;
  activatedAt: number;
}

interface HypothesisRow {
  id: string;
  projectId: string;
  title: string;
  description: string;
  status: string;
  rationale: string;
  expectedOutcome: string;
  actualOutcome: string | null;
  priority: number;
  createdAt: number;
  completedAt: number | null;
}

interface ExperimentRow {
  id: string;
  projectId: string;
  hypothesisId: string;
  name: string;
  protocol: string;
  status: string;
  skillsUsed: string;
  config: string;
  results: string | null;
  metrics: string;
  logs: string | null;
  startedAt: number | null;
  completedAt: number | null;
}

interface ResearchStateRow {
  id: string;
  projectId: string;
  phase: string;
  currentHypothesisId: string | null;
  findings: string;
  researchQuestion: string;
  directionDecision: string | null;
  experimentCount: number;
  innerLoopCount: number;
  outerLoopCount: number;
  lastUpdated: number;
}

interface ResearchLogRow {
  id: string;
  projectId: string;
  timestamp: number;
  action: string;
  phase: string;
  details: string;
  relatedId: string | null;
}

interface ResearchMemoryRow {
  id: string;
  projectId: string;
  type: string;
  content: string;
  source: string | null;
  pinned: number;
  createdAt: number;
}

interface PaperRow {
  id: string;
  projectId: string;
  provider: string | null;
  openAlexId: string | null;
  semanticScholarId: string | null;
  arxivId: string | null;
  doi: string | null;
  title: string;
  authors: string;
  abstract: string | null;
  year: number | null;
  venue: string | null;
  citationCount: number;
  tldr: string | null;
  url: string | null;
  publicationType: string | null;
  primaryTopic: string | null;
  aiSummary: string | null;
  relevanceScore: number | null;
  relevanceReason: string | null;
  summaryStatus: string | null;
  notes: string | null;
  tags: string;
  addedAt: number;
}

// Exported types match the frontend expectations (_id, _creationTime)
export interface Project extends Omit<ProjectRow, "id"> {
  _id: string;
  _creationTime: number;
}
export interface FileRow extends Omit<FileRowInternal, "id"> {
  _id: string;
  _creationTime: number;
}
export interface Conversation extends Omit<ConversationRow, "id"> {
  _id: string;
  _creationTime: number;
}
export interface Message extends Omit<MessageRow, "id"> {
  _id: string;
  _creationTime: number;
}
export interface ProjectSkill extends Omit<ProjectSkillRow, "id"> {
  _id: string;
  _creationTime: number;
}
export interface Hypothesis extends Omit<HypothesisRow, "id"> {
  _id: string;
  _creationTime: number;
}
export interface Experiment extends Omit<ExperimentRow, "id"> {
  _id: string;
  _creationTime: number;
}
export interface ResearchState extends Omit<ResearchStateRow, "id"> {
  _id: string;
  _creationTime: number;
}
export interface ResearchLogEntry extends Omit<ResearchLogRow, "id"> {
  _id: string;
  _creationTime: number;
}
export interface ResearchMemoryEntry extends Omit<ResearchMemoryRow, "id"> {
  _id: string;
  _creationTime: number;
}
export interface Paper extends Omit<PaperRow, "id"> {
  _id: string;
  _creationTime: number;
}

// Map DB rows to frontend shape
function mapRow<T extends { id: string; updatedAt?: number }>(
  row: T
): Omit<T, "id"> & { _id: string; _creationTime: number } {
  const { id, ...rest } = row;
  return { _id: id, _creationTime: (rest as { updatedAt?: number }).updatedAt ?? Date.now(), ...rest };
}

function mapRows<T extends { id: string; updatedAt?: number }>(
  rows: T[]
): (Omit<T, "id"> & { _id: string; _creationTime: number })[] {
  return rows.map(mapRow);
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export function getProjects(ownerId: string): Project[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM projects WHERE ownerId = ? ORDER BY updatedAt DESC")
    .all(ownerId) as ProjectRow[];
  return mapRows(rows) as Project[];
}

export function getProjectsPartial(ownerId: string, limit: number): Project[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM projects WHERE ownerId = ? ORDER BY updatedAt DESC LIMIT ?")
    .all(ownerId, limit) as ProjectRow[];
  return mapRows(rows) as Project[];
}

export function getProjectById(id: string): Project | undefined {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM projects WHERE id = ?")
    .get(id) as ProjectRow | undefined;
  return row ? mapRow(row) as Project : undefined;
}

export function createProject(
  name: string,
  ownerId: string,
  template?: string,
  topic?: string
): string {
  const db = getDb();
  const id = crypto.randomUUID();
  const now = Date.now();
  db.prepare(
    "INSERT INTO projects (id, name, ownerId, updatedAt, template, topic) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(id, name, ownerId, now, template ?? null, topic ?? null);
  return id;
}

export function renameProject(id: string, name: string): void {
  const db = getDb();
  const now = Date.now();
  db.prepare("UPDATE projects SET name = ?, updatedAt = ? WHERE id = ?").run(
    name,
    now,
    id
  );
}

export function updateProjectTopic(id: string, topic: string): void {
  const db = getDb();
  const now = Date.now();
  db.prepare("UPDATE projects SET topic = ?, updatedAt = ? WHERE id = ?").run(
    topic,
    now,
    id
  );
}

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

export function getFiles(projectId: string): FileRow[] {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM files WHERE projectId = ?").all(projectId) as FileRowInternal[];
  return mapRows(rows) as unknown as FileRow[];
}

export function getFile(id: string): FileRow | undefined {
  const db = getDb();
  const row = db.prepare("SELECT * FROM files WHERE id = ?").get(id) as FileRowInternal | undefined;
  return row ? mapRow(row) as FileRow : undefined;
}

export function getFilePath(id: string): { _id: string; name: string }[] {
  const db = getDb();
  const pathSegments: { _id: string; name: string }[] = [];
  let currentId: string | null = id;

  const stmt = db.prepare(
    "SELECT id, name, parentId FROM files WHERE id = ?"
  );

  while (currentId) {
    const row = stmt.get(currentId) as
      | { id: string; name: string; parentId: string | null }
      | undefined;
    if (!row) break;
    pathSegments.unshift({ _id: row.id, name: row.name });
    currentId = row.parentId ?? null;
  }

  return pathSegments;
}

export function getFolderContents(
  projectId: string,
  parentId?: string
): FileRow[] {
  const db = getDb();

  let rawRows: FileRowInternal[];
  if (parentId === undefined || parentId === null) {
    rawRows = db
      .prepare("SELECT * FROM files WHERE projectId = ? AND parentId IS NULL")
      .all(projectId) as FileRowInternal[];
  } else {
    rawRows = db
      .prepare("SELECT * FROM files WHERE projectId = ? AND parentId = ?")
      .all(projectId, parentId) as FileRowInternal[];
  }

  const rows = mapRows(rawRows) as unknown as FileRow[];

  // Sort: folders first, then files, alphabetically within each group
  return rows.sort((a, b) => {
    if (a.type === "folder" && b.type === "file") return -1;
    if (a.type === "file" && b.type === "folder") return 1;
    return a.name.localeCompare(b.name);
  });
}

export function createFile(
  projectId: string,
  name: string,
  content: string,
  parentId?: string
): string {
  const db = getDb();
  const id = crypto.randomUUID();
  const now = Date.now();

  // Check for duplicate
  let existing: FileRowInternal | undefined;
  if (parentId === undefined || parentId === null) {
    existing = db
      .prepare(
        "SELECT id FROM files WHERE projectId = ? AND parentId IS NULL AND name = ? AND type = 'file'"
      )
      .get(projectId, name) as FileRowInternal | undefined;
  } else {
    existing = db
      .prepare(
        "SELECT id FROM files WHERE projectId = ? AND parentId = ? AND name = ? AND type = 'file'"
      )
      .get(projectId, parentId, name) as FileRowInternal | undefined;
  }

  if (existing) {
    throw new Error("File already exists");
  }

  const insertFile = db.prepare(
    "INSERT INTO files (id, projectId, parentId, name, type, content, updatedAt) VALUES (?, ?, ?, ?, 'file', ?, ?)"
  );
  const updateProject = db.prepare(
    "UPDATE projects SET updatedAt = ? WHERE id = ?"
  );

  const transaction = db.transaction(() => {
    insertFile.run(id, projectId, parentId ?? null, name, content, now);
    updateProject.run(now, projectId);
  });

  transaction();
  return id;
}

export function createFiles(
  projectId: string,
  files: { name: string; content: string }[],
  parentId?: string
): { name: string; fileId?: string; error?: string }[] {
  const db = getDb();
  const now = Date.now();

  // Get existing files in the target folder
  let existingFiles: FileRowInternal[];
  if (parentId === undefined || parentId === null) {
    existingFiles = db
      .prepare(
        "SELECT id, name, type FROM files WHERE projectId = ? AND parentId IS NULL"
      )
      .all(projectId) as FileRowInternal[];
  } else {
    existingFiles = db
      .prepare(
        "SELECT id, name, type FROM files WHERE projectId = ? AND parentId = ?"
      )
      .all(projectId, parentId) as FileRowInternal[];
  }

  const insertFile = db.prepare(
    "INSERT INTO files (id, projectId, parentId, name, type, content, updatedAt) VALUES (?, ?, ?, ?, 'file', ?, ?)"
  );

  const results: { name: string; fileId?: string; error?: string }[] = [];

  const transaction = db.transaction(() => {
    for (const file of files) {
      const dup = existingFiles.find(
        (f) => f.name === file.name && f.type === "file"
      );

      if (dup) {
        results.push({ name: file.name, fileId: dup.id, error: "File already exists" });
        continue;
      }

      const id = crypto.randomUUID();
      insertFile.run(
        id,
        projectId,
        parentId ?? null,
        file.name,
        file.content,
        now
      );
      results.push({ name: file.name, fileId: id });
    }

    db.prepare("UPDATE projects SET updatedAt = ? WHERE id = ?").run(
      now,
      projectId
    );
  });

  transaction();
  return results;
}

export function createFolder(
  projectId: string,
  name: string,
  parentId?: string
): string {
  const db = getDb();
  const id = crypto.randomUUID();
  const now = Date.now();

  // Check for duplicate folder
  let existing: FileRowInternal | undefined;
  if (parentId === undefined || parentId === null) {
    existing = db
      .prepare(
        "SELECT id FROM files WHERE projectId = ? AND parentId IS NULL AND name = ? AND type = 'folder'"
      )
      .get(projectId, name) as FileRowInternal | undefined;
  } else {
    existing = db
      .prepare(
        "SELECT id FROM files WHERE projectId = ? AND parentId = ? AND name = ? AND type = 'folder'"
      )
      .get(projectId, parentId, name) as FileRowInternal | undefined;
  }

  if (existing) {
    throw new Error("Folder already exists");
  }

  const insertFolder = db.prepare(
    "INSERT INTO files (id, projectId, parentId, name, type, updatedAt) VALUES (?, ?, ?, ?, 'folder', ?)"
  );
  const updateProject = db.prepare(
    "UPDATE projects SET updatedAt = ? WHERE id = ?"
  );

  const transaction = db.transaction(() => {
    insertFolder.run(id, projectId, parentId ?? null, name, now);
    updateProject.run(now, projectId);
  });

  transaction();
  return id;
}

export function updateFile(id: string, content: string): void {
  const db = getDb();
  const now = Date.now();

  const file = db.prepare("SELECT projectId FROM files WHERE id = ?").get(id) as
    | { projectId: string }
    | undefined;

  if (!file) throw new Error("File not found");

  const transaction = db.transaction(() => {
    db.prepare("UPDATE files SET content = ?, updatedAt = ? WHERE id = ?").run(
      content,
      now,
      id
    );
    db.prepare("UPDATE projects SET updatedAt = ? WHERE id = ?").run(
      now,
      file.projectId
    );
  });

  transaction();
}

export function renameFile(id: string, newName: string): void {
  const db = getDb();
  const now = Date.now();

  const file = db
    .prepare("SELECT projectId, parentId, type FROM files WHERE id = ?")
    .get(id) as
    | { projectId: string; parentId: string | null; type: string }
    | undefined;

  if (!file) throw new Error("File not found");

  // Check for duplicates among siblings
  let existing: FileRowInternal | undefined;
  if (file.parentId === null) {
    existing = db
      .prepare(
        "SELECT id FROM files WHERE projectId = ? AND parentId IS NULL AND name = ? AND type = ? AND id != ?"
      )
      .get(file.projectId, newName, file.type, id) as FileRowInternal | undefined;
  } else {
    existing = db
      .prepare(
        "SELECT id FROM files WHERE projectId = ? AND parentId = ? AND name = ? AND type = ? AND id != ?"
      )
      .get(file.projectId, file.parentId, newName, file.type, id) as
      | FileRowInternal
      | undefined;
  }

  if (existing) {
    throw new Error(
      `A ${file.type} with this name already exists in this location`
    );
  }

  const transaction = db.transaction(() => {
    db.prepare("UPDATE files SET name = ?, updatedAt = ? WHERE id = ?").run(
      newName,
      now,
      id
    );
    db.prepare("UPDATE projects SET updatedAt = ? WHERE id = ?").run(
      now,
      file.projectId
    );
  });

  transaction();
}

export function deleteFile(id: string): void {
  const db = getDb();

  const file = db
    .prepare("SELECT projectId, type FROM files WHERE id = ?")
    .get(id) as { projectId: string; type: string } | undefined;

  if (!file) throw new Error("File not found");

  const getChildren = db.prepare(
    "SELECT id, type FROM files WHERE parentId = ?"
  );
  const deleteRow = db.prepare("DELETE FROM files WHERE id = ?");

  function deleteRecursive(fileId: string): void {
    const children = getChildren.all(fileId) as {
      id: string;
      type: string;
    }[];

    for (const child of children) {
      deleteRecursive(child.id);
    }

    deleteRow.run(fileId);
  }

  const transaction = db.transaction(() => {
    deleteRecursive(id);
    db.prepare("UPDATE projects SET updatedAt = ? WHERE id = ?").run(
      Date.now(),
      file.projectId
    );
  });

  transaction();
}

// ---------------------------------------------------------------------------
// Conversations
// ---------------------------------------------------------------------------

export function getConversationsByProject(
  projectId: string
): Conversation[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM conversations WHERE projectId = ? ORDER BY updatedAt DESC")
    .all(projectId) as ConversationRow[];
  return mapRows(rows) as Conversation[];
}

export function getConversationById(id: string): Conversation | undefined {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM conversations WHERE id = ?")
    .get(id) as ConversationRow | undefined;
  return row ? mapRow(row) as Conversation : undefined;
}

export function createConversation(
  projectId: string,
  title: string
): string {
  const db = getDb();
  const id = crypto.randomUUID();
  const now = Date.now();
  db.prepare(
    "INSERT INTO conversations (id, projectId, title, updatedAt) VALUES (?, ?, ?, ?)"
  ).run(id, projectId, title, now);
  return id;
}

export function updateConversationTitle(id: string, title: string): void {
  const db = getDb();
  const now = Date.now();
  db.prepare(
    "UPDATE conversations SET title = ?, updatedAt = ? WHERE id = ?"
  ).run(title, now, id);
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

export function getMessages(conversationId: string): Message[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM messages WHERE conversationId = ? ORDER BY rowid ASC")
    .all(conversationId) as MessageRow[];
  return rows.map((r) => ({ ...mapRow({ ...r, updatedAt: Date.now() }), conversationId: r.conversationId, projectId: r.projectId, role: r.role, content: r.content, status: r.status })) as Message[];
}

export function createMessage(
  conversationId: string,
  projectId: string,
  role: string,
  content: string,
  status?: string
): string {
  const db = getDb();
  const id = crypto.randomUUID();

  const transaction = db.transaction(() => {
    db.prepare(
      "INSERT INTO messages (id, conversationId, projectId, role, content, status) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(id, conversationId, projectId, role, content, status ?? null);

    db.prepare(
      "UPDATE conversations SET updatedAt = ? WHERE id = ?"
    ).run(Date.now(), conversationId);
  });

  transaction();
  return id;
}

export function updateMessageContent(id: string, content: string): void {
  const db = getDb();
  db.prepare(
    "UPDATE messages SET content = ?, status = 'completed' WHERE id = ?"
  ).run(content, id);
}

export function updateMessageStatus(id: string, status: string): void {
  const db = getDb();
  db.prepare("UPDATE messages SET status = ? WHERE id = ?").run(status, id);
}

export function getProcessingMessages(projectId: string): Message[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM messages WHERE projectId = ? AND status = 'processing'")
    .all(projectId) as MessageRow[];
  return rows.map((r) => ({ _id: r.id, _creationTime: Date.now(), conversationId: r.conversationId, projectId: r.projectId, role: r.role, content: r.content, status: r.status })) as Message[];
}

export function getRecentMessages(
  conversationId: string,
  limit: number
): Message[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM messages WHERE conversationId = ? ORDER BY rowid DESC LIMIT ?")
    .all(conversationId, limit)
    .reverse() as MessageRow[];
  return rows.map((r) => ({ _id: r.id, _creationTime: Date.now(), conversationId: r.conversationId, projectId: r.projectId, role: r.role, content: r.content, status: r.status })) as Message[];
}

// ---------------------------------------------------------------------------
// Composite operations
// ---------------------------------------------------------------------------

export function createProjectWithConversation(
  projectName: string,
  conversationTitle: string,
  ownerId: string,
  template?: string,
  topic?: string
): { projectId: string; conversationId: string } {
  const db = getDb();
  const projectId = crypto.randomUUID();
  const conversationId = crypto.randomUUID();
  const now = Date.now();

  const transaction = db.transaction(() => {
    db.prepare(
      "INSERT INTO projects (id, name, ownerId, updatedAt, template, topic) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(projectId, projectName, ownerId, now, template ?? null, topic ?? null);

    db.prepare(
      "INSERT INTO conversations (id, projectId, title, updatedAt) VALUES (?, ?, ?, ?)"
    ).run(conversationId, projectId, conversationTitle, now);
  });

  transaction();
  return { projectId, conversationId };
}

// ---------------------------------------------------------------------------
// Project Skills
// ---------------------------------------------------------------------------

export function getProjectSkills(projectId: string): ProjectSkill[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM project_skills WHERE projectId = ? ORDER BY activatedAt DESC")
    .all(projectId) as ProjectSkillRow[];
  return mapRows(rows) as ProjectSkill[];
}

export function activateSkill(
  projectId: string,
  skillId: string,
  skillName: string,
  category: string
): string {
  const db = getDb();
  const id = crypto.randomUUID();
  const now = Date.now();
  db.prepare(
    "INSERT OR IGNORE INTO project_skills (id, projectId, skillId, skillName, category, activatedAt) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(id, projectId, skillId, skillName, category, now);
  return id;
}

export function deactivateSkill(projectId: string, skillId: string): void {
  const db = getDb();
  db.prepare("DELETE FROM project_skills WHERE projectId = ? AND skillId = ?").run(projectId, skillId);
}

// ---------------------------------------------------------------------------
// Hypotheses
// ---------------------------------------------------------------------------

export function getHypotheses(projectId: string): Hypothesis[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM hypotheses WHERE projectId = ? ORDER BY createdAt DESC")
    .all(projectId) as HypothesisRow[];
  return mapRows(rows) as Hypothesis[];
}

export function getHypothesisById(id: string): Hypothesis | undefined {
  const db = getDb();
  const row = db.prepare("SELECT * FROM hypotheses WHERE id = ?").get(id) as HypothesisRow | undefined;
  return row ? (mapRow(row) as Hypothesis) : undefined;
}

export function createHypothesis(
  projectId: string,
  title: string,
  description: string,
  rationale: string,
  expectedOutcome: string
): string {
  const db = getDb();
  const id = crypto.randomUUID();
  const now = Date.now();
  db.prepare(
    "INSERT INTO hypotheses (id, projectId, title, description, rationale, expectedOutcome, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(id, projectId, title, description, rationale, expectedOutcome, now);
  return id;
}

export function updateHypothesisStatus(
  id: string,
  status: string,
  actualOutcome?: string
): void {
  const db = getDb();
  const completedAt = ["completed", "failed", "abandoned"].includes(status) ? Date.now() : null;
  db.prepare(
    "UPDATE hypotheses SET status = ?, actualOutcome = COALESCE(?, actualOutcome), completedAt = COALESCE(?, completedAt) WHERE id = ?"
  ).run(status, actualOutcome ?? null, completedAt, id);
}

// ---------------------------------------------------------------------------
// Experiments
// ---------------------------------------------------------------------------

export function getExperiments(projectId: string): Experiment[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM experiments WHERE projectId = ? ORDER BY rowid DESC")
    .all(projectId) as ExperimentRow[];
  return mapRows(rows) as Experiment[];
}

export function getExperimentsByHypothesis(hypothesisId: string): Experiment[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM experiments WHERE hypothesisId = ? ORDER BY rowid ASC")
    .all(hypothesisId) as ExperimentRow[];
  return mapRows(rows) as Experiment[];
}

export function createExperiment(
  projectId: string,
  hypothesisId: string,
  name: string,
  protocol: string,
  skillsUsed: string[],
  config: Record<string, unknown>
): string {
  const db = getDb();
  const id = crypto.randomUUID();
  db.prepare(
    "INSERT INTO experiments (id, projectId, hypothesisId, name, protocol, skillsUsed, config) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(id, projectId, hypothesisId, name, protocol, JSON.stringify(skillsUsed), JSON.stringify(config));
  return id;
}

export function updateExperimentStatus(id: string, status: string): void {
  const db = getDb();
  const startedAt = status === "running" ? Date.now() : null;
  const completedAt = ["completed", "failed", "cancelled"].includes(status) ? Date.now() : null;
  db.prepare(
    "UPDATE experiments SET status = ?, startedAt = COALESCE(?, startedAt), completedAt = COALESCE(?, completedAt) WHERE id = ?"
  ).run(status, startedAt, completedAt, id);
}

export function updateExperimentResults(
  id: string,
  results: string,
  metrics: Record<string, number>
): void {
  const db = getDb();
  db.prepare(
    "UPDATE experiments SET results = ?, metrics = ?, status = 'completed', completedAt = ? WHERE id = ?"
  ).run(results, JSON.stringify(metrics), Date.now(), id);
}

// ---------------------------------------------------------------------------
// Research State
// ---------------------------------------------------------------------------

export function getResearchState(projectId: string): ResearchState | undefined {
  const db = getDb();
  const row = db.prepare("SELECT * FROM research_state WHERE projectId = ?").get(projectId) as ResearchStateRow | undefined;
  return row ? (mapRow(row) as ResearchState) : undefined;
}

export function upsertResearchState(
  projectId: string,
  updates: Partial<ResearchStateRow>
): void {
  const db = getDb();
  const now = Date.now();
  const existing = db.prepare("SELECT id FROM research_state WHERE projectId = ?").get(projectId) as { id: string } | undefined;

  if (existing) {
    const setClauses: string[] = [];
    const values: unknown[] = [];
    for (const [key, val] of Object.entries(updates)) {
      if (key === "id" || key === "projectId") continue;
      setClauses.push(`${key} = ?`);
      values.push(val);
    }
    setClauses.push("lastUpdated = ?");
    values.push(now, projectId);
    db.prepare(`UPDATE research_state SET ${setClauses.join(", ")} WHERE projectId = ?`).run(...values);
  } else {
    const id = crypto.randomUUID();
    db.prepare(
      "INSERT INTO research_state (id, projectId, phase, findings, researchQuestion, lastUpdated) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(
      id,
      projectId,
      updates.phase ?? "idle",
      updates.findings ?? "",
      updates.researchQuestion ?? "",
      now
    );
  }
}

// ---------------------------------------------------------------------------
// Research Log
// ---------------------------------------------------------------------------

export function getResearchLog(projectId: string, limit = 50): ResearchLogEntry[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM research_log WHERE projectId = ? ORDER BY timestamp DESC LIMIT ?")
    .all(projectId, limit) as ResearchLogRow[];
  return mapRows(rows) as ResearchLogEntry[];
}

export function addResearchLogEntry(
  projectId: string,
  action: string,
  phase: string,
  details: string,
  relatedId?: string
): string {
  const db = getDb();
  const id = crypto.randomUUID();
  db.prepare(
    "INSERT INTO research_log (id, projectId, timestamp, action, phase, details, relatedId) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(id, projectId, Date.now(), action, phase, details, relatedId ?? null);
  return id;
}

// ---------------------------------------------------------------------------
// Research Memory
// ---------------------------------------------------------------------------

export function getResearchMemory(projectId: string): ResearchMemoryEntry[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM research_memory WHERE projectId = ? ORDER BY pinned DESC, createdAt DESC")
    .all(projectId) as ResearchMemoryRow[];
  return mapRows(rows) as ResearchMemoryEntry[];
}

export function getResearchMemoryByType(projectId: string, type: string): ResearchMemoryEntry[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM research_memory WHERE projectId = ? AND type = ? ORDER BY createdAt DESC")
    .all(projectId, type) as ResearchMemoryRow[];
  return mapRows(rows) as ResearchMemoryEntry[];
}

export function addResearchMemory(
  projectId: string,
  type: string,
  content: string,
  source?: string
): string {
  const db = getDb();
  const id = crypto.randomUUID();
  db.prepare(
    "INSERT INTO research_memory (id, projectId, type, content, source, createdAt) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(id, projectId, type, content, source ?? null, Date.now());
  return id;
}

export function toggleMemoryPin(id: string): void {
  const db = getDb();
  db.prepare("UPDATE research_memory SET pinned = 1 - pinned WHERE id = ?").run(id);
}

export function deleteResearchMemory(id: string): void {
  const db = getDb();
  db.prepare("DELETE FROM research_memory WHERE id = ?").run(id);
}

// ---------------------------------------------------------------------------
// Papers (project library)
// ---------------------------------------------------------------------------

export function getProjectPapers(projectId: string): Paper[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM papers WHERE projectId = ? ORDER BY addedAt DESC")
    .all(projectId) as PaperRow[];
  return mapRows(rows) as Paper[];
}

export function getPaperById(id: string): Paper | undefined {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM papers WHERE id = ?")
    .get(id) as PaperRow | undefined;
  return row ? (mapRow(row) as Paper) : undefined;
}

export function addPaper(
  projectId: string,
  paper: {
    provider?: string;
    openAlexId?: string;
    semanticScholarId?: string;
    arxivId?: string;
    doi?: string;
    title: string;
    authors?: string[];
    abstract?: string;
    year?: number;
    venue?: string;
    citationCount?: number;
    tldr?: string;
    url?: string;
    publicationType?: string;
    primaryTopic?: string;
    aiSummary?: string;
    relevanceScore?: number;
    relevanceReason?: string;
    summaryStatus?: string;
    notes?: string;
    tags?: string[];
  }
): string {
  const db = getDb();
  const existing = (db.prepare(
    `SELECT id FROM papers
     WHERE projectId = ?
       AND (
         (openAlexId IS NOT NULL AND openAlexId = ?)
         OR (doi IS NOT NULL AND doi = ?)
         OR (semanticScholarId IS NOT NULL AND semanticScholarId = ?)
       )
     LIMIT 1`
  ).get(
    projectId,
    paper.openAlexId ?? null,
    paper.doi ?? null,
    paper.semanticScholarId ?? null
  ) as { id: string } | undefined);

  const serializedAuthors = JSON.stringify(paper.authors ?? []);
  const serializedTags = JSON.stringify(paper.tags ?? []);

  if (existing) {
    db.prepare(
      `UPDATE papers
       SET provider = COALESCE(provider, ?),
           openAlexId = COALESCE(openAlexId, ?),
           semanticScholarId = COALESCE(semanticScholarId, ?),
           arxivId = COALESCE(arxivId, ?),
           doi = COALESCE(doi, ?),
           abstract = COALESCE(abstract, ?),
           year = COALESCE(year, ?),
           venue = COALESCE(venue, ?),
           citationCount = CASE
             WHEN citationCount IS NULL OR citationCount = 0 THEN ?
             ELSE citationCount
           END,
           tldr = COALESCE(tldr, ?),
           url = COALESCE(url, ?),
           publicationType = COALESCE(publicationType, ?),
           primaryTopic = COALESCE(primaryTopic, ?),
           aiSummary = COALESCE(aiSummary, ?),
           relevanceScore = COALESCE(relevanceScore, ?),
           relevanceReason = COALESCE(relevanceReason, ?),
           summaryStatus = COALESCE(summaryStatus, ?),
           tags = CASE
             WHEN tags = '[]' THEN ?
             ELSE tags
           END,
           authors = CASE
             WHEN authors = '[]' THEN ?
             ELSE authors
           END
       WHERE id = ?`
    ).run(
      paper.provider ?? null,
      paper.openAlexId ?? null,
      paper.semanticScholarId ?? null,
      paper.arxivId ?? null,
      paper.doi ?? null,
      paper.abstract ?? null,
      paper.year ?? null,
      paper.venue ?? null,
      paper.citationCount ?? 0,
      paper.tldr ?? null,
      paper.url ?? null,
      paper.publicationType ?? null,
      paper.primaryTopic ?? null,
      paper.aiSummary ?? null,
      paper.relevanceScore ?? null,
      paper.relevanceReason ?? null,
      paper.summaryStatus ?? null,
      serializedTags,
      serializedAuthors,
      existing.id
    );

    return existing.id;
  }

  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO papers (
      id, projectId, provider, openAlexId, semanticScholarId, arxivId, doi,
      title, authors, abstract, year, venue, citationCount, tldr, url,
      publicationType, primaryTopic, aiSummary, relevanceScore,
      relevanceReason, summaryStatus, notes, tags, addedAt
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    projectId,
    paper.provider ?? null,
    paper.openAlexId ?? null,
    paper.semanticScholarId ?? null,
    paper.arxivId ?? null,
    paper.doi ?? null,
    paper.title,
    serializedAuthors,
    paper.abstract ?? null,
    paper.year ?? null,
    paper.venue ?? null,
    paper.citationCount ?? 0,
    paper.tldr ?? null,
    paper.url ?? null,
    paper.publicationType ?? null,
    paper.primaryTopic ?? null,
    paper.aiSummary ?? null,
    paper.relevanceScore ?? null,
    paper.relevanceReason ?? null,
    paper.summaryStatus ?? null,
    paper.notes ?? null,
    serializedTags,
    Date.now()
  );
  return id;
}

export function updatePaperNotes(id: string, notes: string): void {
  const db = getDb();
  db.prepare("UPDATE papers SET notes = ? WHERE id = ?").run(notes, id);
}

export function updatePaperEnrichment(
  id: string,
  updates: {
    aiSummary?: string | null;
    relevanceScore?: number | null;
    relevanceReason?: string | null;
    summaryStatus?: string | null;
  }
): void {
  const db = getDb();
  db.prepare(
    `UPDATE papers
     SET aiSummary = COALESCE(?, aiSummary),
         relevanceScore = COALESCE(?, relevanceScore),
         relevanceReason = COALESCE(?, relevanceReason),
         summaryStatus = COALESCE(?, summaryStatus)
     WHERE id = ?`
  ).run(
    updates.aiSummary ?? null,
    updates.relevanceScore ?? null,
    updates.relevanceReason ?? null,
    updates.summaryStatus ?? null,
    id
  );
}

export function removePaper(id: string): void {
  const db = getDb();
  db.prepare("DELETE FROM papers WHERE id = ?").run(id);
}
