# Deterministic bookkeeping for the orchestrator

## Why

Closing a change costs more process than doing the work. The orchestrator is read-only under
`force-delegate`, so every clerical mutation—appending a reviewer verdict, archiving a change—needs
a full `developer` subagent. On a 16-task change that is ~16 extra pi processes whose only job is to
paste text the orchestrator already holds. Archive is worse: the prose archive skill re-implements
`openspec archive` by hand and spawns a *third* subagent for spec sync, when the CLI does both
natively. Measured on this repo, `openspec archive -y` promotes deltas correctly for 28 of 29 delta
sections. The one shape it gets wrong—a partial `## MODIFIED`—it destroys silently, so the
agent-driven path cannot simply be deleted; it has to be gated.

## What Changes

- `force-delegate` gains a **bounded bookkeeping channel** for the main agent: a `MAIN_BASH_WRITERS`
  map admitting exactly two `just` recipes by pinned first argument, mirroring the shape
  `architect-scope` already uses for `SCOPED_BASH_WRITERS`. `write` and `edit` stay hard-blocked and
  arbitrary bash stays blocked, so the delegation guarantee for *authored* mutation is unchanged.
- A new `tools/record-verdict.ts` appends the reviewer's verdict to `review-log.md` **verbatim, read
  from the parent session transcript**, rather than having an agent retype it. Append-only and
  idempotent on `toolCallId`.
- A new `just archive-change <change>` recipe replaces the prose archive ceremony: it chains the
  existing `just archive-check`, a new promotion guard, `openspec archive -y`, and a lint
  normalisation pass over the promoted specs.
- A new `tools/promote-guard.ts` **fails closed** on the one promotion shape the CLI corrupts—a
  `## MODIFIED` requirement whose body omits scenarios the main spec still has. Only that case is
  routed to the agent-driven sync; the other 28 go deterministic.
- The apply protocol stops delegating the ledger write. `prompts/opsx-loop.md`,
  `openspec/schemas/dev-reviewer/schema.yaml` (`apply.instruction` step 3) and `templates/AGENTS.md`
  are updated so the orchestrator records the verdict itself through the recipe.
- `just check-extensions` is extended to assert the two admitted recipes stay thin wrappers, because
  allowlisting `just` makes `justfile.opsx` security-relevant.

## Capabilities

### New Capabilities

- `orchestrator-bookkeeping`: the main agent may perform deterministic bookkeeping through a bounded
  recipe allowlist, while authored mutation stays delegated
- `verdict-ledger-fidelity`: reviewer verdicts reach the ledger verbatim, append-only, and idempotent
- `spec-promotion-safety`: delta promotion is deterministic by default and refuses the shapes the
  `openspec` CLI would silently corrupt

## Impact

New `tools/record-verdict.ts` and `tools/promote-guard.ts` with unit tests and a fixture session
transcript; two new recipes plus a `check-extensions` assertion in `justfile.opsx`; a
`MAIN_BASH_WRITERS` map in `extensions/force-delegate/index.ts` with adversarial tests. Protocol text
changes in `prompts/opsx-loop.md`, `openspec/schemas/dev-reviewer/schema.yaml`, and
`templates/AGENTS.md`. The two prose skills (`openspec-archive-change`, `openspec-sync-specs`) are
demoted to the gated fallback path, not deleted.

No new runtime dependency—`record-verdict` reuses the session-transcript reader shape already proven
in `tools/session-cost.ts`, and `markdownlint-cli2` is already a dev gate. The three capabilities are
deliberately **all additive**: this change promotes no partial `## MODIFIED` delta, so it cannot trip
the very defect it fixes.
