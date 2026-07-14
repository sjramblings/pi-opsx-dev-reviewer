/*
 * opsx-reminder -- a session_start nudge that reminds you of the ONE lifecycle action a
 * change is waiting on, and nothing else. It fires only when there is a real pending
 * action, so it informs rather than nags.
 *
 * It surfaces two things, read-only, best-effort:
 *   1. A change whose tasks are all ticked but which has not been archived -- the retro
 *      step (/opsx-retro) has not run, so its findings were never ratcheted.
 *   2. Learnings sitting in the draft state, waiting for promotion to active.
 *
 * Runs only for the main agent (depth 0); subagents skip it. Everything is wrapped so a
 * malformed repo can never break session start.
 *
 * pi-loader note (LOAD-BREAKERS -- do not reintroduce): pi loads extensions with a fragile
 * tokenizer that fails the whole file with "Unterminated string constant" and SILENTLY
 * disables it on regex literals, raw backticks, or apostrophes (even in comments and
 * strings). So: string methods only, no backticks, no apostrophes. See check-extensions.
 *
 * Install (per OpenSpec project): copy this folder to  <repo>/.pi/extensions/
 */

import { readdirSync, readFileSync, existsSync, statSync } from "fs";
import { join } from "path";

// Read a tasks.md and report whether it has tasks and whether they are all done.
function taskState(file: string): { total: number; done: number } {
	let total = 0;
	let done = 0;
	let text = "";
	try {
		text = readFileSync(file, "utf8");
	} catch {
		return { total: 0, done: 0 };
	}
	for (const raw of text.split("\n")) {
		const line = raw.trim();
		if (line.startsWith("- [ ] ")) total++;
		else if (line.startsWith("- [x] ") || line.startsWith("- [X] ")) {
			total++;
			done++;
		}
	}
	return { total, done };
}

// Changes with every task ticked but not archived: retro has not run.
function changesAwaitingRetro(root: string): string[] {
	const dir = join(root, "openspec", "changes");
	if (!existsSync(dir)) return [];
	const out: string[] = [];
	let names: string[] = [];
	try {
		names = readdirSync(dir);
	} catch {
		return [];
	}
	for (const name of names) {
		if (name === "archive") continue; // archived changes live under changes/archive
		const changeDir = join(dir, name);
		try {
			if (!statSync(changeDir).isDirectory()) continue;
		} catch {
			continue;
		}
		const st = taskState(join(changeDir, "tasks.md"));
		if (st.total > 0 && st.done === st.total) out.push(name);
	}
	return out;
}

// Learnings in the draft state, waiting for promotion.
function draftLearnings(root: string): number {
	const dir = join(root, "learnings");
	if (!existsSync(dir)) return 0;
	let count = 0;
	let names: string[] = [];
	try {
		names = readdirSync(dir);
	} catch {
		return 0;
	}
	for (const name of names) {
		if (!name.endsWith(".md")) continue;
		if (name.startsWith("_") || name === "README.md") continue;
		let text = "";
		try {
			text = readFileSync(join(dir, name), "utf8");
		} catch {
			continue;
		}
		for (const raw of text.split("\n")) {
			const line = raw.trim();
			if (line.startsWith("status:") && line.slice("status:".length).trim() === "draft") {
				count++;
				break;
			}
		}
	}
	return count;
}

export default function (pi: any) {
	pi.on("session_start", async (_event: any, ctx: any) => {
		if (Number(process.env.PI_SUBAGENT_DEPTH ?? "0") > 0) return;

		const lines: string[] = [];
		try {
			const root = process.cwd();
			for (const name of changesAwaitingRetro(root)) {
				lines.push("-> /opsx-retro " + name + "   (all tasks ticked, not archived)");
			}
			const drafts = draftLearnings(root);
			if (drafts > 0) {
				lines.push("-> " + String(drafts) + " draft learning(s) awaiting promotion");
			}
		} catch {
			// Best-effort only: never break session start over a reminder.
			return;
		}

		// All UI is fire-and-forget: the client (interactive TUI) renders it in the active pi
		// theme, or ignores it (headless / RPC). Each call is wrapped so it can never throw.
		const ui = ctx && ctx.ui ? ctx.ui : null;
		const call = (fn: string, ...args: any[]) => {
			if (ui && typeof ui[fn] === "function") {
				try {
					ui[fn](...args);
				} catch {
					// fire-and-forget
				}
			}
		};

		if (lines.length === 0) {
			// Nothing pending: clear any reminder pinned by a prior state so it does not linger.
			call("setWidget", "opsx-reminder", undefined);
			call("setStatus", "opsx", undefined);
			return;
		}

		// Pin the reminders as a persistent widget above the editor (theme-coloured plain text)
		// plus a compact footer badge. Both clear themselves once nothing is pending.
		call("setWidget", "opsx-reminder", ["opsx | pending lifecycle actions:", ...lines], {
			placement: "aboveEditor",
		});
		call("setStatus", "opsx", "opsx: " + lines.length + " pending");
		// Reliable fallback for clients that ignore UI requests.
		process.stderr.write("\n----- opsx-reminder -----\n" + lines.join("\n") + "\n\n");
	});
}
