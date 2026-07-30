# Design—add-orchestrator-bookkeeping

## Context

`force-delegate` models permission as one bit: the main agent may not mutate. That was the right
guard against an orchestrator that implements its own tasks, but it conflates two different things.

- **Authored mutation**—code, specs, design artifacts. Judgement lives here. Delegating it is the
  entire point of the harness.
- **Bookkeeping mutation**—appending a verbatim verdict, moving a change folder into `archive/`,
  ticking a checkbox. No authored content; the orchestrator already holds everything needed.

Because both fall under the one bit, closing a change costs a subagent per clerical act. Two measured
facts frame the work.

First, `openspec` 1.4.1 already does archive and spec promotion natively. Running
`openspec archive <change> -y` against this repo's own changes produced correct results on the
`## ADDED` path: `+6, ~0, -0` across three capabilities, 108 insertions and 6 deletions, every
existing requirement preserved. It handled the custom `dev-reviewer` schema, warned on incomplete
tasks, and moved the `review-log.md` and other non-default artifacts with the folder. The 119-line
`openspec-archive-change` skill and the 147-line `openspec-sync-specs` skill re-implement that in
prose, and the archive skill spawns a further subagent for the sync.

Second, the reason the prose sync cannot simply be deleted: the CLI treats `## MODIFIED` as a
wholesale replacement. A delta restating one new scenario for a requirement whose main spec held two
others reduced that requirement to the single new scenario and dropped its descriptive body—verified
by scenario count falling from seven to six in the affected capability. That is real data loss, but it
is a narrow shape, and it is detectable by comparing scenario-name sets. Across every change in this
repo including the archive, delta sections run 28 `## ADDED` to 1 `## MODIFIED`, and that one
MODIFIED was a full restatement the CLI handled correctly. So the correct posture is deterministic by
default with a fail-closed guard on the corrupting shape—not agent-driven for everything on the
chance a delta is partial.

The ledger write has a further constraint: `agents/reviewer.md` grants `tools: read,find,ls,grep`—no
write, no bash. The reviewer cannot record its own verdict, and giving it a write tool would break the
de-bias property that keeps it from touching what it reviews. So the recorder has to be
orchestrator-side.

## Goals / Non-Goals

**Goals:**

- Close a change in one command, with no subagent spawned for any clerical step.
- Record verdicts verbatim by construction, not by trusting an agent to retype them faithfully.
- Keep the delegation guarantee for authored mutation exactly as strong as it is today.
- Make the one destructive promotion shape fail loudly instead of silently.

**Non-Goals:**

- Relaxing `force-delegate` for the main agent in any general way. `write`, `edit`, and arbitrary bash
  stay blocked.
- Deleting the agent-driven sync skill. It becomes the gated fallback for partial MODIFIED.
- Giving the `reviewer` or `spec-reviewer` a write tool.
- Changing `openspec` itself, its CLI, or the `dev-reviewer` artifact set.
- Making the orchestrator implement tasks. Nothing here touches the developer/reviewer protocol
  beyond who writes the ledger.

## Decisions

- **D1—Admit named recipes, not a permission class.** The guard gains a `MAIN_BASH_WRITERS` map
  admitting `just archive-change` and `just record-verdict` by pinned first argument. This copies the
  shape `architect-scope` already uses in `SCOPED_BASH_WRITERS`—base command to allowed first
  argument, output-destination flags blocked, chained segments checked independently, env-assignment
  prefixes rejected. *Rationale:* that shape is already unit-tested against adversarial bypasses in
  this repo (env injection via `GIT_PAGER`, background `&`, `find -exec`), so reusing it inherits the
  proof rather than restating it. *Alternative rejected:* a `bookkeeping: true` flag or a
  path-prefix-based write allowance, both of which admit a category and would let any future
  mutation targeting that path through.

- **D2—Read the verdict from the session transcript, never from argv.** `record-verdict` extracts the
  reviewer's text from the parent session `JSONL`: the `role: "toolResult"` entry with
  `toolName: "subagent"`, text at `message.content[]`. *Rationale:* three things at once. It removes
  the fragility of passing multi-line verdict text through a bash argument the guard inspects for
  redirection characters; it makes the ledger verbatim by construction rather than by diligence, which
  matters because `just archive-check` attests the ledger by sha256; and the reader shape is already
  proven—`tools/session-cost.ts` reads exactly these records, and ADR-0003 documents the
  `@mjakl/pi-subagent` persistence contract they rely on. *Alternative rejected:* passing the verdict
  as a quoted argument, which breaks the moment a verdict quotes a diff containing a redirection
  character.

