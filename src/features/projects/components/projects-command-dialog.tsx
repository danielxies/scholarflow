import { useRouter } from "next/navigation";
import { FileTextIcon } from "lucide-react";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

import { useProjects } from "../hooks/use-projects";

interface ProjectsCommandDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const ProjectsCommandDialog = ({
  open,
  onOpenChange,
}: ProjectsCommandDialogProps) => {
  const router = useRouter();
  const projects = useProjects();

  const handleSelect = (projectId: string) => {
    router.push(`/projects/${projectId}`);
    onOpenChange(false);
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Search Papers"
      description="Search and navigate to your papers"
    >
      <CommandInput placeholder="Search papers..." />
      <CommandList>
        <CommandEmpty>No papers found.</CommandEmpty>
        <CommandGroup heading="Papers">
          {projects?.map((project) => (
            <CommandItem
              key={project._id}
              value={`${project.name}-${project._id}`}
              onSelect={() => handleSelect(project._id)}
            >
              <FileTextIcon className="size-4 text-muted-foreground" />
              <span>{project.name}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
};
