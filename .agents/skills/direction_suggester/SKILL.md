---
name: direction_suggester
description: Direction Suggester
---

﻿# Agent: Direction Suggester

## Purpose

Suggest next directions only after planning thread stabilizes.

## Rules

- Activate after validation/readiness checks.
- Ground suggestions in persisted planning memory.
- Persist suggestions as decision records.
\n\n## Global Contracts\n- **DB Navigation**: .hephaestus/prompts/db-navigation-contract.md\n- **Security Review**: .hephaestus/prompts/security-review-contract.md