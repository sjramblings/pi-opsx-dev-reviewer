# AGENTS.md

Operational back-pressure for this repo — the pitfalls the reviewer keeps catching,
distilled into rules so the developer avoids them up front. Copy this template to your
repo root and grow it from real review findings via `/opsx-retro`.

Keep it under ~60 lines. Every line is earned by a real past failure. Status updates
and progress notes do NOT belong here — those live in the change's `tasks.md` and
`review-log.md`. A bloated AGENTS.md pollutes every delegation's context; prune it
like code.

## Rules

- Keep README.md and index.html current with shipped user-facing features; a stale entry doc is a BLOCK finding (enforced by the dev-reviewer `docs` artifact).

<!-- One line per rule. Example shape: -->
<!-- - Validate every boundary response shape before trusting it (caught 3× in review). -->
<!-- - No empty catch blocks; a swallowed error is a BLOCK finding. -->
