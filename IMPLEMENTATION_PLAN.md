# Implementation plan — harness + docs upgrades

Roadmap for evolving this kit per the 2026-07-07 E4 review. Ten iterations, one
commit each. This file is the loop's durable state: each iteration is implemented
end-to-end (edit → verify → commit → tick the box) so work resumes cleanly after
any interruption.

## Guardrails (read every iteration)

- Implement completely — no placeholders, no stubs, no TODO left behind.
- One iteration = one focused commit. Don't bundle unrelated changes.
- Verify before ticking: read the file back, run the named check, quote real output.
- `openspec` and `pi` (0.79.9) are installed — use them for live verification.
- Docs-lint tools (vale, markdownlint-cli2, lychee, cspell) are NOT installed — the
  gate must degrade gracefully (skip missing tool with a warning), plus a setup recipe.
- Repo is local-only, single-author, clean tree — commit direct to `main`, no branches.
- Keep the kit portable: no PAI (`~/.claude`) dependencies anywhere.

## Iterations

- [x] 1. Corrections + License — README + developer.md: remove the false "pi cannot
      path-gate edit/write" claim (cite tool_call event.input + protected-paths.ts),
      rename to `earendil-works/pi` (note installed 0.79.9), add developer Bedrock/
      billing note (Claude Pro/Max OAuth bills as extra-usage), add a License section.
      VERIFY: grep confirms claim removed + License heading present.
- [x] 2. Prompt templates (P4) — add `prompts/opsx-loop.md`, `opsx-review.md`,
      `opsx-retro.md` using `$ARGUMENTS`/`$1`; install.sh copies them to
      `~/.pi/agent/prompts/`. VERIFY: each has description frontmatter; install.sh cps them.
- [x] 3. Review ledger + brief injection (P1) — apply-policy.config.yaml protocol:
      developer appends reviewer verdict to `openspec/changes/<change>/review-log.md`
      before ticking, and reads `AGENTS.md` + the change's review-log before implementing.
      Add `templates/AGENTS.md` + `templates/review-log.md`. VERIFY: yaml parses; protocol
      references both files.
- [x] 4. Reviewer de-bias + empirical gate (P3) — reviewer.md: quarantine the developer
      narrative as `AUTHOR CLAIMS (untrusted)`, audit beyond pointed areas, a BLOCK needs
      a runnable probe (PLAUSIBLE-only can't block alone). developer.md: separate raw
      command output from narrative in the report. VERIFY: grep for the new clauses.
- [x] 5. tech-writer agent (4a) — `agents/tech-writer.md` (Diátaxis structure, Google/MS
      style rules, banned-LLM-tell list, WRITER REPORT format); install.sh copies it.
      VERIFY: required frontmatter fields present; install.sh cps it.
- [x] 6. Docs lint gate (4c) — `.markdownlint-cli2.jsonc`, `.vale.ini` + `styles/DevReviewer`
      (banned-word substitution rules as errors), `.lycheeignore`, `cspell.json`, and a
      `justfile` with `docs-lint` (graceful-skip) + `docs-lint-setup` (installs tools).
      VERIFY: config files parse; `just docs-lint` runs and skips missing tools cleanly.
- [x] 7. force-delegate v2 + architect scope (P2) — rewrite `extensions/force-delegate`:
      keep write/edit blocked, bash → read-only allowlist (openspec/git read verbs).
      Add architect path-gating IF `@mjakl/pi-subagent` exposes the agent name to child
      extensions (check live first); else ship bash-allowlist only + document the gap.
      VERIFY: `bun build --no-bundle` on the extension; allowlist logic unit-checked.
- [x] 8. Custom OpenSpec schema (P5) — `openspec/schemas/dev-reviewer/schema.yaml` +
      `templates/` redefining `apply` (delegation) and adding `review-report` (requires
      tasks) + `docs` (requires tasks) artifacts. VERIFY: `openspec schema validate
      dev-reviewer` passes; settles whether verify gates on the docs artifact.
- [x] 9. MADR ADRs + env notes (4d, P6/P7) — solution-architect.md emits MADR files to
      `docs/decisions/`; add `docs/decisions/0001-*.md` example; README "recommended
      environment" section (LSP backpressure, PI_CACHE_RETENTION). VERIFY: MADR file parses.
- [x] 10. Dogfood + README restructure (4e) — restructure README to standard-readme order
      (one-liner <120 chars, ToC, Install/Usage, License last); run the docs gate on it.
      VERIFY: `just docs-lint` clean on README (with whatever tools are installed).

## Done condition

All ten boxes ticked, each with a commit, and a final advisor pass over the diff.
