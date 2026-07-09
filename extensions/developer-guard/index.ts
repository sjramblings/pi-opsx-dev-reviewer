/*
 * developer-guard -- damage-control for the write-capable subagents.
 *
 * force-delegate makes the MAIN agent read-only, but the developer subagent keeps full
 * write + bash by design so it can do the work -- and nothing else guards it. A
 * hallucinated destructive command from the developer would execute. This extension
 * blocks the unambiguous catastrophes for every agent (defense in depth; the main agent
 * is already covered by force-delegate, the subagents are covered only here).
 *
 * It blocks catastrophic bash only -- it does NOT block ordinary dev work (tests, builds,
 * git commit, narrow deletes). If a genuinely destructive action is needed, the developer
 * should scope it narrowly or surface it to the human, not route around this guard.
 *
 * pi-loader note: no regex literals, no raw backticks, no apostrophes (see SHAKEDOWN.md /
 * just check-extensions). All patterns are built with new RegExp from plain strings.
 *
 * Install (per OpenSpec project): copy this folder to  <repo>/.pi/extensions/
 */

// [pattern, reason]. Patterns are matched against the raw bash command string.
const DESTRUCTIVE: Array<[RegExp, string]> = [
	[new RegExp("(^|\\s)rm\\s+-\\S*r\\S*f"), "recursive force delete (rm -rf)"],
	[new RegExp("(^|\\s)rm\\s+-\\S*f\\S*r"), "recursive force delete (rm -fr)"],
	[new RegExp("(^|\\s)rm\\s+-r\\s+-f"), "recursive force delete (rm -r -f)"],
	[new RegExp("(^|\\s)rm\\s+-f\\s+-r"), "recursive force delete (rm -f -r)"],
	[new RegExp("(^|\\s)dd\\b[^\\n]*\\bof=/dev/"), "dd writing to a device"],
	[new RegExp("(^|\\s)mkfs\\b"), "filesystem format (mkfs)"],
	[new RegExp(">\\s*/dev/(sd|nvme|disk|hd)"), "redirect to a raw device"],
	[new RegExp("(^|\\s)ch(mod|own)\\b[^\\n]*-R[^\\n]*\\s/(\\s|$)"), "recursive chmod/chown on /"],
	[new RegExp("\\|\\s*(sudo\\s+)?(sh|bash|zsh)\\b"), "piping a download into a shell"],
	[new RegExp("(^|\\s)git\\s+push\\b[^\\n]*(--force|--force-with-lease|-f($|\\s))"), "force push"],
	[new RegExp("(^|\\s)git\\s+reset\\s+--hard"), "git reset --hard (discards work)"],
	[new RegExp("(^|\\s)sudo\\s"), "sudo (privilege escalation)"],
];
// Fork bomb is matched separately with a plain substring check.
const FORK_BOMB = ":(){";

function destructiveReason(command: unknown): string | undefined {
	if (typeof command !== "string") return undefined;
	if (command.indexOf(FORK_BOMB) !== -1) return "fork bomb";
	for (const [pattern, reason] of DESTRUCTIVE) {
		if (pattern.test(command)) return reason;
	}
	return undefined;
}

export default function (pi: any) {
	pi.on("tool_call", async (event: any) => {
		if (event.toolName !== "bash") return undefined;
		const reason = destructiveReason(event.input?.command);
		if (!reason) return undefined;
		return {
			block: true,
			reason:
				"developer-guard: blocked a destructive command (" + reason + "). Scope it " +
				"narrowly or surface it to the human -- do not route around this guard.",
		};
	});
}
