# Orchestration Policy

- Default entry point: `hephaestus-run`.
- Human can invoke specialist skills directly when needed.
- `hephaestus-run` enforces stage order and artifact completeness.
- `hephaestus-run` must invoke `hephaestus-laziness-audit` after verify and before ship summary.
- If planning intent is detected, run planning specialist sequence before execution stages and emit docs only at readiness gate.
- When CI fails, `hephaestus-run` must execute CI triage loop states:
  `detected -> ingested -> triaged -> recurrence_matched -> blocker_created -> fix_in_progress -> reverifying -> resolved/unresolved/escalated`.
- Ship summary must include CI closeout status, unresolved CI blockers, and recurrence risk.
- Write-heavy stages are serialized; read-heavy checks may run in parallel.
