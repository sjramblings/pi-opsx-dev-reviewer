# 2. Constraints

## Technical constraints

| Constraint | Evidence | Architectural consequence and accepted cost |
| --- | --- | --- |
| Pi extension source has tokenizer restrictions that are statically scanned. | `extensions/architect-scope/index.ts:17`, `justfile.opsx:245` | Guards avoid otherwise valid syntax; maintainers accept a constrained coding style to prevent silent load failure. |
| subagent identity is supplied through `PI_SUBAGENT_STACK`, and subprocess depth through `PI_SUBAGENT_DEPTH`. | `extensions/architect-scope/index.ts:14`, `extensions/force-delegate/index.ts:15` | Authorization depends on host-provided process metadata; unknown identity is restricted rather than trusted. |
| Current third-party subagent aggregates are consumed from parent `toolResult` records at `message.details.results[].usage`. | `tools/session-cost.ts:286`, `tools/session-cost.ts:302`, `tools/session-cost.ts:306` | Runtime validation contains producer-schema drift; the system accepts coupling to a third-party persisted shape and reports incomplete coverage when it is unusable. |
| Main-agent cost is eligible only on persisted assistant messages. | `tools/session-cost.ts:281` | Look-alike usage on other roles is ignored; the system accepts omission rather than cross-role inflation. |
| Session-cost accepts only finite, non-negative JSON numbers and checked finite sums. | `tools/session-cost.ts:101`, `tools/session-cost.ts:161` | Numeric strings and overflowing values are rejected atomically; partial totals are preferred to fabricated coercion. |

## toolchain constraints

- Deterministic engines are TypeScript executed by Bun (`justfile.opsx:470`). Session-cost imports
  only Node's filesystem reader and writes its report to standard output
  (`tools/session-cost.ts:10`, `tools/session-cost.ts:462`); adding the persisted-subagent source did
  not add a package dependency or session writer. The accepted cost is a command-line, local-file
  interface rather than integration into pi's exporter.
- `openspec` supplies the change workflow and the custom schema assigns architecture output to the
  architecture-writer (`openspec/schemas/dev-reviewer/schema.yaml:80`). The accepted cost is an
  additional artifact gate in the change lifecycle.

## Organizational constraints

The architecture writer may change only `docs/architecture/**`
(`extensions/architect-scope/index.ts:59`). ADRs remain separately owned and this architecture tree
may only index them (`openspec/schemas/dev-reviewer/schema.yaml:93`). The accepted cost is that a
missing rationale is recorded as decision debt rather than repaired during documentation.

## Optional Structurizr constraints

| Constraint | Evidence | Architectural consequence and accepted cost |
| --- | --- | --- |
| The renderer is reachable only as a pinned OCI image on a native Linux engine. | `tools/structurizr/pin.json:6`, `tools/structurizr-probe.ts:100` | Rendering needs Docker; emulated targets are refused, so contributors on unsupported engines cannot render locally. |
| Only `linux/amd64` and `linux/arm64` are pinned. | `tools/structurizr/pin.json:11` | A third target needs a governed pin update with fresh two-target evidence; the system accepts refusing work rather than guessing an untested platform. |
| The verifier requires Bun exactly `1.3.14`. | `tools/structurizr-render.ts:151` | A newer local Bun blocks rendering until the pin moves; the system accepts that friction to keep the verifier behaviour fixed. |
| A model is one regular file of at most 5 MiB with no source expansion. | `tools/structurizr-source.ts:29`, `tools/structurizr-source.ts:169` | Includes, extension, scripts, and plugins are rejected; teams accept a single-file model in exchange for a mount that cannot reach another repository file. |
| Generated SVG bytes are not a stable API. | `tools/structurizr-verify.ts:14` | The renderer writes wall-clock metadata, so no byte-identical guarantee is offered; the stable contract is validated lineage, safety, and manifest provenance. |
