# Design — fix-spec-template-lint

## Context

`.markdownlint-cli2.jsonc` carries a deliberate comment: "Docs structural rules for the kit.
Errors here are the non-negotiable floor; everything not listed keeps its markdownlint default."
Nine rules are named. The measured reality against the repo:

| Rule | Count | In the chosen floor? |
| --- | --- | --- |
| `MD022` blanks-around-headings | 158 | No — default |
| `MD032` blanks-around-lists | 98 | No — default |
| `MD041` first-line-heading | 24 | Yes |
| `MD031` blanks-around-fences | 8 | No — default |
| `MD040` fenced-code-language | 7 | Yes |
| `MD060` table-column-style | 6 | No — default |
| `MD007` ul-indent | 4 | No — default |
| `MD012` no-multiple-blanks | 1 | No — default |

By area: `openspec/` 230, `agents/` 54, remainder 22.

Two facts drive the design. `MD041` was chosen and is violated by the kit's own template, so the
template must change regardless of any other decision. `MD022` and `MD032` were never chosen and
account for 84% of the backlog, so the size of this change is set by a rule nobody picked.

The gate is absent from `.github/workflows/`, and `docs-lint` reports `PARTIAL` rather than
failing when a tool is missing — correct locally, wrong in CI.

## Goals / Non-Goals

**Goals:**

- Make every rule that governs this repo a decision, not an inheritance.
- Make the kit's templates emit output that passes the kit's own gate.
- Put the gate in CI so it cannot rot silently again.
- Clear the backlog once the floor is settled.

**Non-Goals:**

- Changing what `tech-writer` writes, or the Diátaxis structure it follows.
- Vale, lychee, or cspell rule changes. This change is about markdownlint and the gate's wiring.
- Prose rewriting. Blank lines and headings only — no content edits.
- Disabling a rule in order to make a red gate green.

## Decisions

**Decide every firing rule explicitly, then fix what survives.** The instinct is to argue
adopt-all versus disable-the-defaults. Both are wrong framings, because both accept that the
floor should be settled by an argument rather than by a decision recorded in the config. The
change audits each of the eight firing rules and writes an explicit true or false with a reason.
The floor becomes readable.

**Recommended disposition, to be red-teamed before task 1 starts.** `MD022`, `MD032`, and `MD031`
set true: blank lines around headings, lists, and fences are ordinary markdown hygiene, they cost
nothing once the templates emit them, and they are free forever afterwards. `MD041` stays true and
the templates change to satisfy it. `MD007`, `MD012`, and `MD060` set true — 11 errors total,
not worth a carve-out. If any rule is set false, the config records why, so a future reader sees a
decision rather than a gap.

**Fix the generator, not just the output.** Clearing 306 errors while the template still emits
`## ADDED Requirements` as line one means the next generated delta re-opens the hole. The template
fix is the load-bearing task; the backlog is downstream of it.

**`PARTIAL` fails in CI, degrades locally.** A missing tool on a laptop should not block work, so
the local three-state behaviour stays. In CI the tools are installed by the workflow, so a skip
means the gate broke — and a gate that skips itself into a pass is the exact failure this change
exists to close. The recipe keeps its exit code; the workflow asserts `clean`.

**A template regression guard.** After this change, a shipped template that emits output its own
gate rejects is a build failure, not a discovery two months later. This is the same move as `just
check-extensions` — the guard exists because the failure already happened once.

## Risks / Trade-offs

- **The blank-line pass is broad and mechanical.** 256 edits across generated artifacts, and a
  careless transform can corrupt a list continuation or a fenced block. Mitigation: the transform
  runs per-area with `openspec validate --strict` re-run after the `openspec/` pass, and the diff
  is blank-line-only — any content change in the diff is a defect.
- **Adopting `MD022`/`MD032` ratifies a floor nobody chose.** Mitigation: that is precisely what
  the explicit-decision task makes visible; the reviewer may set them false with a reason, and the
  change stays coherent either way.
- **Concurrent-writer collision.** `add-architecture-writer` is in flight against `justfile.opsx`,
  `README.md`, and the schema `templates/` directory. Mitigation: this change applies after that
  one lands. Starting both against one tree risks the repository-revert class of failure.
- **CI cost and flakiness.** lychee hits the network and will fail on a rate-limited or transient
  404, turning an unrelated PR red. Mitigation: lychee runs with the existing `.lycheeignore` and
  its cache; if it proves flaky, it moves to a scheduled run rather than per-push, and that
  decision is recorded rather than silently applied.
- **A green gate is not good documentation.** Every rule here is structural. None of them detects
  a stale claim, and the entry-doc currency rule in `AGENTS.md` remains a reviewer judgement.
