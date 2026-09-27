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

// Fix-loop cap: count BLOCK rounds per task, park at the cap.

function reviewerResult(toolCallId: string, verdict: "PASS" | "BLOCK"): string {
	return `${JSON.stringify({
		type: "message",
		message: {
			role: "toolResult",
			toolName: "subagent",
			toolCallId,
			content: [{ type: "text", text: `FINDINGS:\n- P1 finding.\n\nVERDICT: ${verdict}` }],
		},
	})}\n`;
}

function withCap<T>(value: string | undefined, run: () => T): T {
	const original = process.env.OPSX_MAX_BLOCK_ROUNDS;
	if (value === undefined) delete process.env.OPSX_MAX_BLOCK_ROUNDS;
	else process.env.OPSX_MAX_BLOCK_ROUNDS = value;
	try {
		return run();
	} finally {
		if (original === undefined) delete process.env.OPSX_MAX_BLOCK_ROUNDS;
		else process.env.OPSX_MAX_BLOCK_ROUNDS = original;
	}
}

function recordBlocks(workspace: Workspace, count: number): RecordVerdictResult[] {
	const results: RecordVerdictResult[] = [];
	for (let round = 1; round <= count; round++) {
		writeFileSync(workspace.sessionPath, reviewerResult(`review-block-${round}`, "BLOCK"), "utf8");
		results.push(invoke(workspace));
	}
	return results;
}

test("a BLOCK under the cap is appended with its round count", () => {
	withCap(undefined, () =>
		withWorkspace((workspace) => {
			const [first] = recordBlocks(workspace, 1);
			expect(first).toEqual({
				status: "appended",
				taskId: "1.2",
				toolCallId: "review-block-1",
				blockRounds: 1,
				cap: 3,
			});
			expect(readFileSync(workspace.ledgerPath, "utf8")).not.toContain("PARKED:");
		}),
	);
});

test("the third BLOCK parks the task once, after the verdict entry", () => {
	withCap(undefined, () =>
		withWorkspace((workspace) => {
			const results = recordBlocks(workspace, 3);
			expect(results.map((r) => r.status)).toEqual(["appended", "appended", "parked"]);
			const ledger = readFileSync(workspace.ledgerPath, "utf8");
			expect(ledger.match(/^PARKED:/gm)).toHaveLength(1);
			expect(ledger.match(/^VERDICT: BLOCK$/gm)).toHaveLength(3);
			expect(ledger.lastIndexOf("PARKED:")).toBeGreaterThan(ledger.lastIndexOf("VERDICT: BLOCK"));
			expect(ledger).toContain("PARKED: task 1.2 reached 3 BLOCK round(s), the cap of 3.");
		}),
	);
});

test("re-running a parked verdict reports parked without writing", () => {
	withCap(undefined, () =>
		withWorkspace((workspace) => {
			recordBlocks(workspace, 3);
			const before = readFileSync(workspace.ledgerPath);
			const again = invoke(workspace);
			expect(again.status).toBe("parked");
			expect(readFileSync(workspace.ledgerPath)).toEqual(before);
		}),
	);
});

test("PARKED entries never begin with VERDICT:", () => {
	withCap("1", () =>
		withWorkspace((workspace) => {
			recordBlocks(workspace, 1);
			const ledger = readFileSync(workspace.ledgerPath, "utf8");
			const parkedSection = ledger.slice(ledger.lastIndexOf("## Task"));
			expect(parkedSection).toContain("PARKED:");
			expect(parkedSection).not.toMatch(/^VERDICT:/m);
			expect(ledger.match(/^VERDICT:/gm)).toHaveLength(1);
		}),
	);
});

test("the cap is configurable", () => {
	withCap("2", () =>
		withWorkspace((workspace) => {
			expect(recordBlocks(workspace, 2).map((r) => r.status)).toEqual(["appended", "parked"]);
		}),
	);
});

test("an invalid cap fails closed before appending", () => {
	for (const bad of ["0", "-1", "three", "2.5"]) {
		withCap(bad, () =>
			withWorkspace((workspace) => {
				const before = readFileSync(workspace.ledgerPath);
				expectRefusal(workspace, "INVALID_BLOCK_CAP");
				expect(readFileSync(workspace.ledgerPath)).toEqual(before);
			}),
		);
	}
});

test("BLOCK rounds are counted per task", () => {
	const ledger = "# Review log\n\n## Task 1.1\n\nVERDICT: BLOCK\n\n## Task 1.1\n\nVERDICT: BLOCK\n";
	withCap(undefined, () =>
		withWorkspace(
			(workspace) => {
				const [result] = recordBlocks(workspace, 1);
				expect(result?.status).toBe("appended");
				expect(result?.blockRounds).toBe(1);
			},
			{ ledger },
		),
	);
});

test("CLI exits 3 and says stop when a task parks", () => {
	withCap("1", () =>
		withWorkspace((workspace) => {
			writeFileSync(workspace.sessionPath, reviewerResult("review-cli-1", "BLOCK"), "utf8");
			const run = Bun.spawnSync(
				["bun", join(import.meta.dir, "record-verdict.ts"), change, workspace.sessionPath],
				{ cwd: workspace.root, env: { ...process.env, OPSX_MAX_BLOCK_ROUNDS: "1" } },
			);
			expect(run.exitCode).toBe(3);
			expect(run.stdout.toString()).toContain("record-verdict: parked: task 1.2 (BLOCK round 1 of 1)");
			expect(run.stdout.toString()).toContain("stop the loop");
		}),
	);
});

test("a BLOCK recorded after the task parked reports parked again without a second PARKED entry", () => {
	withCap(undefined, () =>
		withWorkspace((workspace) => {
			const results = recordBlocks(workspace, 4);
			expect(results.map((r) => r.status)).toEqual(["appended", "appended", "parked", "parked"]);
			expect(results[3]?.blockRounds).toBe(4);
			expect(readFileSync(workspace.ledgerPath, "utf8").match(/^PARKED:/gm)).toHaveLength(1);
		}),
	);
});
