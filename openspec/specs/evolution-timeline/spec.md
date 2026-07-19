# evolution-timeline Specification

## Purpose
TBD - created by archiving change add-evolution-timeline. Update Purpose after archive.
## Requirements
### Requirement: The tool extracts a faithful model from the OpenSpec repo

The tool SHALL read `openspec/changes/` (active and `archive/`), `openspec/specs/`, and
git history of a target repo, and produce a model whose counts equal the repo's actual
content — no sampling, no truncation, no invented entries.

#### Scenario: Every change folder is represented

- **WHEN** the tool runs against a repo with N change folders (active plus archived)
- **THEN** the model contains exactly N changes, each with its id, title, capabilities, requirement count, scenario count, and task ledger

#### Scenario: Requirement operations are read, not assumed

- **WHEN** a spec delta declares requirements under `## ADDED`, `## MODIFIED`, or `## REMOVED` headers
- **THEN** each requirement carries the operation from its own header, so a repo that only ever adds is reported as add-only rather than defaulted to it

#### Scenario: Task progress reflects the checkbox ledger

- **WHEN** a change's `tasks.md` contains checked (`- [x]`) and unchecked (`- [ ]`) items
- **THEN** the change's task metric is the checked count over the total, matching the file

### Requirement: An uncommitted change is dated and marked without inventing history

The tool SHALL derive each change's date from the first-commit date of its folder, and
where a change is untracked in git it SHALL fall back to file mtime and flag the change
as uncommitted rather than presenting a fabricated commit date.

#### Scenario: A committed change uses its first-commit date

- **WHEN** a change folder exists in git history
- **THEN** its date is the date the folder was first added and it is not flagged uncommitted

#### Scenario: An untracked change is flagged

- **WHEN** a change folder has no git history
- **THEN** its date falls back to file mtime and the change is flagged uncommitted in the model and the page

### Requirement: The page is self-contained and works from data alone

The tool SHALL emit a single HTML file with no external network dependencies (no CDN
scripts, fonts, or images) that renders the full timeline from the embedded model without
a server or a model in the loop.

#### Scenario: The page opens offline

- **WHEN** the emitted HTML is opened directly from the filesystem with no network
- **THEN** the stat row, cumulative chart, and change spine all render from the embedded model

#### Scenario: The embedded model cannot break out of its script tag

- **WHEN** the model is serialised into the page
- **THEN** the serialisation is escaped so that content containing a script-closing sequence cannot terminate the data block, and generation fails loudly if it would

### Requirement: The hero thesis is a computed observation by default

The tool SHALL compute the hero headline and subhead from the model — using mechanically
checkable patterns such as all-added accretion, archive ratio, and open backlog — and
SHALL NOT emit praise or claims not derivable from the data.

#### Scenario: An all-added repo is described as accretion

- **WHEN** every requirement across every change carries the ADDED operation
- **THEN** the computed thesis states the architecture grows by accretion with zero retractions

#### Scenario: The default thesis needs no model

- **WHEN** the tool runs without narration
- **THEN** the page carries a complete, data-true thesis and no field is left as a placeholder

### Requirement: Narration is optional and never gates the deterministic page

The tool SHALL accept an externally supplied thesis file that overrides only the hero
headline and subhead, and the `evolution-narrator` subagent SHALL be the sole producer of
that file; absence of the file SHALL leave the deterministic page fully intact.

#### Scenario: A supplied thesis overrides only the hero

- **WHEN** the tool is given a valid thesis file with a headline and subhead
- **THEN** the page shows that headline and subhead and every other section is unchanged from the deterministic render

#### Scenario: A missing or invalid thesis falls back cleanly

- **WHEN** no thesis file is supplied, or the supplied file is missing required fields
- **THEN** the tool renders the computed thesis and does not fail

