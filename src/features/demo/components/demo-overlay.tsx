"use client";

import { useState, useEffect, useRef } from "react";
import ky from "ky";
import { toast } from "sonner";
import {
  PlayIcon,
  SkipForwardIcon,
  SkipBackIcon,
  XIcon,
  LoaderIcon,
  CheckCircleIcon,
  MonitorPlayIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Id } from "@/lib/local-db/types";
import { useDemoStore, DEMO_STEPS } from "../store";
import { useConversations } from "@/features/conversations/hooks/use-conversations";

interface DemoOverlayProps {
  projectId: Id<"projects">;
}

export const DemoOverlay = ({ projectId }: DemoOverlayProps) => {
  const { active, currentStep, completedSteps, resume, stop, nextStep, prevStep, setActiveView, markCompleted } =
    useDemoStore();
  const [sending, setSending] = useState(false);
  const [statusText, setStatusText] = useState("Sending...");
  const statusInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (sending) {
      const words = ["Analyzing...", "Thinking...", "Researching...", "Writing...", "Generating...", "Compiling..."];
      let i = 0;
      setStatusText(words[0]);
      statusInterval.current = setInterval(() => {
        i = (i + 1) % words.length;
        setStatusText(words[i]);
      }, 3000);
    } else {
      if (statusInterval.current) clearInterval(statusInterval.current);
      setStatusText("Sending...");
    }
    return () => { if (statusInterval.current) clearInterval(statusInterval.current); };
  }, [sending]);
  const conversations = useConversations(projectId);

  const step = DEMO_STEPS[currentStep];
  const conversationId = conversations?.[0]?._id;

  const executeStep = async () => {
    if (!step) return;

    const stepIndex = useDemoStore.getState().currentStep;

    // Switch tab if needed
    if (step.tab && setActiveView) {
      setActiveView(step.tab);
    }

    // Handle action steps
    if (step.action && projectId) {
      setSending(true);
      try {
        if (step.action === "populate_papers") {
          const res = await fetch("/api/papers/demo", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ projectId }),
          });
          if (!res.ok) throw new Error("Failed to add papers");
          toast.success("3 papers added to library");
        } else if (step.action === "write_results") {
          const res = await fetch("/api/experiments/demo-results", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ projectId }),
          });
          if (!res.ok) throw new Error("Failed to write results");
          toast.success("Results & conclusion added to paper");
        } else {
          const variant = step.action === "replicate" ? "baseline" : "physics";
          const res = await fetch("/api/experiments/demo", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ projectId, variant }),
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({ error: "Unknown error" }));
            throw new Error(err.error);
          }
          toast.success(variant === "baseline" ? "Baseline experiment running..." : "Physics experiment running...");
        }
      } catch (err) {
        toast.error(`${err instanceof Error ? err.message : "Unknown error"}`);
      } finally {
        setSending(false);
      }
    }

    // Send message if needed
    if (step.message && conversationId) {
      setSending(true);
      try {
        const res = await fetch("/api/messages/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversationId, message: step.message }),
        });
        if (!res.ok) throw new Error("Failed");
        const reader = res.body?.getReader();
        if (reader) {
          while (true) {
            const { done } = await reader.read();
            if (done) break;
          }
        }
      } catch {
        toast.error("Failed to send message");
      } finally {
        setSending(false);
      }
    }

    markCompleted(stepIndex);

    // Auto-advance to next step
    if (stepIndex < DEMO_STEPS.length - 1) {
      nextStep();
    }
  };


  if (!active) {
    return (
      <button
        onClick={resume}
        className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-full bg-secondary px-4 py-2.5 text-sm font-medium text-secondary-foreground shadow-lg hover:opacity-90 transition-opacity"
      >
        <MonitorPlayIcon className="size-4" />
        Demo Mode
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 rounded-lg border bg-card shadow-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b bg-secondary/30">
        <span className="text-xs font-mono font-medium uppercase tracking-wider text-secondary">
          Demo Mode
        </span>
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground">
            {currentStep + 1}/{DEMO_STEPS.length}
          </span>
          <button onClick={stop} className="p-1 hover:bg-accent rounded">
            <XIcon className="size-3.5" />
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-muted">
        <div
          className="h-full bg-secondary transition-all duration-300"
          style={{
            width: `${((currentStep + 1) / DEMO_STEPS.length) * 100}%`,
          }}
        />
      </div>

      {/* Steps list */}
      <div className="max-h-48 overflow-y-auto px-3 py-2 space-y-1">
        {DEMO_STEPS.map((s, i) => (
          <div
            key={i}
            className={cn(
              "flex items-center gap-2 py-1 text-xs rounded px-1.5",
              i === currentStep && "bg-accent font-medium",
              completedSteps.includes(i) && i !== currentStep && "text-muted-foreground"
            )}
          >
            {completedSteps.includes(i) ? (
              <CheckCircleIcon className="size-3 text-green-500 shrink-0" />
            ) : (
              <div
                className={cn(
                  "size-3 rounded-full border shrink-0",
                  i === currentStep ? "border-secondary bg-secondary/20" : "border-muted-foreground/30"
                )}
              />
            )}
            <span className="truncate">{s.label}</span>
          </div>
        ))}
      </div>

      {/* Current step detail */}
      <div className="px-3 py-2 border-t bg-accent/30">
        <p className="text-xs text-muted-foreground">{step?.description}</p>
        {step?.message && (
          <p className="text-[11px] text-muted-foreground/60 mt-1 line-clamp-2 italic">
            &ldquo;{step.message.slice(0, 80)}...&rdquo;
          </p>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2 px-3 py-2 border-t">
        <Button
          size="xs"
          variant="ghost"
          onClick={prevStep}
          disabled={currentStep === 0 || sending}
        >
          <SkipBackIcon className="size-3.5" />
        </Button>
        <Button
          size="sm"
          className="flex-1 gap-1.5"
          onClick={executeStep}
          disabled={sending || !conversationId}
        >
          {sending ? (
            <>
              <LoaderIcon className="size-3.5 animate-spin" />
              {statusText}
            </>
          ) : (
            <>
              <PlayIcon className="size-3.5" />
              Run Step
            </>
          )}
        </Button>
        <Button
          size="xs"
          variant="ghost"
          onClick={nextStep}
          disabled={currentStep === DEMO_STEPS.length - 1 || sending}
        >
          <SkipForwardIcon className="size-3.5" />
        </Button>
      </div>
    </div>
  );
};
