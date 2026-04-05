// Simple string type alias (Convex used branded types, we use plain strings)
export type Id<T extends string> = string & { readonly __tableName?: T };

export type ConversationContextType = "experiment_blocker";

export type HypothesisKind = "custom" | "reproduction";

export type HypothesisStatus =
  | "proposed"
  | "active"
  | "completed"
  | "failed"
  | "abandoned";

export type HypothesisWorkflowStatus =
  | "draft"
  | "planned"
  | "running"
  | "near_match"
  | "reproduced"
  | "approximately_reproduced"
  | "partially_reproduced"
  | "not_reproduced"
  | "completed"
  | "failed"
  | "blocked"
  | "unsupported";

export type ExperimentStatus =
  | "planned"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export type SupportabilityLabel =
  | "high_support"
  | "medium_support"
  | "low_support"
  | "unsupported";

export type ReproducibilityClass =
  | "fully_supported"
  | "partially_supported"
  | "not_reproducible";

export interface Project {
  _id: Id<"projects">;
  _creationTime: number;
  name: string;
  ownerId: string;
  updatedAt: number;
  template?: string;
  topic?: string | null;
}

export interface File {
  _id: Id<"files">;
  _creationTime: number;
  projectId: Id<"projects">;
  parentId?: Id<"files">;
  name: string;
  type: "file" | "folder";
  content?: string;
  storageId?: string;
  updatedAt: number;
}

export interface Conversation {
  _id: Id<"conversations">;
  _creationTime: number;
  projectId: Id<"projects">;
  title: string;
  updatedAt: number;
  contextType?: ConversationContextType | null;
  contextId?: string | null;
  contextPayload?: string | null;
}

export interface Message {
  _id: Id<"messages">;
  _creationTime: number;
  conversationId: Id<"conversations">;
  projectId: Id<"projects">;
  role: "user" | "assistant";
  content: string;
  status?: "processing" | "completed" | "cancelled";
}

export interface ProjectSkill {
  _id: Id<"project_skills">;
  _creationTime: number;
  projectId: string;
  skillId: string;
  skillName: string;
  category: string;
  activatedAt: number;
}

export interface Hypothesis {
  _id: Id<"hypotheses">;
  _creationTime: number;
  projectId: string;
  title: string;
  description: string;
  status: HypothesisStatus;
  rationale: string;
  expectedOutcome: string;
  actualOutcome: string | null;
  priority: number;
  createdAt: number;
  completedAt: number | null;
  kind: HypothesisKind;
  paperId: Id<"papers"> | null;
  workflowStatus: HypothesisWorkflowStatus | null;
  phase: string | null;
  verdict: string | null;
  targetMetric: string | null;
  targetValue: number | null;
  tolerance: number | null;
  bestValue: number | null;
  gap: number | null;
  supportabilityLabel: SupportabilityLabel | null;
  currentExperimentId: Id<"experiments"> | null;
  lastActivityAt: number | null;
  blockedAt: number | null;
}

export interface Experiment {
  _id: Id<"experiments">;
  _creationTime: number;
  projectId: string;
  hypothesisId: string;
  name: string;
  protocol: string;
  status: ExperimentStatus;
  skillsUsed: string;
  config: string;
  results: string | null;
  metrics: string;
  logs: string | null;
  startedAt: number | null;
  completedAt: number | null;
  attemptNumber: number;
  workflowStatus: string | null;
  executionMode: string | null;
  fallbackMode: string | null;
  runnerId: string | null;
  phase: string | null;
  innerLoopCount: number;
  outerLoopCount: number;
  environmentManifest: string | null;
  progressPercent: number;
  progressDetails: string;
}

export interface ResearchState {
  _id: Id<"research_state">;
  _creationTime: number;
  projectId: string;
  phase: "idle" | "bootstrap" | "inner_loop" | "outer_loop" | "finalizing" | "completed";
  currentHypothesisId: string | null;
  findings: string;
  researchQuestion: string;
  directionDecision: "DEEPEN" | "BROADEN" | "PIVOT" | "CONCLUDE" | null;
  experimentCount: number;
  innerLoopCount: number;
  outerLoopCount: number;
  lastUpdated: number;
}

export interface ResearchLogEntry {
  _id: Id<"research_log">;
  _creationTime: number;
  projectId: string;
  timestamp: number;
  action: string;
  phase: string;
  details: string;
  relatedId: string | null;
}

export interface ResearchMemoryEntry {
  _id: Id<"research_memory">;
  _creationTime: number;
  projectId: string;
  type: "discovery" | "dead_end" | "decision" | "insight" | "context";
  content: string;
  source: string | null;
  pinned: number;
  createdAt: number;
}

export interface Paper {
  _id: Id<"papers">;
  _creationTime: number;
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
  paperType: string | null;
  supportabilityLabel: SupportabilityLabel | null;
  reproducibilityClass: ReproducibilityClass | null;
  supportabilityScore: number | null;
  supportabilityReason: string | null;
  officialRepoUrl: string | null;
  supplementaryUrls: string | null;
  pdfUrl: string | null;
  sourceDiscoveryStatus: string | null;
  supportabilityUpdatedAt: number | null;
}

export interface ReproductionPlan {
  _id: Id<"reproduction_plans">;
  _creationTime: number;
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

export interface ExperimentFinding {
  _id: Id<"experiment_findings">;
  _creationTime: number;
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

export interface ExperimentLogEntry {
  _id: Id<"experiment_logs">;
  _creationTime: number;
  projectId: string;
  hypothesisId: string;
  experimentId: string;
  phase: string;
  kind: string;
  message: string;
  metadata: string | null;
  timestamp: number;
}

export interface ExperimentArtifact {
  _id: Id<"experiment_artifacts">;
  _creationTime: number;
  projectId: string;
  hypothesisId: string;
  experimentId: string;
  type: string;
  uri: string;
  metadata: string | null;
  createdAt: number;
}

export interface ExecutionJob {
  _id: Id<"execution_jobs">;
  _creationTime: number;
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

export interface CustomExperimentContext {
  _id: Id<"custom_experiment_contexts">;
  _creationTime: number;
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

export interface ExperimentBlocker {
  _id: Id<"experiment_blockers">;
  _creationTime: number;
  projectId: string;
  hypothesisId: string;
  experimentId: string;
  status: "open" | "resolved";
  blockerType: string;
  message: string;
  requiredInput: string | null;
  resolution: string | null;
  createdAt: number;
  resolvedAt: number | null;
}

export interface WorkflowCheckpoint {
  _id: Id<"workflow_checkpoints">;
  _creationTime: number;
  projectId: string;
  hypothesisId: string;
  experimentId: string;
  stage: string;
  status: string;
  payload: string | null;
  createdAt: number;
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

// Map table names to their document types (replaces Convex's Doc<T>)
interface TableMap {
  projects: Project;
  files: File;
  conversations: Conversation;
  messages: Message;
  project_skills: ProjectSkill;
  hypotheses: Hypothesis;
  experiments: Experiment;
  research_state: ResearchState;
  research_log: ResearchLogEntry;
  research_memory: ResearchMemoryEntry;
  papers: Paper;
  reproduction_plans: ReproductionPlan;
  custom_experiment_contexts: CustomExperimentContext;
  experiment_findings: ExperimentFinding;
  experiment_logs: ExperimentLogEntry;
  experiment_artifacts: ExperimentArtifact;
  execution_jobs: ExecutionJob;
  experiment_blockers: ExperimentBlocker;
  workflow_checkpoints: WorkflowCheckpoint;
}

export type Doc<T extends keyof TableMap> = TableMap[T];
