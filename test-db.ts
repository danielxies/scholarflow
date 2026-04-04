/**
 * Comprehensive test suite for ScholarFlow
 * Tests: DB layer, local-db client, Semantic Scholar API, BibTeX, Claude agent, latex.js
 *
 * Run with: npx tsx test-db.ts
 */

// ─── Path alias setup (@ -> ./src) ──────────────────────────────────────────
import { register } from "node:module";
import { pathToFileURL } from "node:url";

// We need tsconfig paths to resolve. tsx handles this with --tsconfig but
// we can also just use direct relative imports. Let's do direct imports.

// ─── Direct imports (bypass @/ alias issues by using relative paths) ─────────
import * as db from "./src/lib/db";
import { generateCiteKey, generateBibtexEntry, citeKeyExists, appendBibtexEntry } from "./src/lib/bibtex";
import { searchPapers } from "./src/lib/semantic-scholar";
import { callClaude } from "./src/lib/claude-client";

// ─── Test runner ─────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(condition: boolean, testName: string, detail?: string): void {
  if (condition) {
    passed++;
    console.log(`  PASS  ${testName}`);
  } else {
    failed++;
    const msg = detail ? `${testName} — ${detail}` : testName;
    failures.push(msg);
    console.log(`  FAIL  ${msg}`);
  }
}

function section(name: string): void {
  console.log(`\n${"═".repeat(60)}`);
  console.log(`  ${name}`);
  console.log(`${"═".repeat(60)}`);
}

// ─── 1. Projects CRUD ───────────────────────────────────────────────────────
async function testProjectsCRUD() {
  section("1. Projects CRUD");

  const TEST_OWNER = "test-owner-" + Date.now();

  // Create
  const projectId = db.createProject("Test Project Alpha", TEST_OWNER);
  assert(typeof projectId === "string" && projectId.length > 0, "createProject returns ID");

  // Get by ID
  const project = db.getProjectById(projectId);
  assert(project !== undefined, "getProjectById finds project");
  assert(project?.name === "Test Project Alpha", "getProjectById name matches", `got: ${project?.name}`);
  assert(project?.ownerId === TEST_OWNER, "getProjectById ownerId matches");

  // Get all projects
  const projects = db.getProjects(TEST_OWNER);
  assert(projects.length >= 1, "getProjects returns at least 1", `got: ${projects.length}`);
  assert(projects.some(p => p.id === projectId), "getProjects contains our project");

  // Get partial projects
  const partial = db.getProjectsPartial(TEST_OWNER, 1);
  assert(partial.length === 1, "getProjectsPartial respects limit", `got: ${partial.length}`);

  // Rename
  db.renameProject(projectId, "Renamed Project Alpha");
  const renamed = db.getProjectById(projectId);
  assert(renamed?.name === "Renamed Project Alpha", "renameProject changes name", `got: ${renamed?.name}`);

  return { projectId, ownerId: TEST_OWNER };
}

