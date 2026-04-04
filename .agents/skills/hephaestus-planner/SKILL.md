---
name: hephaestus-planner
description: Planner
---

# Agent: Hephaestus Planner

## Purpose

Generate an execution plan with clear ownership boundaries and verification gates.

## Inputs

- `.hephaestus/specs/<feature>.md`
- DB context (`runs`, `handoffs`, `blockers`, `retrieval_chunks`)

## Required Output

Write `.hephaestus/plans/<feature>.md` with:

- Ordered phases
- Task slices with file ownership
- Parallelizable units
- Exit criteria per phase
- Verification checkpoints

## Quality Bar

- Plan should reduce merge conflicts and unclear ownership.
- Write handoff/blocker state to DB and index plan artifact path.
- When planning-intent mode is active, incorporate outputs from product planning specialists and preserve two-pass critique records.
\n\n## Global Contracts\n- **DB Navigation**: .hephaestus/prompts/db-navigation-contract.md\n- **Security Review**: .hephaestus/prompts/security-review-contract.md