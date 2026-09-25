# 9. Architecture Decisions

This section only indexes accepted records under `docs/decisions/`; each linked ADR owns its
context, options, rationale, and consequences.

| ADR | Title | Status | Link |
| --- | --- | --- | --- |
| 0001 | Run the reviewer on a different model family from the developer | accepted | [ADR 0001](../decisions/0001-cross-family-reviewer.md) |
| 0002 | Generate architecture documentation with a separate agent rather than extending the tech-writer | accepted | [ADR 0002](../decisions/0002-architecture-writer-agent.md) |
| 0003 | Roll up only validated assistant usage and persisted parent subagent results | accepted | [ADR 0003](../decisions/0003-read-subagent-cost-from-parent-tool-results.md) |
| 0004 | Prevent duplicate subagent cost by preferring native usage over legacy annotations session-wide | accepted | [ADR 0004](../decisions/0004-prefer-native-subagent-usage-over-legacy-annotations.md) |
| 0005 | Render session-cost HTML safely by escaping every dynamic string at the output boundary | accepted | [ADR 0005](../decisions/0005-escape-dynamic-session-cost-html.md) |

Architecturally significant choices without an ADR are recorded as decision debt in section 11;
this index does not manufacture missing rationale (`openspec/schemas/dev-reviewer/schema.yaml:93`).