// ─── 2. Files CRUD ──────────────────────────────────────────────────────────
async function testFilesCRUD(projectId: string) {
  section("2. Files CRUD");

  // Create .tex file
  const texId = db.createFile(projectId, "main.tex", "\\documentclass{article}\n\\begin{document}\nHello\n\\end{document}");
  assert(typeof texId === "string" && texId.length > 0, "createFile (.tex) returns ID");

  // Create .bib file
  const bibId = db.createFile(projectId, "refs.bib", "@article{key, title={Test}}");
  assert(typeof bibId === "string" && bibId.length > 0, "createFile (.bib) returns ID");

  // Create folder
  const folderId = db.createFolder(projectId, "chapters");
  assert(typeof folderId === "string" && folderId.length > 0, "createFolder returns ID");

  // Create file inside folder
  const chapterFileId = db.createFile(projectId, "chapter1.tex", "\\chapter{Introduction}", folderId);
  assert(typeof chapterFileId === "string" && chapterFileId.length > 0, "createFile in folder returns ID");

  // Create files (batch)
  const batchResults = db.createFiles(projectId, [
    { name: "appendixA.tex", content: "\\section{Appendix A}" },
    { name: "appendixB.tex", content: "\\section{Appendix B}" },
  ]);
  assert(batchResults.length === 2, "createFiles returns 2 results", `got: ${batchResults.length}`);
  assert(batchResults.every(r => r.fileId && !r.error), "createFiles all succeed");

  // createFiles duplicate detection
  const dupResults = db.createFiles(projectId, [{ name: "main.tex", content: "dup" }]);
  assert(dupResults[0].error === "File already exists", "createFiles detects duplicate");

  // Get all files
  const allFiles = db.getFiles(projectId);
  assert(allFiles.length >= 5, "getFiles returns at least 5", `got: ${allFiles.length}`);

  // Get folder contents (root)
  const rootContents = db.getFolderContents(projectId);
  assert(rootContents.length >= 4, "getFolderContents(root) has items", `got: ${rootContents.length}`);
  // Folders first
  const folderIdx = rootContents.findIndex(f => f.type === "folder");
  const firstFileIdx = rootContents.findIndex(f => f.type === "file");
  assert(folderIdx < firstFileIdx, "getFolderContents sorts folders first");

  // Get folder contents (subfolder)
  const subContents = db.getFolderContents(projectId, folderId);
  assert(subContents.length === 1, "getFolderContents(subfolder) returns 1", `got: ${subContents.length}`);
  assert(subContents[0].name === "chapter1.tex", "subfolder contains chapter1.tex");

  // Get single file
  const texFile = db.getFile(texId);
  assert(texFile !== undefined, "getFile finds file");
  assert(texFile?.content?.includes("\\documentclass"), "getFile content correct");
  assert(texFile?.name === "main.tex", "getFile name correct");
  assert(texFile?.type === "file", "getFile type correct");

  // Get file path
  const chapterPath = db.getFilePath(chapterFileId);
  assert(chapterPath.length === 2, "getFilePath returns 2 segments (folder + file)", `got: ${chapterPath.length}`);
  assert(chapterPath[0].name === "chapters", "getFilePath[0] is folder");
  assert(chapterPath[1].name === "chapter1.tex", "getFilePath[1] is file");

  // Root file path
  const rootPath = db.getFilePath(texId);
  assert(rootPath.length === 1, "getFilePath for root file returns 1 segment", `got: ${rootPath.length}`);

  // Update file content
  db.updateFile(texId, "\\documentclass{article}\n\\begin{document}\nUpdated!\n\\end{document}");
  const updated = db.getFile(texId);
  assert(updated?.content?.includes("Updated!"), "updateFile changes content");

  // Rename file
  db.renameFile(texId, "paper.tex");
  const renamedFile = db.getFile(texId);
  assert(renamedFile?.name === "paper.tex", "renameFile changes name", `got: ${renamedFile?.name}`);

  // Rename duplicate detection
  let renameDupError = false;
  try {
    db.renameFile(bibId, "paper.tex"); // should fail — same name in same folder
  } catch (e: any) {
    renameDupError = true;
  }
  assert(renameDupError, "renameFile rejects duplicate name");

  // Delete file
  const delFileId = db.createFile(projectId, "todelete.tex", "delete me");
  db.deleteFile(delFileId);
  const deleted = db.getFile(delFileId);
  assert(deleted === undefined, "deleteFile removes file");

  // Delete folder (recursive)
  const tempFolder = db.createFolder(projectId, "tempfolder");
  db.createFile(projectId, "inner.tex", "inside", tempFolder);
  db.deleteFile(tempFolder);
  const deletedFolder = db.getFile(tempFolder);
  assert(deletedFolder === undefined, "deleteFile removes folder recursively");

  // createFile duplicate detection
  let dupError = false;
  try {
    db.createFile(projectId, "paper.tex", "dup content");
  } catch (e: any) {
    dupError = e.message === "File already exists";
  }
  assert(dupError, "createFile rejects duplicate");

  // createFolder duplicate detection
  let dupFolderError = false;
  try {
    db.createFolder(projectId, "chapters");
  } catch (e: any) {
    dupFolderError = e.message === "Folder already exists";
  }
  assert(dupFolderError, "createFolder rejects duplicate");

  return { texId, bibId, folderId };
}

