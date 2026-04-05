import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  // Projects
  getProjects,
  getProjectsPartial,
  getProjectById,
  createProject,
  renameProject,
  updateProjectTopic,
  // Files
  getFiles,
  getFile,
  getFilePath,
  getFolderContents,
  createFile,
  createFiles,
  createFolder,
  updateFile,
  renameFile,
  deleteFile,
  // Conversations
  getConversationsByProject,
  getConversationById,
  getConversationByContext,
  createConversation,
  updateConversationTitle,
  // Messages
  getMessages,
  createMessage,
  updateMessageContent,
  updateMessageStatus,
  getProcessingMessages,
  getRecentMessages,
  createProjectWithConversation,
  // Research: Skills
  getProjectSkills,
  activateSkill,
  deactivateSkill,
  // Research: Hypotheses
  getHypotheses,
  getHypothesisById,
  createHypothesis,
  updateHypothesisStatus,
  // Research: Experiments
  getExperiments,
  getExperimentsByHypothesis,
  getExperimentWorkspace,
  createExperiment,
  updateExperimentStatus,
  updateExperimentResults,
  // Research: State
  getResearchState,
  upsertResearchState,
  // Research: Log
  getResearchLog,
  addResearchLogEntry,
  // Research: Memory
  getResearchMemory,
  getResearchMemoryByType,
  addResearchMemory,
  toggleMemoryPin,
  deleteResearchMemory,
  // Research: Papers
  getProjectPapers,
  addPaper,
  updatePaperNotes,
  removePaper,
} from "@/lib/db";

// ---------------------------------------------------------------------------
// Route handler map
// ---------------------------------------------------------------------------

type HandlerFn = (
  args: Record<string, unknown>,
  userId: string
) => unknown;

const queryHandlers: Record<string, HandlerFn> = {
  "projects.get": (_args, userId) => getProjects(userId),

  "projects.getPartial": (args, userId) =>
    getProjectsPartial(userId, args.limit as number),

  "projects.getById": (args) => getProjectById(args.id as string),

  "files.getFiles": (args) => getFiles(args.projectId as string),

  "files.getFile": (args) => getFile(args.id as string),

  "files.getFilePath": (args) => getFilePath(args.id as string),

  "files.getFolderContents": (args) =>
    getFolderContents(
      args.projectId as string,
      args.parentId as string | undefined
    ),

  "conversations.getByProject": (args) =>
    getConversationsByProject(args.projectId as string),

  "conversations.getById": (args) =>
    getConversationById(args.id as string),

  "conversations.getByContext": (args) =>
    getConversationByContext(
      args.projectId as string,
      args.contextType as string,
      args.contextId as string
    ),

  "conversations.getMessages": (args) =>
    getMessages(args.conversationId as string),

  "messages.getProcessing": (args) =>
    getProcessingMessages(args.projectId as string),

  "messages.getRecent": (args) =>
    getRecentMessages(
      args.conversationId as string,
      args.limit as number
    ),

  // Research
  "projectSkills.get": (args) =>
    getProjectSkills(args.projectId as string),
  "hypotheses.getByProject": (args) =>
    getHypotheses(args.projectId as string),
  "hypotheses.getById": (args) =>
    getHypothesisById(args.id as string),
  "experiments.getByProject": (args) =>
    getExperiments(args.projectId as string),
  "experiments.getByHypothesis": (args) =>
    getExperimentsByHypothesis(args.hypothesisId as string),
  "experiments.getWorkspace": (args) =>
    getExperimentWorkspace(args.hypothesisId as string),
  "researchState.get": (args) =>
    getResearchState(args.projectId as string),
  "researchLog.get": (args) =>
    getResearchLog(args.projectId as string, (args.limit as number) ?? 50),
  "researchMemory.get": (args) =>
    getResearchMemory(args.projectId as string),
  "researchMemory.getByType": (args) =>
    getResearchMemoryByType(args.projectId as string, args.type as string),
  "papers.getByProject": (args) =>
    getProjectPapers(args.projectId as string),
};

