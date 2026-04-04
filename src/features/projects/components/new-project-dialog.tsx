"use client";

import { useState } from "react";
import ky from "ky";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { Id } from "@/lib/local-db/types";

interface NewProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const NewProjectDialog = ({
  open,
  onOpenChange,
}: NewProjectDialogProps) => {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [template, setTemplate] = useState("plain");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (message: PromptInputMessage) => {
    if (!message.text) return;

    setIsSubmitting(true);

    try {
      const { projectId } = await ky
        .post("/api/projects/create-with-prompt", {
          json: {
            idea: message.text.trim(),
            template,
          },
        })
        .json<{ projectId: Id<"projects"> }>();

      toast.success("Paper scaffold created");
      onOpenChange(false);
      setInput("");
      router.push(`/projects/${projectId}`);
    } catch {
      toast.error("Unable to create project");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-lg p-0"
      >
        <DialogHeader className="hidden">
          <DialogTitle>New Paper</DialogTitle>
          <DialogDescription>
            Describe your research and AI will create a paper scaffold.
          </DialogDescription>
        </DialogHeader>
        <div className="px-3 pt-3">
          <Select value={template} onValueChange={setTemplate}>
            <SelectTrigger className="w-full h-8 text-xs">
              <SelectValue placeholder="Select template" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="plain">Plain Article</SelectItem>
              <SelectItem value="acm">ACM Conference</SelectItem>
              <SelectItem value="ieee">IEEE Conference</SelectItem>
              <SelectItem value="neurips">NeurIPS</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <PromptInput onSubmit={handleSubmit} className="border-none!">
          <PromptInputBody>
            <PromptInputTextarea
              placeholder="Describe your research paper idea..."
              onChange={(e) => setInput(e.target.value)}
              value={input}
              disabled={isSubmitting}
            />
          </PromptInputBody>
          <PromptInputFooter>
             <PromptInputTools />
             <PromptInputSubmit disabled={!input || isSubmitting} />
          </PromptInputFooter>
        </PromptInput>
      </DialogContent>
    </Dialog>
  );
};
