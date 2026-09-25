# Design—add-session-cost

## Context

The first implementation assumed that `@mjakl/pi-subagent` persisted only plain-text tool output
because child processes run with `--no-session`. That assumption is false for the current installed
extension. Real parent-session `JSONL` contains `message.role: "toolResult"`,
`message.toolName: "subagent"`, and `message.details.results[]`; each child result carries `model`
and aggregate `usage` with token counters and a scalar dollar `cost`. The parent already owns a
durable aggregate without retaining child sessions.

The current rollup reads only main-agent `message.usage.cost` and a legacy top-level
`subagentCost` shape. It reports a legacy annotation but does not add it to `grand`, and its HTML
renderer inserts the session name and model keys without escaping them.

### Constraint classification

- **HARD—parent-session contract:** current `@mjakl/pi-subagent` persists child aggregates on the
  parent `subagent` tool result. The rollup consumes this boundary; it does not require child files.
- **HARD—accounting invariant:** every accepted cost contributes to the displayed grand total
  exactly once; rejected or uncertain cost is disclosed rather than fabricated.
- **HARD—Pi message contract:** main-agent provider usage belongs to persisted assistant messages;
  tool-result details are a separate source and must not also be accepted as main-agent usage.
- **HARD—untrusted input boundary:** `JSONL` contents and the filename are arbitrary strings. HTML
  output treats every dynamic string as text.
- **HARD—compatibility:** sessions without native details remain readable, and malformed records
  do not suppress independent valid records.
- **SOFT—legacy annotation:** top-level `subagentCost` was a forward-compatible convention, not a
  shipped writer contract. It remains a lower-confidence fallback.
- **ASSUMPTION REJECTED:** `--no-session` means child usage is absent from the parent. It only means
  the child has no independent durable session.
- **ASSUMPTION—package stability:** `details.results[].usage` is third-party data. Runtime
  validation and explicit coverage diagnostics contain schema drift.

## Goals / Non-Goals

**Goals:**

- Include accepted main and child usage in model rows, subagent subtotal, and grand total.
- Define exact source eligibility, validation, attribution, call identity, and precedence.
- Keep partial totals available while marking any known omission or ambiguity in text and HTML.
- Escape every dynamic HTML value.
- Stay dependency-free and test parent-session-shaped `JSONL` records.

**Non-Goals:**

- Retaining or reading child session files.
- Adding fork-mode persistence or a new writer hook.
- Changing or vendoring `@mjakl/pi-subagent`.
- backfilling historical `JSONL` or changing Pi's built-in exporter.
- Computing cost from tokens when persisted cost is absent.
- reporting only the active branch: this command reports all incurred cost-bearing entries in the
  selected session file, including abandoned branches, because those provider calls were billed.

## Decisions

### 1. Consume persisted parent records through two disjoint, validated sources

**Reversibility: two-way door.**

#### Main-agent source

A main-agent candidate is only a `JSONL` object with `type: "message"` and
`message.role: "assistant"`. No other role can contribute through `message.usage`, even if it
contains a look-alike object.

A candidate is structurally valid when:

- `message.usage` and `message.usage.cost` are objects;
- `cost.total` is a finite, non-negative JSON number;
- every present `cost.input`, `cost.output`, `cost.cacheRead`, and `cost.cacheWrite` is a finite,
  non-negative JSON number; missing components become zero; and
- every present `usage.input` and `usage.output` is a finite, non-negative JSON number; missing
  token counters become zero. Present `usage.cacheRead` and `usage.cacheWrite` are validated by the
  same rule even though they are not displayed.

Numeric strings are never coerced. A malformed main candidate is excluded with `malformed-main`
without suppressing other records. A structurally valid candidate is accepted only if atomically
adding it leaves every impacted model-row, token, main-total, and grand-total accumulator finite.
If any addition would be non-finite, no calls, tokens, or cost fields from that candidate are added
and `aggregate-overflow` is incremented.

A non-empty string model is trimmed and used as its row key. Missing, non-string, or whitespace-only
main models use `main/unknown`; the label defect does not discard otherwise valid cost.

#### Native subagent source and call identity

A native call candidate is only a `JSONL` object with `type: "message"`,
`message.role: "toolResult"`, and `message.toolName: "subagent"`. Assistant `toolCall` request
blocks are never counted, so one invocation is not counted once at request and again at result.

