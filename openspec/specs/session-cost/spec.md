# Session Cost Specification

## Purpose

Define deterministic, coverage-aware accounting for main-agent and persisted subagent usage in
Pi session files, including safe text and HTML reporting.

## Requirements

### Requirement: Eligible persisted costs roll up without cross-source inflation

The harness SHALL report file-wide incurred cost from two disjoint eligible sources. A main-agent
source SHALL be a session entry with `type: "message"`, `message.role: "assistant"`, and a valid
`message.usage.cost`. A native subagent source SHALL be a session entry with `type: "message"`,
`message.role: "toolResult"`, `message.toolName: "subagent"`, and valid child usage under
`message.details.results[]`. No other message role or look-alike usage object SHALL contribute.

For main usage, `cost.total` SHALL be a finite, non-negative JSON number; every present cost
component and token counter SHALL satisfy the same invariant. Missing cost components and token
counters SHALL become zero. Numeric strings SHALL NOT be coerced. Malformed eligible main records
SHALL be excluded without suppressing independent valid records. A structurally valid main value
SHALL be accepted only when atomically adding it leaves every impacted row, token, main-total, and
grand-total accumulator finite. If any impacted sum would be non-finite, no call, token, or cost
field from that value SHALL change and it SHALL be rejected with `aggregate-overflow`.

#### Scenario: Main-agent costs sum per model and overall

- **WHEN** the rollup reads valid assistant messages across two models
- **THEN** it prints each model's calls, input/output tokens, and cost
- **AND** each valid `message.usage.cost.total` contributes once to the accepted grand total

#### Scenario: Non-assistant usage cannot inflate the total

- **WHEN** a tool-result, user, or custom message carries a look-alike `message.usage.cost`
- **THEN** that object contributes nothing through the main-agent source

#### Scenario: Malformed main usage is isolated and surfaced

- **WHEN** one eligible assistant has a negative, infinite, non-numeric, or numeric-string required value and another assistant is valid
- **THEN** the malformed assistant is excluded and the valid assistant is included
- **AND** text and HTML report incomplete coverage

#### Scenario: Blank and non-JSON lines remain tolerable

- **WHEN** the session file contains blank or non-JSON lines
- **THEN** those lines are skipped and valid classified records are still totaled

### Requirement: Native subagent calls have deterministic identity, validation, and attribution

Each eligible persisted `subagent` tool-result entry SHALL increment `rawNativeCandidates` before
deduplication. `subagentCalls` SHALL count only candidates selected for processing after
deduplication, and `duplicateNativeCalls` SHALL count later candidates rejected for an already-seen
identity. Assistant tool-call request blocks SHALL NOT increment any of these counts. The invariant
SHALL be `rawNativeCandidates = subagentCalls + duplicateNativeCalls`.

A string session entry `id` SHALL be trimmed before identity testing and comparison. A non-empty
trimmed ID SHALL be preferred: the first occurrence is processed and a later candidate with the same
trimmed ID is rejected from native processing. Thus `" call-1 "` and `"call-1"` are duplicates.
A missing, non-string, or whitespace-only ID SHALL be ID-less, use its line ordinal as a
compatibility identity, be processed once, and emit `idless-native-call`. Every processed candidate,
including a malformed container, SHALL increment `subagentCalls` exactly once.

A missing/non-object `message.details`, missing/non-array `details.results`, or empty results array
SHALL be a malformed native container. In a non-empty array, a non-object child, missing/non-object
`usage`, invalid scalar `usage.cost`, or invalid present token counter SHALL make only that child
malformed. Valid siblings SHALL still contribute. Missing token counters SHALL become zero.

Each structurally valid child SHALL be accepted only when atomically adding it leaves every
impacted row, token, persisted-subagent-subtotal, and grand-total accumulator finite. If any
impacted sum would be non-finite, no call, token, or cost field from that child SHALL change and it
SHALL be rejected with `aggregate-overflow`. Each accepted child SHALL contribute one call, its
input/output tokens, and scalar cost to exactly one model row, persisted subagent subtotal, and
accepted grand total. Scalar child cost SHALL increment total only; component dollar costs SHALL
NOT be invented.

A non-empty string model SHALL be trimmed and used as the row key. Missing, non-string, or
whitespace-only models SHALL map to `main/unknown` for main usage and `subagent/unknown` for child
usage. Explicit main and child keys SHALL merge only when their trimmed strings are exactly equal;
the two fallback keys SHALL never merge.

#### Scenario: Single and parallel native results contribute exactly once

