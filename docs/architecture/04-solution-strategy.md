# 4. Solution Strategy

## Structurally guarded delegation

The main process is made read-only and delegates writes to role-scoped subprocesses
(`extensions/force-delegate/index.ts:6`, `extensions/architect-scope/index.ts:50`). This improves
policy enforceability at the accepted cost of subprocess startup and narrower reviewer evidence.
ADRs 0001 and 0002 are indexed in section 9.

## Consume the existing persistence boundary

Session-cost is a local deterministic engine that reads the parent `JSONL` once and normalizes two
disjoint native sources: assistant-message usage for the main agent and child usage from processed
`subagent` tool-result details (`tools/session-cost.ts:269`, `tools/session-cost.ts:281`,
`tools/session-cost.ts:286`). It does not add a session writer or package dependency
(`tools/session-cost.ts:10`, `tools/session-cost.ts:459`). This keeps deployment simple at the
accepted cost of depending on runtime validation of a third-party details schema.

## Apply source precedence before claiming coverage

Native aggregate child usage has session-wide precedence when at least one child is accepted;
otherwise valid top-level `subagentCost` annotations are replayed as a lower-confidence fallback
(`tools/session-cost.ts:315`, `tools/session-cost.ts:325`, `tools/session-cost.ts:327`). Native and
legacy values therefore do not enter the same accepted total. The accepted cost is possible
undercount in a hybrid historical file because uncorrelated legacy values are ignored rather than
risked as duplicates.

Coverage is complete only when the shared ordered diagnostic list is empty; any malformed,
duplicate, ID-less, fallback, ignored, unusable, or overflow condition makes the accepted total
explicitly incomplete (`tools/session-cost.ts:63`, `tools/session-cost.ts:343`,
`tools/session-cost.ts:359`). The accepted cost is that a useful partial total carries a warning
instead of the command failing on every local data defect.

## Encode untrusted output at the final boundary

HTML rendering escapes every dynamic string immediately before interpolation
(`tools/session-cost.ts:391`, `tools/session-cost.ts:417`). This avoids a templating dependency at
the accepted cost that every future dynamic insertion must continue to pass through the helper.
ADRs 0003, 0004, and 0005 record the accepted accounting and output decisions and are indexed in
section 9.

## Optional Structurizr strategy

Three decisions shape this path. **Packaging is separate**: every recipe and tool ships in
`justfile.structurizr` and is installed only by an explicit flag, so an ordinary install carries no
Structurizr inventory at all (`install.sh:396`). The accepted cost is a second recipe file to keep
in step with the first.

**Verification is fail-closed and layered**: the exported model, the view keys, the cross-view
lineage, and every SVG must each pass before anything is published
(`tools/structurizr-verify.ts:797`). The accepted cost is that a renderer change which is merely
cosmetic can still fail the gate.

**Ownership is split**: the kit owns its tools and refreshes them on every opt-in rerun, while the
model is team-owned and seeded only when absent (`install.sh:225`). The accepted cost is that a
team editing a kit-owned file will silently lose that edit on the next rerun.
