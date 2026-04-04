/**
 * Server-side client that replaces ConvexHttpClient.
 *
 * Instead of making HTTP calls, this imports `@/lib/db` directly and maps
 * "system.*" path strings to the corresponding function calls.
 *
 * Usage (in API routes / Inngest):
 *   import { db } from "@/lib/local-db/client";
 *   const files = await db.query("system.getProjectFiles", { projectId });
 *   await db.mutation("system.updateFile", { fileId, content });
 */

import * as dbOps from "@/lib/db";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Args = Record<string, any>;

/**
 * Strip the `internalKey` field that Convex auth required — we don't need
 * it in the local setup.
 */
function cleanArgs<T extends Args>(args: T): Omit<T, "internalKey"> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { internalKey, ...rest } = args;
  return rest as Omit<T, "internalKey">;
}

// ---------------------------------------------------------------------------
// Path -> function dispatch
// ---------------------------------------------------------------------------

async function dispatch(path: string, rawArgs: Args): Promise<unknown> {
  const args = cleanArgs(rawArgs);

  switch (path) {
    // ---- Queries ----
    case "system.getProjectFiles":
      return dbOps.getFiles(args.projectId);

    case "system.getFileById":
      return dbOps.getFile(args.fileId);

    case "system.getConversationById":
      return dbOps.getConversationById(args.conversationId);

    case "system.getRecentMessages":
      return dbOps.getRecentMessages(args.conversationId, args.limit);

    case "system.getProcessingMessages":
      return dbOps.getProcessingMessages(args.projectId);

    // ---- Mutations ----
    case "system.updateFile":
      return dbOps.updateFile(args.fileId, args.content);

    case "system.createFile":
      return dbOps.createFile(
        args.projectId,
        args.name,
        args.content,
        args.parentId
      );

    case "system.createFiles":
      return dbOps.createFiles(args.projectId, args.files, args.parentId);

    case "system.createFolder":
      return dbOps.createFolder(args.projectId, args.name, args.parentId);

    case "system.renameFile":
      return dbOps.renameFile(args.fileId, args.newName);

    case "system.deleteFile":
      return dbOps.deleteFile(args.fileId);

    case "system.createMessage":
      return dbOps.createMessage(
        args.conversationId,
        args.projectId,
        args.role,
        args.content,
        args.status
      );

    case "system.updateMessageContent":
      return dbOps.updateMessageContent(args.messageId, args.content);

    case "system.updateMessageStatus":
      return dbOps.updateMessageStatus(args.messageId, args.status);

    case "system.updateConversationTitle":
      return dbOps.updateConversationTitle(args.conversationId, args.title);

    case "system.createProjectWithConversation":
      return dbOps.createProjectWithConversation(
        args.projectName,
        args.conversationTitle,
        args.ownerId,
        args.template,
        args.topic
      );

    // ---- Research: Project Skills ----
    case "system.getProjectSkills":
      return dbOps.getProjectSkills(args.projectId);
    case "system.activateSkill":
      return dbOps.activateSkill(args.projectId, args.skillId, args.skillName, args.category);
    case "system.deactivateSkill":
      return dbOps.deactivateSkill(args.projectId, args.skillId);

    // ---- Research: Hypotheses ----
    case "system.getHypotheses":
      return dbOps.getHypotheses(args.projectId);
    case "system.getHypothesisById":
      return dbOps.getHypothesisById(args.id);
    case "system.createHypothesis":
      return dbOps.createHypothesis(args.projectId, args.title, args.description, args.rationale, args.expectedOutcome);
    case "system.updateHypothesisStatus":
      return dbOps.updateHypothesisStatus(args.id, args.status, args.actualOutcome);

    // ---- Research: Experiments ----
    case "system.getExperiments":
      return dbOps.getExperiments(args.projectId);
    case "system.getExperimentsByHypothesis":
      return dbOps.getExperimentsByHypothesis(args.hypothesisId);
    case "system.createExperiment":
      return dbOps.createExperiment(args.projectId, args.hypothesisId, args.name, args.protocol, args.skillsUsed, args.config);
    case "system.updateExperimentStatus":
      return dbOps.updateExperimentStatus(args.id, args.status);
    case "system.updateExperimentResults":
      return dbOps.updateExperimentResults(args.id, args.results, args.metrics);

    // ---- Research: State ----
    case "system.getResearchState":
      return dbOps.getResearchState(args.projectId);
    case "system.upsertResearchState":
      return dbOps.upsertResearchState(args.projectId, args.updates);

    // ---- Research: Log ----
    case "system.getResearchLog":
      return dbOps.getResearchLog(args.projectId, args.limit);
    case "system.addResearchLogEntry":
      return dbOps.addResearchLogEntry(args.projectId, args.action, args.phase, args.details, args.relatedId);

    // ---- Research: Memory ----
    case "system.getResearchMemory":
      return dbOps.getResearchMemory(args.projectId);
    case "system.getResearchMemoryByType":
      return dbOps.getResearchMemoryByType(args.projectId, args.type);
    case "system.addResearchMemory":
      return dbOps.addResearchMemory(args.projectId, args.type, args.content, args.source);
    case "system.toggleMemoryPin":
      return dbOps.toggleMemoryPin(args.id);
    case "system.deleteResearchMemory":
      return dbOps.deleteResearchMemory(args.id);

    // ---- Research: Papers ----
    case "system.getProjectPapers":
      return dbOps.getProjectPapers(args.projectId);
    case "system.addPaper":
      return dbOps.addPaper(args.projectId, args.paper);
    case "system.updatePaperNotes":
      return dbOps.updatePaperNotes(args.id, args.notes);
    case "system.removePaper":
      return dbOps.removePaper(args.id);

    default:
      throw new Error(`[local-db client] Unknown path: ${path}`);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const db = {
  /**
   * Execute a query by path string.
   *
   * @param path  Dot-separated path, e.g. "system.getProjectFiles"
   * @param args  Arguments for the query (internalKey is ignored)
   */
  async query(path: string, args: Args = {}): Promise<unknown> {
    return dispatch(path, args);
  },

  /**
   * Execute a mutation by path string.
   *
   * @param path  Dot-separated path, e.g. "system.updateFile"
   * @param args  Arguments for the mutation (internalKey is ignored)
   */
  async mutation(path: string, args: Args = {}): Promise<unknown> {
    return dispatch(path, args);
  },
};
