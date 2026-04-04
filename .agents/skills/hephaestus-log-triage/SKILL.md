# hephaestus-log-triage

Use this skill to turn noisy logs into actionable rework items.

## Purpose

Triage execution, test, and CI logs into severity-ranked issues with owners and next actions.

## Master Directive

This skill MUST follow `.hephaestus/prompts/master-agent-directive.md`.
This skill MUST follow `.hephaestus/prompts/db-navigation-contract.md`.
This skill MUST follow `.hephaestus/prompts/ci-automation-contract.md`.
This skill MUST follow `.hephaestus/prompts/security-review-contract.md`.

## Use When

- Verify fails or CI is unstable.
- Fast diagnosis is needed before broader rework.

## Inputs

- `.hephaestus/logs/*.log`
- `.hephaestus/reports/*-verify.md`
- CI output and runtime traces.
- DB context (`error_signatures`, `recurrence_history`, `blockers`, `retrieval_chunks`, `raw_artifacts`)
- Shared API module (`.hephaestus/db/storage/retrieval_api.py`).

## Outputs

- `.hephaestus/reports/<feature>-log-triage.md`
- DB updates in `error_signatures`, `recurrence_history`, `blockers`, `artifact_index`, and CI state tables for CI logs.
- CI loop transitions: `ingested`, `triaged`, `recurrence_matched`, `blocker_created`.

## DB Reads

- `get_run_state`, `get_first_hard_failure`, `lookup_recurrence`, `get_recurrence_history`, `get_relevant_chunks`
- `get_latest_failed_ci_run`, `get_stage_failure_chain`, `get_recent_ci_failures_by_signature`, `get_ci_noise_profile`

## DB Writes

- `register_artifact`
- `persist_error_signature` / `record_recurrence_observation`
- `persist_fact` (root-cause hypothesis)
- `persist_blocker`
- `persist_retrieval_chunk`
- `persist_retrieval_audit` via `select_evidence_bundle`
- `register_ci_pipeline`, `create_ci_run`, `create_ci_stage`, `persist_ci_event`, `record_ci_retry`, `record_ci_automation_action` (for CI sources)
- `persist_ci_workflow_state`, `persist_ci_failure_intelligence`
- `persist_ci_triage_assessment`, `persist_ci_flake_profile`
- `persist_ci_failure_cluster`, `add_ci_cluster_member`
- `persist_ci_fix_suggestion`, `persist_ci_closure_decision`
- `persist_fix_pattern` / `get_common_fix_patterns_for_signature` (to capture reusable fix path)

## Procedure

1. Query DB for compacted chunks and CI stage summary first.
2. Query DB for prior signatures and recurrence before rereading full logs.
3. Ingest and compact CI/test/runtime logs into DB chunks/facts/signatures (`hephaestus ci ingest ...` for provider and local fallback).
4. Derive first hard failure and normalized signature.
5. Cluster errors by likely root cause class and rank by delivery impact.
6. Answer "have we seen this before?" using recurrence lookup before proposing net-new root cause.
7. Persist CI triage assessment (class/confidence/owner route) and flake profile when retry history exists.
8. Persist/attach CI failure cluster for recurrence reuse.
9. Generate and persist at least one fix suggestion candidate with verify hint when confidence permits.
10. Map failures to OWASP categories when security risk is implicated and persist security finding/chunk evidence.
11. Persist root-cause hypothesis and recommended fix path in DB.
12. Create/update blockers with explicit owner and severity.
13. Route to role(s) with handoff notes and reproduction anchors.
14. Persist CI workflow states and automation decision trail.
15. Route back to execute, infra, verify, or spec-plan as needed.

## Guardrails

- Prioritize root causes over symptom spam.
- Keep issue list short and actionable.
- Include command/log anchor for each blocker.
- Deduplicate repeated noise and keep full raw detail in raw artifacts only.
- Recurrence lookup must happen before deep raw-log inspection.
- Do not classify flaky/transient as proven without evidence.
- Raw fallback is allowed only when compacted chunk evidence is insufficient.

## Handoff

Include:

- Cluster summary with owner
- Blocking/non-blocking status
- Next skill recommendation
