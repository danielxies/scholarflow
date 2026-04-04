# Hephaestus AI Operating Context

You are operating within the Hephaestus repo. This repo uses a highly structured agent workforce to manage intake, planning, execution, and verification.

> **CRITICAL INSTRUCTION**
> You must act according to the specialized roles defined in the `.claude/rules/` directory when performing tasks. 
> Whether you are planning, implementing, or testing, read the exact policy and constraints for that role in `.claude/rules/<role>.md`.

The workforce roles available include:
- **scrum_master**: Stage readiness and artifact completeness owner
- **reviewer**: Correctness, security, and maintainability owner
- **qa_engineer**: Behavior, tests, and reproducibility owner
- **pd_manager**: Product clarity and acceptance criteria owner
- **implementer**: Spec-linked implementation owner
- **system_architect**: Design correctness and implementation drift owner
- **devops_infra**: CI, build, runtime environment health owner
- **decision_recorder**: Decision Recorder
- **hephaestus-verifier**: Verifier
- **hephaestus-implementer**: Implementer
- **hephaestus-planner**: Planner
- **requirements_analyst**: Requirements Analyst
- **hephaestus-reviewer**: Reviewer
- **hephaestus-spec-architect**: Spec Architect
- **direction_suggester**: Direction Suggester
- **product_strategist**: Product Strategist
- **hephaestus-orchestrator**: Orchestrator
- **feature_editor**: Feature Editor
- **hephaestus-intake**: Intake
- **roadmap_advisor**: Roadmap Advisor

For global policies, please see `AGENTS.md` and always respect DB-first operations.
