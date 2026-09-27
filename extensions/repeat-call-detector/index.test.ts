import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import repeatCallDetector, { callKey, DEFAULT_REPEAT_LIMIT, repeatLimit } from "./index.ts";

type Decision = { block: true; reason: string } | undefined;
type Event = { toolName: string; input?: Record<string, unknown> };
type Handler = (event: Event) => Promise<Decision>;

const originalCwd = process.cwd();
const originalLimit = process.env.OPSX_REPEAT_CALL_LIMIT;
const roots: string[] = [];

afterEach(() => {
	process.chdir(originalCwd);
	if (originalLimit === undefined) delete process.env.OPSX_REPEAT_CALL_LIMIT;
	else process.env.OPSX_REPEAT_CALL_LIMIT = originalLimit;
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function load(limit?: string): { handler: Handler; root: string } {
	const root = mkdtempSync(join(tmpdir(), "repeat-call-test-"));
	roots.push(root);
	process.chdir(root);
	if (limit === undefined) delete process.env.OPSX_REPEAT_CALL_LIMIT;
	else process.env.OPSX_REPEAT_CALL_LIMIT = limit;
	let handler: Handler | undefined;
	repeatCallDetector({
		on(name: string, registered: Handler): void {
			if (name === "tool_call") handler = registered;
		},
	});
	if (handler === undefined) throw new Error("repeat-call-detector did not register a handler");
	return { handler, root };
}

const bash = (command: string): Event => ({ toolName: "bash", input: { command } });

test("the eighth identical call is blocked, the first seven pass", async () => {
	const { handler, root } = load();
	for (let i = 1; i <= 7; i++) expect(await handler(bash("sh -n x.sh"))).toBeUndefined();
	const eighth = await handler(bash("sh -n x.sh"));
	expect(eighth?.block).toBe(true);
	expect(eighth?.reason).toContain("blocked call 8 in a row to bash");
	const log = join(root, "memory", "tool-events.jsonl");
	expect(existsSync(log)).toBe(true);
	const record = JSON.parse(readFileSync(log, "utf8").trim().split("\n").at(-1) ?? "{}");
	expect(record.guard).toBe("repeat-call-detector");
	expect(record.target).toBe("sh -n x.sh");
});

test("calls past the limit stay blocked until a distinct call", async () => {
	const { handler } = load("3");
	await handler(bash("a"));
	await handler(bash("a"));
	expect((await handler(bash("a")))?.block).toBe(true);
	expect((await handler(bash("a")))?.block).toBe(true);
	expect(await handler(bash("b"))).toBeUndefined();
	expect(await handler(bash("a"))).toBeUndefined();
});

test("a distinct call resets the streak", async () => {
	const { handler } = load();
	for (let i = 0; i < 7; i++) await handler(bash("same"));
	expect(await handler(bash("different"))).toBeUndefined();
	for (let i = 0; i < 7; i++) expect(await handler(bash("same"))).toBeUndefined();
});

test("the same input on a different tool is a different call", async () => {
	const { handler } = load("2");
	expect(await handler({ toolName: "read", input: { path: "a" } })).toBeUndefined();
	expect(await handler({ toolName: "grep", input: { path: "a" } })).toBeUndefined();
});

test("key order does not defeat the detector", async () => {
	expect(callKey("read", { path: "a", offset: 1 })).toBe(callKey("read", { offset: 1, path: "a" }));
	expect(callKey("x", { a: { c: 1, b: 2 } })).toBe(callKey("x", { a: { b: 2, c: 1 } }));
	const { handler } = load("2");
	await handler({ toolName: "read", input: { path: "a", offset: 1 } });
	expect((await handler({ toolName: "read", input: { offset: 1, path: "a" } }))?.block).toBe(true);
});

test("an invalid limit falls back to the default instead of disabling the guard", () => {
	expect(repeatLimit(undefined)).toBe(DEFAULT_REPEAT_LIMIT);
	for (const bad of ["", "0", "1", "-4", "abc", "2.5"]) expect(repeatLimit(bad)).toBe(DEFAULT_REPEAT_LIMIT);
	expect(repeatLimit("5")).toBe(5);
});

test("each load starts with fresh state", async () => {
	const first = load("2");
	await first.handler(bash("a"));
	const second = load("2");
	expect(await second.handler(bash("a"))).toBeUndefined();
});
