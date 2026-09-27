/*
 * record-verdict.ts — append the latest reviewer verdict from a pi session transcript.
 *
 * Runs via bun; not a pi extension.
 *
 * It also bounds the fix loop. After a BLOCK is recorded it counts that task's BLOCK entries;
 * at OPSX_MAX_BLOCK_ROUNDS (default 3) it appends one PARKED entry and exits 3, so the
 * orchestrator stops re-dispatching instead of looping forever against a reviewer that always
 * finds something. The PARKED line never begins with VERDICT:, so ledger verdict counts are
 * unchanged.
 *
 * usage: bun tools/record-verdict.ts <change> <session.jsonl>
 */

import { appendFileSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";

type JsonRecord = Record<string, unknown>;
type VerdictEntry = { text: string; toolCallId: string };

export type RecordVerdictResult = {
	status: "appended" | "already-recorded" | "parked";
	taskId: string;
	toolCallId: string;
	/** Present only when the task has at least one BLOCK entry. */
	blockRounds?: number;
	cap?: number;
};

export const DEFAULT_BLOCK_CAP = 3;

export class RecordVerdictError extends Error {
	constructor(
		readonly reason: string,
		message: string,
	) {
		super(message);
		this.name = "RecordVerdictError";
	}
}

function fail(reason: string, message: string): never {
	throw new RecordVerdictError(reason, message);
}

function isRecord(value: unknown): value is JsonRecord {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readText(path: string, reason: string): string {
	try {
		return readFileSync(path, "utf8");
	} catch (error: unknown) {
		const detail = error instanceof Error ? error.message : String(error);
		return fail(reason, `${path}: ${detail}`);
	}
}

function contentText(content: unknown, lineNumber: number): string {
	if (!Array.isArray(content) || content.length === 0) {
		return fail(
			"MALFORMED_SUBAGENT_CONTENT",
			`transcript line ${lineNumber}: message.content must be a non-empty array`,
		);
	}

	let text = "";
	for (const [index, block] of content.entries()) {
		if (!isRecord(block) || block.type !== "text" || typeof block.text !== "string") {
			return fail(
				"MALFORMED_SUBAGENT_CONTENT",
				`transcript line ${lineNumber}: message.content[${index}] must be a text block`,
			);
		}
		text += block.text;
	}
	return text;
}

function latestVerdict(transcript: string): VerdictEntry {
	let selected: { text: string; toolCallId: unknown; lineNumber: number } | null = null;
	const lines = transcript.split(/\n/);

	for (const [index, line] of lines.entries()) {
		if (line.trim() === "") continue;

		let parsed: unknown;
		try {
			parsed = JSON.parse(line) as unknown;
		} catch (error: unknown) {
			const detail = error instanceof Error ? error.message : String(error);
			return fail("MALFORMED_TRANSCRIPT_JSON", `transcript line ${index + 1}: ${detail}`);
		}
		if (!isRecord(parsed)) {
			return fail("MALFORMED_TRANSCRIPT_ENTRY", `transcript line ${index + 1}: expected an object`);
		}
		if (parsed.type !== "message") continue;
		if (!isRecord(parsed.message)) {
			return fail(
				"MALFORMED_TRANSCRIPT_ENTRY",
				`transcript line ${index + 1}: message must be an object`,
			);
		}

		const message = parsed.message;
		if (!Array.isArray(message.content)) {
			return fail(
				"MALFORMED_TRANSCRIPT_CONTENT",
				`transcript line ${index + 1}: message.content must be an array`,
			);
		}
		if (message.role !== "toolResult" || message.toolName !== "subagent") continue;
		const text = contentText(message.content, index + 1);
		if (/^VERDICT:[^\r\n]*\r?$/m.test(text)) {
			selected = { text, toolCallId: message.toolCallId, lineNumber: index + 1 };
		}
	}

	if (selected === null) {
		return fail(
			"VERDICT_NOT_FOUND",
			"no subagent toolResult containing a line beginning with VERDICT: was found",
		);
	}
	if (typeof selected.toolCallId !== "string" || selected.toolCallId.trim() === "") {
		return fail(
			"TOOL_CALL_ID_MISSING",
			`transcript line ${selected.lineNumber}: selected verdict has no toolCallId`,
		);
	}
	return { text: selected.text, toolCallId: selected.toolCallId };
}

function nextTaskId(tasks: string): string {
	for (const line of tasks.split(/\r?\n/)) {
		const match = /^- \[ \] (\d+(?:\.\d+)*)\b/.exec(line);
		if (match?.[1]) return match[1];
	}
	return fail("TASK_ID_NOT_FOUND", "tasks.md has no unchecked task identifier");
}

function appendSeparator(existing: string): string {
	if (existing === "" || existing.endsWith("\n\n")) return "";
	if (existing.endsWith("\n")) return "\n";
	return "\n\n";
}

function recordedTaskId(ledger: string, marker: string): string {
	const markerIndex = ledger.indexOf(marker);
	const headings = [...ledger.slice(0, markerIndex).matchAll(/^## Task (\d+(?:\.\d+)*)\b/gm)];
	const taskId = headings.at(-1)?.[1];
	if (!taskId) {
		return fail("MALFORMED_IDEMPOTENCE_MARKER", "recorded toolCallId has no preceding task heading");
	}
	return taskId;
}

export function blockCap(raw: string | undefined = process.env.OPSX_MAX_BLOCK_ROUNDS): number {
	if (raw === undefined || raw === "") return DEFAULT_BLOCK_CAP;
	if (!/^[1-9][0-9]*$/.test(raw)) {
		return fail("INVALID_BLOCK_CAP", `OPSX_MAX_BLOCK_ROUNDS must be a positive integer, got "${raw}"`);
	}
	return Number(raw);
}

type TaskSection = { taskId: string; body: string };

function taskSections(ledger: string): TaskSection[] {
	const headings = [...ledger.matchAll(/^## Task (\d+(?:\.\d+)*)\b.*$/gm)];
	return headings.map((heading, index) => {
		const start = (heading.index ?? 0) + heading[0].length;
		const end = headings[index + 1]?.index ?? ledger.length;
		return { taskId: heading[1] ?? "", body: ledger.slice(start, end) };
	});
}

/** Number of recorded BLOCK verdicts for a task, and whether it is already parked. */
export function blockState(ledger: string, taskId: string): { rounds: number; parked: boolean } {
	let rounds = 0;
	let parked = false;
	for (const section of taskSections(ledger)) {
		if (section.taskId !== taskId) continue;
		if (/^VERDICT:[ \t]*BLOCK\b/m.test(section.body)) rounds++;
		if (/^PARKED:/m.test(section.body)) parked = true;
	}
	return { rounds, parked };
}

function parkedEntry(ledger: string, taskId: string, rounds: number, cap: number): string {
	return (
		`${appendSeparator(ledger)}## Task ${taskId}\n\n` +
		`PARKED: task ${taskId} reached ${rounds} BLOCK round(s), the cap of ${cap}. ` +
		"The loop stopped for operator review; do not re-dispatch the developer.\n"
	);
}

function idMarker(toolCallId: string): string {
	const encoded = Buffer.from(toolCallId, "utf8").toString("base64url");
	return `<!-- record-verdict toolCallId-base64: ${encoded} -->`;
}

export function recordVerdict(
	change: string,
	sessionPath: string,
	rootDir: string = process.cwd(),
): RecordVerdictResult {
	if (
		change === "" ||
		change === "." ||
		change === ".." ||
		basename(change) !== change ||
		change.includes("/") ||
		change.includes("\\") ||
		change.includes("\0")
	) {
		return fail("INVALID_CHANGE", "change must be a single non-empty path segment");
	}

	// Read and validate every input before opening the append-only ledger for writing.
	const cap = blockCap();
	const transcript = readText(sessionPath, "TRANSCRIPT_READ_FAILED");
	const verdict = latestVerdict(transcript);
	const changeDir = join(rootDir, "openspec", "changes", change);
	const ledgerPath = join(changeDir, "review-log.md");
	const ledger = readText(ledgerPath, "LEDGER_READ_FAILED");
	const marker = idMarker(verdict.toolCallId);

	if (ledger.includes(marker)) {
		const taskId = recordedTaskId(ledger, marker);
		const state = blockState(ledger, taskId);
		return {
			status: state.parked ? "parked" : "already-recorded",
			taskId,
			toolCallId: verdict.toolCallId,
			...(state.rounds > 0 ? { blockRounds: state.rounds, cap } : {}),
		};
	}

	const tasks = readText(join(changeDir, "tasks.md"), "TASKS_READ_FAILED");
	const taskId = nextTaskId(tasks);
	const block = `${appendSeparator(ledger)}## Task ${taskId}\n\n${marker}\n${verdict.text}`;
	try {
		appendFileSync(ledgerPath, block, "utf8");
	} catch (error: unknown) {
		const detail = error instanceof Error ? error.message : String(error);
		return fail("LEDGER_APPEND_FAILED", `${ledgerPath}: ${detail}`);
	}

	const updated = ledger + block;
	const state = blockState(updated, taskId);
	if (state.rounds === 0) return { status: "appended", taskId, toolCallId: verdict.toolCallId };
	const latestIsBlock = /^VERDICT:[ \t]*BLOCK\b/m.test(verdict.text);
	if (latestIsBlock && state.rounds >= cap) {
		// Park once; every later BLOCK on a parked task reports parked again, so an orchestrator
		// that ignored one stop signal still gets the next one.
		if (!state.parked) {
			try {
				appendFileSync(ledgerPath, parkedEntry(updated, taskId, state.rounds, cap), "utf8");
			} catch (error: unknown) {
				const detail = error instanceof Error ? error.message : String(error);
				return fail("LEDGER_APPEND_FAILED", `${ledgerPath}: ${detail}`);
			}
		}
		return { status: "parked", taskId, toolCallId: verdict.toolCallId, blockRounds: state.rounds, cap };
	}
	return {
		status: "appended",
		taskId,
		toolCallId: verdict.toolCallId,
		blockRounds: state.rounds,
		cap,
	};
}

if (import.meta.main) {
	const args = process.argv.slice(2);
	if (args.length !== 2) {
		process.stderr.write("record-verdict: USAGE: record-verdict.ts <change> <session.jsonl>\n");
		process.exit(2);
	}
	try {
		const result = recordVerdict(args[0] ?? "", args[1] ?? "");
		const rounds =
			result.blockRounds === undefined ? "" : ` (BLOCK round ${result.blockRounds} of ${result.cap})`;
		process.stdout.write(`record-verdict: ${result.status}: task ${result.taskId}${rounds}\n`);
		if (result.status === "parked") {
			process.stdout.write(
				"record-verdict: the BLOCK cap is reached -- stop the loop and report this task to the operator.\n",
			);
			process.exit(3);
		}
	} catch (error: unknown) {
		if (error instanceof RecordVerdictError) {
			process.stderr.write(`record-verdict: ${error.reason}: ${error.message}\n`);
		} else {
			const detail = error instanceof Error ? error.message : String(error);
			process.stderr.write(`record-verdict: UNEXPECTED_ERROR: ${detail}\n`);
		}
		process.exit(1);
	}
}