- **D3—Fold the check, do not replace it.** `archive-change` chains the existing `just archive-check`
  rather than reimplementing its ledger and attestation logic. *Rationale:* that recipe already
  encodes the gate `openspec` does not provide, and duplicating it would create two gates that drift.
  *Alternative rejected:* a single new TypeScript entrypoint owning the whole close-out, which would
  orphan a working, tested gate.

- **D4—Detect scenario loss by name-set comparison.** The promotion guard parses each `## MODIFIED`
  requirement in the delta and the same requirement in the main spec, and refuses when the main spec's
  scenario names are not a subset of the delta's, or when the delta omits a descriptive body the main
  spec has. *Rationale:* it is a structural check with no judgement in it, which is what makes it
  suitable for a deterministic gate; scenario headings are already constrained to
  `#### Scenario: <name>` by the schema. *Alternative rejected:* diffing rendered output post-hoc and
  reverting, which mutates then repairs and leaves a window where the tree is wrong.

- **D5—Keep the prose skills as the gated fallback.** The two skills stay in `.pi/skills/` and
  `.cursor/skills/`, invoked only when the guard refuses. *Rationale:* the intelligent-merge
  capability is genuinely the only thing that handles a partial MODIFIED correctly. *Alternative
  rejected:* deleting them and requiring deltas to always restate fully, which pushes a real cost onto
  every future change author to save a rare branch.

- **D6—Ship this change with additive deltas only.** All three capabilities are new; nothing here
  promotes a `## MODIFIED`. *Rationale:* the change that fixes the destructive-promotion defect must
  not be archived through the defect. It also means this change can be archived with the deterministic
  path the moment that path exists.

## Risks / Trade-offs

- **[The justfile becomes security-relevant.]** Admitting `just` means anyone editing the two recipes
  widens what the orchestrator can do without touching the guard. → Both recipes stay thin wrappers
  over `bun tools/*.ts` plus `archive-check`, `openspec`, and the lint fixer, and
  `just check-extensions` gains an assertion that fails when either grows its own mutation surface.

- **[The guard edit can silently disable the guard.]** pi 0.79.9 fails the whole extension file on a
  regex literal, a raw backtick, or a lone apostrophe, and disables it silently—the 2026-07-08
  failure. → The edit is constrained to `new RegExp` and apostrophe-free comments,
  `just check-extensions` covers it, and task 3.4 verifies live that a main-agent write is still
  blocked rather than trusting unit tests, which passed while the real loader was dead.

- **[Transcript shape is third-party.]** `record-verdict` depends on `@mjakl/pi-subagent` persisting
  child results in a documented-by-observation shape. ADR-0003 already records this as a known
  trade-off for `session-cost`. → The recorder validates the shape and fails closed with a named
  reason rather than appending an empty or partial entry, and a fixture transcript pins the shape in
  tests so an upstream change fails a test rather than corrupting a ledger.

- **[The promotion guard could be over-strict.]** A delta that intentionally removes a scenario while
  modifying a requirement looks identical to accidental loss. → That is the correct default for a
  fail-closed gate; the operator routes it through the agent-driven sync, and the refusal message says
  so. `## REMOVED Requirements` remains the explicit channel for intentional removal.

- **[Fewer subagent spawns means less review surface.]** The clerical developer spawn, however
  wasteful, did put a second process in front of the ledger write. → The replacement is strictly
  stronger: a deterministic tool that cannot paraphrase, against a ledger the archive gate already
  attests by hash.

## Migration Plan

The change is additive and each section is independently useful, so it can land incrementally.
Sections 1 and 2 ship tools and recipes that nothing yet calls—no behaviour changes until section 3
admits them to the guard and section 4 points the protocol at them. Ordering therefore matters:
protocol text is updated last, so no window exists where the loop instructs the orchestrator to run a
recipe the guard still blocks.

The existing prose path keeps working throughout. Rollback is reverting the guard map and the protocol
text; the tools can stay in place unused.

## Open Questions

- Does the reviewer verdict need its own marker in the transcript to disambiguate a reviewer result
  from a developer result when both are `toolName: "subagent"`? Task 1.1 settles it—selecting the last
  result is sufficient under the sequential loop, but a `VERDICT:` shape check makes it robust if the
  loop ever runs the two concurrently.
- Should `archive-change` also run `/opsx-retro` before archiving, or stay a pure mechanical gate?
  Deferred: the retro involves judgement and belongs in the protocol, not the recipe.
