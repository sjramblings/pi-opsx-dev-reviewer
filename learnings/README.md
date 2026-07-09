# learnings/ — the scoped learning store

This is the harness's **scoped** memory: durable, glob-targeted rules distilled from real
review and research findings, handed to the developer at BRIEF time only when the files
they touch fall in scope. It is the tier `AGENTS.md` cannot be.

## One fact, one writable home (routing rule)

The harness has three learning surfaces. To avoid dual-write drift, each owns exactly one
kind of fact:

| Surface | Owns | Write trigger |
|---------|------|---------------|
| `review-log.md` (per change) | Append-only **ledger** of every reviewer verdict. Provenance source. **Never** a learning store. | developer, per task |
| `AGENTS.md` (repo root) | **Global, always-on, unscoped** invariants only (cap ~60 lines). | `/opsx-retro`, human ack |
| `learnings/` (this dir) | The **sole** home for any rule that is **glob-scoped** to particular paths. | `/opsx-retro`, human ack |

If a rule applies everywhere → AGENTS.md. If it applies to specific files → here. Never both.

## Lifecycle

- **draft → active**: a distilled learning lands as `status: draft`. It is promoted to
  `active` only on **human ack during `/opsx-retro`** (or when the same pattern is cited by
  N distinct review-log entries). A draft is never injected into a BRIEF.
- **active → retired**: a learning that stops firing (see `just learnings-audit`) or is
  superseded is retired. `learnings/` is a **mutable** store — it is deliberately **not**
  under the ratchet's one-way invariant (that invariant stays with AGENTS.md + lint rules).
- **provenance is an immutable pointer**: `source.change` + `source.commit` (a SHA), never
  a line number — review-log grows and rotates, so line-based provenance goes stale silently.

## Retrieval

`just learnings-preview` runs `git diff --name-only` through `tools/select-learnings.ts`,
which prints only the `active` learnings whose `scope` glob matches a changed file, capped
and stably ordered (severity desc, recency desc, id). `/opsx-loop` calls it at BRIEF so the
developer gets exactly the relevant back-pressure. `just check-learnings` is the canary that
fails loud if retrieval silently returns nothing when it must return something.

See `_TEMPLATE.md` for the entry schema.
