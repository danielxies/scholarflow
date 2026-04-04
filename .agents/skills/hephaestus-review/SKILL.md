# hephaestus-review

Use this skill as the explicit quality gate before ship.

## Purpose

Perform risk-first review for correctness, security, and maintainability.

## Master Directive

This skill MUST follow `.hephaestus/prompts/master-agent-directive.md`.
This skill MUST follow `.hephaestus/prompts/db-navigation-contract.md`.
This skill MUST follow `.hephaestus/prompts/ci-automation-contract.md`.
This skill MUST follow `.hephaestus/prompts/security-review-contract.md`.

## Use When

- Verification report exists.
- A ship decision is being considered.

## Inputs

- `.hephaestus/reports/<feature>-verify.md`
- `.hephaestus/reports/<feature>-laziness-audit.md` (when present)
- `.hephaestus/specs/<feature>.md`
- `.hephaestus/plans/<feature>.md`
- Diff and changed files.
- CI closeout and failure-summary artifacts when CI loop was active.
- DB context (`review_findings`, `verification_results`, `blockers`, `retrieval_chunks`, `raw_artifacts`)
- Shared API module (`.hephaestus/db/storage/retrieval_api.py`).

## Outputs

- `.hephaestus/reports/<feature>-review.md`
- Rework requests to execute or spec-plan when needed.
- DB updates in `review_findings`, `blockers`, `handoffs`, and `artifact_index`.
- Security DB updates in `security_findings` and security retrieval chunks.

## DB Reads

- `get_run_state`, `get_review_blockers`, `get_verification_summary`, `get_relevant_chunks`
- `get_security_findings`, `get_security_blockers`
- `get_ci_failure_summary`, `get_ci_workflow_states`, `get_recent_ci_failures_by_signature`

## DB Writes

- `register_artifact`
- `insert_row` on `review_findings`
- `persist_blocker` (high-severity findings)
- `persist_retrieval_chunk`
- `persist_security_finding`
- `persist_security_control` (for deterministic control checks asserted during review)
- `persist_handoff`
- `persist_ci_workflow_state` (resolved/unresolved/escalated closeout states when applicable)
- `create_review_gate`
- `persist_security_gate_decision` for explicit OWASP gate outcomes
- `persist_retrieval_audit` via `select_evidence_bundle`
- `insert_row` on `approval_decisions` for block/conditional/approve record

## OWASP 2025 Security Lens

- Evaluate all applicable `A01`-`A10` categories for the changed surface.
- Persist security findings with severity, category, and blocker policy.
- Block ship on unresolved high/critical OWASP findings or missing security evidence.

## Procedure

1. Query DB for minimal run context and unresolved findings first.
2. List findings by severity first.
3. Check spec-to-implementation and plan alignment.
4. Evaluate file growth risk, class/component growth risk, extract-module opportunities, and diff review safety.
5. Validate Pattern Alignment evidence:
   - nearest existing precedent
   - alignment decision
   - deviation rationale
6. Validate verification evidence quality; reviewer may block ship solely on insufficient verification evidence.
7. Evaluate OWASP Top 10:2025 categories against changed surface and verification evidence.
8. Persist per-category deterministic control status (`pass`/`fail`/`not_applicable`) for touched categories.
9. Persist OWASP findings/chunks/blockers with explicit severity and blocker default.
10. Document security and maintainability risks.
11. Produce go/no-go recommendation with `assets/review-report-template.md`.
12. Persist findings by severity and blocking status using `persist_review_memory(...)`.
13. Include CI automation status, unresolved CI blockers, and recurrence risk in findings.
14. Confirm CI loop decisions and reverification evidence are complete when CI failures occurred.
15. Handoff to ship or rework owner.

## Guardrails

- Findings first, summary second.
- No ship recommendation with unresolved high-severity findings.
- No ship recommendation with insufficient verification evidence.
- Reviewer is independent from implementer completion authority.
- Summaries must reference DB findings/chunks rather than duplicating earlier report text.
- Reviewer may block ship if CI automation trail is incomplete or unverifiable.
- Reviewer must block ship when CI evidence is insufficient or unstable.
- Reviewer must block ship for unresolved high/critical OWASP findings or insufficient security evidence.

## Handoff

Include:

- Severity-ranked findings
- Rework owner
- Ship readiness decision
