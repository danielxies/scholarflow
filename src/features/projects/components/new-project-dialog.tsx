"use client";

import { useState } from "react";
import ky from "ky";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { FlaskConicalIcon } from "lucide-react";

const DEMO_PROMPT = `This paper proposes a self-evolving framework where LLMs autonomously improve their reasoning on graduate-level physics problems by iteratively refining chain-of-thought strategies without weight updates. We build on recent advances in reinforcement learning for reasoning, particularly Group Relative Policy Optimization (GRPO) from DeepSeekMath, which showed that RL training can induce emergent step-by-step reasoning in language models. As a baseline, we replicate GRPO training on Qwen2.5-0.5B using the DeepMath-103K dataset to validate the self-improvement signal on math reasoning, then extend the approach to physics derivation tasks. We benchmark against the GPQA physics subset and a curated set of 200 qualifying exam problems from top PhD programs. Reference: https://arxiv.org/abs/2402.03300 | Repo: https://github.com/huggingface/trl`;

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
        className="sm:max-w-xl p-0"
      >
        <DialogHeader className="hidden">
          <DialogTitle>New Paper</DialogTitle>
          <DialogDescription>
            Describe your research and AI will create a paper scaffold.
          </DialogDescription>
        </DialogHeader>
        <div className="px-3 pt-3 flex items-center gap-2">
          <Select value={template} onValueChange={setTemplate}>
            <SelectTrigger className="flex-1 h-8 text-xs">
              <SelectValue placeholder="Select template" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="plain">Plain Article</SelectItem>
              <SelectItem value="acm">ACM Conference</SelectItem>
              <SelectItem value="ieee">IEEE Conference</SelectItem>
              <SelectItem value="neurips">NeurIPS</SelectItem>
            </SelectContent>
          </Select>
          <button
            type="button"
            onClick={() => setInput(DEMO_PROMPT)}
            className="h-8 px-2.5 rounded-md border text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors flex items-center gap-1.5 shrink-0"
          >
            <FlaskConicalIcon className="size-3" />
            Load Demo
          </button>
        </div>
        <PromptInput onSubmit={handleSubmit} className="border-none!">
          <PromptInputBody>
            <PromptInputTextarea
              placeholder="Describe your research paper idea..."
              onChange={(e) => setInput(e.target.value)}
              value={input}
              disabled={isSubmitting}
              className="max-h-96 min-h-24"
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
