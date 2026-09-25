/*
 * record-verdict.ts — append the latest reviewer verdict from a pi session transcript.
 *
 * Runs via bun; not a pi extension.
 *
 * usage: bun tools/record-verdict.ts <change> <session.jsonl>
 */

import { appendFileSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";

type JsonRecord = Record<string, unknown>;
type VerdictEntry = { text: string; toolCallId: string };

export type RecordVerdictResult = {
	status: "appended" | "already-recorded";
	taskId: string;
	toolCallId: string;
};

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
	const transcript = readText(sessionPath, "TRANSCRIPT_READ_FAILED");
	const verdict = latestVerdict(transcript);
	const changeDir = join(rootDir, "openspec", "changes", change);
	const ledgerPath = join(changeDir, "review-log.md");
	const ledger = readText(ledgerPath, "LEDGER_READ_FAILED");
	const marker = idMarker(verdict.toolCallId);

	if (ledger.includes(marker)) {
		return {
			status: "already-recorded",
			taskId: recordedTaskId(ledger, marker),
			toolCallId: verdict.toolCallId,
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
	return { status: "appended", taskId, toolCallId: verdict.toolCallId };
}

if (import.meta.main) {
	const args = process.argv.slice(2);
	if (args.length !== 2) {
		process.stderr.write("record-verdict: USAGE: record-verdict.ts <change> <session.jsonl>\n");
		process.exit(2);
	}
	try {
		const result = recordVerdict(args[0] ?? "", args[1] ?? "");
		process.stdout.write(`record-verdict: ${result.status}: task ${result.taskId}\n`);
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
