# hephaestus-execute

Use this skill as the explicit implementation gear.

## Purpose

Implement planned slices with strict spec linkage and serialized write-heavy work.

## Master Directive

This skill MUST follow `.hephaestus/prompts/master-agent-directive.md`.
This skill MUST follow `.hephaestus/prompts/db-navigation-contract.md`.
This skill MUST follow `.hephaestus/prompts/ci-automation-contract.md`.
This skill MUST follow `.hephaestus/prompts/security-review-contract.md`.

## Use When

- Spec and plan artifacts are complete.
- Implementation tasks are ready.

## Inputs

- `.hephaestus/specs/<feature>.md`
- `.hephaestus/plans/<feature>.md`
- Target repo source code and tests.
- CI/build config context (workflow files, build scripts, env/config touchpoints).
- DB context (`facts`, `handoffs`, `blockers`, `config_assumptions`, `retrieval_chunks`)
- Shared API module (`.hephaestus/db/storage/retrieval_api.py`).

## Outputs

- Code changes mapped to plan slices.
- `.hephaestus/logs/<feature>-execute.log`
- DB updates in `artifact_index`, `raw_artifacts`, `facts`, `blockers`, `handoffs`, `agent_runs`, and CI automation tables when applicable.

## DB Reads

- `get_run_state`, `get_facts`, `get_handoffs_for_role`, `list_active_blockers`, `get_relevant_chunks`
- `get_latest_failed_ci_run`, `get_ci_failure_summary`, `get_ci_workflow_states` (when CI risk exists)

## DB Writes

- `register_artifact`
- `persist_fact` (changed scope, assumptions)
- `persist_blocker` (execution failures)
- `persist_retrieval_chunk`
- `persist_handoff`
- `record_ci_automation_action` (for CI-relevant code/build/config changes)
- `persist_ci_workflow_state` (when handing off to CI triage/reverify)

## Procedure

1. Query DB first for current blockers/handoffs and prior execution context.
2. Pick one plan slice at a time.
3. Log intent, touched files, and outcomes via `assets/execute-log-template.md`.
4. Evaluate file/class/function growth risk before and after each slice.
5. Check extract-module opportunities and split work when diff is too large for safe review.
6. Document pattern alignment:
   - nearest existing precedent
   - alignment decision
   - deviation rationale
7. Apply minimal, traceable changes.
8. Detect CI-impacting deltas (pipeline files, build scripts, env/config contracts); register CI action with reason.
9. Apply OWASP lens to changed surface and persist security risk chunks when risk is introduced.
10. Persist execution-to-CI handoff when CI-impacting deltas or CI failures exist.
11. Record residual risks and open rework items.
12. Persist changed scope, assumptions, failures, and handoffs using `persist_execute_memory(...)`.
13. Handoff to `hephaestus-verify`.

## Guardrails

- No unplanned feature expansion.
- One active write-heavy stream at a time.
- Prefer existing local patterns before introducing new abstractions.
- If no local pattern fits, document justification and migration cost.
- Implementer cannot self-approve completion.
- Keep DB records synchronized with each completed slice.
- Report should summarize execution only and point to DB-backed evidence refs.
- If code/build/config change may affect pipelines, CI handoff is mandatory.

## Handoff

Include:

- Completed slices
- Residual risk
- Suggested verification commands
- Execution-to-CI handoff note (when CI-impacting changes exist)
- Next skill: `hephaestus-verify`
