# Add a per-repo installer and lifecycle reminders

## Why

`install.sh` installs global pi pieces only; every project-scoped part (extensions, tools,
schema, AGENTS.md, learnings store, recipes) is a manual copy-paste block, and nothing
reminds an operator to run `/opsx-retro` before archiving. Onboarding a repo is error-prone
and the ratchet is easy to skip.

## What Changes

- `install.sh --here [path]` (and `--all`): a non-destructive per-repo install that lays down
  `.pi/extensions/`, `tools/`, the `dev-reviewer` schema + `openspec/config.yaml`, an
  `AGENTS.md` + `learnings/` scaffold, and a `justfile.opsx` import — never clobbering
  existing data files (`cp -n`, config left untouched if present).
- New `opsx-reminder` session_start extension: on the main agent it surfaces the single
  pending lifecycle action (a change all-ticked but un-archived → run `/opsx-retro`; draft
  learnings pending promotion) and stays silent otherwise.
- New `just next <change>` recipe: deterministic "where is this change, what do I run next".
- **Fix (BREAKING for the false-pass):** `just check-extensions` now scans BOTH
  `extensions/*/index.ts` and `.pi/extensions/*/index.ts`. It previously scanned only the
  kit-dev layout, so in every *installed* repo the load-breaker guard checked nothing and
  reported a false "clean".

## Capabilities

- **New Capabilities**: `project-onboarding`

## Impact

Modified: `install.sh`, `justfile` (`next` + `check-extensions` fix). New:
`extensions/opsx-reminder/index.ts`. No new dependency. The reminder extension is
tokenizer-safe and passes `check-extensions`.
