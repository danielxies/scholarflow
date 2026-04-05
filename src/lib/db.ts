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
  ensureColumn(db, "conversations", "contextType", "TEXT");
  ensureColumn(db, "conversations", "contextId", "TEXT");
  ensureColumn(db, "conversations", "contextPayload", "TEXT");
  ensureColumn(db, "papers", "provider", "TEXT");
  ensureColumn(db, "papers", "openAlexId", "TEXT");
  ensureColumn(db, "papers", "publicationType", "TEXT");
  ensureColumn(db, "papers", "primaryTopic", "TEXT");
  ensureColumn(db, "papers", "aiSummary", "TEXT");
  ensureColumn(db, "papers", "relevanceScore", "INTEGER");
  ensureColumn(db, "papers", "relevanceReason", "TEXT");
  ensureColumn(db, "papers", "summaryStatus", "TEXT");
  ensureColumn(db, "papers", "paperType", "TEXT");
  ensureColumn(db, "papers", "supportabilityLabel", "TEXT");
  ensureColumn(db, "papers", "reproducibilityClass", "TEXT");
  ensureColumn(db, "papers", "supportabilityScore", "INTEGER");
  ensureColumn(db, "papers", "supportabilityReason", "TEXT");
  ensureColumn(db, "papers", "officialRepoUrl", "TEXT");
  ensureColumn(db, "papers", "supplementaryUrls", "TEXT");
  ensureColumn(db, "papers", "pdfUrl", "TEXT");
  ensureColumn(db, "papers", "sourceDiscoveryStatus", "TEXT");
  ensureColumn(db, "papers", "supportabilityUpdatedAt", "INTEGER");
  ensureColumn(db, "hypotheses", "kind", "TEXT NOT NULL DEFAULT 'custom'");
  ensureColumn(db, "hypotheses", "paperId", "TEXT");
  ensureColumn(db, "hypotheses", "workflowStatus", "TEXT");
  ensureColumn(db, "hypotheses", "phase", "TEXT");
  ensureColumn(db, "hypotheses", "verdict", "TEXT");
  ensureColumn(db, "hypotheses", "targetMetric", "TEXT");
  ensureColumn(db, "hypotheses", "targetValue", "REAL");
  ensureColumn(db, "hypotheses", "tolerance", "REAL");
  ensureColumn(db, "hypotheses", "bestValue", "REAL");
  ensureColumn(db, "hypotheses", "gap", "REAL");
  ensureColumn(db, "hypotheses", "supportabilityLabel", "TEXT");
  ensureColumn(db, "hypotheses", "currentExperimentId", "TEXT");
  ensureColumn(db, "hypotheses", "lastActivityAt", "INTEGER");
  ensureColumn(db, "hypotheses", "blockedAt", "INTEGER");
  ensureColumn(db, "experiments", "attemptNumber", "INTEGER NOT NULL DEFAULT 1");
  ensureColumn(db, "experiments", "workflowStatus", "TEXT");
  ensureColumn(db, "experiments", "executionMode", "TEXT");
  ensureColumn(db, "experiments", "fallbackMode", "TEXT");
  ensureColumn(db, "experiments", "runnerId", "TEXT");
  ensureColumn(db, "experiments", "phase", "TEXT");
  ensureColumn(db, "experiments", "innerLoopCount", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "experiments", "outerLoopCount", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "experiments", "environmentManifest", "TEXT");
  ensureColumn(db, "experiments", "progressPercent", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "experiments", "progressDetails", "TEXT NOT NULL DEFAULT ''");

  db.exec(`
    CREATE TABLE IF NOT EXISTS reproduction_plans (
      id                   TEXT PRIMARY KEY,
      projectId            TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      hypothesisId         TEXT NOT NULL REFERENCES hypotheses(id) ON DELETE CASCADE,
      experimentId         TEXT NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
      paperId              TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
      paperType            TEXT,
      targetClaim          TEXT NOT NULL,
      targetMetric         TEXT,
      targetValue          REAL,
      tolerance            REAL,
      primaryExecutionMode TEXT NOT NULL,
      fallbackExecutionMode TEXT,
      acceptedSources      TEXT NOT NULL DEFAULT '[]',
      datasetSpec          TEXT,
      environmentSpec      TEXT,
      assumptionPolicy     TEXT NOT NULL,
      escalationPolicy     TEXT NOT NULL,
      successPolicy        TEXT NOT NULL,
      settingsSnapshot     TEXT NOT NULL DEFAULT '{}',
      createdAt            INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_reproduction_plans_hypothesis
      ON reproduction_plans (hypothesisId, createdAt DESC);

    CREATE TABLE IF NOT EXISTS custom_experiment_contexts (
      id               TEXT PRIMARY KEY,
      projectId        TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      hypothesisId     TEXT NOT NULL REFERENCES hypotheses(id) ON DELETE CASCADE,
      experimentId     TEXT NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
      description      TEXT NOT NULL,
      benchmark        TEXT,
      repoUrl          TEXT,
      datasetNote      TEXT,
      contextPaperIds  TEXT NOT NULL DEFAULT '[]',
      settingsSnapshot TEXT NOT NULL DEFAULT '{}',
      createdAt        INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_custom_experiment_contexts_hypothesis
      ON custom_experiment_contexts (hypothesisId, createdAt DESC);
    CREATE INDEX IF NOT EXISTS idx_custom_experiment_contexts_experiment
      ON custom_experiment_contexts (experimentId, createdAt DESC);

    CREATE TABLE IF NOT EXISTS experiment_findings (
      id           TEXT PRIMARY KEY,
      projectId    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      hypothesisId TEXT NOT NULL REFERENCES hypotheses(id) ON DELETE CASCADE,
      experimentId TEXT NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
      type         TEXT NOT NULL,
      severity     TEXT NOT NULL,
      confidence   REAL,
      source       TEXT,
      message      TEXT NOT NULL,
      metadata     TEXT,
      timestamp    INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_experiment_findings_experiment
      ON experiment_findings (experimentId, timestamp DESC);

    CREATE TABLE IF NOT EXISTS experiment_logs (
      id           TEXT PRIMARY KEY,
      projectId    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      hypothesisId TEXT NOT NULL REFERENCES hypotheses(id) ON DELETE CASCADE,
      experimentId TEXT NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
      phase        TEXT NOT NULL,
      kind         TEXT NOT NULL,
      message      TEXT NOT NULL,
      metadata     TEXT,
      timestamp    INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_experiment_logs_experiment
      ON experiment_logs (experimentId, timestamp DESC);

    CREATE TABLE IF NOT EXISTS experiment_artifacts (
      id           TEXT PRIMARY KEY,
      projectId    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      hypothesisId TEXT NOT NULL REFERENCES hypotheses(id) ON DELETE CASCADE,
      experimentId TEXT NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
      type         TEXT NOT NULL,
      uri          TEXT NOT NULL,
      metadata     TEXT,
      createdAt    INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_experiment_artifacts_experiment
      ON experiment_artifacts (experimentId, createdAt DESC);

    CREATE TABLE IF NOT EXISTS execution_jobs (
      id              TEXT PRIMARY KEY,
      projectId       TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      hypothesisId    TEXT NOT NULL REFERENCES hypotheses(id) ON DELETE CASCADE,
      experimentId    TEXT NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
      runnerBackend   TEXT NOT NULL,
      runnerJobId     TEXT NOT NULL,
      status          TEXT NOT NULL,
      computeTier     TEXT,
      repoUrl         TEXT,
      repoRef         TEXT,
      currentCommand  TEXT,
      lastHeartbeatAt INTEGER,
      startedAt       INTEGER,
      completedAt     INTEGER,
      error           TEXT,
      resultSummary   TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_execution_jobs_experiment
      ON execution_jobs (experimentId, rowid DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_execution_jobs_runner
      ON execution_jobs (runnerBackend, runnerJobId);

    CREATE TABLE IF NOT EXISTS experiment_blockers (
      id            TEXT PRIMARY KEY,
      projectId     TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      hypothesisId  TEXT NOT NULL REFERENCES hypotheses(id) ON DELETE CASCADE,
      experimentId  TEXT NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
      status        TEXT NOT NULL DEFAULT 'open',
      blockerType   TEXT NOT NULL,
      message       TEXT NOT NULL,
      requiredInput TEXT,
      resolution    TEXT,
      createdAt     INTEGER NOT NULL,
      resolvedAt    INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_experiment_blockers_hypothesis
      ON experiment_blockers (hypothesisId, createdAt DESC);

    CREATE TABLE IF NOT EXISTS workflow_checkpoints (
      id           TEXT PRIMARY KEY,
      projectId    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      hypothesisId TEXT NOT NULL REFERENCES hypotheses(id) ON DELETE CASCADE,
      experimentId TEXT NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
      stage        TEXT NOT NULL,
      status       TEXT NOT NULL,
      payload      TEXT,
      createdAt    INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_workflow_checkpoints_experiment
      ON workflow_checkpoints (experimentId, createdAt DESC);
  `);

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
  contextType?: string | null;
  contextId?: string | null;
  contextPayload?: string | null;
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
  kind?: string | null;
  paperId?: string | null;
  workflowStatus?: string | null;
  phase?: string | null;
  verdict?: string | null;
  targetMetric?: string | null;
  targetValue?: number | null;
  tolerance?: number | null;
  bestValue?: number | null;
  gap?: number | null;
  supportabilityLabel?: string | null;
  currentExperimentId?: string | null;
  lastActivityAt?: number | null;
  blockedAt?: number | null;
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
  attemptNumber?: number;
  workflowStatus?: string | null;
  executionMode?: string | null;
  fallbackMode?: string | null;
  runnerId?: string | null;
  phase?: string | null;
  innerLoopCount?: number;
  outerLoopCount?: number;
  environmentManifest?: string | null;
  progressPercent?: number;
  progressDetails?: string | null;
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
  paperType?: string | null;
  supportabilityLabel?: string | null;
  reproducibilityClass?: string | null;
  supportabilityScore?: number | null;
  supportabilityReason?: string | null;
  officialRepoUrl?: string | null;
  supplementaryUrls?: string | null;
  pdfUrl?: string | null;
  sourceDiscoveryStatus?: string | null;
  supportabilityUpdatedAt?: number | null;
}

