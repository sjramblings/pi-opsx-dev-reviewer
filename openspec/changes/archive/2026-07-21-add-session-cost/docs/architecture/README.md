# Architecture impact—add-session-cost

This change-local artifact is a pointer and impact summary authored by the
`architecture-writer`. The root arc42 tree remains the architecture source of truth.

## Provenance

- Source commit: `171dfafbf6639343aa509145a887864e4a4a1d00`
- Generation date: 2026-07-21
- WAF corpus tag: `generated-at:2026-05-20T23:55:19.943Z`
- WAF corpus content hash:
  `sha256:9b9945353ab2f6d14565be4f959b81ee319a93e29d90259442baf3c4f5452bc9`
- WAF assessment: not applicable—the repository deploys no AWS workload and claims no
  Well-Architected best-practice identifiers (`install.sh:62`, `tools/waf-grounding.ts:2`).

## Sources of truth

- [arc42 architecture index](../../../../../docs/architecture/README.md)—canonical Markdown tree,
  provenance, section index, and high-level and low-level design crosswalk.
- [Derived architecture HTML](../../../../../docs/architecture/index.html)—generated view.
- [Session-cost specification](../../specs/session-cost/spec.md) and
  [settled design](../../design.md).
- [Shipped implementation](../../../../../tools/session-cost.ts) and
  [contract tests](../../../../../tools/session-cost.test.ts).

## Impacted arc42 sections

- [§5 Building Block View](../../../../../docs/architecture/05-building-block-view.md)—session-cost
  classification, selection, aggregation, and rendering boundaries.
- [§6 Runtime View](../../../../../docs/architecture/06-runtime-view.md)—parent-session replay,
  native-over-legacy selection, and partial coverage.
- [§8 Crosscutting Concepts](../../../../../docs/architecture/08-crosscutting-concepts.md)—validation,
  source precedence, partial results, and output encoding.
- [§9 Architecture Decisions](../../../../../docs/architecture/09-architecture-decisions.md)—accepted
  ADRs 0003–0005, indexed without restatement.
- [§10 Quality Requirements](../../../../../docs/architecture/10-quality-requirements.md)—accounting
  integrity, overflow atomicity, coverage parity, compatibility, and output safety.
- [§11 Risks and Technical Debt](../../../../../docs/architecture/11-risks-and-technical-debt.md)—schema
  drift, hybrid undercount, ID-less deduplication uncertainty, and encoding debt.

## Accepted ADR index

- [ADR 0003—Validated assistant and parent subagent usage](../../../../../docs/decisions/0003-read-subagent-cost-from-parent-tool-results.md)—accepted.
- [ADR 0004—Native-over-legacy session-wide precedence](../../../../../docs/decisions/0004-prefer-native-subagent-usage-over-legacy-annotations.md)—accepted.
- [ADR 0005—Output-boundary HTML escaping](../../../../../docs/decisions/0005-escape-dynamic-session-cost-html.md)—accepted.

## Shipped evidence and accepted costs

- The recipe invokes the Bun tool on an operator-selected session (`justfile.opsx:470`).
- Eligible main and parent `subagent` tool-result records enter normalization
  (`tools/session-cost.ts:281`, `tools/session-cost.ts:286`).
- Native accepted child usage takes session-wide precedence over legacy fallback
  (`tools/session-cost.ts:315`, `tools/session-cost.ts:327`).
- Checked aggregation rejects non-finite mutations atomically (`tools/session-cost.ts:161`,
  `tools/session-cost.ts:197`, `tools/session-cost.ts:214`).
- Text and HTML share ordered coverage reasons (`tools/session-cost.ts:343`,
  `tools/session-cost.ts:359`).
- Dynamic HTML values are escaped at interpolation (`tools/session-cost.ts:391`,
  `tools/session-cost.ts:404`, `tools/session-cost.ts:417`).
- Accepted trade-offs: malformed records yield partial totals, legacy fallback lacks child
  attribution, and future HTML additions must use the encoder.

## Verification

- `bun test tools/session-cost.test.ts` reports 20 passing tests.
- `just architecture-html && just arch-lint` verifies the derived architecture view.
- `just docs-lint` verifies the complete documentation corpus.
