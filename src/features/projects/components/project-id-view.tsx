"use client";

import { useState } from "react";
import { Allotment } from "allotment";

import { cn } from "@/lib/utils";
import { EditorView } from "@/features/editor/components/editor-view";
import { LaTeXPreview } from "@/features/preview/components/latex-preview";
import { LiteratureView } from "@/features/literature/components/literature-view";
import { ExperimentsView } from "@/features/experiments/components/experiments-view";
import { FileExplorer } from "./file-explorer";
import { Id } from "@/lib/local-db/types";

const MIN_SIDEBAR_WIDTH = 200;
const MAX_SIDEBAR_WIDTH = 800;
const DEFAULT_SIDEBAR_WIDTH = 350;
const DEFAULT_MAIN_SIZE = 1000;

type ProjectView = "editor" | "literature" | "experiments" | "preview";

const Tab = ({
  label,
  isActive,
  onClick
}: {
  label: string;
  isActive: boolean;
  onClick: () => void;
}) => {
  return (
    <div
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 h-full px-3 cursor-pointer text-muted-foreground border-r hover:bg-accent/30",
        isActive && "bg-background text-foreground"
      )}
    >
      <span className="text-sm">{label}</span>
    </div>
  );
};

export const ProjectIdView = ({
  projectId
}: {
  projectId: Id<"projects">
}) => {
  const [activeView, setActiveView] = useState<ProjectView>("preview");

  return (
    <div className="h-full flex flex-col">
      <nav className="h-8.75 flex items-center bg-sidebar border-b">
        <Tab
          label="PDF Preview"
          isActive={activeView === "preview"}
          onClick={() => setActiveView("preview")}
        />
        <Tab
          label="Editor"
          isActive={activeView === "editor"}
          onClick={() => setActiveView("editor")}
        />
        <Tab
          label="Literature"
          isActive={activeView === "literature"}
          onClick={() => setActiveView("literature")}
        />
        <Tab
          label="Experiments"
          isActive={activeView === "experiments"}
          onClick={() => setActiveView("experiments")}
        />
      </nav>
      <div className="flex-1 relative">
        <div className={cn(
          "absolute inset-0",
          activeView === "editor" ? "visible" : "invisible"
        )}>
          <Allotment defaultSizes={[DEFAULT_SIDEBAR_WIDTH, DEFAULT_MAIN_SIZE]}>
            <Allotment.Pane
              snap
              minSize={MIN_SIDEBAR_WIDTH}
              maxSize={MAX_SIDEBAR_WIDTH}
              preferredSize={DEFAULT_SIDEBAR_WIDTH}
            >
              <FileExplorer projectId={projectId} />
            </Allotment.Pane>
            <Allotment.Pane>
              <EditorView projectId={projectId} />
            </Allotment.Pane>
          </Allotment>
        </div>
        <div className={cn(
          "absolute inset-0",
          activeView === "literature" ? "visible" : "invisible"
        )}>
          <LiteratureView projectId={projectId} isActive={activeView === "literature"} />
        </div>
        <div className={cn(
          "absolute inset-0",
          activeView === "experiments" ? "visible" : "invisible"
        )}>
          <ExperimentsView projectId={projectId} isActive={activeView === "experiments"} />
        </div>
        <div className={cn(
          "absolute inset-0",
          activeView === "preview" ? "visible" : "invisible"
        )}>
          <LaTeXPreview projectId={projectId} />
        </div>
      </div>
    </div>
  );
};