The parser tracks three distinct counts. `rawNativeCandidates` counts every eligible persisted
`subagent` tool-result entry before deduplication. `subagentCalls` counts only candidates selected
for processing after deduplication. `duplicateNativeCalls` counts later candidates rejected for an
already-seen identity. These names are not interchangeable in output or tests.

The persisted session entry `id` is the preferred call identity. A string ID is trimmed before it
is tested or compared. The first candidate with a non-empty trimmed ID is processed; a later
candidate with the same trimmed ID increments `rawNativeCandidates` and `duplicateNativeCalls`,
does not increment `subagentCalls`, and its native details are ignored in full. A missing,
non-string, or whitespace-only ID is ID-less: the `JSONL` line ordinal is its compatibility identity,
the call is processed once, and coverage is incomplete because cross-line deduplication cannot be
proven. Thus `" call-1 "` and `"call-1"` are the same identity, while `"   "` is ID-less. Every
processed candidate, including one with a malformed container, increments `subagentCalls` exactly
once.

A candidate container is malformed when `message.details` is not an object,
`message.details.results` is not an array, or the array is empty. It contributes no native cost and
makes coverage incomplete. In a non-empty results array, every element represents one expected
child run. A non-object child, missing/non-object `usage`, or invalid usage makes only that child
malformed; valid siblings still contribute.

A child usage is structurally valid when scalar `usage.cost` and every present token counter
(`input`, `output`, `cacheRead`, `cacheWrite`) are finite, non-negative JSON numbers. Missing
counters become zero. It is accepted only if atomically adding it to every impacted row, token,
subagent-subtotal, and grand-total accumulator would also leave each accumulator finite. The parser
checks all resulting values before mutation; if any would be non-finite, it changes none of them,
rejects that child with `aggregate-overflow`, and continues. Each accepted child contributes one
call, input/output tokens, and scalar cost to one model row and to the subagent subtotal. Scalar
child cost increments only `cost.total`; component dollar costs are not invented.

A non-empty string child model is trimmed and used as its row key. Missing, non-string, or
whitespace-only child models use `subagent/unknown`. Explicit normalized keys merge across main and
child sources only when their trimmed strings are exactly equal; `main/unknown` and
`subagent/unknown` can never merge.

This boundary works for spawn, fork, single, and parallel calls without a writer hook. A custom
entry was rejected because it duplicates authoritative details and introduces correlation and
ordering failures. Child sessions were rejected because spawn mode intentionally creates none.

### 2. Native subagent details take session-wide precedence over legacy annotations

**Reversibility: two-way door.**

deduplication precedes native child validation and source selection. A rejected duplicate
candidate's native `message.details` is ignored in full: neither its valid nor malformed children
influence source precedence, totals, or child diagnostics. Top-level `subagentCost` is a separate
line-level legacy source, not part of native details; it is collected and validated independently
on every parsed JSON object, including an object whose native candidate is rejected as a duplicate.

The parser processes structurally valid values in stable `JSONL` order and children in array order.
Before any mutation, checked addition computes every impacted accumulator. A value that would make
any row, token, subtotal, or grand-total accumulator non-finite is rejected atomically: none of its
calls, tokens, or cost fields change. Rejected-overflow native children do not activate native
authority. Source selection is therefore based on aggregate-safe accepted values:

1. If at least one native child from a processed candidate is accepted, all accepted native children
   from processed candidates contribute and every valid top-level `subagentCost` annotation is
   ignored.
2. Otherwise, aggregate-safe valid top-level `subagentCost` objects contribute as fallback under
   `subagent/unknown`, including annotations co-located with rejected duplicate native candidates.
3. If neither source has an accepted value, the accepted main total remains available.

Consequently, a valid child found only in a rejected duplicate does not activate native authority.
If the processed candidate has no valid child and a valid legacy annotation exists, legacy fallback
is selected; coverage remains incomplete because the duplicate identity was observed.

A legacy annotation is structurally valid when it is an object whose `total` and every present
component (`input`, `output`, `cacheRead`, `cacheWrite`) are finite, non-negative JSON numbers.
Missing components become zero. The legacy shape carries aggregate dollar-cost components, not
child-run cardinality or token counters. Each accepted annotation therefore contributes its cost
fields under `subagent/unknown`, but contributes zero to that row's `calls`, `tokensIn`, and
`tokensOut`. The row's `calls` field counts only known invocations: one per accepted main assistant
message and one per accepted native child result. It never treats a legacy annotation as a child
call. The `legacy-fallback` reason count separately reports how many annotations were accepted.
Malformed annotations are excluded independently. A structurally valid annotation is accepted only
when checked addition leaves every impacted model-row, subagent-subtotal, and grand-total field
finite; overflow rejects that annotation atomically without changing any accumulator.

