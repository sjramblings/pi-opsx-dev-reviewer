import { afterAll, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
	existsSync,
	lstatSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	FINAL_NAME,
	IGNORE_ENTRIES,
	LOCK_NAME,
	OWNER_NAME,
	STAGE_PREFIX,
	type Session,
	StructurizrIoError,
	acquire,
	assertSafeTree,
	clean,
	createStage,
	discardStage,
	ownsStage,
	parseLock,
	parseOwner,
	publish,
	removeSafeFinal,
	serializeLock,
	serializeOwner,
} from "./structurizr-fs.ts";

const roots: string[] = [];
afterAll(() => {
	for (const root of roots) rmSync(root, { recursive: true, force: true });
});

const makeRoot = (): string => {
	const root = mkdtempSync(join(tmpdir(), "structurizr-fs-"));
	roots.push(root);
	return root;
};

const lockParentOf = (root: string) => join(root, "build", "architecture");

const expectCode = (run: () => unknown, code: string, needle?: string): void => {
	let message = "";
	try {
		run();
		throw new Error(`expected IO ${code}`);
	} catch (error) {
		expect(error).toBeInstanceOf(StructurizrIoError);
		message = (error as Error).message;
	}
	expect(message.startsWith(`IO ${code}: `)).toBe(true);
	if (needle !== undefined) expect(message).toContain(needle);
};

/** Run a full render-shaped session: acquire, stage, write payload, publish. */
const render = (root: string, write: (payload: string) => void): Session => {
	const session = acquire({ root, command: "render" });
	try {
		createStage(session);
		write(session.payloadPath);
		removeSafeFinal(session);
		publish(session);
		discardStage(session);
	} finally {
		session.release();
	}
	return session;
};

// --- serialization --------------------------------------------------------

test("the lock and owner records serialize in exact key order on one line", () => {
	const nonce = "0123456789abcdef0123456789abcdef";
	const lock = serializeLock({
		schemaVersion: 1,
		kind: "structurizr-lock",
		command: "render",
		pid: 123,
		nonce,
	});
	expect(lock).toBe(
		`{"schemaVersion":1,"kind":"structurizr-lock","command":"render","pid":123,"nonce":"${nonce}"}`,
	);
	expect(lock.includes("\n")).toBe(false);

	const owner = serializeOwner({
		schemaVersion: 1,
		kind: "structurizr-stage",
		nonce,
		stageName: `${STAGE_PREFIX}${nonce}`,
		lock: { device: "123", inode: "456" },
	});
	expect(owner).toBe(
		`{"schemaVersion":1,"kind":"structurizr-stage","nonce":"${nonce}","stageName":"${STAGE_PREFIX}${nonce}","lock":{"device":"123","inode":"456"}}`,
	);
});

test("a malformed, extra-field, or mistyped lock is rejected", () => {
	const nonce = "0123456789abcdef0123456789abcdef";
	expectCode(() => parseLock("not json"), "UNSAFE_OUTPUT", "not valid JSON");
	expectCode(
		() => parseLock(`{"schemaVersion":1,"kind":"structurizr-lock","command":"render","pid":1,"nonce":"${nonce}","extra":1}`),
		"UNSAFE_OUTPUT",
		"unexpected fields",
	);
	expectCode(
		() => parseLock(`{"schemaVersion":1,"kind":"structurizr-lock","command":"deploy","pid":1,"nonce":"${nonce}"}`),
		"UNSAFE_OUTPUT",
		"render or clean",
	);
	expectCode(
		() => parseLock(`{"schemaVersion":1,"kind":"structurizr-lock","command":"render","pid":0,"nonce":"${nonce}"}`),
		"UNSAFE_OUTPUT",
		"positive safe integer",
	);
	expectCode(
		() => parseLock('{"schemaVersion":1,"kind":"structurizr-lock","command":"render","pid":1,"nonce":"ABC"}'),
		"UNSAFE_OUTPUT",
		"32 lowercase hexadecimal",
	);
});

test("an owner marker whose nonce and name disagree is rejected", () => {
	const nonce = "0123456789abcdef0123456789abcdef";
	expectCode(
		() =>
			parseOwner(
				`{"schemaVersion":1,"kind":"structurizr-stage","nonce":"${nonce}","stageName":".structurizr-stage-deadbeef","lock":{"device":"1","inode":"2"}}`,
			),
		"UNSAFE_OUTPUT",
		"does not agree with its nonce",
	);
});

test("a non-canonical lock identity is rejected", () => {
	const nonce = "0123456789abcdef0123456789abcdef";
	for (const device of ['"007"', '"-1"', '" 1"', "1"]) {
		expectCode(
			() =>
				parseOwner(
					`{"schemaVersion":1,"kind":"structurizr-stage","nonce":"${nonce}","stageName":"${STAGE_PREFIX}${nonce}","lock":{"device":${device},"inode":"2"}}`,
				),
			"UNSAFE_OUTPUT",
		);
	}
});

