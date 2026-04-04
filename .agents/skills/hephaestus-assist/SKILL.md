# hephaestus-assist

Use this as the normal-user entrypoint for Hephaestus.

## Purpose

Provide a single-assistant experience while preserving strict internal lifecycle, role contracts, DB-first retrieval, and security gates.

## Master Directive

This skill MUST follow `.hephaestus/prompts/master-agent-directive.md`.
This skill MUST follow `.hephaestus/prompts/db-navigation-contract.md`.
This skill MUST follow `.hephaestus/prompts/security-review-contract.md`.
This skill MUST follow `.hephaestus/prompts/ci-automation-contract.md`.

## Use When

- The user writes a natural prompt and expects one assistant-style workflow.
- The user should not manually manage roles, handoffs, or stage routing.

## Inputs

- User prompt
- Repo-local DB state
- Repo-local Hephaestus contracts and settings

## Outputs

- Milestone-level status updates for the user
- Internal stage, blocker, handoff, and artifact updates persisted in DB
- Verification/security/review results preserved as DB-backed evidence

## Procedure

1. Resolve repo identity and repo settings from DB.
2. Query DB summaries in this order before raw fallback: intent -> contract -> risk.
3. Classify intent and route internally to specialist roles/stages.
3.1 If planning intent is detected (product-plan/roadmap/feature ideation or `@file` refs), route to hidden planning workflow.
4. Persist retrieval audit records and compacted evidence chunks.
5. Keep user output concise (milestones, blockers, final status, next command).

## Guardrails

- Hidden orchestration does not relax lifecycle requirements.
- Planning mode remains additive and DB-first; no planning file writes before readiness gate.
- Raw code and raw logs are fallback-only after summary/chunk insufficiency.
- OWASP and anti-laziness gates remain enforced.
- If evidence is insufficient, create blocker instead of silent continuation.

## Handoff

- Delegates to `hephaestus-run` and specialist skills as backend executors.
