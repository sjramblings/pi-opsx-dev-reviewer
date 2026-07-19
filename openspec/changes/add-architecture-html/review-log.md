# Review log — add-architecture-html

Durable record of every reviewer verdict for this change. The developer appends each
verdict block verbatim before ticking the task. At archive time, `/opsx-retro` reads
this file and ratchets recurring finding classes into lint rules, `openspec/config.yaml`
rules, or `AGENTS.md` lines. This is what stops review findings from evaporating after a
single task.

---

<!-- Appended per task, newest last. -->

## Tasks 1.1-1.2 — Shared theme extracted and consumed by evolution

VERDICT: PASS
EVIDENCE CHECK: Yes. `tools/lib/theme.css` holds the token block (both light and dark
palettes, 2 data-theme blocks). `evolution-timeline.template.html` now carries a `__THEME__`
placeholder; `tools/lib/theme.ts` inlines it. `bun tools/evolution-timeline.ts` renders,
self-contained (0 external refs), tokens present in output. Evolution tests 9/9 after updating
their render stubs to include `__THEME__`.

## Task 2.1 — Zero-dependency markdown renderer

VERDICT: PASS
EVIDENCE CHECK: Yes. `tools/architecture-html.ts` renders headings, ul + ol lists (with
wrapped-continuation joining), pipe tables, inline code, links, bold, italic — via a
backtick-split approach with no sentinel leak. 17 unit tests pass including escaping,
code-span literalness, javascript-href neutralisation, and the real-tree buildModel. No new
dependency (verified: package.json unchanged; bun-only). Two rendering bugs (ordered lists,
wrapped continuations) were caught by the dogfood visual check and fixed with tests.

## Tasks 3.1-3.2 — Template and render

VERDICT: PASS
EVIDENCE CHECK: Yes. `architecture.template.html` inlines the shared theme via `__THEME__`,
has one `__MODEL__` point, references no external host. `bun tools/architecture-html.ts`
writes a 37KB self-contained `docs/architecture/index.html`; two runs are byte-identical
(deterministic — required by the freshness gate). Headless-Chrome screenshot confirms all
twelve sections, provenance line, four stat tiles, sticky nav, styled tables with monospace
file:line pills, and the HLD/LLD crosswalk render professionally.

## Task 4.1 — HTML freshness gate

VERDICT: PASS
EVIDENCE CHECK: Yes — verified by running each case. Fresh HTML: `html freshness: ok`. Tampered
HTML: `FAIL — stale`. Missing HTML: `FAIL — missing render`. Two clean runs stable. The check
re-renders in memory and compares; three-state contract preserved.

## Task 4.2 — Recipe and agent step

VERDICT: PASS
EVIDENCE CHECK: Yes. `just architecture-html` renders; `agents/architecture-writer.md` method
step 8 names the render after the markdown and step 9 notes the freshness gate; `just arch-lint`
output includes the `html freshness` check.

## Task 5.1 — Ship and dogfood

VERDICT: PASS
EVIDENCE CHECK: Yes. `install.sh --here /tmp/inst` copies `architecture-html.ts`,
`architecture.template.html`, and `tools/lib/{theme.ts,theme.css}`. `just arch-lint` reports
`clean (all checks ran)` including freshness. The rendered page opens offline (headless Chrome,
0 external refs) and matches the markdown. Full suite: 74 tests 0 fail, openspec 14/14,
check-extensions clean, tsc clean.
