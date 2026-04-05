"use client";

import { useEffect, useState } from "react";
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
  const { active, currentStep, start, stop, nextStep, prevStep, setActiveView } =
    useDemoStore();
  const [sending, setSending] = useState(false);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
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
        // Consume the stream (chat sidebar will display it via polling)
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

    setCompletedSteps((prev) => new Set([...prev, stepIndex]));

    // Auto-advance to next step
    if (stepIndex < DEMO_STEPS.length - 1) {
      nextStep();
    }
  };

  // Reset completed steps when demo restarts
  useEffect(() => {
    if (!active) setCompletedSteps(new Set());
  }, [active]);

  if (!active) {
    return (
      <button
        onClick={start}
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
              completedSteps.has(i) && i !== currentStep && "text-muted-foreground"
            )}
          >
            {completedSteps.has(i) ? (
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
              Sending...
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
