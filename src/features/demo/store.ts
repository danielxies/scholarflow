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
    description: "Ask the AI to outline key points for the introduction",
    message:
      "Let's plan the introduction. What are the 4-5 key points we need to hit to make a compelling argument for self-evolving reasoning?",
  },
  {
    label: "View PDF",
    description: "Switch to PDF Preview to see the paper scaffold",
    tab: "preview",
  },
  {
    label: "Draft Introduction",
    description: "Have the AI write the introduction with citations",
    message:
      "Draft the introduction — 4 paragraphs. Cite STaR, DeepSeekMath GRPO, and any other relevant prior work. Make it sound like a real NeurIPS submission.",
  },
  {
    label: "Add Methodology",
    description: "Add section headers to the LaTeX file",
    message:
      "Add methodology section headers to the LaTeX file. Include: Problem Formulation, Self-Evolution Loop, Evaluation Protocol, and Baselines.",
    tab: "preview",
  },
  {
    label: "Defend the Idea",
    description: "Address a potential reviewer concern",
    message:
      "A reviewer might argue this is just prompt engineering with extra steps. How do we differentiate our self-evolving framework from DSPy, APE, and other prompt optimization approaches?",
  },
  {
    label: "View Editor",
    description: "Switch to the editor to see the LaTeX source",
    tab: "editor",
  },
  {
    label: "Literature Search",
    description: "Browse the Literature tab to find related papers",
    tab: "literature",
  },
  {
    label: "Write Results",
    description: "Have the AI write a comparison into the paper",
    message:
      "Summarize the key differences between our approach and standard prompt optimization, and add it as a paragraph in the introduction of our LaTeX file.",
  },
  {
    label: "Final PDF",
    description: "View the completed paper in PDF Preview",
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
  active: false,
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
