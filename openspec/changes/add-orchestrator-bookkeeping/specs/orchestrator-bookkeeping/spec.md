# orchestrator-bookkeeping—delta

## ADDED Requirements

### Requirement: The main agent may run a bounded set of bookkeeping recipes

`force-delegate` SHALL admit a fixed, named set of bookkeeping recipes for the main agent, keyed by
base command and pinned on the first argument, and SHALL block every other invocation of that base
command. The admitted set SHALL be exactly `just archive-change` and `just record-verdict`. The
existing deny-by-default posture is otherwise unchanged: if the command cannot be parsed with
confidence, it is blocked.

#### Scenario: An admitted recipe runs

- **WHEN** the main agent runs `just record-verdict add-foo session.jsonl`
- **THEN** the guard allows the call

#### Scenario: A non-admitted recipe is blocked

- **WHEN** the main agent runs `just deploy`
- **THEN** the guard blocks the call and names the delegation path in its reason

#### Scenario: A bare base command is blocked

- **WHEN** the main agent runs `just` with no recipe argument
- **THEN** the guard blocks the call

#### Scenario: Redirection around an admitted recipe is blocked

- **WHEN** the main agent runs `just archive-change add-foo > /tmp/out`
- **THEN** the guard blocks the call, because redirection can place output outside the recipe scope

#### Scenario: An output-destination flag on an admitted recipe is blocked

- **WHEN** the main agent runs `just archive-change add-foo --out /tmp/x`
- **THEN** the guard blocks the call

#### Scenario: An inline environment assignment is blocked

- **WHEN** the main agent runs `GIT_PAGER=rm just archive-change add-foo`
- **THEN** the guard blocks the call, because an injected environment variable can execute an
  arbitrary command

#### Scenario: An admitted recipe chained with a mutating command is blocked

- **WHEN** the main agent runs `just record-verdict add-foo session.jsonl && rm -rf src`
- **THEN** the guard blocks the call, because every chained segment must independently pass

### Requirement: Authored mutation stays delegated

`force-delegate` SHALL continue to block the `write` and `edit` tools outright for the main agent,
and SHALL continue to block any bash command that is neither on the read-only allowlist nor an
admitted bookkeeping recipe. Widening the bookkeeping channel SHALL NOT create a path by which the
main agent can author code, specs, or design artifacts.

#### Scenario: A direct write is still blocked

- **WHEN** the main agent calls the `write` tool against any path
- **THEN** the guard blocks the call and directs the work to the `developer` subagent

#### Scenario: A direct edit is still blocked

- **WHEN** the main agent calls the `edit` tool against any path
- **THEN** the guard blocks the call

#### Scenario: An arbitrary mutating shell command is still blocked

- **WHEN** the main agent runs `sed -i s/a/b/ src/app.ts`
- **THEN** the guard blocks the call

#### Scenario: The guard no-ops inside subagents

- **WHEN** the process runs with `PI_SUBAGENT_DEPTH` greater than zero
- **THEN** the guard applies no restriction, so the `developer` subagent keeps write, edit, and bash

### Requirement: The admitted recipes stay thin wrappers

Because admitting `just` makes `justfile.opsx` security-relevant, `just check-extensions` SHALL fail
when either admitted recipe contains shell mutation of its own rather than delegating to a
version-controlled `tools/*.ts` entrypoint and the existing `archive-check` recipe. The check SHALL
name the offending recipe and the disallowed construct.

#### Scenario: A recipe that grows mutation surface fails the check

- **WHEN** `just archive-change` is edited to include a direct `rm` or `mv` of a repo path
- **THEN** `just check-extensions` exits non-zero and names the recipe

#### Scenario: Thin wrappers pass the check

- **WHEN** both admitted recipes only invoke `bun tools/*.ts`, `just archive-check`, `openspec`, and
  the lint fixer
- **THEN** `just check-extensions` reports the recipe assertion clean

### Requirement: The guard extension loads under the pi tokenizer

The edited `force-delegate` extension SHALL contain no regex literal, no raw backtick, and no
apostrophe, and SHALL keep an even count of every quote character, so pi does not silently disable
it. `just check-extensions` SHALL fail when any of those constructs is reintroduced.

#### Scenario: A reintroduced load-breaker fails the check

- **WHEN** a regex literal is added to the guard source
- **THEN** `just check-extensions` exits non-zero and names the construct

#### Scenario: The guard is proven active at runtime

- **WHEN** a main-agent session starts after the change
- **THEN** the `harness-selftest` canary observes an active `force-delegate` and does not HALT

### Requirement: The apply protocol records verdicts without delegating

The apply protocol SHALL record each reviewer verdict through the bookkeeping recipe rather than by
spawning a subagent to write the ledger. `prompts/opsx-loop.md`,
`openspec/schemas/dev-reviewer/schema.yaml` step 3, and `templates/AGENTS.md` SHALL agree on that
single sequence, and a task SHALL NOT be ticked before its verdict entry exists.

#### Scenario: A verdict is recorded with no extra subagent call

- **WHEN** the reviewer returns a verdict for a task
- **THEN** the orchestrator records it through the recipe, and no subagent is spawned whose only
  purpose is writing the ledger

#### Scenario: The ledger entry precedes the tick

- **WHEN** a task is about to be marked complete
- **THEN** the verdict entry for that task is already present in `review-log.md`

#### Scenario: The three protocol surfaces do not contradict each other

- **WHEN** the loop prompt, the schema apply instruction, and `templates/AGENTS.md` are read together
- **THEN** each describes the same ledger step, with none still instructing the developer to append
