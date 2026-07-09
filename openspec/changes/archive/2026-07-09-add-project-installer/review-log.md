# Review log — add-project-installer

Built directly in Claude Code (outside the pi developer/reviewer delegation flow) at the
operator's request; the entry below records the tool-verified evidence so the ledger is
honest.

---

## Slice (tasks 1.1–5.1) — direct build, tool-verified

VERDICT: PASS
FINDINGS: one real defect caught during verification and fixed (see below). Built outside
the developer/reviewer delegation flow (noted).
EVIDENCE CHECK:
- `install.sh --here <tmp>` populated `.pi/extensions/` (6 guards), `tools/`, the schema +
  `openspec/config.yaml`, `AGENTS.md`, `learnings/`, and a `justfile` importing `justfile.opsx`.
- `opsx-reminder`: `just check-extensions` clean + `bun build` clean; a synthetic
  session_start emitted exactly one reminder naming `harden-architect-scope` (all-ticked,
  un-archived) and stayed silent on the in-progress change and on the active (non-draft) learning.
- `just next add-learning-loop` → "11/15 … run /opsx-loop"; `just next harden-architect-scope`
  → "1/1 … run /opsx-retro … archive-check … archive".
- **Defect found + fixed:** the copied `check-extensions` scanned only `extensions/*/index.ts`,
  so in an installed repo (extensions live in `.pi/extensions/`) it checked nothing and printed
  a false "clean". Fixed to scan both layouts with nullglob + a "nothing to check" branch;
  re-verified by planting an apostrophe in `.pi/extensions/opsx-reminder/index.ts` → exit 1
  naming that path.

<!-- Appended per task, newest last. -->