- **WHEN** one native tool result contains one valid child and another contains two valid children
- **THEN** `rawNativeCandidates` is 2, `subagentCalls` is 2, `duplicateNativeCalls` is 0, and three accepted child runs are reported
- **AND** every child contributes once to its model row, subagent subtotal, and grand total

#### Scenario: Request and result are not double counted

- **WHEN** an assistant message requests a subagent call and its persisted tool result follows
- **THEN** only the tool-result entry increments `rawNativeCandidates` and `subagentCalls` and contributes child usage

#### Scenario: Duplicate persisted call identity is rejected

- **WHEN** two native candidates carry the same non-empty session entry `id`
- **THEN** `rawNativeCandidates` is 2, `subagentCalls` is 1, and `duplicateNativeCalls` is 1
- **AND** only the first candidate is processed and the duplicate is reported as an incomplete-coverage reason

#### Scenario: IDs are trimmed and whitespace-only IDs are ID-less

- **WHEN** one valid native candidate has ID `" call-1 "`, another has ID `"call-1"`, and a third has ID `"   "`
- **THEN** the first two share one identity, producing one processed call and one duplicate
- **AND** the whitespace-only candidate is processed once using its line ordinal
- **AND** `rawNativeCandidates` is 3, `subagentCalls` is 2, and `duplicateNativeCalls` is 1
- **AND** both renderers include `duplicate-native-call: 1` and `idless-native-call: 1`

#### Scenario: Malformed native containers are visible

- **WHEN** a processed native candidate has missing or non-object details, missing or non-array results, or an empty results array
- **THEN** it increments `rawNativeCandidates` and `subagentCalls` but contributes no native cost
- **AND** text and HTML report incomplete coverage

#### Scenario: Malformed child is isolated from a valid sibling

- **WHEN** one results element is non-object or has invalid usage and a sibling child is valid
- **THEN** the malformed child is excluded and the valid sibling is included
- **AND** text and HTML report incomplete coverage

#### Scenario: Invalid and blank labels use source-specific fallbacks

- **WHEN** otherwise valid main and child records have missing, non-string, or whitespace-only models
- **THEN** main usage is attributed to `main/unknown` and child usage to `subagent/unknown`
- **AND** the fallback rows remain separate

### Requirement: Native subagent usage is authoritative and legacy cost is fallback only

Native child usage from non-duplicate processed candidates SHALL be the session-wide authoritative
subagent source. deduplication SHALL occur before child validation and source selection. A rejected
duplicate candidate's native `message.details` SHALL NOT influence source precedence, totals, or
child diagnostics. Top-level `subagentCost` SHALL be collected and validated independently on every
parsed JSON object, including one whose native candidate is rejected as a duplicate. A valid legacy
object SHALL contribute only when processed candidates contain no aggregate-safe accepted native
child usage. Native and legacy costs SHALL NOT both enter one total.

A legacy annotation SHALL be structurally valid when its `total` and every present component are
finite, non-negative JSON numbers; missing components SHALL become zero. It SHALL be accepted only
when atomically adding it leaves every impacted row, subagent-subtotal, and grand-total field finite;
overflow SHALL reject the annotation without changing any accumulator. Accepted fallback SHALL be
attributed to `subagent/unknown` and included in that row, the subagent subtotal, and grand total.
Because an aggregate annotation does not establish child-run cardinality or carry token counters,
each accepted annotation SHALL contribute zero to the row's `calls`, `tokensIn`, and `tokensOut`.
Model-row `calls` SHALL count only known invocations: accepted main assistant messages and accepted
native child results. The `legacy-fallback` reason count SHALL report accepted annotation count
without treating annotations as child calls. Malformed annotations SHALL be excluded independently.

The rollup SHALL expose `coverage: complete` or `coverage: incomplete` in both text and HTML from one
shared ordered reason list. The reason-code enum and canonical order SHALL be:

1. `malformed-main`
2. `duplicate-native-call`
3. `idless-native-call`
4. `malformed-native-container`
5. `malformed-native-child`
6. `malformed-legacy-annotation`
7. `no-usable-subagent-cost`
8. `legacy-fallback`
9. `ignored-legacy-annotation`
10. `aggregate-overflow`

