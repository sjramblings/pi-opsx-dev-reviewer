# 11. Risks and Technical Debt

## Known risks

| Risk | Evidence | Mitigation and accepted residual cost |
| --- | --- | --- |
| Third-party subagent result details can change shape. | Native extraction depends on `message.details.results[]` (`tools/session-cost.ts:302`). | Runtime validation emits malformed-container or malformed-child coverage reasons (`tools/session-cost.ts:300`, `tools/session-cost.ts:308`). Residual cost: schema drift yields partial accounting until compatibility is updated. |
| Native-over-legacy precedence can undercount an uncorrelated legacy-only child in a hybrid file. | Native selection ignores all valid legacy annotations once a native child is accepted (`tools/session-cost.ts:327`). | `ignored-legacy-annotation` makes coverage incomplete (`tools/session-cost.ts:329`, `tools/session-cost.ts:359`). Residual cost: ambiguity is disclosed but cannot be resolved without correlation data. |
| ID-less native records cannot prove cross-line deduplication. | Missing, non-string, or blank IDs are processed and diagnosed (`tools/session-cost.ts:293`, `tools/session-cost.ts:299`). | Coverage is incomplete. Residual cost: a compatibility path remains available but cannot claim deduplication certainty. |
| The report covers every eligible entry in the selected file, including entries outside a currently visible branch. | The parser processes all lines without branch filtering (`tools/session-cost.ts:269`). | The heading says accepted persisted usage (`tools/session-cost.ts:365`). Residual cost: the total represents file-wide incurred calls rather than a branch-only export view. |
| Local HTML remains safe only if all future dynamic insertions use the encoder. | Current dynamic model and reason strings are escaped at rendering (`tools/session-cost.ts:404`, `tools/session-cost.ts:417`). | Hostile-label tests protect the current boundary (`tools/session-cost.test.ts:300`). Residual cost: future renderer edits carry an encoding discipline obligation. |

## Technical debt

- **No historical backfill or provider reconciliation.** The command reads only the selected local
  `JSONL` (`tools/session-cost.ts:459`). Costs absent from persisted sources cannot be recovered, and
  accepted totals are not billing-system reconciliation.
- **Legacy source lacks child cardinality and model attribution.** Fallback accumulates under
  `subagent/unknown` without calls or tokens (`tools/session-cost.ts:232`). This compatibility path
  is intentionally less informative than native child details.
- **Third-party corpus subprocess boundary.** The architecture grounding engine invokes an external
  corpus lookup mechanism (`tools/waf-grounding.ts:2`), while the rest of the local engines are
  TypeScript. This remains a toolchain exception rather than a session-cost dependency.

## Decision debt

The accepted session-cost source, precedence, and HTML-encoding decisions have ADRs 0003, 0004,
and 0005 indexed in section 9. No additional session-cost decision debt was found.

Two repository-wide choices remain architecturally significant without dedicated ADRs:

- Fail-closed authorization for unidentified agents (`extensions/architect-scope/index.ts:38`).
- The `FAIL`/`PARTIAL`/`clean` graceful-skip gate contract (`justfile.opsx:7`).

These entries record missing decision rationale; this document does not reconstruct it.

## Optional Structurizr risks and debt

| Item | Nature | Current state |
| --- | --- | --- |
| Descriptor-relative system calls are unavailable. | Debt | The design specifies `openat`, `mkdirat`, `fstatat`, `renameat`, and `unlinkat`. Node and Bun expose no `*at()` system calls, so the lifecycle uses `O_NOFOLLOW` opens plus retained `(device,inode)` re-verification before every destructive phase (`tools/structurizr-fs.ts:16`). This closes symlink substitution and detects ancestor replacement, but leaves a narrower `TOCTOU` window than true descriptor-relative traversal. Closing it needs an FFI binding or a native helper. |
| Native `linux/amd64` evidence is absent. | Risk | Every command has been executed on a native `linux/arm64` engine only. The pinned amd64 manifest is published but no amd64 command has been run, and the design forbids emulation as a substitute (`tools/structurizr/pin-evidence.md:110`). Until the canonical CI job runs, amd64 support is a published-manifest claim rather than an executed one. |
| The pin has no automated update path. | Debt | A pin move requires manual registry checks, two-target native evidence, and a reviewed pull request. The accepted cost is that the pin ages until someone does that work. |
| Governed pin attestation is not wired. | Risk | The two-native-job attestation workflow and the repository rule that would require it are described in the design but not installed here. Without that repository rule a pin-impacting change can merge on one target's evidence. |
| The safety policy is deliberately narrow. | Risk | It permits only the passive forms actually observed from this renderer. A future renderer version emitting a new benign construct will fail the gate until the policy is widened deliberately. |
