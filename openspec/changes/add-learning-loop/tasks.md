# Tasks — add-learning-loop

> Slice 1 (built + verified directly this session, outside the pi delegation flow) is
> ticked. The deferred tasks are the tracked backlog for the pi extension surface.

## 1. Scoped learnings store

- [x] 1.1 Create `learnings/` with `_TEMPLATE.md` (versioned typed frontmatter), `README.md`
      (one-fact/one-home routing rule + lifecycle), and one seeded active learning.
      probe: `ls learnings/_TEMPLATE.md learnings/README.md learnings/LRN-0001-*.md` all exist; `grep -q schema_version learnings/_TEMPLATE.md`.
- [x] 1.2 No parallel store: confirm no `knowledge/` directory is introduced.
      probe: `test ! -d knowledge` exits 0.

## 2. Retrieval engine

- [x] 2.1 Add `tools/select-learnings.ts` — glob match, status filter, bounded stable order, trace.
      probe: `printf 'extensions/foo/index.ts\n' | bun tools/select-learnings.ts` prints LRN-0001; a non-matching path prints the no-relevant message.
- [x] 2.2 Add `tools/select-learnings.test.ts` covering match, status filter, no-false-positive, cold-start, rename, cap, ordering, frontmatter.
      probe: `bun test tools/select-learnings.test.ts` → 9 pass / 0 fail.
- [x] 2.3 Add `tools/audit-learnings.ts` — required fields + active-provenance resolution.
      probe: `bun tools/audit-learnings.ts` exits 0 on the real store and reports N valid.

## 3. Recipes

- [x] 3.1 `just learnings-preview` feeds `git diff --name-only` into the selector.
      probe: `just learnings-preview HEAD~1` runs and exits 0.
- [x] 3.2 `just check-learnings` canary passes on a hermetic match/non-match fixture.
      probe: `just check-learnings` exits 0 and prints "retrieval path live".
- [x] 3.3 `just learnings-audit` gate passes on the seeded store.
      probe: `just learnings-audit` exits 0.

## 4. Wiring

- [x] 4.1 `/opsx-retro` routes scoped rules to `learnings/` (draft + provenance), keeps
      AGENTS.md for global invariants, and calls the audit + canary before archive.
      probe: `grep -q 'learnings/' prompts/opsx-retro.md` and `grep -q 'draft' prompts/opsx-retro.md`.
- [x] 4.2 `/opsx-loop` BRIEF step runs `just learnings-preview`.
      probe: `grep -q 'learnings-preview' prompts/opsx-loop.md`.

## 5. Guards

- [x] 5.1 pi load-breaker guard stays clean after all edits.
      probe: `just check-extensions` exits 0 (no extensions changed; guard clean).

## 6. Deferred — pi extension surface (backlog, not in slice 1)

- [ ] 6.1 Add a `learnings-inject` pi extension that surfaces relevant learnings at
      session_start by shelling to `select-learnings.ts` (tokenizer-safe: new RegExp, no
      backticks, no apostrophes).
      probe: `just check-extensions` clean AND a live pi session_start shows the injected block.
- [ ] 6.2 Add a `regression-guard` that BLOCKs when the reviewer re-detects an active
      bug-class learning whose scope matches (empirical runnable-probe rule).
      probe: a synthetic re-detection of LRN-0001 in scope yields a BLOCK verdict.
- [ ] 6.3 Add `just prune-learnings` to propose retiring learnings not matched in N reviews.
      probe: `just prune-learnings` lists stale candidates and exits 0.
- [ ] 6.4 Live-pi-load verification of any new extension (bun/tests miss the load failure).
      probe: extension observed active inside a real pi session, not just `check-extensions`.