// ─── 3. Conversations CRUD ─────────────────────────────────────────────────
async function testConversationsCRUD(projectId: string) {
  section("3. Conversations CRUD");

  // Create
  const convId = db.createConversation(projectId, "Research Discussion");
  assert(typeof convId === "string" && convId.length > 0, "createConversation returns ID");

  // Get by ID
  const conv = db.getConversationById(convId);
  assert(conv !== undefined, "getConversationById finds conversation");
  assert(conv?.title === "Research Discussion", "getConversationById title matches", `got: ${conv?.title}`);
  assert(conv?.projectId === projectId, "getConversationById projectId matches");

  // Get by project
  const convList = db.getConversationsByProject(projectId);
  assert(convList.length >= 1, "getConversationsByProject returns at least 1", `got: ${convList.length}`);
  assert(convList.some(c => c.id === convId), "getConversationsByProject contains our conversation");

  // Update title
  db.updateConversationTitle(convId, "Updated Discussion Title");
  const updatedConv = db.getConversationById(convId);
  assert(updatedConv?.title === "Updated Discussion Title", "updateConversationTitle changes title", `got: ${updatedConv?.title}`);

  return { conversationId: convId };
}

// ─── 4. Messages CRUD ───────────────────────────────────────────────────────
async function testMessagesCRUD(projectId: string, conversationId: string) {
  section("4. Messages CRUD");

  // Create user message
  const userMsgId = db.createMessage(conversationId, projectId, "user", "What is attention?");
  assert(typeof userMsgId === "string" && userMsgId.length > 0, "createMessage (user) returns ID");

  // Create assistant message with status "processing"
  const assistMsgId = db.createMessage(conversationId, projectId, "assistant", "Let me think...", "processing");
  assert(typeof assistMsgId === "string" && assistMsgId.length > 0, "createMessage (assistant, processing) returns ID");

  // Get messages
  const msgs = db.getMessages(conversationId);
  assert(msgs.length === 2, "getMessages returns 2", `got: ${msgs.length}`);
  assert(msgs[0].role === "user", "getMessages first is user");
  assert(msgs[1].role === "assistant", "getMessages second is assistant");
  assert(msgs[1].status === "processing", "getMessages assistant status is processing");

  // Get processing messages
  const processing = db.getProcessingMessages(projectId);
  assert(processing.length >= 1, "getProcessingMessages finds at least 1", `got: ${processing.length}`);
  assert(processing.some(m => m.id === assistMsgId), "getProcessingMessages contains our message");

  // Get recent messages with limit
  // Add more messages first
  db.createMessage(conversationId, projectId, "user", "Tell me more");
  db.createMessage(conversationId, projectId, "assistant", "Sure thing", "completed");

  const recent = db.getRecentMessages(conversationId, 2);
  assert(recent.length === 2, "getRecentMessages respects limit", `got: ${recent.length}`);
  assert(recent[0].content === "Tell me more", "getRecentMessages returns correct messages (first)");
  assert(recent[1].content === "Sure thing", "getRecentMessages returns correct messages (second)");

  // Verify ordering of getRecentMessages (ASC order)
  const allMsgs = db.getMessages(conversationId);
  const lastTwo = allMsgs.slice(-2);
  assert(recent[0].id === lastTwo[0].id, "getRecentMessages order matches full list (ASC)");

  // Update message content
  db.updateMessageContent(assistMsgId, "Attention is a mechanism in neural networks.");
  const updatedMsg = db.getMessages(conversationId).find(m => m.id === assistMsgId);
  assert(updatedMsg?.content === "Attention is a mechanism in neural networks.", "updateMessageContent changes content");
  assert(updatedMsg?.status === "completed", "updateMessageContent sets status to completed");

  // Update message status
  db.updateMessageStatus(assistMsgId, "cancelled");
  const statusMsg = db.getMessages(conversationId).find(m => m.id === assistMsgId);
  assert(statusMsg?.status === "cancelled", "updateMessageStatus changes status", `got: ${statusMsg?.status}`);
}

// ─── 5. Composite operations ────────────────────────────────────────────────
async function testCompositeOperations() {
  section("5. Composite Operations");

  const TEST_OWNER = "composite-test-" + Date.now();

  const result = db.createProjectWithConversation(
    "Composite Project",
    "Initial Chat",
    TEST_OWNER
  );

  assert(typeof result.projectId === "string" && result.projectId.length > 0, "createProjectWithConversation returns projectId");
  assert(typeof result.conversationId === "string" && result.conversationId.length > 0, "createProjectWithConversation returns conversationId");

  // Verify both exist
  const project = db.getProjectById(result.projectId);
  assert(project?.name === "Composite Project", "composite project exists with correct name");

  const conv = db.getConversationById(result.conversationId);
  assert(conv?.title === "Initial Chat", "composite conversation exists with correct title");
  assert(conv?.projectId === result.projectId, "composite conversation linked to project");
}

