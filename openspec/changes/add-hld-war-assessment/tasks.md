# Tasks—add-HLD-war-assessment

> Gives the solution-architect a repo-level `HLD` + full six-pillar Well-Architected review under
> `docs/hld/`, extends architect-scope to allow that tree, and adds a war-lint gate. Reuses
> `tools/waf-grounding.ts` for corpus grounding. No production runtime code; no new dependency.

## 1. Path scope (spec: agent-path-scoping)

- [ ] 1.1 Extend the `solution-architect` policy in `extensions/architect-scope/index.ts` to allow
      `docs/hld/` in addition to its existing design artifacts, WITHOUT allowing `docs/architecture/**`
      and without loosening any other agent. pi loader-safe: no regex literals, no raw backticks, no
      apostrophes (even in comments/strings); keep quotes balanced.
      files: `extensions/architect-scope/index.ts`
      probe: unit test—solution-architect write to `docs/hld/x.md` allowed, to `docs/architecture/y.md` blocked, to `proposal.md` still allowed; developer/tech-writer/unidentified unchanged. `just check-extensions` clean.
      out-of-scope: changing architecture-writer or evolution-narrator policies.
      spec: `agent-path-scoping`

- [ ] 1.2 Confirm the guard still loads in a real pi session after the edit (loader regression is the
      known failure class for this file).
      files: `extensions/architect-scope/index.ts`
      probe: `just check-extensions` clean AND `harness-selftest` raises no unguarded-harness halt in a pi session with the edited extension installed.
      out-of-scope: the `HLD` content itself.
      spec: `agent-path-scoping`

## 2. The `HLD` + WAR artifact (spec: `hld-war-assessment`)

- [ ] 2.1 Add an optional HLD artifact to `openspec/schemas/dev-reviewer/schema.yaml` (owned by the
      solution-architect, generates `docs/hld/**`) with a template at
      `openspec/schemas/dev-reviewer/templates/hld.md`: context and drivers, target architecture, key
      decisions and trade-offs, and a six-pillar Well-Architected review section with a risk-rated,
      recommended finding structure. Keep the template lint-clean.
      files: `openspec/schemas/dev-reviewer/schema.yaml`, `openspec/schemas/dev-reviewer/templates/hld.md`
      probe: `openspec schema validate` (or the repo's schema check) passes; a seeded HLD has all six pillar sections and a finding block with a risk/recommendation field. `just docs-lint` clean on the template.
      out-of-scope: making the artifact a required per-change step (it is on-demand, D2).
      spec: `hld-war-assessment`

- [ ] 2.2 Add the `HLD`/WAR method + report block to `agents/solution-architect.md`: produce `docs/hld/`
      as a repo-level deliverable on demand; all six pillars; each finding risk-rated HIGH/MEDIUM/LOW
      with a recommendation; ground every WAF identifier via `tools/waf-grounding.ts` and fail loudly if
      the corpus is missing; cross-link `docs/architecture/` for as-built facts rather than duplicating.
      files: `agents/solution-architect.md`
      probe: the method names the six pillars, the risk+recommendation rule, corpus grounding via `tools/waf-grounding.ts`, and the cross-link-not-duplicate rule; a report block field lists the `HLD` provenance (commit, date, corpus tag/hash).
      out-of-scope: changing the architect's design-artifact settling method.
      spec: `hld-war-assessment`

## 3. The gate (spec: war-lint)

- [ ] 3.1 Write `tools/war-lint.ts`: fail on a missing pillar, a finding with no HIGH/MEDIUM/LOW rating
      or no recommendation, or a WAF identifier that does not resolve via `tools/waf-grounding.ts`; fail
      loudly (non-zero, explicit message) when the corpus is unavailable. Resolve identifiers through
      `tools/waf-grounding.ts`, not a parallel parser.
      files: `tools/war-lint.ts`, `tools/war-lint.test.ts`
      probe: unit tests—a five-pillar doc fails naming the missing pillar; an unrated finding fails; a doc citing a bogus BP id fails; a complete, grounded doc passes. Grounding calls go through `tools/waf-grounding.ts`.
      out-of-scope: changing the `tools/waf-grounding.ts` contract (exit codes/messages are a contract).
      spec: `war-lint`

- [ ] 3.2 Wire `just war-lint <dir>` into `justfile.opsx` (standalone, on-demand—not folded into an
      aggregate gate per D2/Open-Question-2).
      files: `justfile.opsx`
      probe: `just war-lint docs/hld` runs the gate and returns its exit code; `just --list` shows the recipe.
      out-of-scope: adding it to a verify-gate aggregate.
      spec: `war-lint`

## 4. Docs (spec: `hld-war-assessment`)

- [ ] 4.1 Document the deliverable for the reader in `README.md` and `index.html`: what the `HLD`/WAR
      artifact is, that it is repo-level and on-demand, `just war-lint`, the `docs/hld/` home, and how it
      differs from the as-built arc42 tree.
      files: `README.md`, `index.html`
      probe: README has an `HLD`/WAR section distinguishing it from architecture-writer's as-built tree; index.html reflects it; docs gate clean.
      out-of-scope: restating the WAF pillars in the README (link, do not duplicate).
      spec: `hld-war-assessment`

## 5. Verify

- [ ] 5.1 End-to-end: generate an `HLD` for this repo via the solution-architect, run `just war-lint
      docs/hld` to a clean pass, and confirm the six pillars, risk-rated findings, corpus-grounded
      identifiers, and the arc42 cross-links are present. Record the gate output verbatim.
      files: `docs/hld/README.md` (generated), review evidence
      probe: `just war-lint docs/hld` exits zero on the generated `HLD`; the artifact shows all six pillars with rated/recommended findings and grounded identifiers.
      out-of-scope: automating `HLD` generation on a schedule.
      spec: `hld-war-assessment`
