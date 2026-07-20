# algorithm-grafts Specification

## Purpose

TBD - created by archiving change add-algorithm-grafts. Update Purpose after archive.

## Requirements

### Requirement: Learnings carry a refutation core

Every learning SHALL record `conjectured → refuted_by → learned → criterion_now`, and the
template, README, and retro workflow SHALL specify it.

#### Scenario: The template and existing learnings carry the refutation block

- **WHEN** a learning file or the template is inspected
- **THEN** it contains a `## Refutation` section with the four fields

#### Scenario: Retro writes learnings in refutation form

- **WHEN** `/opsx-retro` distils a scoped learning
- **THEN** the instruction requires the conjecture/refutation/learned/criterion_now shape

### Requirement: Bug fixes are reproduce-first

A bug-fix task SHALL begin with a failing reproduction, and the reviewer SHALL BLOCK a bug-fix
diff that has no red→green reproduction evidence.

#### Scenario: The rule is enforced across the surfaces

- **WHEN** AGENTS.md, the reviewer prompt, and the schema `tasks` instruction are inspected
- **THEN** each states that a bug-fix task's first probe is a failing reproduction and a fix with no repro is a BLOCK

### Requirement: A commitment-boundary advisor is available

The harness SHALL provide a `/opsx-advise` prompt that requests a cross-family opinion on the
approach at commitment boundaries, and SHALL install it.

#### Scenario: The advise prompt exists and is installed

- **WHEN** the prompts directory and install.sh are inspected
- **THEN** `opsx-advise.md` exists and `install.sh` copies it into the global prompts dir

#### Scenario: It advises, it does not gate

- **WHEN** `/opsx-advise` runs
- **THEN** it relays a verdict and explicitly states it advises rather than blocks

### Requirement: A propose-only meta-loop improves the harness itself

`/opsx-retro` SHALL write a per-change reflection, and `/opsx-compost` SHALL mine reflections
and the empirical signals and propose process/doctrine changes — propose-only, never applied
unattended.

#### Scenario: Retro records a reflection

- **WHEN** `/opsx-retro` completes
- **THEN** it appends a reflection line to `memory/reflections.jsonl`

#### Scenario: Compost proposes doctrine changes from evidence, propose-only

- **WHEN** `/opsx-compost` runs
- **THEN** it reads reflections + tool-events + trust + goals and may propose a process/doctrine change, and states nothing is applied without human sign-off
