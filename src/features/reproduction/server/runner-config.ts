export type RunnerBackend = "none" | "modal";

export interface RunnerCapability {
  backend: RunnerBackend;
  available: boolean;
  reason: string | null;
  submitUrl: string | null;
  cancelUrl: string | null;
}

function cleanEnv(value: string | undefined): string {
  return value?.trim() ?? "";
}

export function getRunnerBackend(): RunnerBackend {
  const raw = cleanEnv(process.env.REPRODUCTION_RUNNER_BACKEND).toLowerCase();
  return raw === "modal" ? "modal" : "none";
}

export function getRunnerCapability(): RunnerCapability {
  const backend = getRunnerBackend();

  if (backend === "none") {
    return {
      backend,
      available: false,
      reason: "This deployment has no reproduction runner configured.",
      submitUrl: null,
      cancelUrl: null,
    };
  }

  const submitUrl = cleanEnv(process.env.REPRODUCTION_MODAL_SUBMIT_URL);
  const cancelUrl = cleanEnv(process.env.REPRODUCTION_MODAL_CANCEL_URL);
  const sharedSecret = cleanEnv(process.env.REPRODUCTION_MODAL_SHARED_SECRET);
  const callbackSecret = cleanEnv(process.env.REPRODUCTION_RUNNER_CALLBACK_SECRET);

  if (!submitUrl || !cancelUrl || !sharedSecret || !callbackSecret) {
    return {
      backend,
      available: false,
      reason:
        "Modal runner configuration is incomplete. Set submit URL, cancel URL, shared secret, and callback secret before starting reproduction runs.",
      submitUrl: submitUrl || null,
      cancelUrl: cancelUrl || null,
    };
  }

  return {
    backend,
    available: true,
    reason: null,
    submitUrl,
    cancelUrl,
  };
}

export function getModalSharedSecret(): string {
  return cleanEnv(process.env.REPRODUCTION_MODAL_SHARED_SECRET);
}

export function getRunnerCallbackSecret(): string {
  return cleanEnv(process.env.REPRODUCTION_RUNNER_CALLBACK_SECRET);
}

export function resolvePublicAppBaseUrl(request?: Request): string {
  const explicit = cleanEnv(process.env.REPRODUCTION_PUBLIC_BASE_URL);
  if (explicit) {
    return explicit.replace(/\/+$/, "");
  }

  if (!request) {
    throw new Error(
      "Unable to resolve public base URL. Provide request context or REPRODUCTION_PUBLIC_BASE_URL."
    );
  }

  return new URL(request.url).origin.replace(/\/+$/, "");
}
