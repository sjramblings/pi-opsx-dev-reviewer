# shared-theme — delta

## ADDED Requirements

### Requirement: One theme asset backs both HTML outputs

The design tokens SHALL live in a single shared asset that both the architecture HTML template
and the evolution-timeline template inline at build time. Neither template SHALL carry its own
private copy of the token set.

#### Scenario: A theme edit reaches both outputs

- **WHEN** the shared theme asset changes a token value
- **THEN** a re-render of both the architecture HTML and the evolution timeline reflects the new value

#### Scenario: Outputs stay self-contained

- **WHEN** either HTML page is rendered
- **THEN** it inlines the theme and references no external stylesheet, font, or script

### Requirement: The shared theme keeps light and dark support

The shared theme SHALL define both light and dark palettes and respond to the viewer's system
preference and to a manual toggle.

#### Scenario: System dark preference is honoured

- **WHEN** a page is opened under a dark system preference with no manual override
- **THEN** the dark palette is applied
