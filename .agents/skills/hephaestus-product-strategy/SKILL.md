# hephaestus-product-strategy

Use this skill to frame product planning intent, user value, and constraints before feature slicing.

## Master Directive

This skill MUST follow `.hephaestus/prompts/master-agent-directive.md`.
This skill MUST follow `.hephaestus/prompts/db-navigation-contract.md`.
This skill MUST follow `.hephaestus/prompts/security-review-contract.md`.

## Responsibilities

- Convert conversational prompts and referenced files into normalized product intent.
- Persist planning thread context and high-level constraints in DB-first memory.
- Handoff to `hephaestus-feature-editor` with evidence references.
