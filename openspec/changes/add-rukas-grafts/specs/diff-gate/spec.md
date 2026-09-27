# diff-gate—delta

## ADDED Requirements

### Requirement: Net-new test skip or focus markers fail the gate

`just diff-gate` SHALL fail when the diff against its base adds more skip or focus markers
(`.skip(`, `.only(`, `.todo(`, `xit(`, `xdescribe(`, `xtest(`, `#[ignore]`, `@Disabled`,
`@pytest.mark.skip`) to a file than it removes. Markers inside string literals and comment
lines SHALL NOT count.

#### Scenario: An added skip fails

- **WHEN** the diff adds a line `it.skip("x", () => {})` to a test file
- **THEN** the gate exits non-zero and names the file

#### Scenario: A moved skip passes

- **WHEN** the diff removes one skip marker from a file and adds one to the same file
- **THEN** the gate passes

#### Scenario: A marker inside a string passes

- **WHEN** the diff adds a line containing the text `"it.skip("` only inside quotes
- **THEN** the gate passes

### Requirement: A ticked task that changed none of its declared source files fails

With `--change <name>`, the gate SHALL fail for each ticked task whose `files:` line declares
at least one source path when none of its declared paths appear in the changed set.

#### Scenario: Falsely green task fails

- **WHEN** task 1.1 is ticked, declares `tools/a.ts`, and no declared path changed
- **THEN** the gate exits non-zero naming task 1.1

#### Scenario: Docs-only task is exempt

- **WHEN** a ticked task declares only `README.md` and it did not change
- **THEN** that task produces no failure
