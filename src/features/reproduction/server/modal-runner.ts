import { z } from "zod";

import type { ExecutionJob } from "@/lib/local-db/types";
import { getModalSharedSecret, getRunnerCapability } from "./runner-config";
import type { ExecutionSpec } from "./execution-spec";

const submitResponseSchema = z.object({
  runnerJobId: z.string().min(1),
  status: z.string().optional(),
});

function buildAuthHeaders() {
  return {
    "Content-Type": "application/json",
    "x-scholarflow-runner-secret": getModalSharedSecret(),
  };
}

export async function submitModalExecution(params: {
  spec: ExecutionSpec;
  runContext: {
    projectId: string;
    hypothesisId: string;
    experimentId: string;
  };
  callbackSecret: string;
}) {
  const capability = getRunnerCapability();
  if (!capability.available || capability.backend !== "modal" || !capability.submitUrl) {
    throw new Error(capability.reason ?? "Modal runner is not configured.");
  }

  const response = await fetch(capability.submitUrl, {
    method: "POST",
    headers: buildAuthHeaders(),
    body: JSON.stringify({
      executionSpec: params.spec,
      callback: {
        url: params.spec.callbacks.url,
        secret: params.callbackSecret,
      },
      plan: {
        experimentId: params.runContext.experimentId,
        hypothesisId: params.runContext.hypothesisId,
        projectId: params.runContext.projectId,
      },
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `Modal submit failed (${response.status} ${response.statusText}): ${text}`
    );
  }

  return submitResponseSchema.parse(JSON.parse(text) as unknown);
}

export async function cancelModalExecution(job: ExecutionJob) {
  const capability = getRunnerCapability();
  if (!capability.available || capability.backend !== "modal" || !capability.cancelUrl) {
    throw new Error(capability.reason ?? "Modal runner is not configured.");
  }

  const response = await fetch(capability.cancelUrl, {
    method: "POST",
    headers: buildAuthHeaders(),
    body: JSON.stringify({
      runnerJobId: job.runnerJobId,
      experimentId: job.experimentId,
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `Modal cancel failed (${response.status} ${response.statusText}): ${text}`
    );
  }
}
