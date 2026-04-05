import { serve } from "inngest/next";

import { inngest } from "@/inngest/client";
import { processMessage } from "@/features/conversations/inngest/process-message";
import { customExperimentStage } from "@/features/experiments/inngest/custom-workflow";
import { enrichPaper } from "@/features/literature/inngest/enrich-paper";
import { reproductionStage } from "@/features/reproduction/inngest/workflow";
import { researchBootstrap } from "@/features/research/inngest/bootstrap";
import { researchInnerLoop } from "@/features/research/inngest/inner-loop";
import { researchOuterLoop } from "@/features/research/inngest/outer-loop";
import { researchFinalize } from "@/features/research/inngest/finalize";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    processMessage,
    customExperimentStage,
    enrichPaper,
    reproductionStage,
    researchBootstrap,
    researchInnerLoop,
    researchOuterLoop,
    researchFinalize,
  ],
});
