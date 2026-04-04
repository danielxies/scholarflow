// Simple string type alias (Convex used branded types, we use plain strings)
export type Id<T extends string> = string & { readonly __tableName?: T };

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
  status: "proposed" | "active" | "completed" | "failed" | "abandoned";
  rationale: string;
  expectedOutcome: string;
  actualOutcome: string | null;
  priority: number;
  createdAt: number;
  completedAt: number | null;
}

export interface Experiment {
  _id: Id<"experiments">;
  _creationTime: number;
  projectId: string;
  hypothesisId: string;
  name: string;
  protocol: string;
  status: "planned" | "running" | "completed" | "failed" | "cancelled";
  skillsUsed: string;
  config: string;
  results: string | null;
  metrics: string;
  logs: string | null;
  startedAt: number | null;
  completedAt: number | null;
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
}

export type Doc<T extends keyof TableMap> = TableMap[T];
