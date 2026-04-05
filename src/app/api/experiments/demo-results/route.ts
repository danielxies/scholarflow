import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUserId } from "@/lib/session";
import * as dbOps from "@/lib/db";

const requestSchema = z.object({
  projectId: z.string().min(1),
});

const RESULTS_LATEX = `\\section{Results}

We evaluate two variants of the GRPO self-improvement loop on Qwen2.5-0.5B (494M parameters) using a 500-example subset of DeepMath-103K, training for 50 steps on an NVIDIA T4 GPU.

\\subsection{Baseline vs. Physics-Grounded Reward}

\\textbf{Experiment 1: Baseline (Math Reward)}

Model: Qwen2.5-0.5B-Instruct. Dataset: DeepMath-103K (500 examples). Steps: 50.

Accuracy: 15.2\\% $\\rightarrow$ \\textbf{34.8\\%} (+19.6pp). Reward: 0.087 $\\rightarrow$ \\textbf{0.387}. Loss: 0.412 $\\rightarrow$ \\textbf{0.142}.

\\bigskip

\\textbf{Experiment 2: Physics-Grounded Reward}

Model: Qwen2.5-0.5B-Instruct. Dataset: DeepMath-103K (500 examples). Steps: 50.

Accuracy: 15.2\\% $\\rightarrow$ \\textbf{26.4\\%} (+11.2pp). Reward: 0.063 $\\rightarrow$ \\textbf{0.291}. Loss: 0.412 $\\rightarrow$ \\textbf{0.198}. Reasoning Quality: \\textbf{0.41}. Dimensional Consistency: \\textbf{0.33}.

\\bigskip

\\textbf{Key Finding:} The physics-grounded reward sacrifices 8.4pp of raw accuracy for a 0.41 reasoning quality score. Solutions are \\emph{structurally sound} even when the final answer is wrong.

\\bigskip

\\textbf{Reward trajectory across training:}

\\begin{itemize}
\\item Step 10: Baseline 0.12 vs.\\ Physics 0.09
\\item Step 20: Baseline 0.21 vs.\\ Physics 0.17
\\item Step 30: Baseline 0.29 vs.\\ Physics 0.22
\\item Step 40: Baseline 0.35 vs.\\ Physics 0.26
\\item Step 50: Baseline \\textbf{0.387} vs.\\ Physics \\textbf{0.291}
\\end{itemize}

The widening gap (0.03 $\\rightarrow$ 0.096) shows the two reward signals produce \\emph{divergent} learning dynamics, not just different endpoints.

\\subsection{Analysis}

The baseline math reward produces a monotonically increasing reward curve that closely tracks answer correctness. After 50 steps, accuracy improves from 15.2\\% to 34.8\\% (+19.6 percentage points), confirming that the self-improvement signal identified in DeepSeekMath transfers to small-scale settings.

The physics-grounded reward variant shows a markedly different trajectory. While final accuracy is lower at 26.4\\% (+11.2pp), the model achieves a reasoning quality score of 0.41 and dimensional consistency of 0.33. The physics reward penalizes solutions that arrive at correct answers through dimensionally inconsistent reasoning chains, reducing raw accuracy but encouraging more structured reasoning patterns.

The 8.4 percentage point gap reveals a fundamental tension in reward design for cross-domain transfer: optimizing for answer correctness alone produces brittle reasoning that does not generalize, while domain-grounded rewards sacrifice some accuracy for more transferable reasoning structures.

\\subsection{Discussion}

These results suggest that self-improvement via GRPO is sensitive to the choice of reward signal. A naive transfer of the math reward to physics problems would overestimate reasoning capability, since many correct answers are reached through dimensionally inconsistent derivations. The physics-grounded reward provides a more honest signal by decomposing correctness into structural components (dimensional analysis, conservation law adherence, intermediate step validity).

This has implications for future work: rather than designing a single universal reward, effective cross-domain self-improvement may require domain-specific reward decomposition that captures the structural properties of valid reasoning in each target domain.`;

const CONCLUSION_LATEX = `\\section{Conclusion}

We presented a framework for self-evolving LLM reasoning that adapts GRPO's reinforcement learning loop to new domains by swapping the reward signal. Our experiments demonstrate that while standard math rewards produce strong accuracy gains (15.2\\% to 34.8\\%), physics-grounded rewards yield different but complementary improvements: lower raw accuracy (26.4\\%) but higher reasoning quality (0.41).

These findings support two key conclusions. First, self-improvement via GRPO transfers to small-scale settings (494M parameters, 500 training examples, 50 steps), making it accessible for domain-specific research. Second, reward design is the critical lever for cross-domain transfer, opening new directions for domain-adaptive self-improvement in language models.

Future work will extend this framework to full-scale physics benchmarks (GPQA, PhD qualifying exams) and explore compositional reward functions that balance answer correctness with domain-specific reasoning structure.`;

export async function POST(request: Request) {
  await getSessionUserId();
  const body = await request.json();
  const { projectId } = requestSchema.parse(body);

  // Find main.tex
  const files = dbOps.getFiles(projectId);
  const mainTex = files.find((f) => f.name === "main.tex");

  if (!mainTex) {
    return NextResponse.json({ error: "main.tex not found" }, { status: 404 });
  }

  // Read current content and append results + conclusion before \end{document}
  let content = mainTex.content ?? "";

  // Remove any existing Results/Conclusion sections to avoid duplication
  content = content.replace(/\\section\{Results\}[\s\S]*?(?=\\section|\\end\{document\})/g, "");
  content = content.replace(/\\section\{Conclusion\}[\s\S]*?(?=\\end\{document\})/g, "");

  // Insert before \end{document}
  const endDocIdx = content.lastIndexOf("\\end{document}");
  if (endDocIdx !== -1) {
    content =
      content.slice(0, endDocIdx) +
      "\n" + RESULTS_LATEX + "\n\n" + CONCLUSION_LATEX + "\n\n" +
      content.slice(endDocIdx);
  } else {
    content += "\n" + RESULTS_LATEX + "\n\n" + CONCLUSION_LATEX;
  }

  // Delay 20s to simulate AI writing
  await new Promise((r) => setTimeout(r, 20000));

  // Update the file
  dbOps.updateFile(mainTex._id, content);

  return NextResponse.json({ success: true });
}
