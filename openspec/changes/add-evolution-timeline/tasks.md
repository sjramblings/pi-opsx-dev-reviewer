# Tasks — add-evolution-timeline

> Work sequentially. The tool's pure functions land first with tests, then the template,
> then the recipe and the narrator agent that sits on top of the finished tool.

## 1. The extractor and model

- [x] 1.1 Add `tools/evolution-timeline.ts` exporting pure functions: `parseDelta`
      (spec markdown → requirements with operation + scenarios), `parseTasks` (tasks
      markdown → done/total), and `computeThesis` (model → headline + subhead from
      mechanical patterns). No git or fs calls inside the pure functions.
- [x] 1.2 Add `collectChange` and `buildModel` that read a repo's `openspec/changes/`,
      `openspec/changes/archive/`, and `openspec/specs/`, deriving each change's date
      from first-commit date with an mtime fallback that sets `committed: false`.

## 2. Tests

- [x] 2.1 Add `tools/evolution-timeline.test.ts` covering: an ADDED/MODIFIED/REMOVED
      delta parses to the right operations; a mixed checkbox ledger yields the right
      done/total; an all-added model computes the accretion thesis; `computeThesis`
      never emits an empty headline or subhead.

## 3. The page template

- [x] 3.1 Add `tools/evolution-timeline.template.html`: masthead with thesis slot read
      from the embedded model, stat row, cumulative-requirements canvas chart
      (archived vs declared bands), date-grouped change spine, filter chips, and a
      detail drawer rendering each change's why/what and every requirement + scenario.
      Light and dark themes; no external network dependencies.
- [x] 3.2 In the tool's `main`, build the model, run `computeThesis` (or load an
      optional `--thesis <file>` override), serialise the model into the template at a
      single injection point with a fail-loud guard against a script-terminator in the
      JSON, and write the output HTML.

## 4. Recipe and narrator

- [x] 4.1 Add a `evolution-timeline` recipe to `justfile.opsx` (shared verbatim with
      installed repos) that runs the deterministic tool against a repo argument
      defaulting to `.` and writes `architecture-evolution.html`.
- [x] 4.2 Add `agents/evolution-narrator.md`: reads the extracted model, writes a
      `thesis.json` with a headline and subhead grounded only in the model, and follows
      the shipped agent body skeleton (identity, context-is-only-the-task, scope clamp
      to the thesis, method, fenced report block). The agent never edits the tool,
      the template, or any count.
