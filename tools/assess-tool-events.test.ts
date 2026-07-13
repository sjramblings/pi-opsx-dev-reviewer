import { test, expect } from "bun:test";
import { parseEvents, aggregateBlocked, findRetries, render } from "./assess-tool-events.ts";

function ev(guard: string, tool: string, reason = "r", target = "t"): string {
	return JSON.stringify({ ts: "2026-01-01", agent: "main", guard, tool, reason, target });
}

test("parseEvents tolerates blank/malformed lines", () => {
	const e = parseEvents(ev("force-delegate", "bash") + "\n\nnot json\n" + ev("branch-guard", "bash"));
	expect(e.length).toBe(2);
});

test("aggregateBlocked groups by guard+tool and ranks by count", () => {
	const events = parseEvents(
		[ev("force-delegate", "bash", "r1", "git push"), ev("force-delegate", "bash", "r2", "rm x"), ev("architect-scope", "write", "r3", "src/a.ts")].join("\n"),
	);
	const classes = aggregateBlocked(events);
	expect(classes[0].key).toBe("force-delegate / bash");
	expect(classes[0].count).toBe(2);
	expect(classes[0].targets).toContain("git push");
	expect(classes[1].key).toBe("architect-scope / write");
});

test("findRetries flags a tool input repeated >= min times", () => {
	const rec = (name: string, cmd: string) => ({ message: { content: [{ name, input: { command: cmd } }] } });
	const records = [rec("bash", "bun test"), rec("bash", "bun test"), rec("bash", "bun test"), rec("bash", "ls")];
	const retries = findRetries(records, 3);
	expect(retries.length).toBe(1);
	expect(retries[0].tool).toBe("bash");
	expect(retries[0].count).toBe(3);
});

test("findRetries below threshold returns nothing", () => {
	const rec = (cmd: string) => ({ message: { content: [{ toolName: "bash", input: { command: cmd } }] } });
	expect(findRetries([rec("a"), rec("a")], 3)).toEqual([]);
});

test("render reports clean when there is no signal", () => {
	expect(render([], [])).toContain("Clean");
});

test("render surfaces classes and retries", () => {
	const events = parseEvents([ev("developer-guard", "bash", "rm -rf", "rm -rf /")].join("\n"));
	const out = render(aggregateBlocked(events), [{ tool: "bash", input: '{"command":"x"}', count: 4 }]);
	expect(out).toContain("developer-guard / bash");
	expect(out).toContain("Retry loops");
});
