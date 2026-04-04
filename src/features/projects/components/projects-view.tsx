"use client";

import { SparkleIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";

import { ProjectsList } from "./projects-list";
import { ProjectsCommandDialog } from "./projects-command-dialog";
import { NewProjectDialog } from "./new-project-dialog";

export const ProjectsView = () => {
  const [commandDialogOpen, setCommandDialogOpen] = useState(false);
  const [newProjectDialogOpen, setNewProjectDialogOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) {
        if (e.key === "k") {
          e.preventDefault();
          setCommandDialogOpen(true);
        }
        if (e.key === "j") {
          e.preventDefault();
          setNewProjectDialogOpen(true);
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <>
      <ProjectsCommandDialog
        open={commandDialogOpen}
        onOpenChange={setCommandDialogOpen}
      />
      <NewProjectDialog
        open={newProjectDialogOpen}
        onOpenChange={setNewProjectDialogOpen}
      />
      <div className="min-h-screen bg-sidebar flex flex-col items-center justify-center p-6 md:p-16">
        <div className="w-full max-w-sm mx-auto flex flex-col gap-4 items-center">

          <div className="flex justify-between gap-4 w-full items-center">
            <div className="flex items-center gap-2 w-full group/logo">
              <img src="/logo.svg" alt="ScholarFlow" className="size-[32px] md:size-[46px]" />
              <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">
                ScholarFlow
              </h1>
            </div>
          </div>

          <div className="flex flex-col gap-4 w-full">
            <Button
              variant="outline"
              onClick={() => setNewProjectDialogOpen(true)}
              className="h-full items-start justify-start p-4 bg-background border flex flex-col gap-6 rounded-none w-full"
            >
              <div className="flex items-center justify-between w-full">
                <SparkleIcon className="size-4" />
                <Kbd className="bg-accent border">
                  ⌘J
                </Kbd>
              </div>
              <div>
                <span className="text-sm">
                  New Paper
                </span>
              </div>
            </Button>

            <ProjectsList onViewAll={() => setCommandDialogOpen(true)} />
          </div>

        </div>
      </div>
    </>
  );
};
