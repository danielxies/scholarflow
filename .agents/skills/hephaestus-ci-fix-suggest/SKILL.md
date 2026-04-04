# hephaestus-ci-fix-suggest

Use this skill to generate policy-safe CI fix suggestions from recurrence and cluster priors.

## Purpose

Produce ranked fix candidates with mechanism hypothesis, risk note, and verification plan.

## Master Directive

This skill MUST follow `.hephaestus/prompts/master-agent-directive.md`.
This skill MUST follow `.hephaestus/prompts/db-navigation-contract.md`.
This skill MUST follow `.hephaestus/prompts/ci-automation-contract.md`.
This skill MUST follow `.hephaestus/prompts/security-review-contract.md`.

## Use When

- CI triage and recurrence lookup are complete.
- A fix path is needed before execution.

## Inputs

- canonical signature
- CI cluster context
- failure class
- recurrence fix-pattern candidates

## Outputs

- `ci_fix_suggestions` rows
- fix-candidate retrieval chunks
- optional escalation when no safe candidate exists

## Procedure

1. Load recurrence and cluster priors from DB.
2. Generate candidate fixes with mechanism hypothesis.
3. Attach risk note and concrete verification plan for each candidate.
4. Rank suggestions by confidence and blast radius.
5. Persist suggestion rows and decision chunks.

## Guardrails

- Respect do-not-auto-fix classes.
- No candidate without verify plan.
- No candidate without explicit risk note.

## Handoff

Include:

- Ranked candidate list
- Recommended owner role
- Verification commands to validate the chosen fix
