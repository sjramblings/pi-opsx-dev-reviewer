# Tasks — fix-spec-template-lint

> Apply AFTER `add-architecture-writer` lands. This change touches `justfile.opsx`, `README.md`,
> and the schema `templates/` directory, which that change also touches — two writers on one tree
> is the repository-revert failure class.
>
> Task 1 settles the floor. Nothing downstream is meaningful until it does, because the size of
> tasks 3 and 4 is set by its outcome.

## 1. Settle the floor

- [x] 1.1 Audit the eight markdownlint rules that fire against this repo and write an explicit
      true or false with a reason for each into `.markdownlint-cli2.jsonc`. Recommendation in
      `design.md` is adopt-all; red-team it before accepting. The config comment stating that
      unlisted rules keep their default is replaced by the explicit list.
      files: `.markdownlint-cli2.jsonc`
      probe: every rule ID appearing in a `bunx markdownlint-cli2` run against the repo is present in the config with a value and a reason.
      out-of-scope: Vale, lychee, and cspell configuration.
      spec: `lint-clean-templates`

## 2. Fix the generators

- [x] 2.1 Give `openspec/schemas/dev-reviewer/templates/spec.md` a top-level heading and the
      blank-line structure the settled floor requires. The lint-clean form is proven to still
      validate — `openspec/changes/add-architecture-writer/specs/` uses it today.
      files: `openspec/schemas/dev-reviewer/templates/spec.md`
      probe: a delta seeded from the template passes markdownlint against the settled floor AND `openspec validate --strict` reports valid.
      out-of-scope: changing the OpenSpec requirement or scenario grammar.
      spec: `lint-clean-templates`

- [x] 2.2 Audit the remaining shipped templates (`proposal`, `design`, `tasks`, `review-log`,
      `docs`, and the `learnings/` entry shape) and fix each to emit output passing the settled
      floor.
      files: `openspec/schemas/dev-reviewer/templates/*.md`, `templates/*.md`
      probe: output seeded from each template passes markdownlint against the settled floor; `learnings/` entries no longer fail on first heading level.
      out-of-scope: changing what any template asks the author to write.
      spec: `lint-clean-templates`

- [x] 2.3 Add a regression guard that fails when a shipped template emits output its own gate
      rejects, and reports what it scanned rather than reporting a false clean.
      files: `justfile.opsx`, `tools/` as needed
      probe: breaking a template on purpose fails the guard and names it; the guard names each template it checked; a guard run with no templates reports nothing-checked, not clean.
      out-of-scope: guarding Vale or link checking.
      spec: `lint-clean-templates`

## 3. Clear the backlog

- [x] 3.1 Clear `openspec/**` (230 errors). Structural edits only — blank lines and heading
      levels; any content change in the diff is a defect.
      files: `openspec/**/*.md`
      probe: `openspec validate --strict` passes for every change and spec after the pass; `git diff` shows only blank-line and heading edits; the area is clean against the settled floor.
      out-of-scope: editing requirement or scenario text.
      spec: `lint-clean-templates`

- [x] 3.2 Clear `agents/**` (54 errors). These are agent system prompts — structural edits must
      not alter a single instruction.
      files: `agents/*.md`
      probe: the area is clean against the settled floor; `git diff` shows only blank-line and heading edits.
      out-of-scope: changing any agent instruction, tool list, or model.
      spec: `lint-clean-templates`

- [x] 3.3 Clear the remainder (~22 errors across `README.md`, `SHAKEDOWN.md`, `learnings/**`,
      `goals/**`) — mostly fenced blocks missing a language and fences missing blank lines.
      files: `README.md`, `SHAKEDOWN.md`, `learnings/*.md`, `goals/*.md`
      probe: `just docs-lint` markdownlint stage reports clean across the repo.
      out-of-scope: rewriting README prose or the box diagram.
      spec: `lint-clean-templates`

## 4. Wire the gate

- [x] 4.1 Add a CI workflow that runs the markdownlint floor and `just check-templates` on push
      and pull request for markdown changes, failing on any violation. This is the gate this
      change settled and cleared; Vale/cspell/lychee are deferred (task 5.2) until their content
      is clean, so CI stays green on merge. The local `docs-lint` three-state behaviour is
      unchanged.
      files: `.github/workflows/`
      probe: a branch with a deliberate markdown lint error goes red and names the rule; a clean branch goes green; a regressed template fails via check-templates.
      out-of-scope: changing the local `docs-lint` recipe exit semantics; enforcing Vale/cspell/lychee.
      spec: `docs-gate-ci`

- [ ] 4.2 Verify the workflow on a real run — a workflow on a branch cannot be dispatched until it
      reaches the default branch, so this is post-merge verification.
      files: none
      probe: a real CI run on `main` reports the markdownlint floor and template guard green, evidenced by the job log.
      out-of-scope: any code change; verification only.
      spec: `docs-gate-ci`

## 5. Deferred

- [ ] 5.1 Move lychee to a scheduled run if per-push link checking proves flaky against
      rate-limited hosts. Record the decision rather than silently applying it.
      probe: link checking runs on a schedule and a broken link still surfaces within a day.

- [ ] 5.2 Bring Vale, cspell, and lychee to green and add them to the CI gate, one tool at a
      time — clean the ~49 cspell unknown words, sync the Vale styles, and resolve any dead
      links — so the full `docs-lint` runs in CI, not just the markdownlint floor.
      probe: each tool passes locally, then is added to the workflow with the build staying green.