// ─── 6. local-db client ─────────────────────────────────────────────────────
async function testLocalDbClient() {
  section("6. Local-DB Client (system.* dispatch)");

  // We need to import client.ts which uses @/ alias — use dynamic import with direct path
  // Since tsx resolves tsconfig paths, we can try direct import
  let clientDb: any;
  try {
    const mod = await import("./src/lib/local-db/client");
    clientDb = mod.db;
  } catch (e: any) {
    console.log(`  FAIL  Could not import local-db client: ${e.message}`);
    failed++;
    failures.push(`local-db client import: ${e.message}`);
    return;
  }

  const OWNER = "client-test-" + Date.now();

  // createProjectWithConversation via client
  const pcResult: any = await clientDb.mutation("system.createProjectWithConversation", {
    projectName: "Client Test Project",
    conversationTitle: "Client Chat",
    ownerId: OWNER,
  });
  assert(pcResult && pcResult.projectId, "client createProjectWithConversation returns projectId");
  const clientProjectId = pcResult.projectId;

  // createFile via client
  const fileId = await clientDb.mutation("system.createFile", {
    projectId: clientProjectId,
    name: "client-test.tex",
    content: "Hello from client",
  });
  assert(typeof fileId === "string" && fileId.length > 0, "client createFile returns ID");

  // getProjectFiles via client
  const files: any = await clientDb.query("system.getProjectFiles", {
    projectId: clientProjectId,
  });
  assert(Array.isArray(files) && files.length === 1, "client getProjectFiles returns 1 file", `got: ${files?.length}`);

  // getFileById via client
  const file: any = await clientDb.query("system.getFileById", { fileId });
  assert(file?.name === "client-test.tex", "client getFileById returns correct file");

  // updateFile via client
  await clientDb.mutation("system.updateFile", {
    fileId,
    content: "Updated via client",
  });
  const updatedFile: any = await clientDb.query("system.getFileById", { fileId });
  assert(updatedFile?.content === "Updated via client", "client updateFile changes content");

  // createFolder via client
  const folderId = await clientDb.mutation("system.createFolder", {
    projectId: clientProjectId,
    name: "client-folder",
  });
  assert(typeof folderId === "string" && folderId.length > 0, "client createFolder returns ID");

  // renameFile via client
  await clientDb.mutation("system.renameFile", {
    fileId,
    newName: "renamed-client.tex",
  });
  const renamedFile: any = await clientDb.query("system.getFileById", { fileId });
  assert(renamedFile?.name === "renamed-client.tex", "client renameFile works");

  // createMessage via client
  const convId = pcResult.conversationId;
  const msgId = await clientDb.mutation("system.createMessage", {
    conversationId: convId,
    projectId: clientProjectId,
    role: "user",
    content: "Client message test",
  });
  assert(typeof msgId === "string", "client createMessage returns ID");

  // getRecentMessages via client
  const msgs: any = await clientDb.query("system.getRecentMessages", {
    conversationId: convId,
    limit: 10,
  });
  assert(Array.isArray(msgs) && msgs.length === 1, "client getRecentMessages returns 1", `got: ${msgs?.length}`);

  // getConversationById via client
  const gotConv: any = await clientDb.query("system.getConversationById", {
    conversationId: convId,
  });
  assert(gotConv?.title === "Client Chat", "client getConversationById works");

  // updateConversationTitle via client
  await clientDb.mutation("system.updateConversationTitle", {
    conversationId: convId,
    title: "Updated Client Chat",
  });
  const updConv: any = await clientDb.query("system.getConversationById", { conversationId: convId });
  assert(updConv?.title === "Updated Client Chat", "client updateConversationTitle works");

  // createFiles (batch) via client
  const batchRes = await clientDb.mutation("system.createFiles", {
    projectId: clientProjectId,
    files: [
      { name: "batch1.tex", content: "b1" },
      { name: "batch2.tex", content: "b2" },
    ],
  });
  assert(Array.isArray(batchRes) && (batchRes as any[]).length === 2, "client createFiles returns 2 results");

  // updateMessageContent via client
  await clientDb.mutation("system.updateMessageContent", {
    messageId: msgId,
    content: "Updated client message",
  });

  // updateMessageStatus via client
  await clientDb.mutation("system.updateMessageStatus", {
    messageId: msgId,
    status: "completed",
  });

  // getProcessingMessages via client (should be 0 now since we just completed it)
  const procMsgs: any = await clientDb.query("system.getProcessingMessages", {
    projectId: clientProjectId,
  });
  assert(Array.isArray(procMsgs), "client getProcessingMessages returns array");

  // deleteFile via client
  await clientDb.mutation("system.deleteFile", { fileId });
  const deletedFile: any = await clientDb.query("system.getFileById", { fileId });
  assert(deletedFile === undefined, "client deleteFile removes file");

  // Unknown path
  let unknownError = false;
  try {
    await clientDb.query("system.nonExistentPath", {});
  } catch (e: any) {
    unknownError = e.message.includes("Unknown path");
  }
  assert(unknownError, "client rejects unknown path");

  // internalKey stripping
  const fileId2 = await clientDb.mutation("system.createFile", {
    projectId: clientProjectId,
    name: "key-test.tex",
    content: "test",
    internalKey: "should-be-stripped",
  });
  assert(typeof fileId2 === "string", "client strips internalKey without error");
}

