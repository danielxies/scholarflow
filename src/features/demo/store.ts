import { create } from "zustand";

export type ProjectView = "editor" | "literature" | "experiments" | "preview";

interface DemoStep {
  label: string;
  description: string;
  message?: string;
  tab?: ProjectView;
  action?: "replicate" | "experiment";
}

export const DEMO_STEPS: DemoStep[] = [
  {
    label: "Draft Introduction",
    description: "Ask AI to draft a brief intro into main.tex",
    message:
      "Draft a concise introduction for main.tex. Motivate the problem of self-improving LLM reasoning, mention GRPO and STaR as key prior work, and state our research question: can we transfer self-improvement loops to new domains by swapping the reward signal?",
    tab: "preview",
  },
  {
    label: "Literature Search",
    description:
      "Search for papers on self-improving LLM reasoning (GRPO, STaR, Quiet-STaR)",
    message:
      "Search for recent papers on self-improving LLM reasoning — specifically GRPO, STaR, and Quiet-STaR. Find key results and open questions around reward design and cross-domain transfer.",
    tab: "literature",
  },
  {
    label: "Synthesize Novel Idea",
    description:
      "Propose a novel experiment combining GRPO with physics-grounded rewards",
    message:
      "Based on the related work, propose a novel experiment: What if we apply GRPO's self-improvement loop but replace the math reward with a physics-grounded reward that checks dimensional consistency and conservation laws? Outline the experiment design in 3-4 bullet points.",
  },
  {
    label: "Replicate Baseline",
    description:
      "Launch GRPO replication on Modal (Qwen-0.5B, 50 steps, math reward)",
    action: "replicate",
    tab: "experiments",
  },
  {
    label: "Run Novel Experiment",
    description:
      "Launch our physics-grounded reward experiment on Modal",
    action: "experiment",
    tab: "experiments",
  },
  {
    label: "Write Results",
    description:
      "Write the Results section comparing baseline and physics experiment",
    message:
      "Write the Results section into main.tex. Compare the baseline replication metrics with our physics experiment. Include a comparison table and discussion of what the different reward signals reveal about cross-domain reasoning transfer.",
    tab: "preview",
  },
];

interface DemoState {
  active: boolean;
  currentStep: number;
  setActiveView: ((view: ProjectView) => void) | null;
  start: () => void;
  stop: () => void;
  nextStep: () => void;
  prevStep: () => void;
  registerSetActiveView: (fn: (view: ProjectView) => void) => void;
}

export const useDemoStore = create<DemoState>((set) => ({
  active: true,
  currentStep: 0,
  setActiveView: null,
  start: () => set({ active: true, currentStep: 0 }),
  stop: () => set({ active: false, currentStep: 0 }),
  nextStep: () =>
    set((s) => ({
      currentStep: Math.min(s.currentStep + 1, DEMO_STEPS.length - 1),
    })),
  prevStep: () =>
    set((s) => ({ currentStep: Math.max(s.currentStep - 1, 0) })),
  registerSetActiveView: (fn) => set({ setActiveView: fn }),
}));
