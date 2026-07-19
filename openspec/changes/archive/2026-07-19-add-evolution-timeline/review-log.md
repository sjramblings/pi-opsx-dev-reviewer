# Review log — add-evolution-timeline

Durable record of every reviewer verdict for this change. The developer appends each
verdict block verbatim before ticking the task. At archive time, `/opsx-retro` reads
this file and ratchets recurring finding classes into lint rules, `openspec/config.yaml`
rules, or `AGENTS.md` lines. This is what stops review findings from evaporating after a
single task.

---

<!-- Appended per task, newest last. -->

## Change — add-evolution-timeline (executor self-verification)

> Provenance note: this change was hand-built and verified by the executor, not run
> through the delegated developer/reviewer apply loop. The verdict below records the
> evidence actually gathered; it is a single-party self-review, weaker than the two-party
> developer/reviewer split the schema prescribes. Recorded so the archive is honest about
> how it was verified, not to imply an independent reviewer pass occurred.

## Tasks 1.1–4.2 — extractor, tests, template, recipe, narrator

VERDICT: PASS
FINDINGS: none blocking.
EVIDENCE CHECK:

- `bun test tools/` → 40 pass / 0 fail (9 new tests exercise parseDelta op-detection,
  parseTasks ledger counting, computeThesis accretion-vs-reshaping branches and the
  non-empty invariant, and render's injection-point + script-terminator guards).
- `just evolution-timeline` regenerates `architecture-evolution.html`; run summary
  (10 changes / 13 capabilities / 47 requirements / 98 scenarios / 53-73 tasks / 1
  archived) cross-checked against `git log` + `ls openspec/changes` as real repo state.
- Portability: ran against `~/GitHub/projects/cdk-knowledge` (a different OpenSpec repo)
  → correct distinct output (2 changes / 25 requirements / 36-36 tasks), proving the tool
  is not coupled to this repo.
- Narration seam: a supplied `--thesis` file overrides only the hero; an invalid thesis
  falls back to the computed one without failing.
- Browser (Interceptor, real Chrome): data-driven hero renders, chart canvas non-degenerate
  (31.3% ink at DPR-2), drawer opens with 4 requirements / 8 scenarios matching the
  extraction.
- DEFERRED: pixel screenshot — `interceptor screenshot` wedged on backgrounded Chrome;
  layout/CSS unchanged from the previously browser-verified one-off, only hero text differs.

## Verification pass 2026-07-19 (independent re-verify before archive)

## Tasks 1.1-1.2 — Extractor and model

VERDICT: PASS
EVIDENCE CHECK: Yes. `tools/evolution-timeline.ts` exports the pure functions (parseDelta,
parseTasks, computeThesis) with no git/fs inside them, plus `collectChange`/`buildModel` that
read openspec/changes + archive + specs. Uncommitted-dating verified in source: `date = tracked
?? statSync(dir).mtime` and `committed: tracked !== null` (index.ts:153,161) — an untracked
change is dated by mtime and marked committed:false, no invented history. Live run derives a
faithful model: 12 changes, 16 capabilities, 61 requirements, 124 scenarios, 3 archived.

## Task 2.1 — Tests

VERDICT: PASS
EVIDENCE CHECK: Yes. `bun test tools/evolution-timeline.test.ts` → 9/9 pass, covering
ADDED/MODIFIED/REMOVED op detection, mixed checkbox done/total, the all-added accretion thesis,
and computeThesis never emitting an empty headline or subhead. tsc clean.

## Tasks 3.1-3.2 — Template and render

VERDICT: PASS
EVIDENCE CHECK: Yes. The page renders self-contained (0 external references) and now inlines the
shared theme (via the __THEME__ point landed by add-architecture-html). Headless-Chrome
screenshot confirms the computed hero thesis, stat row, cumulative-requirements chart with
declared/archived/uncommitted bands, filter chips, and the date-grouped change spine with
per-change cards. The __MODEL__ injection has the fail-loud script-terminator guard.

## Tasks 4.1-4.2 — Recipe and narrator

VERDICT: PASS
EVIDENCE CHECK: Yes. `just evolution-timeline` runs the deterministic tool against a repo arg
(default `.`) and writes architecture-evolution.html. `agents/evolution-narrator.md` follows the
agent skeleton, scope-clamped to writing thesis.json only, never the tool/template/counts —
narration is optional and the page renders from data alone without it (verified: no --thesis
needed).
