# hephaestus-run

Use this as the default Hephaestus orchestrator skill.

## Purpose

Drive `Request -> Intake -> Spec -> Plan -> Execute -> Verify -> LazinessAudit -> Review -> SecurityAudit -> Ship -> Retro` with explicit artifacts and handoffs.
When invoked through normal user mode (`hephaestus-assist` / `hephaestus ask`), keep this orchestration in the background and emit milestone-only user output.

## Master Directive

This skill MUST follow `.hephaestus/prompts/master-agent-directive.md`.
This skill MUST follow `.hephaestus/prompts/db-navigation-contract.md`.
This skill MUST follow `.hephaestus/prompts/ci-automation-contract.md`.
This skill MUST follow `.hephaestus/prompts/security-review-contract.md`.

## Use When

- A broad feature request needs end-to-end delivery.
- You want low-manual-prompting orchestration.

## Inputs

- User request
- Target repository context
- Hephaestus policy files (`AGENTS.md`, `.codex/config.toml`, `.hephaestus/prompts/role-handoffs.md`)
- DB context (`.hephaestus/db/hephaestus_memory.sqlite3`)
- Shared API module (`.hephaestus/db/storage/retrieval_api.py`)

## Outputs

- Stage artifacts under `.hephaestus/`
- Reports under `.hephaestus/reports/`
- `ship-report` via `assets/ship-report-template.md`
- `closeout-report` via `assets/closeout-report-template.md`
- System-improvement actions under `.hephaestus/retros/`

## DB Reads

- `get_run_state`
- `derive_next_stage_from_db`
- `get_handoffs_for_role`
- `list_active_blockers`
- `lookup_recurrence` (for recurring failures in orchestration path)
- `get_security_findings` / `get_security_blockers` (for OWASP gate enforcement)
- `get_latest_failed_ci_run` / `get_ci_failure_summary` (for CI/CD-aware orchestration)
- `get_ci_workflow_states` / `get_stage_failure_chain` (for CI triage loop progress and failure trace)
- `get_recent_ci_failures_by_signature` / `get_ci_noise_profile` (for recurring CI intelligence)

## DB Writes

- `create_run` / `update_run_stage`
- `persist_handoff`
- `persist_blocker`
- `persist_retrieval_chunk`
- `persist_security_finding` (when orchestrator identifies direct OWASP blocker evidence)
- `register_artifact`
- `persist_ci_workflow_state` / `record_ci_automation_action`

## OWASP 2025 Security Lens

- Enforce completion of OWASP security gate before ship.
- Ensure security findings/blockers/chunks are persisted and linked to ship decision.

## Procedure

1. Normalize request and feature slug.
2. Load minimal context from DB first (runs, blockers, handoffs, facts, review/verify summaries).
3. Query summary prechecks in order (`intent -> contract -> risk`) before any raw code fallback.
4. Create or reuse run record via `get_or_create_run(...)`.
5. Determine next stage from DB state with `derive_next_stage_from_db(...)`; do not rely on chat-only context.
6. Call stage skill(s) based on DB stage state: intake -> spec-plan -> execute -> verify -> laziness-audit -> review -> security-audit.
6.1 For planning-intent runs, call planning specialists: product-strategy -> feature-editor -> requirements-analyst -> roadmap-advisor -> decision-recorder -> direction-suggester.
7. Use `hephaestus-retrieval-audit` for budgeted evidence bundles before verify/review/security gates.
8. Require `hephaestus-security-audit` completion before final ship decision.
9. If CI failed or CI-impacting changes exist, run the CI loop in-order:
   - detect -> ingest -> triage -> recurrence -> blocker -> route -> fix path -> reverification -> closeout.
10. Use `hephaestus-ci-triage`, `hephaestus-ci-flake-detect`, and `hephaestus-ci-fix-suggest` for CI intelligence steps.
11. Use `hephaestus-supply-chain-gate` when dependency/integrity surfaces changed.
12. Use `hephaestus-threat-surface-sync` when trust/auth boundaries changed.
13. Never skip ingestion; if logs were already ingested, require existing `ingested` workflow state evidence.
14. Trigger log ingestion + triage automatically when CI-related failures appear.
15. When failures appear, query recurrence memory (`lookup_recurrence`) before routing rework.
16. Enforce OWASP gate completion and persisted security findings/chunks/blockers before ship.
17. At each transition, persist handoff/blocker/chunk state and stage update.
18. Write ship decision summary to `.hephaestus/reports/<feature>-ship.md` and include DB evidence references.
19. Summarize CI closeout state in ship report (workflow states, unresolved CI blockers, recurrence risk).
20. Write closeout summary to `.hephaestus/reports/<feature>-closeout.md` and include blocker/handoff/run references.
21. Capture retro outcomes and process improvements.

## Guardrails

- No stage skipping.
- No execution without spec and plan.
- No completion without verify, laziness-audit, review, and security-audit evidence.
- CI failure loop decisions are mandatory and append-only in DB.
- Never rerun CI blindly; reverification requires recorded reason.
- Never overwrite original CI failure after retries.
- DB-first retrieval is mandatory; raw file rereads are fallback only.
- Code writing is never equivalent to completion.
- A single narrow passing test is not sufficient when changed behavior has broader impact.
- Verification must be derived from acceptance criteria and changed diff surface.
- Record failures explicitly; if tests are absent, record that absence as risk.
- Reviewer may block ship solely due to insufficient verification evidence.
- Reviewer may block ship solely due to insufficient security evidence.
- Repeated correction patterns must update the system, not only the task.
- Reports must stay concise and human-readable; DB is authoritative coordination memory.
- Do not duplicate unchanged stage context in every report; include DB references instead of context dumps.
- In planning mode, keep conversational UX simple and emit docs artifacts only after readiness state reaches `ready_for_output`.
- Retrieval-vNext audit is required for verify/review/ship decisions.
- Stage transitions must write `execution_checkpoints`; security gate must write `security_gate_decisions`.
- Rework must use `repair_cycles`/`repair_attempts` and respect `retry_budgets`.
- Abandonment detection must write `abandonment_events` and escalate via blocker + handoff.

## Handoff

- Human-facing default entry point.
- Delegates specialist skills and records stage transitions.
- Persists run/handoff/artifact state for downstream agents.