Native and legacy values never both enter one total because legacy records have no required child
correlation key. Session-wide precedence prevents double charging. It can undercount an
uncorrelated legacy-only child in a hybrid file, so hybrid output is explicitly incomplete rather
than claiming full spend.

Coverage has one externally visible state, `complete` or `incomplete`, and this closed reason-code
enum in canonical rendering order:

1. `malformed-main`—count of structurally invalid eligible assistant records;
2. `duplicate-native-call`—count of rejected duplicate native candidates;
3. `idless-native-call`—count of processed candidates with missing, non-string, or blank IDs;
4. `malformed-native-container`—count of processed candidates with invalid/empty results containers;
5. `malformed-native-child`—count of invalid child elements in processed candidates;
6. `malformed-legacy-annotation`—count of invalid top-level legacy annotations;
7. `no-usable-subagent-cost`—count of processed calls with zero accepted native children when no
   legacy value is selected for the file;
8. `legacy-fallback`—count of accepted legacy annotations selected because no native child was
   accepted;
9. `ignored-legacy-annotation`—count of structurally valid legacy annotations excluded because
   native usage was selected; and
10. `aggregate-overflow`—count of otherwise structurally valid main, native-child, or legacy values
    rejected because at least one impacted accumulator would become non-finite.

Reason counts aggregate file-wide. A reason appears exactly once when its count is positive, rendered
as `<code>: <count>`, in the canonical order above. Text and HTML use the same reason array and order;
they do not generate independent prose diagnostics. `coverage` is `incomplete` iff the reason array
is non-empty, otherwise `complete`. A file with no processed subagent calls and no rejected cost
records is therefore complete. Neither renderer describes an incomplete accepted total as complete
session spend.

`grand` is the accepted total, not a claim that rejected data cost zero:

`grand = accepted main-agent cost + selected persisted subagent cost`.

`persistedSubagentCost` is the selected subagent-only subset. The total is partial whenever coverage
is incomplete. Diagnostics do not change exit status for an otherwise readable file.

Alternatives rejected:

- **Sum native and legacy:** can double charge the same child.
- **Per-record precedence:** cannot deduplicate a separate unkeyed annotation.
- **Fail on one malformed record:** discards valid independent accounting data.
- **Coerce strings:** conceals producer schema drift.

### 3. Escape every dynamic HTML string at the rendering boundary

**Reversibility: two-way door.**

One HTML-text helper encodes `&`, `<`, `>`, `"`, and `'`. Session name, every model key, coverage
label, and every diagnostic reason pass through it immediately before interpolation. Numeric values
use trusted numeric formatting and fixed markup remains literal.

Selective escaping was rejected because later diagnostics may include producer-controlled values;
a DOM or templating dependency is disproportionate for this fragment.

## Data model and invariants

The internal rollup exposes:

- per-model rows for accepted main and selected subagent records;
- `grand` and `persistedSubagentCost`;
- `rawNativeCandidates`, deduplicated processed `subagentCalls`, and accepted child counts;
- malformed main, native-container, native-child, and legacy counts;
- ignored legacy and `duplicateNativeCalls` counts; and
- coverage state plus reason codes sufficient for both renderers.

Required invariants:

1. `grand.total = acceptedMain.total + persistedSubagentCost.total`.
2. `grand` equals the sum of accepted model-row costs.
3. Native and legacy subagent costs are mutually exclusive.
4. Every accepted main assistant message and native child increments exactly one model row's call
   count once; every accepted legacy annotation increments model-row calls and tokens by zero, while
   `legacy-fallback` counts the accepted annotations.
5. `rawNativeCandidates = subagentCalls + duplicateNativeCalls`; every processed native tool-result
   increments `subagentCalls` once, and assistant requests increment none of these counts.
6. Rejected duplicate contents never affect native-source selection, totals, or child diagnostics.
7. No malformed, infinite, negative, coerced, or aggregate-overflowing value enters a sum.
8. Checked addition is atomic per main record, native child, or legacy annotation: if any impacted
   accumulator would become non-finite, all impacted accumulators and call counts remain unchanged.
