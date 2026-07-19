# 9. Architecture Decisions

This section indexes the architecture decision records under `docs/decisions/`. It does not
restate their content or invent rationale; read each ADR for the full context, options, and
consequences.

| ADR | Title | Status | Link |
| --- | --- | --- | --- |
| 0001 | Run the reviewer on a different model family from the developer | accepted | `docs/decisions/0001-cross-family-reviewer.md` |
| 0002 | Generate architecture documentation with a separate agent rather than extending the tech-writer | accepted | `docs/decisions/0002-architecture-writer-agent.md` |

ADR 0001 records why review runs cross-family: a same-family reviewer shares the developer's
training corpus and therefore its blind spots. ADR 0002 records why architecture
documentation is owned by a dedicated `architecture-writer` rather than folded into the
`tech-writer` — Diátaxis models four modes, an architecture description is a fifth shape, and
the schema declares one owner per artifact.

Debt for architecturally significant choices that lack an ADR is recorded in section 11, not
here.
