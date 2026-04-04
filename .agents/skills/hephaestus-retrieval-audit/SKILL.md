# hephaestus-retrieval-audit

Use this skill to produce a minimum-sufficient DB-first evidence bundle with audit persistence.

## Purpose

Generate intent-aware, scope-aware evidence bundles that stay within role budgets and remain traceable.

## Master Directive

This skill MUST follow `.hephaestus/prompts/master-agent-directive.md`.
This skill MUST follow `.hephaestus/prompts/db-navigation-contract.md`.
This skill MUST follow `.hephaestus/prompts/security-review-contract.md`.

## Use When

- `hephaestus-run`, `reviewer`, or `qa_engineer` needs fast, auditable context selection.
- Evidence scope must be escalated gradually and logged.

## Inputs

- `slug`
- `run_id` (optional)
- `role`
- `query`
- `intent_code` (optional)
- `allow_raw_fallback` flag

## Outputs

- Selected evidence bundle
- `retrieval_intents` / `retrieval_sessions` / `retrieval_audit_log` rows
- Escalation record if evidence was insufficient
- Optional blocker for unresolved insufficiency

## Procedure

1. Classify intent with `classify_intent(...)`.
2. Resolve scope with `resolve_scope(...)`, deny org-wide by default.
3. Select evidence with `select_evidence_bundle(...)` using role budget.
3.1 Support planning intents (`product_planning`, `feature_dedup`, `requirements_synthesis`, `roadmap_prioritization`, `direction_suggestion`, `file_extract_lookup`) with the same budgeted/audited flow.
4. For code context, call summary prechecks first (`get_intent_summary`, `get_contract_summary`, `get_risk_summary`) and only then `resolve_code_context(...)`.
5. Persist audit row for selection path and sources.
6. If insufficient, escalate one scope step and record escalation.
7. Persist blocker when evidence remains insufficient after allowed escalations.

## Guardrails

- No raw-first retrieval.
- No raw code fallback before summary precheck (`intent -> contract -> risk`).
- No org-wide scope unless explicitly permitted and audited.
- Every retrieval call path must emit an audit row.
- Escalation must be stepwise (`run_local -> slug_local -> repo_local`).

## Handoff

Include:

- Bundle refs and token usage
- Escalation path taken
- Insufficiency reason (if any)
