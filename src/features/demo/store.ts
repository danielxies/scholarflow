import { create } from "zustand";

export type ProjectView = "editor" | "literature" | "experiments" | "preview";

interface DemoStep {
  label: string;
  description: string;
  message?: string;
  tab?: ProjectView;
}

export const DEMO_STEPS: DemoStep[] = [
  {
    label: "Plan Introduction",
    description: "Outline the key arguments for the paper's introduction",
    message:
      "Let's plan the introduction. What are the 4-5 key points we need to hit to make a compelling argument for self-evolving reasoning? Keep it concise.",
  },
  {
    label: "View PDF",
    description: "See the paper scaffold that was generated",
    tab: "preview",
  },
  {
    label: "Draft Introduction",
    description: "Write the introduction with academic citations",
    message:
      "Draft the introduction — 3 paragraphs max. Cite STaR and DeepSeekMath GRPO. Write the LaTeX directly into `main.tex`.",
    tab: "preview",
  },
  {
    label: "Add Methodology",
    description: "Add methodology section structure to the paper",
    message:
      "Add methodology section headers to `main.tex`: Problem Formulation, Self-Evolution Loop, Evaluation Protocol, and Baselines. Just the headers and one-sentence descriptions.",
    tab: "preview",
  },
  {
    label: "Literature Search",
    description: "Search for related papers on self-improving LLM reasoning",
    message:
      "Search for recent papers on self-improving LLM reasoning and reinforcement learning for chain-of-thought. Find 3-5 relevant papers we should cite.",
    tab: "literature",
  },
  {
    label: "Defend the Idea",
    description: "Address a potential reviewer objection",
    message:
      "A reviewer might say this is just prompt engineering. In 2-3 sentences, how do we differentiate from DSPy and APE?",
  },
  {
    label: "Write Comparison",
    description: "Add the differentiation argument to the paper",
    message:
      "Add a short Related Work subsection to `main.tex` distinguishing our approach from prompt optimization methods (DSPy, APE, OPRO).",
    tab: "preview",
  },
  {
    label: "View Editor",
    description: "Inspect the LaTeX source code",
    tab: "editor",
  },
  {
    label: "Final PDF",
    description: "Review the completed paper draft",
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
