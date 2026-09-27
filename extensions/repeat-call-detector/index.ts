/*
 * repeat-call-detector -- blocks an agent that is stuck issuing the same tool call.
 *
 * A subagent in a loop re-runs one command with one input over and over, often printing
 * nothing new, so no watchdog that watches output ever fires. pi-rukas measured this class
 * (a 692-turn developer, a lens running one grep 223 times) and found a consecutive-streak
 * counter catches it where a sliding window does not. This is that idea, re-implemented.
 *
 * Every tool call is keyed by tool name plus its input as canonical JSON (object keys
 * sorted, so key order cannot defeat it). A call identical to the previous one extends the
 * streak; any different call resets it to one. When the streak reaches the limit the call is
 * blocked and logged to memory/tool-events.jsonl. Each subagent is its own pi process, so the
 * per-process state here is per-agent state.
 *
 * Limit: OPSX_REPEAT_CALL_LIMIT, an integer of at least 2, default 8. A missing or invalid
 * value uses the default -- a malformed setting must never disable the guard.
 *
 * pi-loader note LOAD-BREAKERS -- do not reintroduce: no regex literals, no raw backticks,
 * no apostrophes even in comments or strings. Checked by just check-extensions.
 *
 * Install (per OpenSpec project): copy this folder to  <repo>/.pi/extensions/
 */

import { logBlocked } from "../lib/tool-events";

export const DEFAULT_REPEAT_LIMIT = 8;

export function repeatLimit(raw: string | undefined): number {
	if (raw === undefined || raw.trim() === "") return DEFAULT_REPEAT_LIMIT;
	const n = Number(raw);
	if (Number.isInteger(n) && n >= 2) return n;
	return DEFAULT_REPEAT_LIMIT;
}

function sortKeys(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(sortKeys);
	if (value !== null && typeof value === "object") {
		const out: Record<string, unknown> = {};
		for (const key of Object.keys(value as Record<string, unknown>).sort()) {
			out[key] = sortKeys((value as Record<string, unknown>)[key]);
		}
		return out;
	}
	return value;
}

export function callKey(toolName: unknown, input: unknown): string {
	let body = "";
	try {
		body = JSON.stringify(sortKeys(input)) ?? "";
	} catch (serializeError) {
		void serializeError;
		// An unserialisable input cannot be compared; give it a key that never repeats.
		body = "unserialisable:" + String(Math.random());
	}
	return String(toolName) + " " + body;
}

export default function (pi: any) {
	const limit = repeatLimit(process.env.OPSX_REPEAT_CALL_LIMIT);
	let lastKey = "";
	let streak = 0;

	pi.on("tool_call", async (event: any) => {
		const key = callKey(event.toolName, event.input);
		if (key === lastKey) {
			streak += 1;
		} else {
			lastKey = key;
			streak = 1;
		}
		if (streak < limit) return undefined;
		const msg =
			"repeat-call-detector: blocked call " + streak + " in a row to " + String(event.toolName) +
			" with identical input (limit " + limit + "). Repeating it has not changed the outcome -- " +
			"change the approach, or stop and report the blocker to the orchestrator.";
		const target = typeof event.input?.command === "string" ? event.input.command : key;
		logBlocked("repeat-call-detector", String(event.toolName), msg, target);
		return { block: true, reason: msg };
	});
}
