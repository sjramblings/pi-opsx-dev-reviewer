# goals/ — standing goals, re-verified forever

A goal you only verify once is an assumption with a timestamp. When a change finishes, it
graduates into a **standing goal**: a file here whose `predicate:` is a shell command that
must keep exiting 0. `just goals` (and a daily runner) re-checks every predicate, flips
`satisfied` <-> `VIOLATED` in the file, and appends a row to `memory/goal-ledger.tsv`. The
first time it catches a silent regression on something you were sure was done, it earns its
keep.

This generalises the `check-learnings` canary from "is retrieval live" to "is every finished
thing still true".

## Predicate rules

- A command; **exit 0 = the invariant holds**. Cheap, deterministic, read-only.
- Adjectives are banned: if a shell script cannot check it, the checker cannot either.
- Non-code predicates work identically, e.g. `test -s reports/$(date +%Y-%m)-review.md`.

## Lifecycle

- **satisfied** — last run passed.
- **VIOLATED** — last run failed; the sentinel reports suspects, the fix goes through the
  normal pipeline (detection here, repair via `/opsx-loop`). Goals are **not** auto-fixed.
- **retired** — the goal no longer applies (module deleted). Retirement is a human decision,
  logged. A flaky predicate is retired ("needs a better predicate"), never deleted.

See `_TEMPLATE.md` for the file shape.