9. The coverage reason enum, positive-count aggregation, and canonical order are identical in text
   and HTML.
10. Re-running unchanged `JSONL` is idempotent.

## Error taxonomy and failure modes

- **Unreadable file:** fatal and non-zero.
- **Blank/non-JSON line:** skipped; it cannot safely be classified.
- **Non-eligible look-alike record:** ignored and cannot inflate cost.
- **Malformed eligible main/native/legacy record:** excluded with its canonical reason code; valid
  independent records continue.
- **Duplicate native entry ID:** IDs are trimmed; a later candidate is excluded from native
  validation and source selection, while any line-level legacy annotation remains independently
  eligible.
- **Whitespace-only/non-string/missing native ID:** processed once by line ordinal with
  `idless-native-call`.
- **Absent persisted child cost for processed calls:** accepted main total emitted with
  `no-usable-subagent-cost` when no legacy fallback is selected.
- **Native plus legacy:** native selected; each valid ignored annotation increments
  `ignored-legacy-annotation`.
- **Aggregate overflow:** reject the whole candidate value before mutation with
  `aggregate-overflow`; continue with later records in deterministic file/array order.
- **Third-party schema drift:** rejected by runtime validation and surfaced through the closed reason
  taxonomy.

No authentication surface is added. The command reads an operator-selected local file and writes
stdout; its security boundary is output encoding.

## Implementation task contract

Replace the obsolete task 5.1 writer-hook wording with one bounded implementation task:

1. Parse only eligible main assistant messages and native subagent tool-result records using the
   validation, trimmed identity, attribution, and source-precedence rules above.
2. Add accepted selected subagent usage to model rows, `persistedSubagentCost`, and `grand` exactly
   once; make valid legacy fallback contribute to all three; use atomic checked addition for every
   numeric accumulator.
3. Emit the closed complete/incomplete coverage reason taxonomy, positive counts, and canonical
   order from one shared representation in text and HTML.
4. Escape all dynamic HTML strings.
5. Update the stale `justfile.opsx` `session-cost` recipe description so it no longer claims current
   subagent spend is TUI-only and instead states that persisted parent tool-result usage is included
   when valid; this recipe text update belongs to implementation task 5.1.
6. Test realistic main records; single/parallel native results; non-main usage look-alikes; trimmed,
   duplicate, whitespace-only, and absent IDs with exact raw/processed/duplicate counts; missing,
   non-array, and empty results; malformed children with valid siblings; a valid child found only in
   a rejected duplicate whose line also has valid legacy fallback; missing/non-string/blank models;
   legacy-only fallback with two accepted annotations contributing zero row calls/tokens and
   `legacy-fallback: 2`; native-plus-legacy ambiguity; exact reason codes/counts/order in both
   renderers; overflow atomicity for main, native, and legacy values; hostile HTML labels; the
   updated recipe text; and a current real parent-session probe.

The previous review evidence that subagent cost is “TUI-only/not persisted” is historical and must
not be used to pass this replacement task. The replacement requires a fresh per-task reviewer PASS.

## Risks / Trade-offs

- **Third-party shape changes:** runtime validation exposes incomplete coverage instead of guessing.
- **Hybrid history can undercount:** explicit incomplete status is safer than an inflated total.
- **Scalar child cost lacks components:** only total is incremented.
- **Large files:** parsing remains linear; state grows with model and seen-call-ID counts, suitable
  for at least 10× current files.
- **All-branch accounting differs from a branch export:** the command deliberately reports billed
  work across the selected session file, not only currently visible conversation context.

## Migration Plan

1. Replace task 5.1 and mark obsolete evidence historical before implementation.
2. Update parser, renderers, and the `justfile.opsx` recipe description without changing CLI
   arguments or recipe behavior.
3. Add contract-shaped fixtures and probe a current parent session.
4. Run focused tests, all tool tests, strict `openspec` validation, and extension checks.
5. After implementation passes review, refresh user documentation to remove obsolete
   “TUI-only/not persisted” claims and refresh runtime/building-block architecture text to state that
   the rollup reads existing parent tool-result details and adds no writer or dependency.
6. Update `docs/architecture/09-architecture-decisions.md` to index accepted ADRs 0003–0005. This
   documentation and architecture refresh is required before archive, not an optional follow-up.

A no file migration or backfill.

## Open Questions

None.
