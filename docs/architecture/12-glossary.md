# 12. Glossary

| Term | Meaning |
| --- | --- |
| Agent | A single-file role definition under `agents/` with `name`, `model`, and `tools`, run by pi as an isolated process. |
| arc42 | The twelve-section architecture documentation template this tree follows. |
| ADR | Architecture Decision Record — a durable record of one decision under `docs/decisions/`, in MADR form. |
| Decision debt | An architecturally significant choice present in the code with no matching ADR, recorded in section 11. |
| Fail closed | An authorization default that blocks on uncertainty rather than allowing (`extensions/architect-scope/index.ts:38`). |
| Guard / extension | A pi extension under `extensions/` that constrains tool calls at runtime. |
| Open writer | An agent allowed to write anywhere: `developer` and `tech-writer` (`extensions/architect-scope/index.ts:45`). |
| Scoped agent | An agent restricted to a named path allowlist, e.g. `architecture-writer` to `docs/architecture/` (`extensions/architect-scope/index.ts:46`). |
| Ledger / review-report | The append-only record of reviewer verdicts for a change (`openspec/schemas/dev-reviewer/schema.yaml:68`). |
| OpenSpec | The change-management methodology (version 1.4.1) the kit wraps with a custom `dev-reviewer` schema. |
| PI_SUBAGENT_STACK | The environment variable, set by `@mjakl/pi-subagent`, whose last element is the running agent's name. |
| Three-state gate | A gate that reports `FAIL`, `PARTIAL`, or `clean` and never a false clean (`justfile.opsx:7`). |
| WAF corpus | The pinned AWS Well-Architected best-practice corpus consumed by `tools/waf-grounding.ts`. |
