# Tasks — add-algorithm-grafts

> Built + verified directly this session; evidence in review-log.md. All four are
> prompt/template/schema/doc changes (no new executable code).

## 1. Refutation format

- [x] 1.1 Add the `conjectured/refuted_by/learned/criterion_now` block to `learnings/_TEMPLATE.md`
      + README; backfill LRN-0001/0002/0003; require it in `/opsx-retro`.
      probe: `grep -l Refutation learnings/_TEMPLATE.md learnings/LRN-*.md` covers all; retro mentions the four fields.

## 2. Reproduce-first gate

- [x] 2.1 Wire the bug-fix reproduce-first rule into AGENTS.md, the reviewer prompt, and the
      schema `tasks` instruction (BLOCK a fix with no red->green repro).
      probe: `grep -il 'reproduc' templates/AGENTS.md prompts/opsx-review.md openspec/schemas/dev-reviewer/schema.yaml` = 3.

## 3. Commitment-boundary advisor

- [x] 3.1 Add `prompts/opsx-advise.md` (approach-stage, advises-not-gates) and install it globally.
      probe: `test -f prompts/opsx-advise.md` and `grep -q opsx-advise install.sh`.

## 4. Meta-loop

- [x] 4.1 `/opsx-retro` writes a per-change reflection to `memory/reflections.jsonl`;
      `/opsx-compost` mines reflections + tool-events + trust + goals and proposes
      process/doctrine changes, propose-only.
      probe: `grep -q reflections.jsonl prompts/opsx-retro.md` and `grep -q 'process/doctrine' prompts/opsx-compost.md`.

## 5. Docs + guard

- [x] 5.1 README + index.html document all four; schema still valid; no load-breakers.
      probe: `grep -q Refutation README.md` + `grep -q opsx-advise index.html`; `openspec schema validate dev-reviewer` valid; `just check-extensions` clean.
