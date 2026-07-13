/*
 * tool-events -- best-effort append of a BLOCKED tool call to memory/tool-events.jsonl.
 *
 * The guards already intercept every tool call and know what they refused and why; this
 * captures that high-signal subset (blocks, not every call -- the pi session jsonl already
 * has every call) so it can be assessed into learnings by tools/assess-tool-events.ts.
 *
 * Fail-OPEN by contract: logging must NEVER change or break a guard decision. Every path
 * is wrapped so a write failure is swallowed. If this file ever fails to load, the guard
 * that imports it fails to load too -- which the harness-selftest canary turns into a loud
 * HALT, so the failure is never silent.
 *
 * pi-loader note (LOAD-BREAKERS -- do not reintroduce): no regex literals, no raw backticks,
 * no apostrophes (even in comments or strings). Keep it string-methods only. This file is
 * linted by "just check-extensions" alongside the guards.
 */

import { appendFileSync, mkdirSync } from "fs";
import { join } from "path";

function currentAgent(): string {
	const raw = process.env.PI_SUBAGENT_STACK;
	if (!raw) return "main";
	try {
		const stack = JSON.parse(raw);
		if (Array.isArray(stack) && stack.length > 0) {
			const last = stack[stack.length - 1];
			if (typeof last === "string") return last;
		}
	} catch {
		// unparseable stack -> unknown; fall through to main
	}
	return "main";
}

export function logBlocked(guard: string, tool: string, reason: string, target: unknown): void {
	try {
		const dir = join(process.cwd(), "memory");
		mkdirSync(dir, { recursive: true });
		const t = typeof target === "string" ? target.slice(0, 200) : "";
		const rec = {
			ts: new Date().toISOString(),
			agent: currentAgent(),
			guard: guard,
			tool: tool,
			reason: reason.slice(0, 160),
			target: t,
		};
		appendFileSync(join(dir, "tool-events.jsonl"), JSON.stringify(rec) + "\n");
	} catch {
		// fail-open: a logging failure must never affect the guard.
	}
}
