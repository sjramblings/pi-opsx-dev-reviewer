# Tasks — harden-architect-scope

## 1. Invert architect-scope to default-deny

- [x] 1.1 Rewrite the decision in `extensions/architect-scope/index.ts` so that `write`/`edit`
      is allowed only when the current agent is a positively-identified non-architect (e.g.
      `developer`), OR the agent is `solution-architect` writing a design artifact
      (`proposal.md`, `design.md`, `specs/**`, `docs/decisions/**`). Every other case —
      including an unidentified/empty/unparseable `PI_SUBAGENT_STACK` — blocks.
      probe: `bun` unit test asserts 4 cases — empty-stack write → BLOCK; architect + non-design → BLOCK; architect + design → ALLOW; developer + any → ALLOW — 4/4 pass; `bun build --no-bundle` clean.