// --- lock lifecycle -------------------------------------------------------

test("a render publishes atomically and leaves no stage or lock", () => {
	const root = makeRoot();
	render(root, (payload) => writeFileSync(join(payload, "context.svg"), "<svg/>"));

	const parent = lockParentOf(root);
	expect(existsSync(join(parent, FINAL_NAME, "context.svg"))).toBe(true);
	expect(existsSync(join(parent, LOCK_NAME))).toBe(false);
	expect(readdirSync(parent).filter((e) => e.startsWith(STAGE_PREFIX))).toEqual([]);
});

test("different runs receive different nonces", () => {
	const root = makeRoot();
	const first = acquire({ root, command: "render" });
	const firstNonce = first.nonce;
	first.release();
	const second = acquire({ root, command: "render" });
	const secondNonce = second.nonce;
	second.release();

	expect(firstNonce).not.toBe(secondNonce);
	expect(firstNonce).toMatch(/^[0-9a-f]{32}$/);
});

test("lock contention is immediate, non-mutating, and creates no contender stage", () => {
	const root = makeRoot();
	const holder = acquire({ root, command: "render" });
	createStage(holder);

	const parent = lockParentOf(root);
	const before = readdirSync(parent).sort();
	const lockBytes = readFileSync(holder.lockPath, "utf8");

	expectCode(() => acquire({ root, command: "render" }), "LOCK_BUSY", "held by another command");
	expectCode(() => acquire({ root, command: "clean" }), "LOCK_BUSY");

	// Nothing changed: same entries, same lock bytes, holder stage intact.
	expect(readdirSync(parent).sort()).toEqual(before);
	expect(readFileSync(holder.lockPath, "utf8")).toBe(lockBytes);

	discardStage(holder);
	holder.release();
});

test("competing processes serialize on the lock", () => {
	const root = makeRoot();
	const script = `
    import { acquire, createStage, discardStage } from ${JSON.stringify(join(import.meta.dir, "structurizr-fs.ts"))};
    try {
      const s = acquire({ root: ${JSON.stringify(root)}, command: "render" });
      createStage(s);
      Bun.sleepSync(400);
      discardStage(s);
      s.release();
      console.log("ACQUIRED");
    } catch (e) { console.log(e.message.split(":")[0] + ":" + e.message.split(":")[1]); }
  `;
	const scriptPath = join(root, "contend.ts");
	writeFileSync(scriptPath, script);

	const first = Bun.spawn(["bun", scriptPath], { stdout: "pipe" });
	Bun.sleepSync(150);
	const second = spawnSync("bun", [scriptPath], { encoding: "utf8" });

	expect(second.stdout).toContain("IO LOCK_BUSY");
	first.kill();
});

test("a crash lock is never reclaimed automatically", () => {
	const root = makeRoot();
	const parent = lockParentOf(root);
	mkdirSync(parent, { recursive: true });
	// A lock left by a dead process, with a PID that will never match.
	writeFileSync(
		join(parent, LOCK_NAME),
		serializeLock({
			schemaVersion: 1,
			kind: "structurizr-lock",
			command: "render",
			pid: 999_999,
			nonce: "0".repeat(32),
		}),
	);

	expectCode(() => acquire({ root, command: "render" }), "LOCK_BUSY");
	// The stale lock is retained for explicit operator recovery.
	expect(existsSync(join(parent, LOCK_NAME))).toBe(true);
});

test("a replaced lock object is not unlinked on release", () => {
	const root = makeRoot();
	const session = acquire({ root, command: "render" });

	// Another actor swaps the lock for its own.
	rmSync(session.lockPath);
	writeFileSync(session.lockPath, serializeLock({
		schemaVersion: 1,
		kind: "structurizr-lock",
		command: "clean",
		pid: 4242,
		nonce: "f".repeat(32),
	}));

	session.release();

	// The foreign lock survives.
	expect(existsSync(session.lockPath)).toBe(true);
	expect(parseLock(readFileSync(session.lockPath, "utf8")).pid).toBe(4242);
	rmSync(session.lockPath);
});

// --- ownership ------------------------------------------------------------

test("only a matching nonce, marker, and live lock identity authorize deletion", () => {
	const root = makeRoot();
	const session = acquire({ root, command: "render" });
	createStage(session);

	expect(ownsStage(session, session.stagePath)).toBe(true);

	// A directory name alone never authorizes deletion.
	const impostor = join(session.lockParent, `${STAGE_PREFIX}${"a".repeat(32)}`);
	mkdirSync(impostor);
	expect(ownsStage(session, impostor)).toBe(false);

	// A well-formed marker with a foreign nonce never authorizes deletion.
	writeFileSync(
		join(impostor, OWNER_NAME),
		serializeOwner({
			schemaVersion: 1,
			kind: "structurizr-stage",
			nonce: "a".repeat(32),
			stageName: `${STAGE_PREFIX}${"a".repeat(32)}`,
			lock: session.lockIdentity,
		}),
	);
	expect(ownsStage(session, impostor)).toBe(false);

	discardStage(session);
	session.release();
	rmSync(impostor, { recursive: true });
});

