# hephaestus-ci-triage

Use this skill for deterministic CI failure ontology classification and owner routing.

## Purpose

Convert failed CI evidence into class, confidence, and role handoffs with DB-first traceability.

## Master Directive

This skill MUST follow `.hephaestus/prompts/master-agent-directive.md`.
This skill MUST follow `.hephaestus/prompts/db-navigation-contract.md`.
This skill MUST follow `.hephaestus/prompts/ci-automation-contract.md`.
This skill MUST follow `.hephaestus/prompts/security-review-contract.md`.

## Use When

- A CI run failed and ingestion is complete.
- Routing and first owner assignment are required.

## Inputs

- `ci_run_id`
- compacted CI chunks
- stage/failure chain
- recurrence hints

## Outputs

- `ci_triage_assessments` row
- `ci_verification_routes` row
- triage retrieval chunk
- blocker/handoff updates

## Procedure

1. Load stage failure chain and compacted chunks first.
2. Classify failure ontology and confidence.
3. Assign owner route by class and confidence.
4. Persist triage assessment + route rows.
5. Write triage summary chunk and role handoff note.

## Guardrails

- No closure decision during triage.
- No retry before diagnosis evidence is persisted.
- Security-sensitive classes must include reviewer path.

## Handoff

Include:

- Ontology class and confidence
- Owner role route
- First verification action
