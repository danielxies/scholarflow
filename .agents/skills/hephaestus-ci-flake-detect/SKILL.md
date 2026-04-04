# hephaestus-ci-flake-detect

Use this skill to classify flaky CI behavior from retries and recurrence history.

## Purpose

Distinguish flaky/transient failures from deterministic regressions using evidence thresholds.

## Master Directive

This skill MUST follow `.hephaestus/prompts/master-agent-directive.md`.
This skill MUST follow `.hephaestus/prompts/db-navigation-contract.md`.
This skill MUST follow `.hephaestus/prompts/ci-automation-contract.md`.
This skill MUST follow `.hephaestus/prompts/security-review-contract.md`.

## Use When

- CI triage produced candidate flaky or transient signals.
- Retry/noise history must be interpreted before rework.

## Inputs

- signature key
- stage name
- provider
- retry and oscillation history

## Outputs

- `ci_flake_profiles` row
- flake signal retrieval chunk
- optional blocker note when evidence is insufficient

## Procedure

1. Load recurrence + retry history from DB.
2. Compute flake confidence with sample-size threshold.
3. Persist flake profile and supporting chunk.
4. Mark uncertain classifications as non-proven.

## Guardrails

- Flaky classification requires minimum sample evidence.
- Security-sensitive failures cannot be downgraded to flaky-only closure.
- Keep confidence and rationale explicit.

## Handoff

Include:

- Flake class (`flaky` or `not_flaky` or `insufficient_history`)
- Confidence score
- Suggested next step (`retry`, `reproduce`, or `rework`)
