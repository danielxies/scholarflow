# hephaestus-verify

Use this skill as the explicit verification gear.

## Purpose

Validate behavior against acceptance criteria and produce reproducible evidence.

## Master Directive

This skill MUST follow `.hephaestus/prompts/master-agent-directive.md`.
This skill MUST follow `.hephaestus/prompts/db-navigation-contract.md`.
This skill MUST follow `.hephaestus/prompts/ci-automation-contract.md`.
This skill MUST follow `.hephaestus/prompts/security-review-contract.md`.

## Use When

- Execute stage is complete for a slice or feature.
- A completion or ship decision is requested.

## Inputs

- `.hephaestus/intake/<feature>.md`
- `.hephaestus/specs/<feature>.md`
- `.hephaestus/plans/<feature>.md`
- `.hephaestus/logs/<feature>-execute.log`
- CI context from `ci_runs`, `ci_stages`, `ci_stage_events`, and `ci_workflow_states` when CI is involved.
- DB context (`verification_results`, `facts`, `blockers`, `retrieval_chunks`, `raw_artifacts`)
- Shared API module (`.hephaestus/db/storage/retrieval_api.py`).

## Outputs

- `.hephaestus/reports/<feature>-verify.md`
- `.hephaestus/runbooks/verification-commands.md` (if commands were unknown)
- DB updates in `verification_results`, `retrieval_chunks`, `artifact_index`, and CI automation tables when reverification is involved.
- Security evidence updates in `security_findings`, `review_findings`, `blockers`, and security retrieval chunks when risks are found.

## DB Reads

- `get_run_state`, `get_acceptance_criteria_for_slug`, `get_verification_summary`, `get_relevant_chunks`
- `get_security_findings` (for existing unresolved security context)
- `get_ci_failure_summary`, `get_stage_failure_chain`, `get_ci_workflow_states`
- `get_first_hard_failure` (DB chunk/blocker-first before raw logs)

## DB Writes

- `register_artifact`
- `insert_row` on `verification_results`
- `persist_fact` (confidence, release risk)
- `persist_blocker` (unverified areas, failing checks)
- `persist_retrieval_chunk`
- `persist_security_finding` (for verified OWASP risk findings)
- `persist_ci_workflow_state` / `record_ci_automation_action` when reverification is triggered
- `persist_ci_artifact` metadata for generated verification logs when applicable
- `create_execution_checkpoint` / `transition_execution_checkpoint`
- `create_repair_cycle` when verification fails or is blocked
- `persist_retrieval_audit` via `select_evidence_bundle`

## OWASP 2025 Security Lens

- Verify impacted `A01`-`A10` categories based on changed behavior and acceptance criteria.
- Persist OWASP findings and security chunks for material risk evidence.
- Treat unresolved high/critical OWASP findings as blocking.

## Procedure

1. Query DB for minimal context and previous verification/recurrence history.
2. Run project verification commands.
3. If commands are unknown, ask once and persist to runbook.
4. Derive verification scope from acceptance criteria plus changed surface in the diff.
5. Include at least one regression-oriented check for changed behavior when feasible.
6. Compare observed behavior against acceptance criteria and changed-surface expectations.
7. Record all failures explicitly; do not hide or suppress failures.
8. If tests are absent, state that absence explicitly as a release risk.
9. Register generated verification logs/artifacts for ingestion (path metadata only in DB).
10. Document results with `assets/verify-report-template.md`.
11. Evaluate OWASP Top 10:2025 categories implicated by changed behavior and verification evidence.
12. Persist OWASP findings/chunks/blockers for material security risks.
13. Persist coverage, confidence, unverified areas, and release risk using `persist_verify_memory(...)`.
14. If CI failed, require a recorded reverification reason before rerun; persist retry/automation evidence.
15. For hosted CI and local fallback, ingest logs through `hephaestus ci ingest ...` so DB chunks become default retrieval evidence.
16. Handoff to `hephaestus-laziness-audit` and `hephaestus-review`.

## Guardrails

- No completion without verification evidence.
- Code writing is never equivalent to completion.
- One narrow passing test is never enough for broad changed behavior.
- Failed checks require reproducible steps.
- Report must list exact commands executed.
- Raw outputs should be referenced by path in DB; avoid large inline blobs in table rows.
- Keep verification memory in DB and keep markdown report as concise summary with DB evidence refs.
- Reviewer may block ship on insufficient verification or reverification evidence alone.
- Use CI state + compacted chunk evidence before any raw-log fallback.
- Do not mark verification sufficient if OWASP-relevant changed surface lacks security evidence.

## Handoff

Include:

- Status by criterion
- Reproduction details for failures
- Next skill: `hephaestus-review`
