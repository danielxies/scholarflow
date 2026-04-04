# hephaestus-feature-editor

Use this skill to normalize, split, merge, and deduplicate feature candidates.

## Master Directive

This skill MUST follow `.hephaestus/prompts/master-agent-directive.md`.
This skill MUST follow `.hephaestus/prompts/db-navigation-contract.md`.
This skill MUST follow `.hephaestus/prompts/security-review-contract.md`.

## Responsibilities

- Normalize candidate feature shape (`problem`, `user_value`, `intent_tags`, `dependencies`, `constraints`, `risk_tags`).
- Compute overlap and cluster/merge suggestions with persisted rationale.
- Coordinate peer critique with `decision_recorder` before final merge decisions.
