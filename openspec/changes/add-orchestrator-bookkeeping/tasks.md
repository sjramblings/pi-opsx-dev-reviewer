# Tasks—add-orchestrator-bookkeeping

> Removes the per-clerical-act subagent spawn from change close-out. Sections 1 and 2 build tools that
> nothing calls yet; section 3 admits them to `force-delegate`; section 4 points the protocol at them.
> That order is deliberate—protocol text lands last so no window exists where the loop instructs a
> command the guard still blocks.
>
> **Granularity.** A task is sized to be worth its briefing cost. Every developer spawn is a fresh
> process that ingests roughly 49k tokens of context before it produces anything—measured across 103
> subagent calls at 5.02M input to 877k output, 87% of that session total. So implementation and its
> tests live in the SAME task: splitting them pays the cold start twice to review one piece of work,
> and the reviewer judges better with the tests in front of it. This list was consolidated from 18
> tasks to 9 on that basis; task 1.1 was already complete and is unchanged.
>
> **Parallelism.** Each task carries a `parallel:` group. Two tasks may be dispatched concurrently
> only when their groups differ, their `files:` sets are disjoint, AND worktree isolation is active
> (`add-worktree-isolation`). Until that lands the loop runs sequentially—concurrent writers on one
> tree have already caused a repository-revert collision here. The annotation is what makes
> concurrency switch-on-able later; it is not permission to run concurrently today.

## 1. Verdict recorder (spec: verdict-ledger-fidelity)

- [x] 1.1 Add `tools/record-verdict.ts <change> <session.jsonl>`: select the LAST transcript entry with
      `role: "toolResult"` and `toolName: "subagent"` whose text contains a `VERDICT:` line, and append
      its `message.content[]` text byte-identically to `openspec/changes/<change>/review-log.md` under
      a `## Task <id>` heading. Append-only. Idempotent on `toolCallId`—refuse if absent. Fail closed
      with a named reason on missing/malformed transcript, writing nothing.
      files: `tools/record-verdict.ts`
      probe: against a fixture transcript, the appended block is byte-identical to the fixture's reviewer text (`diff` clean); a second run leaves the file unchanged (`sha256` equal).
      out-of-scope: the `just` recipe (1.2); guard admission (section 3).
      parallel: A
      spec: `verdict-ledger-fidelity`

- [x] 1.2 Finish the recorder: ship `tools/record-verdict.test.ts` plus a committed fixture transcript
      covering verbatim append, last-result selection among several `subagent` results, idempotent
      re-run, absent-`toolCallId` refusal, no-verdict-present refusal, malformed-`content` refusal
      (including the non-subagent malformed entry that the first review caught as a P1), and prior
      entries preserved byte-identically. Add a thin `just record-verdict change session` recipe that
      only invokes `bun tools/record-verdict.ts`, with no shell mutation of its own. Then confirm the
      recorded shape satisfies the existing archive gate unchanged—`archive-check` greps `^VERDICT:`
      and attests by sha256, so the recorder conforms to that gate rather than the gate moving.
      files: `tools/record-verdict.test.ts`, `tools/fixtures/session-with-verdicts.jsonl`, `justfile.opsx`
      probe: `bun test tools/record-verdict.test.ts` passes with every listed case named; `just record-verdict <change> <fixture>` appends exactly one entry and the recipe body contains no `mv`, `rm`, `cp`, `sed -i`, or redirection; after recording N verdicts `just archive-check <change>` reports N verdict(s); hand-editing one entry then re-running fails on attestation mismatch.
      out-of-scope: guard admission (3.1); live pi session testing (3.2).
      parallel: A
      spec: `verdict-ledger-fidelity`

## 2. Promotion safety (spec: spec-promotion-safety)

