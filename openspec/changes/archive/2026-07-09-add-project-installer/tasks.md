# Tasks — add-project-installer

> Built + verified directly this session (outside the pi delegation flow) at the operator's
> request; verification evidence is in review-log.md.

## 1. Per-repo installer

- [x] 1.1 Add `install.sh --here [path]` / `--all` mode that installs `.pi/extensions/`,
      `tools/`, the `dev-reviewer` schema + `openspec/config.yaml`, an `AGENTS.md` +
      `learnings/` scaffold, and a `justfile.opsx` import; non-destructive (`cp -n`).
      probe: `./install.sh --here $(mktemp -d)` populates `.pi/extensions/`, `tools/`, `openspec/`, `learnings/`, `justfile` and exits 0.
- [x] 1.2 Existing data files (`AGENTS.md`, `learnings/*`, `justfile`) are never clobbered.
      probe: re-running `--here` on a populated repo keeps the user's files and appends (not overwrites) the justfile import.

## 2. Load-breaker guard covers the installed layout

- [x] 2.1 `just check-extensions` scans both `extensions/*/index.ts` and
      `.pi/extensions/*/index.ts`, and reports "nothing to check" rather than a false clean.
      probe: in a fresh `--here` repo, planting an apostrophe in `.pi/extensions/*/index.ts` makes `just check-extensions` exit 1 naming that path.

## 3. Lifecycle reminder extension

- [x] 3.1 Add tokenizer-safe `extensions/opsx-reminder/index.ts` (session_start, main agent
      only) that reminds on an all-ticked un-archived change and on draft learnings, and is
      silent when nothing is pending.
      probe: `just check-extensions` clean; a synthetic session_start against a repo with an all-ticked change emits exactly one reminder naming that change.

## 4. Lifecycle recipe

- [x] 4.1 Add `just next <change>` reporting done/total tasks and the next command.
      probe: `just next <in-progress>` points at `/opsx-loop`; `just next <all-done>` points at `/opsx-retro` + archive-check + archive.

## 5. Guard

- [x] 5.1 All extensions (including the new reminder) stay load-clean.
      probe: `just check-extensions` exits 0 in the kit repo.
