/*
 * force-delegate v2 -- makes /opsx:apply (and any session) delegate instead of self-editing.
 *
 * The main agent must not mutate the repo directly; the only path to change code is to
 * call the subagent tool (developer), a separate pi process that keeps full tools. v1
 * blocked write/edit/bash wholesale. v2 keeps write/edit hard-blocked but lets the main
 * agent run READ-ONLY orchestration through bash -- so it can inspect openspec state and
 * git diffs to brief the reviewer -- while still blocking any bash that could mutate.
 *
 * The bash gate is deny-by-default and conservative: it blocks command substitution,
 * redirection, and anything whose command (in every chained segment) is not on a small
 * read-only allowlist. If it cannot parse the command with confidence, it blocks. A
 * bypass here would defeat the delegation guarantee, so "block if uncertain" is the rule.
 *
 * Subagents run as child pi processes with PI_SUBAGENT_DEPTH > 0 (set by
 * @mjakl/pi-subagent). This extension no-ops inside them, so the developer subagent keeps
 * write/edit/bash and does the actual work.
 *
 * pi-loader note (LOAD-BREAKERS -- do not reintroduce any of these): pi 0.79.9 loads
 * extensions with a fragile tokenizer that fails the whole file with "Unterminated string
 * constant" and SILENTLY disables it. It chokes on (a) regex literals, (b) raw backticks,
 * and (c) a lone apostrophe in a comment (e.g. a contraction). So: use new RegExp(...) not
 * regex literals, no raw backticks anywhere, and no apostrophes in comments. Keep an even
 * count of every quote character.
 *
 * Install (per OpenSpec project): copy this folder to  <repo>/.pi/extensions/
 */

const DELEGATE_REASON =
	"force-delegate: the main agent is read-only. Delegate implementation to the " +
	"developer subagent, then verify with the reviewer subagent (the subagent tool).";

const BASH_REASON =
	"force-delegate: the main agent may only run read-only orchestration via bash " +
	"(openspec/git read commands, ls, cat, rg, grep, find, head, tail, wc, jq, echo). " +
	"This command can mutate or could not be parsed as read-only -- delegate it to the " +
	"developer subagent instead.";

// Read-only command allowlist. sed and awk are deliberately excluded: sed -i and awk
// program-side redirection can write files, which would be a bypass.
const ALLOWED_COMMANDS = new Set([
	"openspec", "git", "ls", "cat", "rg", "grep", "find",
	"pwd", "head", "tail", "wc", "echo", "jq", "true",
]);
const OPENSPEC_READONLY = new Set(["list", "show", "validate", "status", "diff", "view"]);
const GIT_READONLY = new Set([
	"status", "log", "diff", "show", "branch", "remote", "rev-parse", "ls-files",
]);
// find primaries that execute or delete -- bypass vectors, so any of these blocks.
const FIND_MUTATORS = new Set([
	"-exec", "-execdir", "-ok", "-okdir", "-delete", "-fprint", "-fprintf", "-fls",
]);

// Constructs that can hide mutation: redirection (>, <), backtick (\x60) and $(
// command substitution. Presence of any blocks outright.
const DANGEROUS = new RegExp("[\\x60><]|\\$\\(");
// Operators that chain separate commands, including a lone & (background). && is listed
// first so it wins the alternation; each resulting segment is checked on its own.
const CHAIN_SPLIT = new RegExp("&&|\\|\\||[;&\\n|]");
const ENV_ASSIGN = new RegExp("^[A-Za-z_][A-Za-z0-9_]*=");
const WHITESPACE = new RegExp("\\s+");

function isReadOnlyBash(command: unknown): boolean {
	if (typeof command !== "string" || command.trim() === "") return false;
	if (DANGEROUS.test(command)) return false;

	for (const rawSegment of command.split(CHAIN_SPLIT)) {
		const segment = rawSegment.trim();
		if (segment === "") continue;

		const tokens = segment.split(WHITESPACE);
		const cmd = tokens[0];
		if (!cmd) return false;

		// Reject inline env assignments and the env command -- they inject GIT_PAGER /
		// GIT_EXTERNAL_DIFF / PAGER etc., which run arbitrary commands.
		if (cmd === "env" || ENV_ASSIGN.test(cmd)) return false;

		if (!ALLOWED_COMMANDS.has(cmd)) return false;

		if (cmd === "openspec") {
			if (!OPENSPEC_READONLY.has(tokens[1] ?? "")) return false;
		} else if (cmd === "git") {
			if (!GIT_READONLY.has(tokens[1] ?? "")) return false;
		} else if (cmd === "find") {
			if (tokens.some((t) => FIND_MUTATORS.has(t))) return false;
		}
	}
	return true;
}

export default function (pi: any) {
	// Only restrict the top-level agent. Child subagents (depth > 0) keep full tools.
	if (Number(process.env.PI_SUBAGENT_DEPTH ?? "0") > 0) return;

	// Handshake for the harness-selftest canary: prove to it (same process) that this
	// guard actually loaded and is active for the main agent.
	process.env.__FORCE_DELEGATE_LOADED = "1";

	pi.on("tool_call", async (event: any) => {
		if (event.toolName === "write" || event.toolName === "edit") {
			return { block: true, reason: DELEGATE_REASON };
		}
		if (event.toolName === "bash") {
			if (isReadOnlyBash(event.input?.command)) {
				return undefined;
			}
			return { block: true, reason: BASH_REASON };
		}
		return undefined;
	});
}
