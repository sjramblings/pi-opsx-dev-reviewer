/*
 * patch-cursor-heartbeat.ts -- raise the session-liveness timeouts in @schultzp2020/pi-cursor.
 *
 * Why: the proxy tracks pi sessions by heartbeat and shuts itself down the moment the count
 * hits zero -- and its shutdown path never checks whether a request is in flight (grep the
 * bundle for inFlight/activeRequests/pendingRequests: zero hits). Stock values are a 10s
 * client heartbeat with a 2s POST budget against a 30s prune threshold, so three starved
 * heartbeats during a long tool-heavy turn kill the transport mid-stream and the turn dies
 * with "session closed". Raising the prune threshold makes that race impractical; raising the
 * client POST budget stops a busy event loop from failing the heartbeat itself.
 *
 * This patches an installed package under node_modules, so `pi update` or a reinstall WILL
 * revert it. Re-run this script afterwards. It is idempotent and refuses to guess: if the
 * expected constant is not found exactly once, it changes nothing and exits non-zero.
 *
 * NOT touched: HEARTBEAT_INTERVAL_MS in proxy/main.js (~line 8125), which is the upstream
 * keepalive on the gRPC stream to api2.cursor.sh -- part of the Cursor wire protocol.
 *
 *   bun tools/patch-cursor-heartbeat.ts          # apply (or report already-applied)
 *   bun tools/patch-cursor-heartbeat.ts --status # report only
 *   bun tools/patch-cursor-heartbeat.ts --revert # restore the .orig backups
 */

import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const DIST = join(homedir(), ".pi", "agent", "npm", "node_modules", "@schultzp2020", "pi-cursor", "dist");

type Edit = { file: string; label: string; from: string; to: string; expect?: number };

const EDITS: Edit[] = [
	{
		file: join(DIST, "proxy", "main.js"),
		label: "proxy session-prune threshold",
		from: "HEARTBEAT_TIMEOUT_MS = 3e4", // 30s
		to: "HEARTBEAT_TIMEOUT_MS = 6e5", // 10min
	},
	{
		file: join(DIST, "index.js"),
		label: "client heartbeat POST budget",
		from: "HEARTBEAT_TIMEOUT_MS = 2e3", // 2s
		to: "HEARTBEAT_TIMEOUT_MS = 1e4", // 10s
	},
	// The stream watchdog -- a SECOND, independent killer, and the one that ends long agentic
	// turns. resetInactivityTimer() closes the upstream Cursor stream after 15s of silence while
	// streaming or 30s while thinking, emitting "inactivity timeout", which reaches pi as
	// [Error: session closed] mid-generation. Those defaults suit short chat turns; a reasoning
	// model pausing between bursts, or a slow tool round-trip, blows straight through them.
	{
		file: join(DIST, "proxy", "main.js"),
		label: "upstream stream-inactivity timeout",
		from: "INACTIVITY_STREAMING_MS = 15e3", // 15s
		to: "INACTIVITY_STREAMING_MS = 12e4", // 2min
	},
	{
		file: join(DIST, "proxy", "main.js"),
		label: "upstream thinking-inactivity timeout",
		from: "INACTIVITY_THINKING_MS = 3e4", // 30s
		to: "INACTIVITY_THINKING_MS = 3e5", // 5min
	},
	// Pin the loopback dial to IPv4. "localhost" resolves to BOTH ::1 and 127.0.0.1 (verbatim
	// order on macOS), so undici races them via autoSelectFamily/Happy Eyeballs. undici then
	// calls socket.setTypeOfService(request.typeOfService ?? 0) on every HTTP/1 write with no
	// try/catch (client-h1.js:1245), and a socket caught in that dual-stack handoff makes the
	// setsockopt fail EINVAL -- which, being uncaught, exits pi outright rather than surfacing
	// as a connection error. One address means no race. A loopback proxy has no reason to
	// resolve a name anyway.
	{
		file: join(DIST, "index.js"),
		label: "loopback dial pinned to IPv4",
		from: "http://localhost:",
		to: "http://127.0.0.1:",
		expect: 7,
	},
	// Per-conversation blob store, LRU-evicted at 128. A long agentic session accumulates far
	// more blobs than that, so the oldest are evicted while the conversation still references
	// them -- the proxy then logs "GetBlob miss (store has 128 blobs)" and the stream dies with
	// "Connect error internal". The store is per conversation and persisted to disk, so the cost
	// of a bigger cap is disk and memory per live conversation, not a leak.
	{
		file: join(DIST, "proxy", "main.js"),
		label: "per-conversation blob cap",
		from: "MAX_BLOB_COUNT = 128",
		to: "MAX_BLOB_COUNT = 2048",
	},
	// 30min TTL for bridge and conversation entries. Long sessions with thinking pauses can idle
	// past it and lose their conversation state mid-run.
	{
		file: join(DIST, "proxy", "main.js"),
		label: "bridge/conversation TTL",
		from: "SESSION_TTL_MS = 1800 * 1e3",
		to: "SESSION_TTL_MS = 21600 * 1e3",
	},
];

function fail(message: string): never {
	process.stderr.write(`patch-cursor-heartbeat: ${message}\n`);
	process.exit(1);
}

if (!existsSync(DIST)) fail(`package not installed at ${DIST}`);

const mode = process.argv[2];

if (mode === "--revert") {
	for (const { file } of EDITS) {
		const backup = `${file}.orig`;
		if (!existsSync(backup)) {
			process.stdout.write(`  no backup for ${file} -- skipped\n`);
			continue;
		}
		copyFileSync(backup, file);
		process.stdout.write(`  restored ${file}\n`);
	}
	process.stdout.write("reverted to stock. Restart any running proxy to pick it up.\n");
	process.exit(0);
}

let applied = 0;
let already = 0;

for (const { file, label, from, to, expect = 1 } of EDITS) {
	if (!existsSync(file)) fail(`missing ${file}`);
	const src = readFileSync(file, "utf8");
	const hits = src.split(from).length - 1;

	if (hits === 0 && src.includes(to)) {
		process.stdout.write(`  already patched  ${label.padEnd(32)} ${to}\n`);
		already++;
		continue;
	}

	// Refuse to guess: the bundle is minified and these tokens recur across files.
	if (hits !== expect) {
		fail(`${file}: expected ${expect} occurrence(s) of "${from}", found ${hits}. Aborted, nothing written.`);
	}

	if (mode === "--status") {
		process.stdout.write(`  STOCK (needs patch)  ${label.padEnd(32)} ${from}\n`);
		continue;
	}

	const backup = `${file}.orig`;
	if (!existsSync(backup)) copyFileSync(file, backup);
	writeFileSync(file, src.split(from).join(to));
	process.stdout.write(`  patched  ${label.padEnd(32)} ${from} -> ${to}  (${hits}x)\n`);
	applied++;
}

if (mode === "--status") process.exit(0);

process.stdout.write(
	applied > 0
		? `\napplied ${applied} edit(s). The proxy reads these at spawn, so restart it (or just let the\ncurrent one exit) before the change takes effect.\n`
		: `\nnothing to do -- ${already} edit(s) already in place.\n`,
);