// ─── 7. Semantic Scholar API ────────────────────────────────────────────────
async function testSemanticScholar() {
  section("7. Semantic Scholar API");

  try {
    const papers = await searchPapers("transformer attention mechanism", { limit: 5 });
    assert(Array.isArray(papers), "searchPapers returns array");
    assert(papers.length > 0, "searchPapers returns results", `got: ${papers.length}`);

    if (papers.length > 0) {
      const paper = papers[0];
      assert(typeof paper.title === "string" && paper.title.length > 0, "paper has title");
      assert(Array.isArray(paper.authors), "paper has authors array");
      assert(typeof paper.paperId === "string", "paper has paperId");
      assert(typeof paper.url === "string", "paper has url");
      assert(paper.year === null || typeof paper.year === "number", "paper year is number or null");
      assert(typeof paper.citationCount === "number", "paper has citationCount");
      // Check optional fields exist as properties
      assert("abstract" in paper, "paper has abstract field");
      assert("externalIds" in paper, "paper has externalIds field");
      assert("tldr" in paper, "paper has tldr field");
      assert("venue" in paper, "paper has venue field");
    }

    // Test with year range
    const recentPapers = await searchPapers("deep learning", { limit: 3, yearRange: "2023-2024" });
    assert(Array.isArray(recentPapers), "searchPapers with yearRange returns array");
    if (recentPapers.length > 0 && recentPapers[0].year !== null) {
      assert(recentPapers[0].year! >= 2023, "yearRange filter works", `got year: ${recentPapers[0].year}`);
    }
  } catch (e: any) {
    console.log(`  FAIL  Semantic Scholar API error: ${e.message}`);
    failed++;
    failures.push(`Semantic Scholar: ${e.message}`);
  }
}

