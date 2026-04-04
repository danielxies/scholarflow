# hephaestus-laziness-audit

Use this skill as a targeted anti-laziness gate before code is considered ship-ready.

## Purpose

Audit implementation quality for common lazy-AI failure patterns and produce a ship-gating report.

## Master Directive

This skill MUST follow `.hephaestus/prompts/master-agent-directive.md`.
This skill MUST follow `.hephaestus/prompts/db-navigation-contract.md`.
This skill MUST follow `.hephaestus/prompts/ci-automation-contract.md`.
This skill MUST follow `.hephaestus/prompts/security-review-contract.md`.

## Primary Owner

- `reviewer`

## Supporting Subagents

- `system_architect`
- `qa_engineer`
- `devops_infra` when config/CI/runtime concerns are touched

## Use When

- Verification is complete and a ship decision is approaching.
- Review needs structured anti-pattern evidence.

## Inputs

- Git diff
- Touched files
- `.hephaestus/specs/<slug>.md`
- `.hephaestus/plans/<slug>.md`
- `.hephaestus/reports/<slug>-verify.md`
- CI/build artifacts if available
- DB context (`review_findings`, `verification_results`, `error_signatures`, `retrieval_chunks`, `raw_artifacts`)
- Shared API module (`.hephaestus/db/storage/retrieval_api.py`)

## Outputs

- `.hephaestus/reports/<slug>-laziness-audit.md`
- DB updates in `review_findings`, `recurrence_history`, `error_signatures`, and `artifact_index`
- Security DB updates in `security_findings`, `blockers`, and security retrieval chunks for OWASP-tagged anti-patterns

## DB Reads

- `get_run_state`, `get_review_blockers`, `get_verification_summary`, `get_relevant_chunks`, `lookup_recurrence`
- `get_security_findings`, `get_security_blockers`
- `get_ci_workflow_states`, `get_ci_failure_summary`, `get_ci_noise_profile`, `get_recent_ci_failures_by_signature`

## DB Writes

- `register_artifact`
- `insert_row` on `review_findings`
- `persist_blocker` (ship blockers)
- `persist_retrieval_chunk`
- `persist_fix_pattern` (for repeated anti-pattern corrections)
- `persist_security_finding` (when anti-pattern maps to OWASP risk)
- `persist_security_control` and `persist_security_gate_decision` when anti-pattern implies deterministic security gate failure
- `persist_ci_workflow_state` / `record_ci_automation_action` when CI anti-patterns are found

## OWASP 2025 Security Lens

- Map laziness anti-patterns to OWASP categories when they impact security posture.
- Persist OWASP findings and security chunk evidence for each mapped risk.
- Escalate blocker decisions according to default policy and evidence severity.

## Procedure

1. Query DB for prior findings/signatures before opening raw reports.
2. Inspect diff and changed files against spec/plan intent.
3. Cross-check verification and CI/build outputs for weak claims.
4. Evaluate anti-pattern catalog from `references/anti-pattern-catalog.md`.
5. Record severity-ranked findings with exact file/path anchors.
6. Persist anti-pattern findings and ship blockers using `persist_laziness_audit_memory(...)`.
7. Map applicable anti-pattern findings to OWASP Top 10:2025 and persist security findings.
8. Produce final decision: `blocked`, `conditional`, or `passes`.

## Mandatory Checks

- Hardcoded config/secrets/URLs/ports/environment assumptions
- Magic numbers and strings with poor justification
- Bloated files/classes/functions/components
- Duplicate logic
- Long parameter lists, flag arguments, weak abstractions
- Missing failure handling
- Weak tests or untested changed behavior
- Hidden architecture drift
- Unnecessary dependencies
- Logging and observability gaps
- Style drift from local repository patterns
- Retrying CI without diagnosis
- Swallowing or masking CI failures
- Weak CI observability and non-actionable pipeline events
- Unstable pipeline assumptions (flaky/transient treated as proven)
- Environment-specific hardcoding in pipeline/build/runtime config
- OWASP-tagged lazy handling of access/auth boundaries, injection surfaces, secret handling, integrity checks, and exceptional conditions

## Guardrails

- Findings must be evidence-based and path-specific.
- No ship-ready claim without explicit final decision.
- High-severity findings block ship until fixed.
- Do not restate unchanged verification/review context; cite DB references.
- Security anti-pattern findings must include OWASP category, evidence, and blocker policy.

## Handoff

Include:

- Findings by severity with path references
- Required fixes before ship
- Suggested refactors after ship
- Final decision: `blocked`, `conditional`, or `passes`
