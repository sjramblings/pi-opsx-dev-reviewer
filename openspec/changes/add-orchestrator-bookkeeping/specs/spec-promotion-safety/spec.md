# spec-promotion-safety—delta

## ADDED Requirements

### Requirement: A destructive partial MODIFIED promotion fails closed

`tools/promote-guard.ts` SHALL compare each `## MODIFIED` requirement in a change's delta specs
against the same requirement in the main spec, and SHALL refuse the promotion when the main spec holds
scenarios the delta omits, or when the delta omits the requirement's descriptive body while the main
spec has one. On refusal it SHALL name the capability, the requirement, and each scenario that would
be lost, and SHALL leave every main spec unchanged. This guard exists because `openspec archive`
replaces a `## MODIFIED` requirement wholesale rather than merging it, so a delta that restates only
part of a requirement destroys the rest.

#### Scenario: A partial MODIFIED is refused before any spec is touched

- **WHEN** a delta modifies a requirement listing one new scenario while the main spec holds two
  other scenarios for it
- **THEN** the guard exits non-zero, names the two scenarios that would be lost, and no file under
  `openspec/specs/` is modified

#### Scenario: A full restatement is allowed

- **WHEN** a delta modifies a requirement and restates every scenario the main spec holds, plus its
  descriptive body
- **THEN** the guard passes and the deterministic promotion proceeds

#### Scenario: An ADDED-only delta is allowed

- **WHEN** a change's delta specs contain only `## ADDED Requirements`
- **THEN** the guard passes without inspecting the main specs for scenario loss

#### Scenario: A MODIFIED against a capability with no main spec is allowed

- **WHEN** a delta modifies a requirement in a capability that has no `openspec/specs/<capability>/spec.md`
- **THEN** the guard passes, because there is no existing content to destroy

#### Scenario: A refusal names the agent-driven fallback

- **WHEN** the guard refuses a promotion
- **THEN** its message directs the operator to the agent-driven sync for that capability only, not
  for the whole change

### Requirement: Promotion is deterministic by default

`just archive-change <change>` SHALL be the sanctioned close-out path and SHALL use the `openspec`
CLI for promotion and archival rather than reproducing either in prose. It SHALL run, in order: the
existing `just archive-check`, the promotion guard, `openspec archive <change> -y`, and the lint
normalisation pass. Each step SHALL be chained fail-closed, so a failure stops the sequence and
leaves the change active.

#### Scenario: A failing ledger check stops the sequence

- **WHEN** `just archive-check` fails because the review ledger is missing
- **THEN** no promotion or archival occurs and the change remains active

#### Scenario: A failing promotion guard stops the sequence

- **WHEN** the promotion guard refuses a partial MODIFIED
- **THEN** `openspec archive` is not invoked and the change remains active

#### Scenario: A clean change archives in one command

- **WHEN** the ledger check and promotion guard both pass
- **THEN** the change's deltas are promoted, the change folder is moved under
  `openspec/changes/archive/YYYY-MM-DD-<name>/`, and no subagent is spawned for either step

### Requirement: Promoted specs are lint-normalised

`just archive-change` SHALL run the lint fixer over the promoted spec files so a promotion never
leaves the tree failing lint, and SHALL restrict that pass to the files the promotion touched. This is
required because the `openspec` promotion removes the blank line after `## Purpose` and
`## Requirements` and leaves a trailing blank line, which breaks the repo markdownlint gate.

#### Scenario: A promotion leaves the specs lint-clean

- **WHEN** a promotion updates three main specs
- **THEN** the markdownlint gate reports those files clean immediately afterwards, with no manual
  follow-up commit needed

#### Scenario: The fixer touches only promoted files

- **WHEN** the lint pass runs after a promotion
- **THEN** files unrelated to the promotion are unmodified