interface ReproductionPlanRow {
  id: string;
  projectId: string;
  hypothesisId: string;
  experimentId: string;
  paperId: string;
  paperType: string | null;
  targetClaim: string;
  targetMetric: string | null;
  targetValue: number | null;
  tolerance: number | null;
  primaryExecutionMode: string;
  fallbackExecutionMode: string | null;
  acceptedSources: string;
  datasetSpec: string | null;
  environmentSpec: string | null;
  assumptionPolicy: string;
  escalationPolicy: string;
  successPolicy: string;
  settingsSnapshot: string;
  createdAt: number;
}

interface CustomExperimentContextRow {
  id: string;
  projectId: string;
  hypothesisId: string;
  experimentId: string;
  description: string;
  benchmark: string | null;
  repoUrl: string | null;
  datasetNote: string | null;
  contextPaperIds: string;
  settingsSnapshot: string;
  createdAt: number;
}

interface ExperimentFindingRow {
  id: string;
  projectId: string;
  hypothesisId: string;
  experimentId: string;
  type: string;
  severity: string;
  confidence: number | null;
  source: string | null;
  message: string;
  metadata: string | null;
  timestamp: number;
}

interface ExperimentLogRow {
  id: string;
  projectId: string;
  hypothesisId: string;
  experimentId: string;
  phase: string;
  kind: string;
  message: string;
  metadata: string | null;
  timestamp: number;
}

