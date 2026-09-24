/*
 * tool-events -- best-effort append of a BLOCKED tool call to memory/tool-events.jsonl.
 *
 * The guards already intercept every tool call and know what they refused and why; this
 * captures that high-signal subset so tools/assess-tool-events.ts can assess it.
 *
 * Runtime records are unconditional. Inherited environment variables cannot select a
 * synthetic mode or redirect or drop runtime telemetry. Tests that need synthetic records
 * construct an isolated logger explicitly through createSyntheticTestLogger.
 *
 * Fail-OPEN by contract: logging must NEVER change or break a guard decision. Every path
 * is wrapped so a write failure is swallowed with an intentional catch. If this file ever
 * fails to load, the importing guard fails too, and harness-selftest turns that into HALT.
 *
 * pi-loader note LOAD-BREAKERS -- do not reintroduce: no regex literals, no raw backticks,
 * no apostrophes even in comments or strings. Keep it string-methods only. This file is
 * linted by just check-extensions alongside the guards.
 */

import { appendFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";

export type ToolEventKind = "runtime" | "synthetic-test";
export type BlockedLogger = (guard: string, tool: string, reason: string, target: unknown) => void;

type EventSink = {
	eventKind: ToolEventKind;
	path: () => string;
};

function currentAgent(): string {
	const raw = process.env.PI_SUBAGENT_STACK;
	if (!raw) return "main";
	try {
		const stack = JSON.parse(raw);
		if (Array.isArray(stack) && stack.length > 0) {
			const last = stack[stack.length - 1];
			if (typeof last === "string") return last;
		}
	} catch (parseError) {
		void parseError;
		// Unparseable stack means the agent identity is unavailable; retain main fallback.
	}
	return "main";
}

function loggerFor(sink: EventSink): BlockedLogger {
	return (guard: string, tool: string, reason: string, target: unknown): void => {
		try {
			const path = sink.path();
			mkdirSync(dirname(path), { recursive: true });
			const t = typeof target === "string" ? target.slice(0, 200) : "";
			const rec = {
				ts: new Date().toISOString(),
				eventKind: sink.eventKind,
				agent: currentAgent(),
				guard: guard,
				tool: tool,
				reason: reason.slice(0, 160),
				target: t,
			};
			appendFileSync(path, JSON.stringify(rec) + "\n");
		} catch (loggingError) {
			void loggingError;
			// Intentional fail-open: telemetry failure must never alter a guard decision.
		}
	};
}

// Explicit test dependency. Production guards never call this constructor and always use
// the unconditional runtime logger below.
export function createSyntheticTestLogger(path: string): BlockedLogger {
	return loggerFor({ eventKind: "synthetic-test", path: () => path });
}

const runtimeLogger = loggerFor({
	eventKind: "runtime",
	path: () => join(process.cwd(), "memory", "tool-events.jsonl"),
});

export function logBlocked(guard: string, tool: string, reason: string, target: unknown): void {
	runtimeLogger(guard, tool, reason, target);
}
