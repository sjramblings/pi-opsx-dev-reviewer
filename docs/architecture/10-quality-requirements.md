# 10. Quality Requirements

## Quality scenarios

| Quality attribute | Scenario | Evidence that it is met |
| --- | --- | --- |
| Security (authorization) | The main agent attempts a direct write; the write is refused and delegation is forced | `extensions/force-delegate/index.ts:6` |
| Security (fail-closed) | Agent identity is unset or unparseable; the write is restricted, not allowed | `extensions/architect-scope/index.ts:38` |
| Reliability (loud failure) | A guard fails to load; the session halts with a banner instead of running unguarded | `extensions/harness-selftest/index.ts:22` |
| Reliability (no false pass) | A gate tool is missing; the gate reports `PARTIAL`, never `clean` | `justfile.opsx:7` |
| Testability | The path guard is covered by unit tests, including the symlinked-root regression | `extensions/architect-scope/index.test.ts` |
| Portability | The harness installs into any repository by file copy with no service dependency | `install.sh:66` |
| Integrity | Extension load-health is statically verified so a tokenizer breaker cannot ship silently | `justfile.opsx:245` |

## AWS Well-Architected assessment

AWS Well-Architected best-practice assessment targets a **deployed AWS workload**. This
repository is a local developer tool with no deployed AWS surface — no accounts, no
infrastructure, no runtime resources — so a per-best-practice Well-Architected review is out
of scope, and no best practice is claimed met or unmet here. Forcing AWS best-practice
claims onto a local tool would be fabricated attribution.

The repository does **ship** Well-Architected tooling for consumers: `tools/waf-grounding.ts`
resolves best practices from a pinned corpus, and the architecture-writer uses it to ground
quality claims when documenting an AWS workload. The corpus provenance is recorded in the
index (`docs/architecture/README.md`): tag `generated-at:2026-05-20T23:55:19.943Z`, content
hash `sha256:9b9945353ab2f6d14565be4f959b81ee319a93e29d90259442baf3c4f5452bc9`, 306 best
practices. That provenance is a fact about the shipped tool, not a claim about this
repository's own architecture.
