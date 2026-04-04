"use client";

import { useSkillContent } from "../hooks/use-skills";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { LoaderIcon } from "lucide-react";

interface SkillDetailDialogProps {
  skillId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const SkillDetailDialog = ({
  skillId,
  open,
  onOpenChange,
}: SkillDetailDialogProps) => {
  const { skill, loading } = useSkillContent(open ? skillId : null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{skill?.name ?? "Loading..."}</DialogTitle>
          {skill && (
            <div className="flex items-center gap-2 pt-1">
              <span className="text-xs text-muted-foreground">
                {skill.categoryName}
              </span>
              <span className="text-xs text-muted-foreground">
                v{skill.version}
              </span>
            </div>
          )}
        </DialogHeader>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <LoaderIcon className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : skill ? (
          <>
            {skill.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {skill.tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
            <ScrollArea className="flex-1 -mx-6 px-6">
              <div className="prose prose-sm prose-invert max-w-none whitespace-pre-wrap font-mono text-[13px] leading-relaxed">
                {skill.content}
              </div>
            </ScrollArea>
          </>
        ) : (
          <p className="text-sm text-muted-foreground py-8 text-center">
            Skill not found
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
};
