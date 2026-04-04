# hephaestus-spec-plan

Use this skill as the explicit design and planning gear after intake.

## Purpose

Produce an implementation-ready specification and an execution plan with clear ownership and dependencies.

## Master Directive

This skill MUST follow `.hephaestus/prompts/master-agent-directive.md`.
This skill MUST follow `.hephaestus/prompts/db-navigation-contract.md`.
This skill MUST follow `.hephaestus/prompts/security-review-contract.md`.

## Use When

- Intake artifacts are complete.
- The team is ready to define architecture and execution slices.

## Inputs

- `.hephaestus/intake/<feature>-request.md`
- `.hephaestus/intake/<feature>.md`
- Existing codebase constraints and conventions.
- DB context (`facts`, `config_assumptions`, `subsystem_links`, `retrieval_chunks`)
- Shared API module (`.hephaestus/db/storage/retrieval_api.py`).

## Outputs

- `.hephaestus/specs/<feature>.md`
- `.hephaestus/plans/<feature>.md`
- `.hephaestus/reports/<feature>-design-check.md`
- DB updates in `facts`, `subsystem_links`, `handoffs`, and `artifact_index`.
- Security lens updates in `facts` + security retrieval chunks for applicable OWASP categories.

## DB Reads

- `get_run_state`, `get_facts`, `get_relevant_chunks`, `get_artifacts_for_slug`

## DB Writes

- `register_artifact`
- `persist_fact` (phases, risks, task graph)
- `insert_row` on `subsystem_links`
- `persist_retrieval_chunk`
- `persist_handoff`
- `persist_security_finding` (only when planning discovers immediate blocking security design risk)

## OWASP 2025 Security Lens

- Assess changed surface against `A01` through `A10` categories during planning.
- Persist at least one security chunk per implicated category.
- Escalate immediate design-level blockers (`A01`/`A05`/`A06`/`A08`) before execute starts.

## Procedure

1. Load minimal DB context first and only open raw artifacts for unresolved gaps.
2. Draft specification from `assets/spec-template.md`.
3. Define interfaces, invariants, migration impact, and risk mitigations.
4. Create atomic task slices with `assets/plan-template.md`.
5. Evaluate file growth risk, class/component growth risk, and extract-module opportunities using `.hephaestus/prompts/decomposition-checklist.md`.
6. Decide whether planned diff size is safe for review; split into phases when too large.
7. Apply OWASP Top 10:2025 planning lens to changed surface and add explicit security checks to plan.
8. For each implicated OWASP category, persist a security chunk (`security_*` source type) with expected controls.
9. Map acceptance criteria to verification checks.
10. Persist phases, risks, subsystem links, and task graph in DB using `persist_spec_plan_memory(...)`.
11. Handoff to `hephaestus-execute`.
11.1 If upstream planning thread exists, consume planning artifacts (`docs/product-plan.md`, `docs/roadmap.md`, `docs/feature-specs/*`) as design inputs before execute handoff.

## Guardrails

- No speculative scope beyond intake.
- Every plan slice must map to spec sections.
- Capture decomposition rationale when extraction is deferred.
- Do not approve plans with oversized diffs when smaller increments are possible.
- Do not start execute without both spec and plan artifacts.
- Do not pass plan stage without OWASP lens coverage for the changed surface.
- DB-first retrieval is mandatory for context loading.
- Do not clone prior context into new reports when DB references are sufficient.

## Handoff

Include:

- Spec version and assumptions
- Ordered task slices
- Verification mapping
- Next skill: `hephaestus-execute`
