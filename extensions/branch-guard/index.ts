/*
 * branch-guard -- enforces PR flow by blocking direct changes to protected branches.
 *
 * The harness delegates implementation to the developer subagent, which keeps full bash --
 * so without this guard it can run "git push origin main" and land code on main with no
 * review at all, defeating the entire point of the kit. This blocks, for EVERY agent:
 *   - committing while on a protected branch (main/master) -- work on a feature branch,
 *   - pushing to a protected branch (explicit refspec OR a bare push while on one),
 *   - force-pushing to a protected branch.
 * The only path onto a protected branch becomes a reviewed pull request.
 *
 * Runs in every agent: the main agent is already push-blocked by force-delegate (push is
 * not on its bash allowlist), but the write-capable subagents are covered only here.
 *
 * Protected branches are the PROTECTED set below -- edit it per project.
 *
 * pi-loader note: no regex literals, no raw backticks, no apostrophes (just check-extensions).
 */

import * as fs from "fs";
import * as path from "path";
import { logBlocked } from "../lib/tool-events";

const PROTECTED = new Set(["main", "master"]);
const CHAIN_SPLIT = new RegExp("&&|\\|\\||[;&\\n|]");
const WHITESPACE = new RegExp("\\s+");
// git global flags that consume the following token (so we skip past them to the subcommand).
const GIT_FLAGS_WITH_VALUE = new Set(["-C", "--git-dir", "--work-tree", "--namespace", "-c"]);

function currentBranch(): string | undefined {
	try {
		let gitDir = path.join(process.cwd(), ".git");
		const st = fs.statSync(gitDir);
		if (st.isFile()) {
			// Worktree: .git is a file "gitdir: <path>".
			const pointer = fs.readFileSync(gitDir, "utf8").trim();
			const marker = "gitdir:";
			if (pointer.startsWith(marker)) gitDir = pointer.slice(marker.length).trim();
		}
		const head = fs.readFileSync(path.join(gitDir, "HEAD"), "utf8").trim();
		const ref = "ref: refs/heads/";
		if (head.startsWith(ref)) return head.slice(ref.length).trim();
	} catch {
		// best-effort: if the branch cannot be determined, commit/bare-push are not blocked here;
		// an explicit push to a protected branch is still caught below.
	}
	return undefined;
}

function pushHitsProtected(afterPush: string[]): boolean {
	const positional = afterPush.filter((t) => t.length > 0 && !t.startsWith("-"));
	// positional[0] is the remote; the rest are refspecs (src or src:dst).
	const refspecs = positional.length >= 2 ? positional.slice(1) : [];
	for (const r of refspecs) {
		const dst = r.indexOf(":") !== -1 ? r.slice(r.lastIndexOf(":") + 1) : r;
		if (PROTECTED.has(dst)) return true;
	}
	if (refspecs.length === 0) {
		// Bare push (git push / git push origin) targets the current branch.
		const b = currentBranch();
		if (b && PROTECTED.has(b)) return true;
	}
	return false;
}

function violation(command: unknown): string | undefined {
	if (typeof command !== "string") return undefined;
	for (const rawSeg of command.split(CHAIN_SPLIT)) {
		const seg = rawSeg.trim();
		if (seg === "") continue;
		const tokens = seg.split(WHITESPACE);
		const gi = tokens.indexOf("git");
		if (gi === -1) continue;
		let i = gi + 1;
		while (i < tokens.length && tokens[i].startsWith("-")) {
			if (GIT_FLAGS_WITH_VALUE.has(tokens[i])) i++;
			i++;
		}
		const sub = tokens[i];
		if (sub === "push") {
			if (pushHitsProtected(tokens.slice(i + 1))) return "a push to a protected branch (main/master)";
		} else if (sub === "commit") {
			const b = currentBranch();
			if (b && PROTECTED.has(b)) return "a commit on protected branch " + b;
		}
	}
	return undefined;
}

export default function (pi: any) {
	pi.on("tool_call", async (event: any) => {
		if (event.toolName !== "bash") return undefined;
		const v = violation(event.input?.command);
		if (!v) return undefined;
		const msg =
			"branch-guard: blocked " + v + ". This harness enforces PR flow -- create a " +
			"feature branch and open a pull request; never change main/master directly.";
		logBlocked("branch-guard", "bash", msg, event.input?.command);
		return { block: true, reason: msg };
	});
}
