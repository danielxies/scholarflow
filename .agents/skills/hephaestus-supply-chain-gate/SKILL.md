# hephaestus-supply-chain-gate

Use this skill for deterministic A03/A08 dependency and integrity gate checks.

## Purpose

Enforce supply-chain and artifact-integrity controls before ship.

## Master Directive

This skill MUST follow `.hephaestus/prompts/master-agent-directive.md`.
This skill MUST follow `.hephaestus/prompts/db-navigation-contract.md`.
This skill MUST follow `.hephaestus/prompts/ci-automation-contract.md`.
This skill MUST follow `.hephaestus/prompts/security-review-contract.md`.

## Use When

- Dependency/lockfile/build-artifact surfaces changed.
- Security gate requires supply-chain confirmation.

## Inputs

- dependency diffs
- lockfile changes
- CI artifact metadata
- existing security findings

## Outputs

- `security_controls` rows for A03/A08 checks
- `security_gate_decisions` row
- blockers for unresolved material risk

## Procedure

1. Inspect dependency and integrity deltas.
2. Record deterministic control checks and evidence links.
3. Persist gate decision with block/conditional/approve.
4. Open blocker if unresolved high/critical risk remains.

## Guardrails

- No silent acceptance of unsigned or unverifiable dependency changes.
- No bypass of supply-chain gate for release.
- Retry without diagnosis is prohibited.

## Handoff

Include:

- Control-by-control status
- Blocking findings and owners
- Required remediation for release
