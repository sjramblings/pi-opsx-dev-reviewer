# 12. Glossary

| Term | Meaning |
| --- | --- |
| Accepted total | Sum of validated, aggregate-safe main usage plus the selected persisted subagent source; it is partial when coverage is incomplete (`tools/session-cost.ts:349`, `tools/session-cost.ts:386`). |
| ADR | Architecture Decision Record under `docs/decisions/`; architecture documentation indexes but does not author these records (`openspec/schemas/dev-reviewer/schema.yaml:93`). |
| Aggregate-safe | A candidate whose addition leaves every impacted numeric accumulator finite (`tools/session-cost.ts:161`). |
| Coverage | `complete` when the ordered reason list is empty; otherwise `incomplete` (`tools/session-cost.ts:359`). |
| Legacy annotation | A top-level `subagentCost` object considered only when no native child is accepted (`tools/session-cost.ts:315`, `tools/session-cost.ts:331`). |
| Main usage | Valid cost and tokens from an eligible persisted assistant message (`tools/session-cost.ts:281`). |
| Native child usage | Aggregate child `usage` persisted in a parent `subagent` tool-result's `message.details.results[]` (`tools/session-cost.ts:286`, `tools/session-cost.ts:306`). |
| Parent session | The operator-selected `JSONL` file read by session-cost; child-session retention is not required (`tools/session-cost.ts:459`). |
| Persisted subagent subtotal | Accepted native child total or selected legacy fallback total, excluding main-agent cost (`tools/session-cost.ts:354`). |
| Processed native call | First native tool-result candidate for a trimmed non-empty entry ID, or one ID-less candidate processed under compatibility semantics (`tools/session-cost.ts:293`, `tools/session-cost.ts:299`). |
| Source precedence | Session-wide rule selecting accepted native child usage when present, otherwise valid legacy fallback (`tools/session-cost.ts:327`). |
| Third-party subagent tool | `@mjakl/pi-subagent`, installed externally and producing the parent tool-result details consumed here (`install.sh:33`, `tools/session-cost.ts:286`). |

## Optional Structurizr terms

| Term | Meaning here |
| --- | --- |
| Canonical view key | One of the exact keys `context`, `container`, `component`, which the gate requires and maps to `<key>.svg`. |
| Legend file | The `<key>-key.svg` the renderer may emit alongside a primary view; a view key may therefore never end in `-key`. |
| Lineage | Proof that the context, container, and component views share an element and a source relationship, so they describe one system rather than three. |
| Manifest | The schema-version 1 provenance record of source hash, image, platform, versions, views, and every published file's size and hash. |
| Nonce | The 32-character random hex that binds a staging directory and its owner marker to one live lock, and is the only deletion authority. |
| Owner marker | The file inside a stage that names its nonce, stage name, and live lock identity. |
| Passive SVG | An SVG with no script, event handler, foreign content, external reference, or non-local functional IRI. |
| Payload | The one writable directory mounted into the render container, and the only thing published. |
| Pin | The closed-schema record of the exact image, digests, command vectors, parser, Bun version, and timeouts. |
