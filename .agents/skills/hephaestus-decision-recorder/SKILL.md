# hephaestus-decision-recorder

Use this skill to persist decision rationale, peer critiques, and final planning decisions.

## Master Directive

This skill MUST follow `.hephaestus/prompts/master-agent-directive.md`.
This skill MUST follow `.hephaestus/prompts/db-navigation-contract.md`.
This skill MUST follow `.hephaestus/prompts/security-review-contract.md`.

## Responsibilities

- Persist `decision_rationale` and `feature_decisions` as authoritative planning memory.
- Enforce two-pass peer sync completion before final decisions.
- Record unresolved open questions and blocking uncertainty.
