# repeat-call-detector—delta

## ADDED Requirements

### Requirement: Identical consecutive tool calls are blocked at a limit

The `repeat-call-detector` extension SHALL track, per process, how many consecutive tool calls
share the same tool name and canonical input. When the streak reaches the limit
(`OPSX_REPEAT_CALL_LIMIT`, default 8) it SHALL block the call with a reason that names the
streak, and log it through the shared tool-events logger.

#### Scenario: The eighth identical call is blocked

- **WHEN** an agent issues the same bash command eight times in a row
- **THEN** calls one to seven pass and call eight is blocked

#### Scenario: A distinct call resets the streak

- **WHEN** seven identical calls are followed by one different call and then the first call again
- **THEN** none of those calls is blocked

#### Scenario: Key order does not defeat the detector

- **WHEN** two calls carry the same input object with keys in a different order
- **THEN** they count as identical

### Requirement: The extension is pi-loader safe

The extension source SHALL contain no regex literals, raw backticks, or apostrophes.

#### Scenario: check-extensions covers it

- **WHEN** `just check-extensions` runs
- **THEN** it scans `extensions/repeat-call-detector/index.ts` and reports clean
