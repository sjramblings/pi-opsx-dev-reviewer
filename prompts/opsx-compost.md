---
description: Weekly cross-change compost — turn the week's failures into at most three proposed laws.
argument-hint: ""
---

# Compost — the week's failures become back-pressure

`/opsx-retro` ratchets findings within a single change. This ratchets across the week, so
recurring failure classes that no single retro would catch become laws.

Read this week's exhaust:

- `FAILED:` / `BLOCK` lines across `openspec/changes/*/review-log.md` and the archive.
- `fail`-heavy skills in `memory/trust.tsv` (run `just trust`) — anything sliding toward `watch`.
- `FAIL` rows in `memory/goal-ledger.tsv` — standing goals that regressed.
- Recurring **blocked actions** and retry loops (run `just tool-events`) — process friction.
- **Reflections** in `memory/reflections.jsonl` — the `smarter_next` field is the meta-signal.
- Pull requests closed unmerged.

Extract **at most 3** proposals, each tied to quoted incidents:

1. A new **CLAUDE.md / AGENTS.md** law (global, unscoped invariant), OR
2. A scoped **`learnings/`** entry (a rule for specific paths — draft, with provenance, and a
   `Refutation` block: conjectured → refuted_by → learned → criterion_now), OR
3. A new **standing goal** in `goals/` you lacked (an invariant nothing was guarding), OR
4. A **process/doctrine** change (the meta-loop) — an edit to a prompt template, the
   `dev-reviewer` schema, or a recipe — when the friction is in the harness's OWN workflow
   (e.g. reflections repeatedly name the same missing step).

Rules: **propose only** — a human signs off before ANYTHING is applied; the meta-loop never
edits its own doctrine unattended. Ground every proposal in the empirical signal above, not in
taste. Fewer, higher-quality proposals beat many. A clean week: say so and write nothing. Do
not route a scoped rule into AGENTS.md (one fact, one home — see `learnings/README.md`).
