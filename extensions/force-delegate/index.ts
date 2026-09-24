/*
 * force-delegate v2 -- makes /opsx:apply (and any session) delegate instead of self-editing.
 *
 * The main agent must not mutate the repo directly; the only path to change code is to
 * call the subagent tool (developer), a separate pi process that keeps full tools. v1
 * blocked write/edit/bash wholesale. v2 keeps write/edit hard-blocked but lets the main
 * agent run READ-ONLY orchestration plus pinned read-only and bookkeeping recipes
 * through bash. It can inspect state and perform deterministic close-out while arbitrary
 * mutation stays blocked.
 *
 * The bash gate is deny-by-default and conservative: it blocks command substitution,
 * redirection, and anything whose command in every chained segment is neither read-only
 * nor a pinned bookkeeping recipe. If parsing is uncertain, it blocks. A bypass here
 * would defeat the delegation guarantee, so block if uncertain is the rule.
 *
 * Subagents run as child pi processes. Only a trimmed ASCII decimal depth that is a
 * positive safe integer proves a delegated child. This extension no-ops there, so the
 * developer subagent keeps write/edit/bash and does the actual work.
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

import { logBlocked } from "../lib/tool-events";

const DELEGATE_REASON =
	"force-delegate: the main agent is read-only. Delegate implementation to the " +
	"developer subagent, then verify with the reviewer subagent (the subagent tool).";

const BASH_REASON =
	"force-delegate: the main agent may only run read-only orchestration, approved " +
	"read-only just recipes, or the pinned archive-change and record-verdict bookkeeping " +
	"recipes via bash. This command can mutate or could not be parsed inside that bounded " +
	"channel -- delegate it to the developer subagent instead.";

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
const MAIN_BASH_WRITERS = new Map<string, Set<string>>([
	["just", new Set(["archive-change", "record-verdict"])],
]);
const MAIN_BASH_READERS = new Set([
	"tool-events", "learnings-audit", "check-learnings", "learnings-preview", "next",
]);
// find primaries that execute or delete -- bypass vectors, so any of these blocks.
const FIND_MUTATORS = new Set([
	"-exec", "-execdir", "-ok", "-okdir", "-delete", "-fprint", "-fprintf", "-fls",
]);

// Constructs that can hide mutation: redirection (>, <), backtick (\x60) and $(
// command substitution. Presence of any blocks outright.
const DANGEROUS = new RegExp("[\\x60><]|\\$\\(");
// Operators that chain separate commands, including a lone & background operator. && is
// listed first so it wins the alternation; each resulting segment is checked on its own.
const CHAIN_SPLIT = new RegExp("&&|\\|\\||[;&\\n|]");
const BACKGROUND = new RegExp("(^|[^&])&([^&]|$)");
const ENV_ASSIGN = new RegExp("^[A-Za-z_][A-Za-z0-9_]*=");
const WHITESPACE = new RegExp("\\s+");
const POSITIVE_INTEGER = new RegExp("^[1-9][0-9]*$");
const SAFE_PATH_ARGUMENT = new RegExp("^[A-Za-z0-9_./:+~=\\-]+$");
const SAFE_REF_ARGUMENT = new RegExp("^[A-Za-z0-9_./~^\\-]+$");
const SAFE_CHANGE_ARGUMENT = new RegExp("^[a-z0-9][a-z0-9-]*$");
const DOUBLE_QUOTE = String.fromCharCode(34);
const SINGLE_QUOTE = String.fromCharCode(39);
const BACKSLASH = String.fromCharCode(92);
const QUOTED_PLACEHOLDER = String.fromCharCode(1);

function isDelegatedChild(rawDepth: string | undefined): boolean {
	if (rawDepth === undefined) return false;
	const depth = rawDepth.trim();
	if (depth.length === 0) return false;
	for (let index = 0; index < depth.length; index++) {
		const code = depth.charCodeAt(index);
		if (code < 48 || code > 57) return false;
	}
	const parsed = Number(depth);
	return Number.isSafeInteger(parsed) && parsed > 0;
}

function maskQuotedSpans(command: string): string | undefined {
	if (command.indexOf(QUOTED_PLACEHOLDER) !== -1) return undefined;
	let masked = "";
	let quote = "";
	for (let index = 0; index < command.length; index++) {
		const char = command[index];
		if (quote === "") {
			if (char === DOUBLE_QUOTE || char === SINGLE_QUOTE) {
				quote = char;
				masked += QUOTED_PLACEHOLDER;
			} else {
				masked += char;
			}
			continue;
		}
		if (quote === DOUBLE_QUOTE && char === BACKSLASH) {
			if (index + 1 >= command.length) return undefined;
			index++;
			continue;
		}
		if (char === quote) quote = "";
	}
	if (quote !== "") return undefined;
	return masked;
}

function isAllowedToolEventsArgs(args: string[]): boolean {
	for (let index = 0; index < args.length; index++) {
		const arg = args[index];
		if (arg === "--include-synthetic") continue;
		if (arg === "--events" || arg === "--session") {
			const value = args[++index];
			if (value === undefined || !SAFE_PATH_ARGUMENT.test(value)) return false;
			continue;
		}
		if (arg === "--min") {
			const value = args[++index];
			if (value === undefined || !POSITIVE_INTEGER.test(value)) return false;
			continue;
		}
		return false;
	}
	return true;
}

function isAllowedReadOnlyJust(tokens: string[]): boolean {
	const recipe = tokens[1] ?? "";
	if (!MAIN_BASH_READERS.has(recipe)) return false;
	const args = tokens.slice(2);
	if (recipe === "tool-events") return isAllowedToolEventsArgs(args);
	if (recipe === "learnings-preview") {
		return args.length <= 1 && (
			args.length === 0 || (!args[0].startsWith("-") && SAFE_REF_ARGUMENT.test(args[0]))
		);
	}
	if (recipe === "next") {
		return args.length === 1 && SAFE_CHANGE_ARGUMENT.test(args[0]);
	}
	return args.length === 0;
}

function isAllowedMainBash(command: unknown): boolean {
	if (typeof command !== "string" || command.trim() === "") return false;
	if (DANGEROUS.test(command)) return false;
	const maskedCommand = maskQuotedSpans(command);
	if (maskedCommand === undefined || BACKGROUND.test(maskedCommand)) return false;

	for (const rawSegment of maskedCommand.split(CHAIN_SPLIT)) {
		const segment = rawSegment.trim();
		if (segment === "") return false;

		const tokens = segment.split(WHITESPACE);
		const cmd = tokens[0];
		if (!cmd) return false;

		// Reject inline env assignments and the env command -- they inject GIT_PAGER /
		// GIT_EXTERNAL_DIFF / PAGER etc., which run arbitrary commands.
		if (cmd === "env" || ENV_ASSIGN.test(cmd)) return false;

		const writerArgs = MAIN_BASH_WRITERS.get(cmd);
		if (writerArgs && tokens[1] !== undefined && writerArgs.has(tokens[1])) {
			if (tokens.some((token) => token.indexOf(QUOTED_PLACEHOLDER) !== -1)) return false;
			if (tokens.some((token) =>
				token === "--out" || token === "-o" || token.indexOf("--out=") === 0
			)) return false;
			continue;
		}
		if (cmd === "just") {
			if (tokens.some((token) => token.indexOf(QUOTED_PLACEHOLDER) !== -1)) return false;
			if (isAllowedReadOnlyJust(tokens)) continue;
			return false;
		}

		if (!ALLOWED_COMMANDS.has(cmd)) return false;

		if (cmd === "openspec") {
			if (!OPENSPEC_READONLY.has(tokens[1] ?? "")) return false;
		} else if (cmd === "git") {
			if (!GIT_READONLY.has(tokens[1] ?? "")) return false;
		} else if (cmd === "find") {
			if (tokens.some((token) => FIND_MUTATORS.has(token))) return false;
		}
	}
	return true;
}

export default function (pi: any) {
	// Valid delegated children keep full tools and retain any inherited handshake value.
	if (isDelegatedChild(process.env.PI_SUBAGENT_DEPTH)) return;

	// Prove that this guard loaded and activated in this exact top-level process.
	process.env.__FORCE_DELEGATE_LOADED = String(process.pid);

	pi.on("tool_call", (event: any) => {
		if (event.toolName === "write" || event.toolName === "edit") {
			const target = event.input?.path ?? event.input?.file_path;
			logBlocked("force-delegate", event.toolName, DELEGATE_REASON, target);
			return { block: true, reason: DELEGATE_REASON };
		}
		if (event.toolName === "bash") {
			if (isAllowedMainBash(event.input?.command)) {
				return undefined;
			}
			logBlocked("force-delegate", "bash", BASH_REASON, event.input?.command);
			return { block: true, reason: BASH_REASON };
		}
		return undefined;
	});
}