- [ ] 2.1 **Reproduce, then gate the destructive promotion.** Write the failing test first: build a
      temp `openspec` tree where a main spec holds a requirement with a descriptive body and two
      scenarios, and a delta `## MODIFIED` restates only one new scenario; run the promotion path;
      assert the body and both original scenarios survive. That test MUST fail against today's tree.
      Then add `tools/promote-guard.ts <change>`: for each delta `## MODIFIED` requirement, compare its
      scenario-name set and body presence against the same requirement in
      `openspec/specs/<capability>/spec.md`; refuse (non-zero) when the main-spec scenario names are
      not a subset of the delta names, or when the delta omits a body the main spec has. Name the
      capability, the requirement, and every scenario that would be lost, and direct the operator to
      the agent-driven sync for that capability only. Pass when: ADDED-only, full restatement, or no
      main spec exists.
      files: `tools/promote-guard.ts`, `tools/promote-guard.test.ts`
      probe: RED FIRST—`bun test tools/promote-guard.test.ts` FAILS before the guard exists, showing the scenario count fall from 3 to 1 and the body removed; GREEN after—the promotion is refused, the main specs are byte-identical afterwards, and the full-restatement, ADDED-only, and no-main-spec cases all pass.
      out-of-scope: fixing the `openspec` CLI (not ours to fix—we gate it); `REMOVED`/`RENAMED` shapes.
      parallel: B
      spec: `spec-promotion-safety`

- [ ] 2.2 Add the one-command close-out: a thin `just archive-change change` recipe chaining
      fail-closed, in order, `just archive-check <change>` → `bun tools/promote-guard.ts <change>` →
      `openspec archive <change> -y` → lint normalisation restricted to the promoted spec files. No
      `mv`, `rm`, or `mkdir` of its own—`openspec` performs the move. The lint pass exists because
      promotion strips the blank line after `## Purpose` and `## Requirements` and adds a trailing
      blank, which fails the repo markdownlint gate and was previously cleaned by hand.
      files: `justfile.opsx`
      probe: with a refusing guard, `openspec archive` is never invoked and `openspec list` still shows the change active; with a clean change, one command promotes and archives, `markdownlint-cli2` reports the promoted specs clean with no follow-up commit, and `git status` shows no unrelated file modified.
      out-of-scope: running `/opsx-retro` (judgement, stays in the protocol).
      parallel: B
      spec: `spec-promotion-safety`

## 3. The bookkeeping channel (spec: orchestrator-bookkeeping)

- [ ] 3.1 Open the bounded channel and gate it, in one pass. Add `MAIN_BASH_WRITERS` to
      `extensions/force-delegate/index.ts`, mirroring `SCOPED_BASH_WRITERS` in
      `extensions/architect-scope/index.ts`: `just` mapped to exactly
      `{archive-change, record-verdict}`, pinned on `tokens[1]`; block `--out`/`-o`/`--out=`; keep the
      existing `DANGEROUS` regex, per-segment `CHAIN_SPLIT` checking, and `ENV_ASSIGN` rejection.
      `write`/`edit` stay unconditionally blocked. Ship with it the adversarial set in
      `extensions/force-delegate/index.test.ts` (both recipes allowed; `just deploy` blocked; bare
      `just` blocked; redirection blocked; `--out`/`-o` blocked; `GIT_PAGER=rm just archive-change x`
      blocked; `&& rm -rf src` blocked; backgrounded `&` blocked; `write`/`edit` blocked; the
      `PI_SUBAGENT_DEPTH > 0` no-op path), and extend `just check-extensions` with a recipe-thinness
      assertion failing when either admitted recipe contains `rm`, `mv`, `cp`, `mkdir`, `sed -i`, or
      redirection instead of delegating to `bun tools/*.ts`, `just archive-check`, `openspec`, or the
      lint fixer. **LOAD-BREAKERS (LRN-0001): `new RegExp` only, no raw backtick, no apostrophe
      anywhere including comments, even quote counts.**
      files: `extensions/force-delegate/index.ts`, `extensions/force-delegate/index.test.ts`, `justfile.opsx`
      probe: `bun build` clean; `bun test extensions/force-delegate` passes with every listed case named and none asserting a bypass is allowed; `just check-extensions` clean, and adding `rm -rf /tmp/x` to `archive-change` makes it exit non-zero naming that recipe.
      out-of-scope: `architect-scope` and `developer-guard` behaviour.
      parallel: C
      spec: `orchestrator-bookkeeping`