const mutationHandlers: Record<string, HandlerFn> = {
  "projects.create": (args, userId) =>
    createProject(
      args.name as string,
      userId,
      args.template as string | undefined,
      args.topic as string | undefined
    ),

  "projects.rename": (args) =>
    renameProject(args.id as string, args.name as string),

  "projects.updateTopic": (args) =>
    updateProjectTopic(args.id as string, args.topic as string),

  "files.createFile": (args) =>
    createFile(
      args.projectId as string,
      args.name as string,
      args.content as string,
      args.parentId as string | undefined
    ),

  "files.createFiles": (args) =>
    createFiles(
      args.projectId as string,
      args.files as { name: string; content: string }[],
      args.parentId as string | undefined
    ),

  "files.createFolder": (args) =>
    createFolder(
      args.projectId as string,
      args.name as string,
      args.parentId as string | undefined
    ),

  "files.updateFile": (args) =>
    updateFile(args.id as string, args.content as string),

  "files.renameFile": (args) =>
    renameFile(args.id as string, args.newName as string),

  "files.deleteFile": (args) => deleteFile(args.id as string),

  "conversations.create": (args) =>
    createConversation(
      args.projectId as string,
      args.title as string,
      {
        contextType: (args.contextType as string | undefined) ?? null,
        contextId: (args.contextId as string | undefined) ?? null,
        contextPayload: (args.contextPayload as string | undefined) ?? null,
      }
    ),

  "conversations.updateTitle": (args) =>
    updateConversationTitle(args.id as string, args.title as string),

  "messages.create": (args) =>
    createMessage(
      args.conversationId as string,
      args.projectId as string,
      args.role as string,
      args.content as string,
      args.status as string | undefined
    ),

  "messages.updateContent": (args) =>
    updateMessageContent(args.id as string, args.content as string),

  "messages.updateStatus": (args) =>
    updateMessageStatus(args.id as string, args.status as string),

  "projects.createWithConversation": (args, userId) =>
    createProjectWithConversation(
      args.projectName as string,
      args.conversationTitle as string,
      userId,
      args.template as string | undefined,
      args.topic as string | undefined
    ),

  // Research
  "projectSkills.activate": (args) =>
    activateSkill(
      args.projectId as string,
      args.skillId as string,
      args.skillName as string,
      args.category as string
    ),
  "projectSkills.deactivate": (args) =>
    deactivateSkill(args.projectId as string, args.skillId as string),
  "hypotheses.create": (args) =>
    createHypothesis(
      args.projectId as string,
      args.title as string,
      args.description as string,
      args.rationale as string,
      args.expectedOutcome as string
    ),
  "hypotheses.updateStatus": (args) =>
    updateHypothesisStatus(
      args.id as string,
      args.status as string,
      args.actualOutcome as string | undefined
    ),
  "experiments.create": (args) =>
    createExperiment(
      args.projectId as string,
      args.hypothesisId as string,
      args.name as string,
      args.protocol as string,
      args.skillsUsed as string[],
      args.config as Record<string, unknown>
    ),
  "experiments.updateStatus": (args) =>
    updateExperimentStatus(args.id as string, args.status as string),
  "experiments.updateResults": (args) =>
    updateExperimentResults(
      args.id as string,
      args.results as string,
      args.metrics as Record<string, number>
    ),
  "researchState.upsert": (args) =>
    upsertResearchState(
      args.projectId as string,
      args.updates as Record<string, unknown>
    ),
  "researchLog.add": (args) =>
    addResearchLogEntry(
      args.projectId as string,
      args.action as string,
      args.phase as string,
      args.details as string,
      args.relatedId as string | undefined
    ),
  "researchMemory.add": (args) =>
    addResearchMemory(
      args.projectId as string,
      args.type as string,
      args.content as string,
      args.source as string | undefined
    ),
  "researchMemory.togglePin": (args) =>
    toggleMemoryPin(args.id as string),
  "researchMemory.delete": (args) =>
    deleteResearchMemory(args.id as string),
  "papers.add": (args) =>
    addPaper(args.projectId as string, args.paper as Parameters<typeof addPaper>[1]),
  "papers.updateNotes": (args) =>
    updatePaperNotes(args.id as string, args.notes as string),
  "papers.remove": (args) =>
    removePaper(args.id as string),
};

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { operation, path, args = {} } = body as {
      operation: "query" | "mutation";
      path: string;
      args?: Record<string, unknown>;
    };

    if (!operation || !path) {
      return NextResponse.json(
        { error: "Missing required fields: operation, path" },
        { status: 400 }
      );
    }

    const handlers =
      operation === "query" ? queryHandlers : mutationHandlers;
    const handler = handlers[path];

    if (!handler) {
      return NextResponse.json(
        { error: `Unknown ${operation} path: ${path}` },
        { status: 404 }
      );
    }

    const data = handler(args, userId);
    return NextResponse.json({ data });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Internal server error";
    console.error(`[db api] Error:`, err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
