"use client";

import { useLocalQuery, useLocalMutation } from "@/lib/local-db/hooks";
import type { Id, Project } from "@/lib/local-db/types";

export const useProjects = () => {
  return useLocalQuery<Project[]>("projects.get", {});
};

export const useProjectsPartial = (limit: number) => {
  return useLocalQuery<Project[]>("projects.getPartial", { limit });
};

export const useProject = (projectId: Id<"projects">) => {
  return useLocalQuery<Project>("projects.getById", { id: projectId });
};

export const useRenameProject = () => {
  return useLocalMutation("projects.rename");
};
