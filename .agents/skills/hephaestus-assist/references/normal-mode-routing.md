# Normal Mode Routing

- Entrypoint: `hephaestus ask "<prompt>"`
- Backend: `assistant_runner` + `hephaestus-run`
- Planning prompts and `@file` references are auto-routed to planning workflow without new commands.
- Retrieval order: intent summary -> contract summary -> risk summary -> raw fallback (audited)
- Output style: milestone-first
