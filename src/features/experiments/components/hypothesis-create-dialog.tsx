"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useCreateHypothesis } from "../hooks/use-hypotheses";

interface HypothesisCreateDialogProps {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function HypothesisCreateDialog({
  projectId,
  open,
  onOpenChange,
}: HypothesisCreateDialogProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [rationale, setRationale] = useState("");
  const [expectedOutcome, setExpectedOutcome] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const createHypothesis = useCreateHypothesis();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await createHypothesis({
        projectId,
        title: title.trim(),
        description: description.trim(),
        rationale: rationale.trim(),
        expectedOutcome: expectedOutcome.trim(),
      });
      setTitle("");
      setDescription("");
      setRationale("");
      setExpectedOutcome("");
      onOpenChange(false);
    } catch (err) {
      console.error("Failed to create hypothesis:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New Hypothesis</DialogTitle>
          <DialogDescription>
            Define a testable hypothesis for your research.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Title</label>
            <Input
              placeholder="e.g. Transformer attention scales sublinearly with context length"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Description</label>
            <Textarea
              placeholder="Describe the hypothesis in detail..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Rationale</label>
            <Textarea
              placeholder="Why do you believe this hypothesis? What evidence supports it?"
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
              rows={3}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Expected Outcome</label>
            <Textarea
              placeholder="What results would confirm or refute this hypothesis?"
              value={expectedOutcome}
              onChange={(e) => setExpectedOutcome(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!title.trim() || isSubmitting}>
              {isSubmitting ? "Creating..." : "Create Hypothesis"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