Each code SHALL occur at most once, only when its file-wide count is positive, rendered exactly as
`<code>: <count>` in that order. Counts SHALL respectively represent: malformed eligible assistant
records; rejected duplicate native candidates; processed ID-less candidates; malformed processed
native containers; malformed children in processed candidates; malformed top-level legacy objects;
processed calls with zero accepted native children when no legacy value is selected; accepted
legacy fallback annotations; structurally valid legacy annotations ignored because native was
selected; and structurally valid main/native/legacy values atomically rejected because an impacted
sum would become non-finite. Coverage SHALL be `incomplete` iff this ordered list is non-empty.
An accepted total SHALL NOT be described as complete spend when coverage is incomplete.

#### Scenario: Native usage prevents legacy double counting

- **WHEN** a file contains valid native child usage in a processed candidate and one or more top-level legacy annotations
- **THEN** only native child usage from processed candidates enters the model rows, subagent subtotal, and grand total
- **AND** both renderers report incomplete coverage because legacy data was ignored as ambiguous

#### Scenario: Legacy-only fallback contributes cost without inventing child calls

- **WHEN** a file has no valid native child usage in processed candidates and has two valid legacy annotations
- **THEN** both annotations contribute under `subagent/unknown` to the row, subtotal, and grand total
- **AND** `subagent/unknown.calls`, `tokensIn`, and `tokensOut` are each zero
- **AND** both renderers include `legacy-fallback: 2` and report incomplete coverage because child correlation is unavailable

#### Scenario: Legacy on a rejected duplicate remains independently eligible

- **WHEN** the first candidate for an ID has no accepted child and a later duplicate carries both a valid native child and a valid top-level legacy annotation
- **THEN** the duplicate native child is ignored before source selection
- **AND** the co-located legacy annotation remains eligible and is selected because no processed candidate has an accepted native child
- **AND** `rawNativeCandidates` is 2, `subagentCalls` is 1, and `duplicateNativeCalls` is 1
- **AND** both renderers include `duplicate-native-call: 1` and `legacy-fallback: 1` in canonical order

#### Scenario: Processed calls without selected cost remain visible

- **WHEN** one or more processed native calls exist but neither valid native usage nor valid legacy fallback is usable
- **THEN** the accepted main-agent total remains available
- **AND** both renderers state that coverage is incomplete and child cost is omitted

#### Scenario: Coverage reason codes aggregate once in canonical order

- **WHEN** a file produces two malformed main records, one duplicate native call, one ID-less call, three malformed children, and one legacy annotation ignored by selected native usage
- **THEN** text and HTML each render exactly `malformed-main: 2`, `duplicate-native-call: 1`, `idless-native-call: 1`, `malformed-native-child: 3`, and `ignored-legacy-annotation: 1`
- **AND** each reason appears once in canonical order with no zero-count reason

#### Scenario: Aggregate overflow rejects one value atomically

- **WHEN** an otherwise structurally valid main record, native child, or legacy annotation would make any impacted numeric accumulator non-finite
- **THEN** that whole value changes no model row, call count, token count, subtotal, or grand-total field
- **AND** later independent values are still processed in file and array order
- **AND** both renderers include `aggregate-overflow: 1` for each rejected value

#### Scenario: Clean native accounting is complete

- **WHEN** every eligible main record and every processed native container and child is valid and aggregate-safe, `duplicateNativeCalls` is zero, no ID-less call exists, and no legacy annotation is present
- **THEN** the reason list is empty and text and HTML report `coverage: complete`

### Requirement: The shipped recipe describes the persisted source accurately

The `just session-cost` recipe description SHALL state that valid persisted parent subagent
ToolResult usage is included and SHALL NOT claim that current subagent spend is necessarily
TUI-only. This text update SHALL be part of implementation task 5.1; recipe arguments and behavior
SHALL remain unchanged.

#### Scenario: Recipe help does not preserve the obsolete source claim

- **WHEN** a reader inspects or lists the `session-cost` recipe
- **THEN** its description states that valid parent tool-result usage is included
- **AND** it does not state that all subagent cost is TUI-only or absent from the session

### Requirement: Viewer HTML escapes every dynamic string

The tool SHALL emit a self-contained HTML summary on request. Every dynamic string inserted into
markup, including session name, model key, coverage label, and diagnostic reason, SHALL be escaped
at the output boundary by encoding `&`, `<`, `>`, `"`, and `'`.

#### Scenario: HTML contains accepted totals and coverage

- **WHEN** HTML output is requested for a session with main and selected persisted subagent usage
- **THEN** the fragment contains their per-model costs, accepted grand total, and coverage state

#### Scenario: untrusted labels render only as text

- **WHEN** a filename, model key, or diagnostic value contains HTML metacharacters
- **THEN** those characters are encoded in the fragment
- **AND** the dynamic value cannot create an element, attribute, or executable markup