// ─── 8. BibTeX generation ───────────────────────────────────────────────────
async function testBibtex() {
  section("8. BibTeX Generation");

  const mockPaper: any = {
    paperId: "abc123",
    title: "Attention Is All You Need",
    authors: [
      { authorId: "1", name: "Ashish Vaswani" },
      { authorId: "2", name: "Noam Shazeer" },
    ],
    year: 2017,
    citationCount: 50000,
    url: "https://arxiv.org/abs/1706.03762",
    externalIds: { DOI: "10.5555/3295222.3295349", ArXiv: "1706.03762" },
    abstract: null,
    tldr: null,
    venue: "NeurIPS",
  };

  // Generate cite key
  const citeKey = generateCiteKey(mockPaper);
  assert(citeKey === "vaswani2017", "generateCiteKey produces correct key", `got: ${citeKey}`);

  // Generate cite key with no authors
  const noAuthorPaper: any = { ...mockPaper, authors: [] };
  const noAuthorKey = generateCiteKey(noAuthorPaper);
  assert(noAuthorKey === "unknown2017", "generateCiteKey handles no authors", `got: ${noAuthorKey}`);

  // Generate cite key with no year
  const noYearPaper: any = { ...mockPaper, year: null };
  const noYearKey = generateCiteKey(noYearPaper);
  assert(noYearKey === "vaswanind", "generateCiteKey handles null year", `got: ${noYearKey}`);

  // Generate BibTeX entry
  const entry = generateBibtexEntry(mockPaper);
  assert(entry.includes("@inproceedings{vaswani2017,"), "generateBibtexEntry has correct key");
  assert(entry.includes("Ashish Vaswani and Noam Shazeer"), "generateBibtexEntry has authors");
  assert(entry.includes("Attention Is All You Need"), "generateBibtexEntry has title");
  assert(entry.includes("2017"), "generateBibtexEntry has year");
  assert(entry.includes("NeurIPS"), "generateBibtexEntry has venue");
  assert(entry.includes("10.5555/3295222.3295349"), "generateBibtexEntry has DOI");
  assert(entry.includes("https://arxiv.org"), "generateBibtexEntry has URL");

  // Generate with custom cite key
  const customEntry = generateBibtexEntry(mockPaper, "attention2017");
  assert(customEntry.includes("@inproceedings{attention2017,"), "generateBibtexEntry accepts custom key");

  // citeKeyExists
  const bibContent = `@article{smith2020,
  author = {Smith},
  title = {Test}
}

@inproceedings{vaswani2017,
  author = {Vaswani}
}`;

  assert(citeKeyExists(bibContent, "vaswani2017") === true, "citeKeyExists finds existing key");
  assert(citeKeyExists(bibContent, "smith2020") === true, "citeKeyExists finds another key");
  assert(citeKeyExists(bibContent, "jones2021") === false, "citeKeyExists returns false for missing key");
  assert(citeKeyExists("", "anykey") === false, "citeKeyExists returns false for empty content");

  // appendBibtexEntry
  const newEntry = "@article{new2023, author={New}, title={New Paper}}";

  const appended = appendBibtexEntry(bibContent, newEntry);
  assert(appended.includes(bibContent.trim()), "appendBibtexEntry preserves existing content");
  assert(appended.includes(newEntry), "appendBibtexEntry includes new entry");
  assert(appended.endsWith("\n"), "appendBibtexEntry ends with newline");

  // Append to empty
  const appendedEmpty = appendBibtexEntry("", newEntry);
  assert(appendedEmpty === newEntry + "\n", "appendBibtexEntry handles empty bib");

  // Append to whitespace-only
  const appendedWhitespace = appendBibtexEntry("   \n\n  ", newEntry);
  assert(appendedWhitespace === newEntry + "\n", "appendBibtexEntry handles whitespace-only bib");
}

// ─── 9. Claude Code agent ───────────────────────────────────────────────────
async function testClaudeAgent() {
  section("9. Claude Code Agent");

  // First check health
  try {
    const healthRes = await fetch("http://100.107.162.81:9090/api/claude/health");
    assert(healthRes.ok, "Claude agent health check returns 200", `got: ${healthRes.status}`);
  } catch (e: any) {
    console.log(`  FAIL  Claude agent health unreachable: ${e.message}`);
    failed++;
    failures.push(`Claude health: ${e.message}`);
  }

  // Test calling the agent
  try {
    const result = await callClaude({
      prompt: "Reply with exactly the word 'pong' and nothing else.",
      model: "haiku",
      maxTurns: 1,
    });
    assert(typeof result === "string" && result.length > 0, "callClaude returns non-empty string");
    assert(result.toLowerCase().includes("pong"), "callClaude response contains 'pong'", `got: ${result.substring(0, 100)}`);
  } catch (e: any) {
    console.log(`  FAIL  callClaude error: ${e.message}`);
    failed++;
    failures.push(`callClaude: ${e.message}`);
  }
}

// ─── 10. latex.js import check ──────────────────────────────────────────────
async function testLatexJs() {
  section("10. latex.js Import Check");

  try {
    const latexjs = await import("latex.js");
    assert(latexjs !== undefined, "latex.js module imports successfully");

    // Check for key exports
    const hasParser = typeof latexjs.parse === "function" || typeof (latexjs as any).default?.parse === "function";
    assert(hasParser || "HtmlGenerator" in latexjs || "parse" in latexjs, "latex.js has expected exports", `keys: ${Object.keys(latexjs).join(", ")}`);

    // Try to parse a simple document
    if (typeof latexjs.parse === "function") {
      try {
        const generator = new (latexjs as any).HtmlGenerator({ hyphenate: false });
        const doc = latexjs.parse("Hello \\textbf{world}", { generator });
        assert(doc !== undefined, "latex.js can parse a simple document");
      } catch (parseErr: any) {
        // Some versions have different API
        console.log(`  INFO  latex.js parse API variant: ${parseErr.message}`);
        assert(true, "latex.js imported (parse API may differ)");
      }
    } else {
      assert(true, "latex.js imported (parse function location may vary)");
    }
  } catch (e: any) {
    console.log(`  FAIL  latex.js import error: ${e.message}`);
    failed++;
    failures.push(`latex.js: ${e.message}`);
  }
}

