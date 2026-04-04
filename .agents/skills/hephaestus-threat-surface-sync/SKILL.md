# hephaestus-threat-surface-sync

Use this skill to keep trust boundaries and threat assumptions aligned with spec/plan changes.

## Purpose

Persist architecture/security surface deltas as structured DB memory for later verification and review.

## Master Directive

This skill MUST follow `.hephaestus/prompts/master-agent-directive.md`.
This skill MUST follow `.hephaestus/prompts/db-navigation-contract.md`.
This skill MUST follow `.hephaestus/prompts/security-review-contract.md`.

## Use When

- `hephaestus-spec-plan` introduces interface or boundary changes.
- `system_architect` or `hephaestus-security-audit` needs boundary drift sync.

## Inputs

- spec diff
- plan diff
- interface/subsystem change list

## Outputs

- updated `trust_boundaries`, `authz_surfaces`, `threat_assumptions`
- boundary-delta retrieval chunk
- blocker when boundary risk is unresolved

## Procedure

1. Locate changed trust/auth/data boundaries from spec/plan deltas.
2. Map boundary changes to OWASP A01/A06 risks.
3. Persist threat assumptions and authz surface records.
4. Emit boundary-delta chunk and blocker when unresolved.

## Guardrails

- No new interface/boundary without threat rationale.
- No unresolved boundary drift passed to execute stage.
- Keep records concise and traceable.

## Handoff

Include:

- Updated boundary records
- OWASP mapping for changed surfaces
- Required follow-up owner and stage