interface ExperimentArtifactRow {
  id: string;
  projectId: string;
  hypothesisId: string;
  experimentId: string;
  type: string;
  uri: string;
  metadata: string | null;
  createdAt: number;
}

interface ExecutionJobRow {
  id: string;
  projectId: string;
  hypothesisId: string;
  experimentId: string;
  runnerBackend: string;
  runnerJobId: string;
  status: string;
  computeTier: string | null;
  repoUrl: string | null;
  repoRef: string | null;
  currentCommand: string | null;
  lastHeartbeatAt: number | null;
  startedAt: number | null;
  completedAt: number | null;
  error: string | null;
  resultSummary: string | null;
}

interface ExperimentBlockerRow {
  id: string;
  projectId: string;
  hypothesisId: string;
  experimentId: string;
  status: string;
  blockerType: string;
  message: string;
  requiredInput: string | null;
  resolution: string | null;
  createdAt: number;
  resolvedAt: number | null;
}

interface WorkflowCheckpointRow {
  id: string;
  projectId: string;
  hypothesisId: string;
  experimentId: string;
  stage: string;
  status: string;
  payload: string | null;
  createdAt: number;
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
export interface ReproductionPlan extends Omit<ReproductionPlanRow, "id"> {
  _id: string;
  _creationTime: number;
}
export interface CustomExperimentContext
  extends Omit<CustomExperimentContextRow, "id"> {
  _id: string;
  _creationTime: number;
}
export interface ExperimentFinding extends Omit<ExperimentFindingRow, "id"> {
  _id: string;
  _creationTime: number;
}
export interface ExperimentLogEntry extends Omit<ExperimentLogRow, "id"> {
  _id: string;
  _creationTime: number;
}
export interface ExperimentArtifact extends Omit<ExperimentArtifactRow, "id"> {
  _id: string;
  _creationTime: number;
}
export interface ExecutionJob extends Omit<ExecutionJobRow, "id"> {
  _id: string;
  _creationTime: number;
}
export interface ExperimentBlocker extends Omit<ExperimentBlockerRow, "id"> {
  _id: string;
  _creationTime: number;
}
export interface WorkflowCheckpoint extends Omit<WorkflowCheckpointRow, "id"> {
  _id: string;
  _creationTime: number;
}
export interface ExperimentWorkspace {
  hypothesis: Hypothesis;
  experiment: Experiment | null;
  plan: ReproductionPlan | null;
  customContext: CustomExperimentContext | null;
  blocker: ExperimentBlocker | null;
  findings: ExperimentFinding[];
  logs: ExperimentLogEntry[];
  artifacts: ExperimentArtifact[];
  executionJob: ExecutionJob | null;
  checkpoints: WorkflowCheckpoint[];
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

export function getConversationByContext(
  projectId: string,
  contextType: string,
  contextId: string
): Conversation | undefined {
  const db = getDb();
  const row = db
    .prepare(
      "SELECT * FROM conversations WHERE projectId = ? AND contextType = ? AND contextId = ? ORDER BY updatedAt DESC LIMIT 1"
    )
    .get(projectId, contextType, contextId) as ConversationRow | undefined;
  return row ? mapRow(row) as Conversation : undefined;
}

export function createConversation(
  projectId: string,
  title: string,
  options?: {
    contextType?: string | null;
    contextId?: string | null;
    contextPayload?: string | null;
  }
): string {
  const db = getDb();
  const id = crypto.randomUUID();
  const now = Date.now();
  db.prepare(
    "INSERT INTO conversations (id, projectId, title, updatedAt, contextType, contextId, contextPayload) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(
    id,
    projectId,
    title,
    now,
    options?.contextType ?? null,
    options?.contextId ?? null,
    options?.contextPayload ?? null
  );
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
    .prepare(
      "SELECT * FROM hypotheses WHERE projectId = ? ORDER BY createdAt DESC, rowid DESC"
    )
    .all(projectId) as HypothesisRow[];
  return mapRows(rows) as Hypothesis[];
}

export function generateUniqueHypothesisTitle(
  projectId: string,
  desiredTitle: string
): string {
  return generateUniqueHypothesisTitleExcluding(projectId, desiredTitle);
}

export function generateUniqueHypothesisTitleExcluding(
  projectId: string,
  desiredTitle: string,
  excludedHypothesisId?: string
): string {
  const db = getDb();
  const baseTitle = desiredTitle.trim();
  if (!baseTitle) {
    return desiredTitle;
  }

  const rows = excludedHypothesisId
    ? ((db
        .prepare("SELECT title FROM hypotheses WHERE projectId = ? AND id != ?")
        .all(projectId, excludedHypothesisId) as Array<{ title: string }>))
    : ((db
        .prepare("SELECT title FROM hypotheses WHERE projectId = ?")
        .all(projectId) as Array<{ title: string }>));

  let maxOrdinal = 0;
  const exactPattern = new RegExp(`^${escapeRegExp(baseTitle)}(?: \\((\\d+)\\))?$`);

  for (const row of rows) {
    const match = row.title.match(exactPattern);
    if (!match) continue;
    const ordinal = match[1] ? Number(match[1]) : 1;
    if (Number.isFinite(ordinal)) {
      maxOrdinal = Math.max(maxOrdinal, ordinal);
    }
  }

  return maxOrdinal === 0 ? baseTitle : `${baseTitle} (${maxOrdinal + 1})`;
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
  expectedOutcome: string,
  options?: Partial<
    Pick<
      HypothesisRow,
      | "kind"
      | "paperId"
      | "workflowStatus"
      | "phase"
      | "verdict"
      | "targetMetric"
      | "targetValue"
      | "tolerance"
      | "bestValue"
      | "gap"
      | "supportabilityLabel"
      | "currentExperimentId"
      | "lastActivityAt"
      | "blockedAt"
    >
  >
): string {
  const db = getDb();
  const id = crypto.randomUUID();
  const now = Date.now();
  db.prepare(
    `INSERT INTO hypotheses (
      id, projectId, title, description, rationale, expectedOutcome, createdAt,
      kind, paperId, workflowStatus, phase, verdict, targetMetric, targetValue,
      tolerance, bestValue, gap, supportabilityLabel, currentExperimentId,
      lastActivityAt, blockedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    projectId,
    title,
    description,
    rationale,
    expectedOutcome,
    now,
    options?.kind ?? "custom",
    options?.paperId ?? null,
    options?.workflowStatus ?? null,
    options?.phase ?? null,
    options?.verdict ?? null,
    options?.targetMetric ?? null,
    options?.targetValue ?? null,
    options?.tolerance ?? null,
    options?.bestValue ?? null,
    options?.gap ?? null,
    options?.supportabilityLabel ?? null,
    options?.currentExperimentId ?? null,
    options?.lastActivityAt ?? now,
    options?.blockedAt ?? null
  );
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

export function updateHypothesis(
  id: string,
  updates: Partial<HypothesisRow>
): void {
  const db = getDb();
  const setClauses: string[] = [];
  const values: unknown[] = [];

  for (const [key, value] of Object.entries(updates)) {
    if (key === "id" || key === "projectId" || value === undefined) continue;
    setClauses.push(`${key} = ?`);
    values.push(value);
  }

  if (setClauses.length === 0) return;

  if (!Object.prototype.hasOwnProperty.call(updates, "lastActivityAt")) {
    setClauses.push("lastActivityAt = ?");
    values.push(Date.now());
  }

  values.push(id);
  db.prepare(`UPDATE hypotheses SET ${setClauses.join(", ")} WHERE id = ?`).run(...values);
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
    .prepare("SELECT * FROM experiments WHERE hypothesisId = ? ORDER BY attemptNumber ASC, rowid ASC")
    .all(hypothesisId) as ExperimentRow[];
  return mapRows(rows) as Experiment[];
}

export function getExperimentById(id: string): Experiment | undefined {
  const db = getDb();
  const row = db.prepare("SELECT * FROM experiments WHERE id = ?").get(id) as ExperimentRow | undefined;
  return row ? (mapRow(row) as Experiment) : undefined;
}

export function getLatestExperimentByHypothesis(
  hypothesisId: string
): Experiment | undefined {
  const db = getDb();
  const row = db
    .prepare(
      "SELECT * FROM experiments WHERE hypothesisId = ? ORDER BY attemptNumber DESC, rowid DESC LIMIT 1"
    )
    .get(hypothesisId) as ExperimentRow | undefined;
  return row ? (mapRow(row) as Experiment) : undefined;
}

export function createExperiment(
  projectId: string,
  hypothesisId: string,
  name: string,
  protocol: string,
  skillsUsed: string[],
  config: Record<string, unknown>,
  options?: Partial<
    Pick<
      ExperimentRow,
      | "attemptNumber"
      | "workflowStatus"
      | "executionMode"
      | "fallbackMode"
      | "runnerId"
      | "phase"
      | "innerLoopCount"
      | "outerLoopCount"
      | "environmentManifest"
      | "progressPercent"
      | "progressDetails"
      | "results"
      | "metrics"
      | "logs"
      | "startedAt"
      | "completedAt"
      | "status"
    >
  >
): string {
  const db = getDb();
  const id = crypto.randomUUID();
  const nextAttempt =
    options?.attemptNumber ??
    (((db
      .prepare("SELECT MAX(attemptNumber) as maxAttempt FROM experiments WHERE hypothesisId = ?")
      .get(hypothesisId) as { maxAttempt?: number | null } | undefined)?.maxAttempt ?? 0) + 1);
  db.prepare(
    `INSERT INTO experiments (
      id, projectId, hypothesisId, name, protocol, status, skillsUsed, config,
      results, metrics, logs, startedAt, completedAt, attemptNumber,
      workflowStatus, executionMode, fallbackMode, runnerId, phase,
      innerLoopCount, outerLoopCount, environmentManifest, progressPercent,
      progressDetails
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    projectId,
    hypothesisId,
    name,
    protocol,
    options?.status ?? "planned",
    JSON.stringify(skillsUsed),
    JSON.stringify(config),
    options?.results ?? null,
    options?.metrics ?? "{}",
    options?.logs ?? null,
    options?.startedAt ?? null,
    options?.completedAt ?? null,
    nextAttempt,
    options?.workflowStatus ?? null,
    options?.executionMode ?? null,
    options?.fallbackMode ?? null,
    options?.runnerId ?? null,
    options?.phase ?? null,
    options?.innerLoopCount ?? 0,
    options?.outerLoopCount ?? 0,
    options?.environmentManifest ?? null,
    options?.progressPercent ?? 0,
    options?.progressDetails ?? ""
  );
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

export function updateExperiment(
  id: string,
  updates: Partial<ExperimentRow>
): void {
  const db = getDb();
  const setClauses: string[] = [];
  const values: unknown[] = [];

  for (const [key, value] of Object.entries(updates)) {
    if (key === "id" || key === "projectId" || key === "hypothesisId" || value === undefined) continue;
    setClauses.push(`${key} = ?`);
    values.push(value);
  }

  if (setClauses.length === 0) return;

  values.push(id);
  db.prepare(`UPDATE experiments SET ${setClauses.join(", ")} WHERE id = ?`).run(...values);
}

export function updateExperimentResults(
  id: string,
  results: string,
  metrics: Record<string, number>
): void {
  const db = getDb();
  db.prepare(
    "UPDATE experiments SET results = ?, metrics = ?, status = 'completed', workflowStatus = COALESCE(workflowStatus, 'completed'), completedAt = ? WHERE id = ?"
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
// Reproduction workflow
// ---------------------------------------------------------------------------

export function createReproductionPlan(
  plan: Omit<ReproductionPlanRow, "id" | "createdAt">
): string {
  const db = getDb();
  const id = crypto.randomUUID();
  const createdAt = Date.now();
  db.prepare(
    `INSERT INTO reproduction_plans (
      id, projectId, hypothesisId, experimentId, paperId, paperType, targetClaim,
      targetMetric, targetValue, tolerance, primaryExecutionMode,
      fallbackExecutionMode, acceptedSources, datasetSpec, environmentSpec,
      assumptionPolicy, escalationPolicy, successPolicy, settingsSnapshot, createdAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    plan.projectId,
    plan.hypothesisId,
    plan.experimentId,
    plan.paperId,
    plan.paperType,
    plan.targetClaim,
    plan.targetMetric,
    plan.targetValue,
    plan.tolerance,
    plan.primaryExecutionMode,
    plan.fallbackExecutionMode,
    plan.acceptedSources,
    plan.datasetSpec,
    plan.environmentSpec,
    plan.assumptionPolicy,
    plan.escalationPolicy,
    plan.successPolicy,
    plan.settingsSnapshot,
    createdAt
  );
  return id;
}

export function getReproductionPlanByHypothesis(
  hypothesisId: string
): ReproductionPlan | undefined {
  const db = getDb();
  const row = db
    .prepare(
      "SELECT * FROM reproduction_plans WHERE hypothesisId = ? ORDER BY createdAt DESC LIMIT 1"
    )
    .get(hypothesisId) as ReproductionPlanRow | undefined;
  return row ? (mapRow(row) as ReproductionPlan) : undefined;
}

export function updateReproductionPlan(
  id: string,
  updates: Partial<ReproductionPlanRow>
): void {
  const db = getDb();
  const setClauses: string[] = [];
  const values: unknown[] = [];

  for (const [key, value] of Object.entries(updates)) {
    if (key === "id" || value === undefined) continue;
    setClauses.push(`${key} = ?`);
    values.push(value);
  }

  if (setClauses.length === 0) return;

  values.push(id);
  db.prepare(`UPDATE reproduction_plans SET ${setClauses.join(", ")} WHERE id = ?`).run(...values);
}

export function createCustomExperimentContext(
  context: Omit<CustomExperimentContextRow, "id" | "createdAt">
): string {
  const db = getDb();
  const id = crypto.randomUUID();
  const createdAt = Date.now();
  db.prepare(
    `INSERT INTO custom_experiment_contexts (
      id, projectId, hypothesisId, experimentId, description, benchmark, repoUrl,
      datasetNote, contextPaperIds, settingsSnapshot, createdAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    context.projectId,
    context.hypothesisId,
    context.experimentId,
    context.description,
    context.benchmark ?? null,
    context.repoUrl ?? null,
    context.datasetNote ?? null,
    context.contextPaperIds,
    context.settingsSnapshot,
    createdAt
  );
  return id;
}

export function getCustomExperimentContextByHypothesis(
  hypothesisId: string
): CustomExperimentContext | undefined {
  const db = getDb();
  const row = db
    .prepare(
      "SELECT * FROM custom_experiment_contexts WHERE hypothesisId = ? ORDER BY createdAt DESC LIMIT 1"
    )
    .get(hypothesisId) as CustomExperimentContextRow | undefined;
  return row ? (mapRow(row) as CustomExperimentContext) : undefined;
}

export function getCustomExperimentContextByExperiment(
  experimentId: string
): CustomExperimentContext | undefined {
  const db = getDb();
  const row = db
    .prepare(
      "SELECT * FROM custom_experiment_contexts WHERE experimentId = ? ORDER BY createdAt DESC LIMIT 1"
    )
    .get(experimentId) as CustomExperimentContextRow | undefined;
  return row ? (mapRow(row) as CustomExperimentContext) : undefined;
}

export function addExperimentFinding(
  finding: Omit<ExperimentFindingRow, "id" | "timestamp">
): string {
  const db = getDb();
  const id = crypto.randomUUID();
  const timestamp = Date.now();
  db.prepare(
    `INSERT INTO experiment_findings (
      id, projectId, hypothesisId, experimentId, type, severity, confidence,
      source, message, metadata, timestamp
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    finding.projectId,
    finding.hypothesisId,
    finding.experimentId,
    finding.type,
    finding.severity,
    finding.confidence ?? null,
    finding.source ?? null,
    finding.message,
    finding.metadata ?? null,
    timestamp
  );
  return id;
}

export function getExperimentFindings(
  experimentId: string
): ExperimentFinding[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM experiment_findings WHERE experimentId = ? ORDER BY timestamp DESC")
    .all(experimentId) as ExperimentFindingRow[];
  return mapRows(rows) as ExperimentFinding[];
}

export function addExperimentLog(
  log: Omit<ExperimentLogRow, "id" | "timestamp">
): string {
  const db = getDb();
  const id = crypto.randomUUID();
  const timestamp = Date.now();
  db.prepare(
    `INSERT INTO experiment_logs (
      id, projectId, hypothesisId, experimentId, phase, kind, message, metadata, timestamp
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    log.projectId,
    log.hypothesisId,
    log.experimentId,
    log.phase,
    log.kind,
    log.message,
    log.metadata ?? null,
    timestamp
  );
  return id;
}

export function getExperimentLogs(
  experimentId: string
): ExperimentLogEntry[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM experiment_logs WHERE experimentId = ? ORDER BY timestamp DESC")
    .all(experimentId) as ExperimentLogRow[];
  return mapRows(rows) as ExperimentLogEntry[];
}

export function addExperimentArtifact(
  artifact: Omit<ExperimentArtifactRow, "id" | "createdAt">
): string {
  const db = getDb();
  const id = crypto.randomUUID();
  const createdAt = Date.now();
  db.prepare(
    `INSERT INTO experiment_artifacts (
      id, projectId, hypothesisId, experimentId, type, uri, metadata, createdAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    artifact.projectId,
    artifact.hypothesisId,
    artifact.experimentId,
    artifact.type,
    artifact.uri,
    artifact.metadata ?? null,
    createdAt
  );
  return id;
}

export function getExperimentArtifacts(
  experimentId: string
): ExperimentArtifact[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM experiment_artifacts WHERE experimentId = ? ORDER BY createdAt DESC")
    .all(experimentId) as ExperimentArtifactRow[];
  return mapRows(rows) as ExperimentArtifact[];
}

export function getLatestExperimentArtifactByType(
  experimentId: string,
  type: string
): ExperimentArtifact | undefined {
  const db = getDb();
  const row = db
    .prepare(
      "SELECT * FROM experiment_artifacts WHERE experimentId = ? AND type = ? ORDER BY createdAt DESC LIMIT 1"
    )
    .get(experimentId, type) as ExperimentArtifactRow | undefined;
  return row ? (mapRow(row) as ExperimentArtifact) : undefined;
}

export function createExecutionJob(
  job: Omit<ExecutionJobRow, "id">
): string {
  const db = getDb();
  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO execution_jobs (
      id, projectId, hypothesisId, experimentId, runnerBackend, runnerJobId,
      status, computeTier, repoUrl, repoRef, currentCommand, lastHeartbeatAt,
      startedAt, completedAt, error, resultSummary
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    job.projectId,
    job.hypothesisId,
    job.experimentId,
    job.runnerBackend,
    job.runnerJobId,
    job.status,
    job.computeTier ?? null,
    job.repoUrl ?? null,
    job.repoRef ?? null,
    job.currentCommand ?? null,
    job.lastHeartbeatAt ?? null,
    job.startedAt ?? null,
    job.completedAt ?? null,
    job.error ?? null,
    job.resultSummary ?? null
  );
  return id;
}

export function getExecutionJobById(id: string): ExecutionJob | undefined {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM execution_jobs WHERE id = ?")
    .get(id) as ExecutionJobRow | undefined;
  return row ? (mapRow(row) as ExecutionJob) : undefined;
}

export function getLatestExecutionJobByExperiment(
  experimentId: string
): ExecutionJob | undefined {
  const db = getDb();
  const row = db
    .prepare(
      "SELECT * FROM execution_jobs WHERE experimentId = ? ORDER BY rowid DESC LIMIT 1"
    )
    .get(experimentId) as ExecutionJobRow | undefined;
  return row ? (mapRow(row) as ExecutionJob) : undefined;
}

export function getExecutionJobByRunnerJobId(
  runnerBackend: string,
  runnerJobId: string
): ExecutionJob | undefined {
  const db = getDb();
  const row = db
    .prepare(
      "SELECT * FROM execution_jobs WHERE runnerBackend = ? AND runnerJobId = ?"
    )
    .get(runnerBackend, runnerJobId) as ExecutionJobRow | undefined;
  return row ? (mapRow(row) as ExecutionJob) : undefined;
}

export function updateExecutionJob(
  id: string,
  updates: Partial<ExecutionJobRow>
): void {
  const db = getDb();
  const setClauses: string[] = [];
  const values: unknown[] = [];

  for (const [key, value] of Object.entries(updates)) {
    if (
      key === "id" ||
      key === "projectId" ||
      key === "hypothesisId" ||
      key === "experimentId" ||
      value === undefined
    ) {
      continue;
    }

    setClauses.push(`${key} = ?`);
    values.push(value);
  }

  if (setClauses.length === 0) return;

  values.push(id);
  db.prepare(`UPDATE execution_jobs SET ${setClauses.join(", ")} WHERE id = ?`).run(
    ...values
  );
}

export function createExperimentBlocker(
  blocker: Omit<
    ExperimentBlockerRow,
    "id" | "createdAt" | "resolvedAt" | "status" | "resolution"
  >
): string {
  const db = getDb();
  const id = crypto.randomUUID();
  const createdAt = Date.now();
  db.prepare(
    `INSERT INTO experiment_blockers (
      id, projectId, hypothesisId, experimentId, status, blockerType, message,
      requiredInput, resolution, createdAt, resolvedAt
    ) VALUES (?, ?, ?, ?, 'open', ?, ?, ?, NULL, ?, NULL)`
  ).run(
    id,
    blocker.projectId,
    blocker.hypothesisId,
    blocker.experimentId,
    blocker.blockerType,
    blocker.message,
    blocker.requiredInput ?? null,
    createdAt
  );
  return id;
}

export function getOpenExperimentBlocker(
  hypothesisId: string
): ExperimentBlocker | undefined {
  const db = getDb();
  const row = db
    .prepare(
      "SELECT * FROM experiment_blockers WHERE hypothesisId = ? AND status = 'open' ORDER BY createdAt DESC LIMIT 1"
    )
    .get(hypothesisId) as ExperimentBlockerRow | undefined;
  return row ? (mapRow(row) as ExperimentBlocker) : undefined;
}

export function getExperimentBlockerById(
  id: string
): ExperimentBlocker | undefined {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM experiment_blockers WHERE id = ?")
    .get(id) as ExperimentBlockerRow | undefined;
  return row ? (mapRow(row) as ExperimentBlocker) : undefined;
}

export function resolveExperimentBlocker(id: string, resolution: string): void {
  const db = getDb();
  db.prepare(
    "UPDATE experiment_blockers SET status = 'resolved', resolution = ?, resolvedAt = ? WHERE id = ?"
  ).run(resolution, Date.now(), id);
}

export function createWorkflowCheckpoint(
  checkpoint: Omit<WorkflowCheckpointRow, "id" | "createdAt">
): string {
  const db = getDb();
  const id = crypto.randomUUID();
  const createdAt = Date.now();
  db.prepare(
    `INSERT INTO workflow_checkpoints (
      id, projectId, hypothesisId, experimentId, stage, status, payload, createdAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    checkpoint.projectId,
    checkpoint.hypothesisId,
    checkpoint.experimentId,
    checkpoint.stage,
    checkpoint.status,
    checkpoint.payload ?? null,
    createdAt
  );
  return id;
}

export function getWorkflowCheckpoints(
  experimentId: string
): WorkflowCheckpoint[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM workflow_checkpoints WHERE experimentId = ? ORDER BY createdAt DESC")
    .all(experimentId) as WorkflowCheckpointRow[];
  return mapRows(rows) as WorkflowCheckpoint[];
}

export function getExperimentWorkspace(
  hypothesisId: string
): ExperimentWorkspace | undefined {
  const hypothesis = getHypothesisById(hypothesisId);
  if (!hypothesis) return undefined;

  const experiment = hypothesis.currentExperimentId
    ? getExperimentById(hypothesis.currentExperimentId)
    : getLatestExperimentByHypothesis(hypothesisId);

  const plan = getReproductionPlanByHypothesis(hypothesisId) ?? null;
  const customContext = getCustomExperimentContextByHypothesis(hypothesisId) ?? null;
  const blocker = getOpenExperimentBlocker(hypothesisId) ?? null;

  if (!experiment) {
    return {
      hypothesis,
      experiment: null,
      plan,
      customContext,
      blocker,
      findings: [],
      logs: [],
      artifacts: [],
      executionJob: null,
      checkpoints: [],
    };
  }

  return {
    hypothesis,
    experiment,
    plan,
    customContext,
    blocker,
    findings: getExperimentFindings(experiment._id),
    logs: getExperimentLogs(experiment._id),
    artifacts: getExperimentArtifacts(experiment._id),
    executionJob: getLatestExecutionJobByExperiment(experiment._id) ?? null,
    checkpoints: getWorkflowCheckpoints(experiment._id),
  };
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
    paperType?: string | null;
    supportabilityLabel?: string | null;
    reproducibilityClass?: string | null;
    supportabilityScore?: number | null;
    supportabilityReason?: string | null;
    officialRepoUrl?: string | null;
    supplementaryUrls?: string | null;
    pdfUrl?: string | null;
    sourceDiscoveryStatus?: string | null;
    supportabilityUpdatedAt?: number | null;
  }
): void {
  const db = getDb();
  db.prepare(
    `UPDATE papers
     SET aiSummary = COALESCE(?, aiSummary),
         relevanceScore = COALESCE(?, relevanceScore),
         relevanceReason = COALESCE(?, relevanceReason),
         summaryStatus = COALESCE(?, summaryStatus),
         paperType = COALESCE(?, paperType),
         supportabilityLabel = COALESCE(?, supportabilityLabel),
         reproducibilityClass = COALESCE(?, reproducibilityClass),
         supportabilityScore = COALESCE(?, supportabilityScore),
         supportabilityReason = COALESCE(?, supportabilityReason),
         officialRepoUrl = COALESCE(?, officialRepoUrl),
         supplementaryUrls = COALESCE(?, supplementaryUrls),
         pdfUrl = COALESCE(?, pdfUrl),
         sourceDiscoveryStatus = COALESCE(?, sourceDiscoveryStatus),
         supportabilityUpdatedAt = COALESCE(?, supportabilityUpdatedAt)
     WHERE id = ?`
  ).run(
    updates.aiSummary ?? null,
    updates.relevanceScore ?? null,
    updates.relevanceReason ?? null,
    updates.summaryStatus ?? null,
    updates.paperType ?? null,
    updates.supportabilityLabel ?? null,
    updates.reproducibilityClass ?? null,
    updates.supportabilityScore ?? null,
    updates.supportabilityReason ?? null,
    updates.officialRepoUrl ?? null,
    updates.supplementaryUrls ?? null,
    updates.pdfUrl ?? null,
    updates.sourceDiscoveryStatus ?? null,
    updates.supportabilityUpdatedAt ?? null,
    id
  );
}

export function removePaper(id: string): void {
  const db = getDb();
  db.prepare("DELETE FROM papers WHERE id = ?").run(id);
}
