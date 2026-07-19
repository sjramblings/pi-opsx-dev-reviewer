import { test, expect } from "bun:test";
import {
  parseDelta, parseTasks, section, computeThesis, render,
  type Change, type Model,
} from "./evolution-timeline.ts";

test("parseDelta reads the operation from each header, not a default", () => {
  const md = [
    "## ADDED Requirements",
    "### Requirement: A adds",
    "#### Scenario: a1",
    "## MODIFIED Requirements",
    "### Requirement: B changes",
    "#### Scenario: b1",
    "#### Scenario: b2",
    "## REMOVED Requirements",
    "### Requirement: C goes",
  ].join("\n");
  const reqs = parseDelta(md);
  expect(reqs.map((r) => r.op)).toEqual(["ADDED", "MODIFIED", "REMOVED"]);
  expect(reqs[0].scenarios).toEqual(["a1"]);
  expect(reqs[1].scenarios).toEqual(["b1", "b2"]);
  expect(reqs[2].scenarios).toEqual([]);
});

test("parseTasks counts checked over total from the checkbox ledger", () => {
  const md = "## 1. Group\n- [x] 1.1 done\n- [ ] 1.2 open\n- [X] 1.3 done too\n";
  expect(parseTasks(md)).toEqual({ done: 2, total: 3 });
});

test("section extracts a named proposal section body", () => {
  const md = "# Title\n## Why\nbecause reasons\n## What Changes\n- a thing\n";
  expect(section(md, "Why")).toBe("because reasons");
  expect(section(md, "What Changes")).toBe("- a thing");
});

function change(op: string, archived: boolean): Change {
  return {
    id: "c", title: "c", why: "", what: "", archived, committed: true, date: "2026-01-01",
    capabilities: [{ name: "cap", requirements: [{ op, title: "r", scenarios: ["s"] }] }],
    tasks: { done: 1, total: 1 }, hasDesign: false, hasProbes: false,
    reqCount: 1, scenarioCount: 1,
  };
}

test("an all-added model computes the accretion thesis with zero retractions", () => {
  const changes = [change("ADDED", true), change("ADDED", false), change("ADDED", false)];
  const t = computeThesis({
    changes,
    totals: { changes: 3, requirements: 3, scenarios: 3, archived: 1 },
    capabilityCount: 1,
  });
  expect(t.headline.toLowerCase()).toContain("zero retractions");
  expect(t.subhead.toLowerCase()).toContain("accretion");
});

test("a modified-and-mostly-archived model is not described as accretion", () => {
  const changes = [change("MODIFIED", true), change("REMOVED", true)];
  const t = computeThesis({
    changes,
    totals: { changes: 2, requirements: 2, scenarios: 2, archived: 2 },
    capabilityCount: 1,
  });
  expect(t.headline.toLowerCase()).not.toContain("zero retractions");
  expect(t.subhead.toLowerCase()).toContain("reshaped");
});

test("computeThesis never emits an empty headline or subhead", () => {
  for (const [op, arch, reqs] of [["ADDED", 0, 0], ["MODIFIED", 5, 5], ["ADDED", 5, 5]] as const) {
    const t = computeThesis({
      changes: reqs ? [change(op, arch > 0)] : [],
      totals: { changes: 5, requirements: reqs, scenarios: reqs, archived: arch },
      capabilityCount: 2,
    });
    expect(t.headline.trim().length).toBeGreaterThan(0);
    expect(t.subhead.trim().length).toBeGreaterThan(0);
  }
});

const model: Model = {
  repo: "r", generated: "2026-01-01", thesis: { headline: "h", subhead: "s" },
  changes: [], capabilityCount: 0,
  totals: { changes: 0, requirements: 0, scenarios: 0, tasksDone: 0, tasksTotal: 0, archived: 0 },
};

test("render injects the model at the single injection point", () => {
  const out = render("<style>__THEME__</style><x>__MODEL__</x>", model);
  expect(out).toContain('"repo":"r"');
  expect(out).not.toContain("__MODEL__");
});

test("render throws when the template lacks the injection point", () => {
  expect(() => render("<style>__THEME__</style><x>no slot</x>", model)).toThrow(/injection point/);
});

test("render neutralises a script terminator hidden in model content", () => {
  const evil: Model = { ...model, repo: "</script><script>alert(1)</script>" };
  const out = render("<style>__THEME__</style><x>__MODEL__</x>", evil);
  // the raw closing sequence must not survive intact inside the data block
  expect(out).not.toContain("</script><script>alert(1)");
  expect(out).toContain("<\\/script");
});