- [ ] 3.2 **Live shakedown—unit tests are not evidence the pi loader accepted the file.** After
      `./install.sh --here` re-copies the guards, confirm in a real pi session: `harness-selftest` does
      not HALT; a main-agent `write` is still BLOCKED; `rm` is still BLOCKED; both admitted recipes
      RUN; `just deploy` is BLOCKED. Record the transcript in `SHAKEDOWN.md`. This task exists because
      `bun build` and 29 green tests once all passed while the real pi loader had silently disabled
      the guard—and because the guards were found entirely uninstalled in this checkout on 2026-07-30,
      with the canary that should have caught that sitting in the same uninstalled set.
      files: `SHAKEDOWN.md`
      probe: the recorded session shows all five outcomes, and `memory/tool-events.jsonl` gains real `force-delegate` block entries (before this change it held only test fixtures).
      out-of-scope: automating the shakedown.
      parallel: none (must follow 3.1)
      spec: `orchestrator-bookkeeping`

## 4. Protocol alignment (spec: orchestrator-bookkeeping)

- [ ] 4.1 Make the three protocol surfaces agree in one pass, because they must not contradict each
      other: `prompts/opsx-loop.md` step 3c (the orchestrator records the verdict itself via
      `just record-verdict`, replacing "the developer does this write—you are read-only under
      force-delegate"; keep the tick with the developer and keep ledger-before-tick ordering);
      `openspec/schemas/dev-reviewer/schema.yaml` `apply.instruction` step 3 and the `review-report`
      artifact instruction; and `templates/AGENTS.md`, which also gains the close-out line—one command,
      `just archive-change <change>`. Point the post-last-task sequence at `just archive-change`
      instead of a bare `just archive-check`.
      files: `prompts/opsx-loop.md`, `openspec/schemas/dev-reviewer/schema.yaml`, `templates/AGENTS.md`
      probe: no surface still instructs the developer to append the ledger; all three name the recipe; `openspec schema validate dev-reviewer` reports valid; `openspec status --change add-orchestrator-bookkeeping --json` still resolves all seven artifacts.
      out-of-scope: the developer/reviewer protocol itself.
      parallel: none (must follow 3.1)
      spec: `orchestrator-bookkeeping`

- [ ] 4.2 Demote the two prose skills to the gated fallback: `.pi/skills/openspec-archive-change/` and
      `.pi/skills/openspec-sync-specs/` and their `.cursor/` twins state that the sanctioned path is
      `just archive-change`, and that they are invoked only when the promotion guard refuses—for the
      named capability only. Do not delete them; the intelligent-merge instructions are the
      load-bearing fallback for a partial `## MODIFIED`.
      files: `.pi/skills/openspec-archive-change/SKILL.md`, `.pi/skills/openspec-sync-specs/SKILL.md`, `.cursor/skills/openspec-archive-change/SKILL.md`, `.cursor/skills/openspec-sync-specs/SKILL.md`
      probe: each of the four files names `just archive-change` as the default path and the guard refusal as its trigger; the merge instructions remain intact.
      out-of-scope: rewriting the merge instructions themselves.
      parallel: D
      spec: `spec-promotion-safety`

## 5. Documentation (artifact: docs)

- [ ] 5.1 Delegate the `docs` artifact to the `tech-writer` subagent: document the one-command
      close-out, the bookkeeping-versus-authored-mutation boundary and why the guard admits exactly
      two recipes, and the partial-MODIFIED refusal with the operator fallback. Update `README.md` and
      `index.html` for the changed user-facing surface, verified against shipped code rather than
      against this proposal.
      files: `docs/**`, `README.md`, `index.html`
      probe: `just docs-lint` clean (or PARTIAL naming absent tools); README and index.html both describe `just archive-change`; no doc claims a behaviour not present in the shipped tools.
      out-of-scope: `docs/architecture/**` (owned by `architecture-writer`).
      parallel: none (must follow 4.1)
      spec: `orchestrator-bookkeeping`
