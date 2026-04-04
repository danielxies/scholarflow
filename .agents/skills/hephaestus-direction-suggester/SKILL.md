# hephaestus-direction-suggester

Use this skill after plan stabilization to suggest next directions and roadmap adjacencies.

## Master Directive

This skill MUST follow `.hephaestus/prompts/master-agent-directive.md`.
This skill MUST follow `.hephaestus/prompts/db-navigation-contract.md`.
This skill MUST follow `.hephaestus/prompts/security-review-contract.md`.

## Responsibilities

- Suggest adjacent opportunities, MVP cuts, sequencing improvements, and missing requirements.
- Activate only after readiness validation indicates planning maturity.
- Persist suggestions in `feature_decisions` with decision type `direction_suggestion`.