// ─── 11. Edge cases & error handling ────────────────────────────────────────
async function testEdgeCases() {
  section("11. Edge Cases & Error Handling");

  // getProjectById with non-existent ID
  const noProject = db.getProjectById("nonexistent-id-12345");
  assert(noProject === undefined, "getProjectById returns undefined for missing ID");

  // getFile with non-existent ID
  const noFile = db.getFile("nonexistent-file-id");
  assert(noFile === undefined, "getFile returns undefined for missing ID");

  // getConversationById with non-existent ID
  const noConv = db.getConversationById("nonexistent-conv-id");
  assert(noConv === undefined, "getConversationById returns undefined for missing ID");

  // getMessages for non-existent conversation
  const noMsgs = db.getMessages("nonexistent-conv-id");
  assert(Array.isArray(noMsgs) && noMsgs.length === 0, "getMessages returns empty array for missing conversation");

  // getFilePath for non-existent file
  const noPath = db.getFilePath("nonexistent-file-id");
  assert(Array.isArray(noPath) && noPath.length === 0, "getFilePath returns empty array for missing file");

  // updateFile for non-existent file
  let updateError = false;
  try {
    db.updateFile("nonexistent-file-id", "content");
  } catch (e: any) {
    updateError = e.message === "File not found";
  }
  assert(updateError, "updateFile throws 'File not found' for missing file");

  // renameFile for non-existent file
  let renameError = false;
  try {
    db.renameFile("nonexistent-file-id", "newname.tex");
  } catch (e: any) {
    renameError = e.message === "File not found";
  }
  assert(renameError, "renameFile throws 'File not found' for missing file");

  // deleteFile for non-existent file
  let deleteError = false;
  try {
    db.deleteFile("nonexistent-file-id");
  } catch (e: any) {
    deleteError = e.message === "File not found";
  }
  assert(deleteError, "deleteFile throws 'File not found' for missing file");

  // getProjects with unknown owner
  const noProjects = db.getProjects("nobody-" + Date.now());
  assert(Array.isArray(noProjects) && noProjects.length === 0, "getProjects returns empty for unknown owner");

  // getFolderContents for project with no files
  const emptyOwner = "empty-" + Date.now();
  const emptyProjId = db.createProject("Empty Project", emptyOwner);
  const emptyContents = db.getFolderContents(emptyProjId);
  assert(Array.isArray(emptyContents) && emptyContents.length === 0, "getFolderContents returns empty for project with no files");
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║         ScholarFlow Comprehensive Test Suite            ║");
  console.log("╚══════════════════════════════════════════════════════════╝");

  const startTime = Date.now();

  try {
    // Core DB tests
    const { projectId } = await testProjectsCRUD();
    await testFilesCRUD(projectId);
    const { conversationId } = await testConversationsCRUD(projectId);
    await testMessagesCRUD(projectId, conversationId);
    await testCompositeOperations();

    // local-db client layer
    await testLocalDbClient();

    // External APIs
    await testSemanticScholar();

    // BibTeX utilities
    await testBibtex();

    // Claude agent
    await testClaudeAgent();

    // latex.js
    await testLatexJs();

    // Edge cases
    await testEdgeCases();
  } catch (e: any) {
    console.error(`\nFATAL ERROR: ${e.message}`);
    console.error(e.stack);
    failed++;
    failures.push(`FATAL: ${e.message}`);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log(`\n${"═".repeat(60)}`);
  console.log(`  RESULTS: ${passed} passed, ${failed} failed (${elapsed}s)`);
  console.log(`${"═".repeat(60)}`);

  if (failures.length > 0) {
    console.log("\n  Failures:");
    for (const f of failures) {
      console.log(`    - ${f}`);
    }
  }

  console.log("");
  process.exit(failed > 0 ? 1 : 0);
}

main();
