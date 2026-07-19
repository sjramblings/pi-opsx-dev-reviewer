# Make the docs gate deliberate, enforced, and self-consistent

## Why

`just docs-lint` has never run to green, and nothing would have told us. It is not wired into
CI, the four tools it calls are not installed on the maintainer machine, and a missing tool
reports `PARTIAL` rather than failing. The gate that `tech-writer` is measured against is, in
practice, unmeasured.

Running it reveals 306 markdownlint errors, and the breakdown matters more than the count:

- `MD041` (first line is a top-level heading) is **explicitly chosen** in
  `.markdownlint-cli2.jsonc`, and `openspec/schemas/dev-reviewer/templates/spec.md` violates it
  by construction — the template starts at `## ADDED Requirements`. Every spec delta the kit has
  ever generated fails the kit's own gate, including the archived
  `openspec/specs/project-onboarding/spec.md` the harness wrote itself.
- `MD022` and `MD032` fire 256 of the 306 times and appear **nowhere** in the config. They
  arrived through the "everything not listed keeps its markdownlint default" line. Nobody chose
  them.

That is the defect. Not the error count — the fact that the floor is inherited rather than
decided, and that no one has stood on it. This is the failure class the kit exists to name: a
gate that reads as passing because it never ran, the same shape as the extensions that `bun
build` proved fine while the real pi loader had them dead (`SHAKEDOWN.md`).

## What Changes

- Every markdownlint rule that fires against this repo is **explicitly decided** in
  `.markdownlint-cli2.jsonc` — set true because it is wanted, or false because it is not. No
  rule governs the repo by accident.
- `openspec/schemas/dev-reviewer/templates/spec.md` emits output that passes the gate. A top-level
  heading plus blank-line structure satisfies `MD041` and still passes `openspec validate
  --strict` — verified against a real delta before this proposal was written.
- Every other shipped template and generator (`proposal`, `design`, `tasks`, `review-log`, `docs`,
  the `learnings/` entry shape) is audited to the same standard.
- The 306-error backlog is cleared.
- `docs-lint` runs in CI, where `PARTIAL` is a failure. Locally a missing tool may degrade; in CI
  the tools are installed, so a skip means the gate rotted and the build stops.
- A regression guard fails if a shipped template emits output its own gate rejects.

## Capabilities

### New Capabilities

- `lint-clean-templates`: every template the kit ships emits output that passes `docs-lint` while still validating against its schema, and every governing rule is deliberately chosen
- `docs-gate-ci`: `docs-lint` runs in CI and cannot report a false clean

## Impact

Modified: `.markdownlint-cli2.jsonc`, `openspec/schemas/dev-reviewer/templates/*.md`,
`justfile.opsx`, `.github/workflows/`, plus the backlog across `openspec/**` (230), `agents/**`
(54), `README.md`, `SHAKEDOWN.md`, `learnings/**`, `goals/**`.

Sequencing: this change touches `justfile.opsx`, `README.md`, and the schema `templates/`
directory, which `add-architecture-writer` also touches. Apply it **after** that change lands to
avoid a concurrent-writer collision. The `arch-lint` recipe it adds inherits whatever floor this
change settles.
