# hephaestus-security-audit

Use this skill as the explicit OWASP Top 10:2025 security gate before ship.

## Purpose

Perform a structured security audit aligned to OWASP Top 10:2025 and persist security findings/blockers to DB.

## Master Directive

This skill MUST follow `.hephaestus/prompts/master-agent-directive.md`.
This skill MUST follow `.hephaestus/prompts/db-navigation-contract.md`.
This skill MUST follow `.hephaestus/prompts/ci-automation-contract.md`.
This skill MUST follow `.hephaestus/prompts/security-review-contract.md`.

## Primary Owner

- `reviewer`

## Supporting Roles

- `system_architect`
- `devops_infra`
- `qa_engineer`

## Use When

- Verification and review artifacts exist.
- A ship decision is pending.
- The changed surface is security-relevant or uncertain.

## Inputs

- `.hephaestus/specs/<slug>.md`
- `.hephaestus/plans/<slug>.md`
- `.hephaestus/reports/<slug>-verify.md`
- `.hephaestus/reports/<slug>-review.md`
- `.hephaestus/reports/<slug>-laziness-audit.md` (if present)
- Git diff and touched files.
- DB context (`security_findings`, `review_findings`, `verification_results`, `blockers`, `retrieval_chunks`, `artifact_index`, `raw_artifacts`).
- OWASP checklist: `references/owasp-2025-audit-checklist.md`.
- Shared API module (`.hephaestus/db/storage/retrieval_api.py`).

## Outputs

- `.hephaestus/reports/<slug>-security-audit.md`
- DB updates in `security_findings`, `security_controls`, `security_gate_decisions`, `security_evidence_links`, `review_findings`, `blockers`, `retrieval_chunks`, and `artifact_index`.

## DB Reads

- `get_run_state`, `get_security_findings`, `get_security_blockers`, `get_review_blockers`, `get_verification_summary`, `get_relevant_chunks`
- `get_ci_failure_summary`, `get_ci_workflow_states`, `get_recent_ci_failures_by_signature` (for CI/security signal)

## DB Writes

- `register_artifact`
- `persist_security_finding`
- `persist_security_control`
- `persist_security_gate_decision`
- `link_security_evidence`
- `persist_retrieval_chunk` (security chunk types)
- `persist_blocker` (for explicit gate blockers)
- `persist_handoff`

## Procedure

1. Load DB-first context and unresolved blockers/findings.
2. Inspect spec, plan, diff, verify, review, and CI evidence for security implications.
3. Apply all OWASP Top 10:2025 categories from the checklist and record deterministic control status per category.
4. Persist control rows via `persist_security_control(...)` and evidence links for each material check.
5. Persist each material finding via `persist_security_finding(...)` with category, severity, confidence, and blocker decision.
6. Persist gate decision via `persist_security_gate_decision(...)` with explicit `block`/`conditional`/`approve`.
7. Ensure blocker defaults are honored (`A01`-`A08` block by default; `A09`/`A10` conditional unless escalated).
8. Produce concise report using `assets/security-audit-report-template.md`.
9. Handoff to ship or rework owner with explicit block/conditional/pass decision.

## Guardrails

- No security conclusions without traceable evidence.
- No ship-ready recommendation with unresolved high/critical OWASP findings.
- No raw-log-first workflow when DB chunk evidence already exists.
- Security audit must stay concise and point to DB-backed findings/chunks.

## Handoff

Include:

- OWASP findings by severity
- Blockers with owners
- Required fixes before ship
- Final decision: `blocked` / `conditional` / `passes`