test("a replaced owner marker retains the stage with IO CLEANUP", () => {
	const root = makeRoot();
	const session = acquire({ root, command: "render" });
	createStage(session);

	writeFileSync(session.ownerPath, '{"schemaVersion":1}');

	expectCode(() => discardStage(session), "CLEANUP", "not provably owned");
	expect(existsSync(session.stagePath)).toBe(true);

	session.release();
});

test("an abandoned stage is retained, never collected", () => {
	const root = makeRoot();
	const parent = lockParentOf(root);
	mkdirSync(parent, { recursive: true });

	const abandoned = join(parent, `${STAGE_PREFIX}${"b".repeat(32)}`);
	mkdirSync(abandoned, { recursive: true });
	writeFileSync(join(abandoned, "leftover"), "x");

	const session = acquire({ root, command: "clean" });
	const report = clean(session);
	session.release();

	expect(report.retainedStages).toContain(`${STAGE_PREFIX}${"b".repeat(32)}`);
	expect(report.removedStages).toEqual([]);
	expect(existsSync(abandoned)).toBe(true);
});

// --- unsafe output --------------------------------------------------------

test("an unsafe final root is retained untouched", () => {
	const root = makeRoot();
	const parent = lockParentOf(root);
	mkdirSync(parent, { recursive: true });

	const decoy = join(root, "decoy");
	mkdirSync(decoy);
	symlinkSync(decoy, join(parent, FINAL_NAME));

	const session = acquire({ root, command: "render" });
	expectCode(() => removeSafeFinal(session), "UNSAFE_OUTPUT", "symbolic link");
	session.release();

	// Retained, not followed, not removed.
	expect(lstatSync(join(parent, FINAL_NAME)).isSymbolicLink()).toBe(true);
	expect(existsSync(decoy)).toBe(true);
});

test("a symlink, hard link, or special file in the tree is unsafe", () => {
	const root = makeRoot();
	const tree = join(root, "tree");
	mkdirSync(tree, { recursive: true });
	writeFileSync(join(tree, "a.svg"), "<svg/>");
	expect(() => assertSafeTree(tree)).not.toThrow();

	symlinkSync(join(tree, "a.svg"), join(tree, "link.svg"));
	expectCode(() => assertSafeTree(tree), "UNSAFE_OUTPUT", "symbolic link");
});

test("safe stale output is removed before work, so failure leaves no stale success", () => {
	const root = makeRoot();
	render(root, (payload) => writeFileSync(join(payload, "old.svg"), "<svg/>"));
	const parent = lockParentOf(root);
	expect(existsSync(join(parent, FINAL_NAME, "old.svg"))).toBe(true);

	// A later run fails after removing the previous final root.
	const session = acquire({ root, command: "render" });
	createStage(session);
	removeSafeFinal(session);
	discardStage(session);
	session.release();

	expect(existsSync(join(parent, FINAL_NAME))).toBe(false);
});

test("ordinary failure leaves the final root absent and no owned stage", () => {
	const root = makeRoot();
	const session = acquire({ root, command: "render" });
	createStage(session);
	writeFileSync(join(session.payloadPath, "partial.svg"), "<svg/>");
	// Simulated render failure: discard without publishing.
	discardStage(session);
	session.release();

	const parent = lockParentOf(root);
	expect(existsSync(join(parent, FINAL_NAME))).toBe(false);
	expect(readdirSync(parent).filter((e) => e.startsWith(STAGE_PREFIX))).toEqual([]);
});

// --- clean ----------------------------------------------------------------

test("clean is idempotent and preserves an outside sentinel", () => {
	const root = makeRoot();
	const sentinel = join(root, "build", "keep-me.txt");
	render(root, (payload) => writeFileSync(join(payload, "context.svg"), "<svg/>"));
	writeFileSync(sentinel, "sentinel");

	const first = acquire({ root, command: "clean" });
	const firstReport = clean(first);
	first.release();

	const second = acquire({ root, command: "clean" });
	const secondReport = clean(second);
	second.release();

	expect(firstReport.removedFinal).toBe(true);
	expect(secondReport.removedFinal).toBe(false);
	expect(existsSync(sentinel)).toBe(true);
	expect(readFileSync(sentinel, "utf8")).toBe("sentinel");
});

test("clean with nothing to do succeeds", () => {
	const root = makeRoot();
	const session = acquire({ root, command: "clean" });
	const report = clean(session);
	session.release();

	expect(report).toEqual({ removedFinal: false, removedStages: [], retainedStages: [] });
});

test("the three managed ignore entries are exact", () => {
	expect(IGNORE_ENTRIES).toEqual([
		"/build/architecture/structurizr/",
		"/build/architecture/.structurizr-lock",
		"/build/architecture/.structurizr-stage-*/",
	]);
});
