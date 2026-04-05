import { z } from "zod";

import type { ExecutionJob } from "@/lib/local-db/types";
import { getModalSharedSecret, getRunnerCapability } from "./runner-config";
import type { ExecutionSpec } from "./execution-spec";

export const EXPECTED_MODAL_RUNNER_CONTRACT_VERSION = "bundle-v2";

const submitResponseSchema = z.object({
  runnerJobId: z.string().min(1),
  status: z.string().optional(),
});

const capabilitiesResponseSchema = z.object({
  runnerContractVersion: z.string().min(1),
  workerBuild: z.string().nullable().optional(),
  supportsPreflight: z.boolean().default(false),
});

const preflightResponseSchema = z.object({
  ok: z.boolean(),
  runnerContractVersion: z.string().min(1),
  workerBuild: z.string().nullable().optional(),
  supportsPreflight: z.boolean().default(false),
  checks: z
    .array(
      z.object({
        name: z.string().min(1),
        source: z.enum(["local", "remote"]),
        status: z.enum(["passed", "failed", "skipped"]),
        summary: z.string().min(1),
        details: z.string().nullable().default(null),
      })
    )
    .default([]),
  warnings: z.array(z.string()).default([]),
  errorSummary: z.string().nullable().default(null),
  failureClass: z.string().nullable().default(null),
});

export class ModalRunnerContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModalRunnerContractError";
  }
}

function buildAuthHeaders() {
  return {
    "Content-Type": "application/json",
    "x-scholarflow-runner-secret": getModalSharedSecret(),
  };
}

function deriveEndpointUrl(submitUrl: string, endpoint: "capabilities" | "preflight") {
  const url = new URL(submitUrl);
  url.hostname = url.hostname.replace(
    /-submit(?=\.modal\.run$)/,
    `-${endpoint}`
  );
  return url.toString();
}

async function parseJsonResponse<T>(
  response: Response,
  schema: z.ZodType<T>,
  failureLabel: string
) {
  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `${failureLabel} (${response.status} ${response.statusText}): ${text}`
    );
  }

  return schema.parse(JSON.parse(text) as unknown);
}

export async function fetchModalRunnerCapabilities() {
  const capability = getRunnerCapability();
  if (!capability.available || capability.backend !== "modal" || !capability.submitUrl) {
    throw new Error(capability.reason ?? "Modal runner is not configured.");
  }

  const response = await fetch(deriveEndpointUrl(capability.submitUrl, "capabilities"), {
    method: "POST",
    headers: buildAuthHeaders(),
  });
  return parseJsonResponse(
    response,
    capabilitiesResponseSchema,
    "Modal capabilities request failed"
  );
}

export async function ensureModalRunnerContract() {
  try {
    const capabilities = await fetchModalRunnerCapabilities();
    if (capabilities.runnerContractVersion !== EXPECTED_MODAL_RUNNER_CONTRACT_VERSION) {
      throw new ModalRunnerContractError(
        `Deployed Modal worker contract ${capabilities.runnerContractVersion} does not match expected ${EXPECTED_MODAL_RUNNER_CONTRACT_VERSION}. Redeploy the Modal worker before continuing.`
      );
    }

    return capabilities;
  } catch (error) {
    if (error instanceof ModalRunnerContractError) {
      throw error;
    }
    throw new ModalRunnerContractError(
      `Unable to verify the deployed Modal worker contract. Redeploy the Modal worker and ensure the capabilities endpoint is available. ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export async function preflightModalExecution(params: { spec: ExecutionSpec }) {
  const capability = getRunnerCapability();
  if (!capability.available || capability.backend !== "modal" || !capability.submitUrl) {
    throw new Error(capability.reason ?? "Modal runner is not configured.");
  }

  const capabilities = await ensureModalRunnerContract();
  if (!capabilities.supportsPreflight) {
    throw new ModalRunnerContractError(
      "Deployed Modal worker does not support bundle preflight. Redeploy the Modal worker before continuing."
    );
  }

  try {
    const response = await fetch(deriveEndpointUrl(capability.submitUrl, "preflight"), {
      method: "POST",
      headers: buildAuthHeaders(),
      body: JSON.stringify({
        executionSpec: params.spec,
      }),
    });
    return await parseJsonResponse(
      response,
      preflightResponseSchema,
      "Modal preflight failed"
    );
  } catch (error) {
    throw new ModalRunnerContractError(
      `Unable to run Modal bundle preflight. Redeploy the Modal worker and ensure the preflight endpoint is available. ${error instanceof Error ? error.message : String(error)}`
    );
  }
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

  await ensureModalRunnerContract();

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

  return parseJsonResponse(response, submitResponseSchema, "Modal submit failed");
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
