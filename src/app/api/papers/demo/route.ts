import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import * as dbOps from "@/lib/db";
import { z } from "zod";

const requestSchema = z.object({
  projectId: z.string().min(1),
});

const DEMO_PAPERS = [
  {
    openAlexId: "W4285719527",
    title: "STaR: Bootstrapping Reasoning With Reasoning",
    authors: ["Eric Zelikman", "Yuhuai Wu", "Jesse Mu", "Noah D. Goodman"],
    year: 2022,
    venue: "NeurIPS 2022",
    citationCount: 847,
    abstract:
      "Generating step-by-step chain-of-thought rationales improves LLM performance on complex reasoning tasks. STaR iteratively bootstraps reasoning by training on self-generated rationales that lead to correct answers, achieving 72.5% on CommonsenseQA and doubling GSM8K accuracy from 5.8% to 10.7%.",
    doi: "10.48550/arXiv.2203.14465",
    url: "https://arxiv.org/abs/2203.14465",
    pdfUrl: "https://arxiv.org/pdf/2203.14465",
    relevanceScore: 0.94,
    topics: '["self-improving reasoning","chain-of-thought","bootstrapping"]',
    enrichmentStatus: "completed",
  },
  {
    openAlexId: "W4391234567",
    title: "DeepSeekMath: Pushing the Limits of Mathematical Reasoning in Open Language Models",
    authors: ["Zhihong Shao", "Peiyi Wang", "Qihao Zhu", "Runxin Xu"],
    year: 2024,
    venue: "arXiv 2024",
    citationCount: 412,
    abstract:
      "We introduce Group Relative Policy Optimization (GRPO), a variant of PPO that eliminates the critic model by using group scores as baselines. GRPO enables efficient RL training for math reasoning, achieving 88.2% on MATH and 92.7% on GSM8K with DeepSeek-Math 7B.",
    doi: "10.48550/arXiv.2402.03300",
    url: "https://arxiv.org/abs/2402.03300",
    pdfUrl: "https://arxiv.org/pdf/2402.03300",
    relevanceScore: 0.97,
    topics: '["GRPO","reinforcement learning","math reasoning"]',
    enrichmentStatus: "completed",
  },
  {
    openAlexId: "W4398765432",
    title: "Quiet-STaR: Language Models Can Teach Themselves to Think Before Speaking",
    authors: ["Eric Zelikman", "Georges Harik", "Yijia Shao", "Varuna Jayasiri", "Nick Haber", "Noah D. Goodman"],
    year: 2024,
    venue: "arXiv 2024",
    citationCount: 203,
    abstract:
      "We present Quiet-STaR, a generalization of STaR where the LM learns to generate internal rationales (thoughts) at each token to explain future text. Training on internet text with REINFORCE, Quiet-STaR improves GSM8K zero-shot from 5.9% to 10.9% and CommonsenseQA from 36.3% to 47.2%.",
    doi: "10.48550/arXiv.2403.09629",
    url: "https://arxiv.org/abs/2403.09629",
    pdfUrl: "https://arxiv.org/pdf/2403.09629",
    relevanceScore: 0.91,
    topics: '["self-taught reasoning","internal rationales","inference-time compute"]',
    enrichmentStatus: "completed",
  },
];

export async function POST(request: Request) {
  await getSessionUserId();
  const body = await request.json();
  const { projectId } = requestSchema.parse(body);

  const project = dbOps.getProjectById(projectId);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const addedIds: string[] = [];

  // Add papers with staggered delays to feel like a real search
  for (let i = 0; i < DEMO_PAPERS.length; i++) {
    await new Promise((r) => setTimeout(r, i === 0 ? 3000 : 3500));
    try {
      const id = dbOps.addPaper(projectId, DEMO_PAPERS[i]);
      addedIds.push(id);
    } catch {
      // skip if already exists
    }
  }

  return NextResponse.json({
    success: true,
    papersAdded: addedIds.length,
    papers: DEMO_PAPERS.map((p) => p.title),
  });
}
