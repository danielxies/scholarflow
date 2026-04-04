"use client";

import { useState } from "react";
import ky from "ky";
import { toast } from "sonner";
import { FlaskConicalIcon, LoaderIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Id } from "@/lib/local-db/types";

interface StartResearchDialogProps {
  projectId: Id<"projects">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const StartResearchDialog = ({
  projectId,
  open,
  onOpenChange,
}: StartResearchDialogProps) => {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);

  const handleStart = async () => {
    if (!question.trim()) return;
    setLoading(true);
    try {
      await ky.post("/api/research", {
        json: { action: "start", projectId, researchQuestion: question.trim() },
      });
      toast.success("Research started");
      onOpenChange(false);
      setQuestion("");
    } catch {
      toast.error("Failed to start research");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FlaskConicalIcon className="size-4" />
            Start Research
          </DialogTitle>
          <DialogDescription>
            Define your research question. The AI agent will search literature,
            form hypotheses, run experiments, and synthesize findings.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-1.5 block">
              Research Question
            </label>
            <textarea
              placeholder="e.g., How does LoRA rank affect fine-tuning performance compared to full fine-tuning?"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              className="w-full rounded-md border bg-transparent px-3 py-2 text-sm min-h-[100px] resize-none outline-none focus:ring-1 focus:ring-ring"
              disabled={loading}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleStart}
              disabled={loading || !question.trim()}
            >
              {loading ? (
                <LoaderIcon className="size-3.5 mr-1.5 animate-spin" />
              ) : (
                <FlaskConicalIcon className="size-3.5 mr-1.5" />
              )}
              Begin Research
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
