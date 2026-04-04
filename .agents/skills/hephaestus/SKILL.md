# Hephaestus Skill (Compatibility Alias)

This legacy alias maps to `hephaestus-assist` in normal mode and `hephaestus-run` for explicit operator orchestration.

Use `hephaestus-assist` as the default normal-user entrypoint.
All flows inherit `.hephaestus/prompts/master-agent-directive.md`.
All flows use DB-first retrieval via `.hephaestus/db/hephaestus_memory.sqlite3`.
All flows follow `.hephaestus/prompts/db-navigation-contract.md`.
All flows follow `.hephaestus/prompts/security-review-contract.md`.
