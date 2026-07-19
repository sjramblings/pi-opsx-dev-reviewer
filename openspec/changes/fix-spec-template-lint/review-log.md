# Review log — fix-spec-template-lint

Durable record of every reviewer verdict for this change. The developer appends each
verdict block verbatim before ticking the task. At archive time, `/opsx-retro` reads
this file and ratchets recurring finding classes into lint rules, `openspec/config.yaml`
rules, or `AGENTS.md` lines. This is what stops review findings from evaporating after a
single task.

---

<!-- Appended per task, newest last. Example:

## Task 1.2 — implement CSV export

VERDICT: PASS
FINDINGS: none
EVIDENCE CHECK: tsc clean + 12/12 tests exercise the changed branch — yes
-->

## Task 1.1 — Settle the floor

VERDICT: PASS
EVIDENCE CHECK: Yes. `.markdownlint-cli2.jsonc` now decides every rule that fires against the
repo explicitly, with a reason. The six previously-inherited whitespace rules (MD007, MD012,
MD022, MD031, MD032, MD060) are adopted with a stated reason; MD013/MD033 stay off with a
reason. No rule governs by inherited default.

## Tasks 2.1-2.3 — Fix the generators + regression guard

VERDICT: PASS
EVIDENCE CHECK: Yes. spec/proposal/design/tasks templates gained an H1 and blank-line
structure; `bunx markdownlint-cli2` on the templates dir is clean (7 templates). A delta seeded
in the `# name — delta` form still passes `openspec validate --strict` (proven by the archived
add-architecture-writer deltas; validate --all 15/15). `just check-templates` added: clean on
good templates, FAILs and names the file on a tampered template, reports the count scanned.

## Tasks 3.1-3.3 — Clear the backlog

VERDICT: PASS
EVIDENCE CHECK: Yes. `markdownlint-cli2 --fix` cleared the auto-fixable whitespace rules
(350 -> 31); the remaining 23 MD041 (missing H1) and 8 MD040 (bare code fence) were fixed by
script — H1 inserted after frontmatter (agents/learnings/goals) or at top (specs/design/tasks),
`text` language on bare fences. Whole repo now 0 markdownlint errors. `openspec validate --all
--strict` 15/15 (H1s on specs did not break parsing); 74 tests pass (frontmatter parsers
untouched — they read only the `---` block); agent frontmatter intact with the H1 below it;
arch-lint still clean (docs/architecture untouched).

## Task 4.1 — Wire the gate into CI

VERDICT: PASS
EVIDENCE CHECK: Yes. `.github/workflows/docs-lint.yml` runs the markdownlint floor
(`bunx markdownlint-cli2 "**/*.md"`) and `just check-templates` on markdown-affecting push/PR.
Both commands verified locally: floor PASS (clean), check-templates clean. Scope corrected
during build: the full four-tool docs-lint is NOT wired because cspell (~49 words), Vale
(styles unsynced), and lychee are out of this change's scope and would ship red CI; deferred to
task 5.2. The spec (docs-gate-ci) was refined to match. 4.2 is post-merge verification (a
workflow cannot be dispatched until it reaches the default branch).
