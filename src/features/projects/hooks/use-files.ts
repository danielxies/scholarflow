"use client";

import { useLocalQuery, useLocalMutation } from "@/lib/local-db/hooks";
import type { Id, File } from "@/lib/local-db/types";

export const useFiles = (projectId: Id<"projects"> | null) => {
  return useLocalQuery<File[]>("files.getFiles", projectId ? { projectId } : "skip");
};

export const useFile = (fileId: Id<"files"> | null) => {
  return useLocalQuery<File>("files.getFile", fileId ? { id: fileId } : "skip");
};

export const useFilePath = (fileId: Id<"files"> | null) => {
  return useLocalQuery<{ _id: string; name: string }[]>("files.getFilePath", fileId ? { id: fileId } : "skip");
};

export const useUpdateFile = () => {
  return useLocalMutation("files.updateFile");
};

export const useCreateFile = () => {
  return useLocalMutation("files.createFile");
};

export const useCreateFolder = () => {
  return useLocalMutation("files.createFolder");
};

export const useRenameFile = (_opts?: { projectId: Id<"projects">; parentId?: Id<"files"> }) => {
  return useLocalMutation("files.renameFile");
};

export const useDeleteFile = (_opts?: { projectId: Id<"projects">; parentId?: Id<"files"> }) => {
  return useLocalMutation("files.deleteFile");
};

export const useFolderContents = ({
  projectId,
  parentId,
  enabled = true,
}: {
  projectId: Id<"projects">;
  parentId?: Id<"files">;
  enabled?: boolean;
}) => {
  return useLocalQuery<File[]>(
    "files.getFolderContents",
    enabled ? { projectId, parentId } : "skip"
  );
};
