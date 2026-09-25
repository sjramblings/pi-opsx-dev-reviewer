---
schema_version: 1
id: LRN-0006
type: review-rule
scope: ["extensions/**"]
tags: [evidence, probe, verification, review]
severity: high
status: active
summary: A probe whose only proof is a child process's stderr or stdout must redirect that stream to a retained artifact and cite it; a stream that is not persisted is not evidence.
source:
  change: add-architecture-diagrams
  commit: 9a84a2d755ff2c1ca60344237ea1c0c80def2c62
created: 2026-07-31
supersedes: null
---

# LRN-0006—probe evidence must persist

## Rule

When a probe's assertion rests on a spawned process's stderr or stdout, redirect that stream to a
file that survives the run and cite the artifact path in the evidence; never assert a claim whose
only witness is an ephemeral parent-process stream.

## Why

The task 4.2 review of `add-architecture-diagrams` found `[P2][CONFIRMED]` that
`extensions/harness-selftest/index.ts:28-34` writes its no-halt banner only to parent-process
stderr, which is absent from the persisted session JSONL, so a self-test failure could still have
let the session continue and the claim could not be independently verified. The reviewer's
EVIDENCE CHECK was only Partially satisfied for that reason.

## Refutation (the hard-to-vary core)

- **conjectured:** a guard/selftest that prints a failure banner is self-evidently proven to have halted the session.
- **refuted_by:** the persisted session JSONL contained no trace of the banner -- the only witness was the outer process stderr, which was never retained, so the no-halt claim rested on an artifact nobody could re-read.
- **learned:** evidence that is not persisted is not evidence; a claim is only as verifiable as the artifact that outlives the run.
- **criterion_now:** any probe asserting on subprocess output must redirect that stream to a retained file and cite its path in the verdict.

## Example

Bad:

    if bun extensions/harness-selftest/index.ts 2>&1 |
      grep -q "SELFTEST FAILED: session did not halt"; then
      verdict="PASS: no-halt banner observed"
    fi

Good:

    artifact="artifacts/harness-selftest.stderr"
    bun extensions/harness-selftest/index.ts 2>"$artifact"
    grep -q "SELFTEST FAILED: session did not halt" "$artifact"
    verdict="PASS: no-halt banner observed; evidence: $artifact"
