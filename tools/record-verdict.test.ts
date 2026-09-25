import { expect, test } from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	recordVerdict,
	RecordVerdictError,
	type RecordVerdictResult,
} from "./record-verdict.ts";

const change = "fixture-change";
const fixturePath = join(import.meta.dir, "fixtures", "session-with-verdicts.jsonl");
const fixtureTranscript = readFileSync(fixturePath, "utf8");
const initialLedger = "# Review log\n\nExisting preface.\n";
const expectedFinalVerdict = [
	"FINDINGS (most severe first):",
	"- None.",
	"",
	"EVIDENCE CHECK: Yes — π & <raw> remain literal.",
	"",
	"VERDICT: PASS",
].join("\n");

type Workspace = {
	root: string;
	ledgerPath: string;
	sessionPath: string;
};

function withWorkspace<T>(
	run: (workspace: Workspace) => T,
	options: { ledger?: string; transcript?: string } = {},
): T {
	const root = mkdtempSync(join(tmpdir(), "record-verdict-test-"));
	const changeDir = join(root, "openspec", "changes", change);
	const ledgerPath = join(changeDir, "review-log.md");
	const sessionPath = join(root, "session.jsonl");
	try {
		mkdirSync(changeDir, { recursive: true });
		writeFileSync(ledgerPath, options.ledger ?? initialLedger, "utf8");
		writeFileSync(
			join(changeDir, "tasks.md"),
			"# Tasks\n\n- [x] 1.1 Implement recorder\n- [ ] 1.2 Test recorder\n",
			"utf8",
		);
		writeFileSync(sessionPath, options.transcript ?? fixtureTranscript, "utf8");
		return run({ root, ledgerPath, sessionPath });
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
}

function invoke(workspace: Workspace): RecordVerdictResult {
	return recordVerdict(change, workspace.sessionPath, workspace.root);
}

function expectRefusal(workspace: Workspace, reason: string): RecordVerdictError {
	let caught: unknown;
	try {
		invoke(workspace);
	} catch (error: unknown) {
		caught = error;
	}
	expect(caught).toBeInstanceOf(RecordVerdictError);
	if (!(caught instanceof RecordVerdictError)) {
		throw new Error(`expected RecordVerdictError with reason ${reason}`);
	}
	expect(caught.reason).toBe(reason);
	return caught;
}

function withJsonlLine(transcript: string, entry: unknown): string {
	const separator = transcript.endsWith("\n") ? "" : "\n";
	return `${transcript}${separator}${JSON.stringify(entry)}\n`;
}

test("verbatim append preserves every reviewer-result byte", () => {
	withWorkspace((workspace) => {
		const before = readFileSync(workspace.ledgerPath);
		const result = invoke(workspace);
		const after = readFileSync(workspace.ledgerPath);
		const appended = after.subarray(before.length).toString("utf8");
		const marker = Buffer.from("review-final-002", "utf8").toString("base64url");

		expect(result).toEqual({
			status: "appended",
			taskId: "1.2",
			toolCallId: "review-final-002",
		});
		expect(appended).toBe(
			`\n## Task 1.2\n\n<!-- record-verdict toolCallId-base64: ${marker} -->\n${expectedFinalVerdict}`,
		);
		expect(Buffer.from(appended).subarray(appended.indexOf(expectedFinalVerdict))).toEqual(
			Buffer.from(expectedFinalVerdict),
		);
	});
});

test("last-result selection chooses the latest of several subagent results", () => {
	withWorkspace((workspace) => {
		invoke(workspace);
		const ledger = readFileSync(workspace.ledgerPath, "utf8");

		expect(ledger).toContain(expectedFinalVerdict);
		expect(ledger).not.toContain("Fixture predecessor finding.");
		expect(ledger).not.toContain("Implementation evidence only");
	});
});

test("idempotent re-run keyed by toolCallId leaves the ledger byte-identical", () => {
	withWorkspace((workspace) => {
		const first = invoke(workspace);
		const afterFirst = readFileSync(workspace.ledgerPath);
		const second = invoke(workspace);
		const afterSecond = readFileSync(workspace.ledgerPath);

		expect(first.status).toBe("appended");
		expect(second).toEqual({
			status: "already-recorded",
			taskId: "1.2",
			toolCallId: "review-final-002",
		});
		expect(afterSecond).toEqual(afterFirst);
		expect(afterSecond.toString("utf8").match(/^VERDICT: PASS$/gm)).toHaveLength(1);
	});
});

test("absent toolCallId refusal leaves the ledger byte-identical", () => {
	const transcript = fixtureTranscript.replace('"toolCallId":"review-final-002",', "");
	withWorkspace(
		(workspace) => {
			const before = readFileSync(workspace.ledgerPath);
			const error = expectRefusal(workspace, "TOOL_CALL_ID_MISSING");

			expect(error.message).toContain("selected verdict has no toolCallId");
			expect(readFileSync(workspace.ledgerPath)).toEqual(before);
		},
		{ transcript },
	);
});

test("no-verdict-present refusal leaves the ledger byte-identical", () => {
	const transcript = fixtureTranscript.replaceAll("VERDICT:", "DECISION:");
	withWorkspace(
		(workspace) => {
			const before = readFileSync(workspace.ledgerPath);
			const error = expectRefusal(workspace, "VERDICT_NOT_FOUND");

			expect(error.message).toContain("no subagent toolResult");
			expect(readFileSync(workspace.ledgerPath)).toEqual(before);
		},
		{ transcript },
	);
});

test("malformed content refusal fails closed even for non-subagent tool results", () => {
	const malformedEntries = [
		{
			type: "message",
			message: { role: "toolResult", toolName: "read", toolCallId: "read-missing" },
		},
		{
			type: "message",
			message: {
				role: "toolResult",
				toolName: "read",
				toolCallId: "read-non-array",
				content: { type: "text", text: "not an array" },
			},
		},
	];

	for (const malformedEntry of malformedEntries) {
		withWorkspace(
			(workspace) => {
				const before = readFileSync(workspace.ledgerPath);
				const error = expectRefusal(workspace, "MALFORMED_TRANSCRIPT_CONTENT");

				expect(error.message).toContain("message.content must be an array");
				expect(readFileSync(workspace.ledgerPath)).toEqual(before);
			},
			{ transcript: withJsonlLine(fixtureTranscript, malformedEntry) },
		);
	}
});

test("prior entries are preserved byte-identically and the new entry is last", () => {
	const priorLedger = [
		"# Review log\r\n",
		"\r\n",
		"## Task 0.1\r\n\r\nVERDICT: PASS\r\n",
		"## Task 0.2\n\nVERDICT: BLOCK\n",
		"## Task 1.1\r\n\r\nVERDICT: PASS",
	].join("");

	withWorkspace(
		(workspace) => {
			const before = readFileSync(workspace.ledgerPath);
			invoke(workspace);
			const after = readFileSync(workspace.ledgerPath);

			expect(after.subarray(0, before.length)).toEqual(before);
			expect(after.subarray(before.length).toString("utf8")).toStartWith("\n\n## Task 1.2\n");
			expect(after.toString("utf8").endsWith(expectedFinalVerdict)).toBe(true);
		},
		{ ledger: priorLedger },
	);
});
