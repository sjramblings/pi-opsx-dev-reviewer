# 8. Crosscutting Concepts

Each pattern names its catalogue, repository instantiation, and accepted consequence.

## Pattern: Fail-safe defaults

**Catalogue:** Saltzer and Schroeder, *The Protection of Information in Computer Systems*
(fail-safe defaults). The authorization gate restricts unidentified agents
(`extensions/architect-scope/index.ts:38`), while session-cost rejects invalid and non-finite
numeric candidates instead of coercing them (`tools/session-cost.ts:101`). The system accepts false
rejections and partial results rather than unsafe authorization or inflated accounting.

## Pattern: Pipes and filters

**Catalogue:** *Pattern-Oriented Software Architecture*, Pipes and Filters. Session-cost separates
classification/normalization, deterministic replay and aggregation, then text or HTML rendering
(`tools/session-cost.ts:133`, `tools/session-cost.ts:248`, `tools/session-cost.ts:365`). The system
accepts intermediate event storage proportional to the selected session file in exchange for
source selection that is independent of rendering.

## Pattern: Authoritative-source precedence with fallback (cost: possible hybrid undercount)

**Catalogue:** *Enterprise Integration Patterns*, Message Filter and Content Enricher, adapted as a
house source-selection rule. Native persisted child usage from processed parent tool results is
selected session-wide when any child is aggregate-safe; otherwise independently collected legacy
annotations are replayed (`tools/session-cost.ts:315`, `tools/session-cost.ts:325`,
`tools/session-cost.ts:327`). The system accepts possible undercount of uncorrelated legacy-only
spend in a hybrid file to prevent native and legacy double charging.

## Pattern: Explicit partial-result contract

**Catalogue:** house convention, aligned with Result-with-diagnostics APIs. One closed, ordered
reason list drives both renderers and coverage is incomplete whenever that list is non-empty
(`tools/session-cost.ts:63`, `tools/session-cost.ts:343`, `tools/session-cost.ts:359`). The system
accepts a more complex public output contract so malformed or ambiguous persisted cost cannot hide
behind a complete label.

## Pattern: Output-boundary encoding (cost: future encoding discipline)

**Catalogue:** OWASP Cross Site Scripting Prevention Cheat Sheet, output encoding. Session name,
model keys, coverage, and reason text pass through one HTML escaping helper at interpolation
(`tools/session-cost.ts:391`, `tools/session-cost.ts:404`, `tools/session-cost.ts:417`). The system
accepts a maintenance obligation on every future dynamic insertion to avoid adding a templating
or DOM dependency.

## Optional Structurizr crosscutting concepts

**One ordered failure taxonomy.** Twenty-three primary codes are ranked once, and the command stops
at the first failure in that order, so the reported code never depends on discovery order
(`tools/structurizr-render.ts:41`). The accepted cost is that a later, more interesting fault stays
hidden until the earlier one is fixed.

**Accept or reject, never rewrite.** SVG verification parses with a vendored, hash-pinned,
namespace-aware parser with document type declarations rejected, and refuses anything active or externally referencing; it
never sanitizes (`tools/structurizr-verify.ts:530`). The accepted cost is that a benign-but-unusual
renderer construct fails the gate until the policy is widened deliberately.

**Ownership is a live descriptor plus a nonce.** A matching directory name, a well-formed marker, or
a process ID never authorizes deletion, so an abandoned stage is retained for explicit operator
recovery rather than collected automatically (`tools/structurizr-fs.ts:352`). The accepted cost is
that a crashed run needs a documented manual cleanup.

**Provenance without volatility.** The manifest records the exact source hash, image reference,
native platform, application and library versions, Bun version, and every published file's size and
hash, and deliberately excludes timestamps, host names, process IDs, and staging nonces
(`tools/structurizr-verify.ts:660`). The accepted cost is that the manifest cannot answer when a
render happened.
