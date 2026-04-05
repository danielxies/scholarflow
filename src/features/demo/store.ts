import { create } from "zustand";

export type ProjectView = "editor" | "literature" | "experiments" | "preview";

interface DemoStep {
  label: string;
  description: string;
  message?: string;
  tab?: ProjectView;
  action?: "replicate" | "experiment" | "populate_papers";
}

export const DEMO_STEPS: DemoStep[] = [
  {
    label: "Draft Introduction",
    description: "AI writes the intro with citations into the LaTeX file",
    message:
      "Draft a concise 3-paragraph introduction for main.tex. Motivate self-improving LLM reasoning, cite GRPO (DeepSeekMath) and STaR as prior work, and state our research question. Write the LaTeX directly.",
    tab: "preview",
  },
  {
    label: "Add Papers to Library",
    description: "Populate the library with key related papers",
    action: "populate_papers",
    tab: "literature",
  },
  {
    label: "Synthesize Novel Idea",
    description: "Propose a novel experiment based on the literature",
    message:
      "Based on STaR, GRPO, and Quiet-STaR, propose a novel experiment: apply GRPO's self-improvement loop with a physics-grounded reward that checks dimensional consistency and conservation laws. Outline in 3-4 bullet points.",
  },
  {
    label: "Replicate Baseline",
    description: "Run GRPO replication (Qwen-0.5B, 50 steps, math reward)",
    action: "replicate",
    tab: "experiments",
  },
  {
    label: "Run Novel Experiment",
    description: "Run physics-grounded reward experiment",
    action: "experiment",
    tab: "experiments",
  },
  {
    label: "Write Results",
    description: "AI writes results comparing both experiments into the paper",
    message:
      "Write a Results section into main.tex. The baseline GRPO achieved 34.8% accuracy (reward 0.387) while our physics-grounded reward achieved 26.4% accuracy but higher reasoning quality (0.41). Discuss what this reveals about cross-domain transfer. Include a comparison table.",
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
  stop: () => set({ active: false }),
  nextStep: () =>
    set((s) => ({
      currentStep: Math.min(s.currentStep + 1, DEMO_STEPS.length - 1),
    })),
  prevStep: () =>
    set((s) => ({ currentStep: Math.max(s.currentStep - 1, 0) })),
  registerSetActiveView: (fn) => set({ setActiveView: fn }),
}));
