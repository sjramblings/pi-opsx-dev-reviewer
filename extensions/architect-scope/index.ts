/*
 * architect-scope -- structurally holds the solution-architect design-artifacts-only
 * boundary, and fails closed.
 *
 * The solution-architect agent settles design with proposal.md, design.md, specs/**,
 * and docs/decisions/**, and must never touch production code or tests. pi cannot
 * path-gate edit/write natively, but a tool_call handler can. This extension is loaded
 * in every agent process. It lets positively identified writer agents write freely,
 * applies per-agent path policies to scoped writers, restricts architects and unknown
 * agents to design artifacts, and blocks every other unsafe case.
 *
 * Agent identity comes from PI_SUBAGENT_STACK, set by @mjakl/pi-subagent, as a JSON
 * array of ancestor agent names whose last element is the agent this process runs as.
 *
 * pi-loader note LOAD-BREAKERS -- do not reintroduce: pi 0.79.9 loads extensions with a
 * fragile tokenizer that fails the whole file with an unterminated string constant and
 * silently disables it. It chokes on regex literals, raw backticks, and apostrophes even
 * inside comments and double quoted strings. So use new RegExp or string methods, no
 * backticks, no apostrophes anywhere. Keep every quote character balanced.
 *
 * Install per OpenSpec project: copy this folder to  <repo>/.pi/extensions/
 */

import { realpathSync } from "fs";
import { logBlocked } from "../lib/tool-events";

const DESIGN_REASON =
	"architect-scope: writes are restricted to design artifacts (proposal.md, design.md, " +
	"specs/**, docs/decisions/**) for the solution-architect and for any unidentified " +
	"agent. This path is production code or tests -- hand the change to the developer " +
	"subagent.";

const ARCHITECTURE_WRITER_REASON =
	"architect-scope: architecture-writer writes are restricted to docs/architecture/**. " +
	"Decisions in docs/decisions/** belong to the solution-architect.";

const EVOLUTION_NARRATOR_REASON =
	"architect-scope: evolution-narrator writes are restricted to thesis.json. It sharpens " +
	"the timeline hero thesis only, never the tool, the template, or any count.";

const MISSING_POLICY_REASON =
	"architect-scope: scoped agent policy is missing. Write blocked by fail closed guard.";

// Agents positively allowed to write anywhere. Everyone else -- the architect, the
// scoped writers, and any unidentified agent -- is restricted. Do not add an agent here
// to work around a path gate: give it a scoped policy instead. Read-only agents such as
// reviewer and spec-reviewer are deliberately absent; they hold no write tool, so listing
// them here would only loosen this guard for no gain.
const OPEN_WRITERS = new Set(["developer", "tech-writer"]);
const SCOPED_AGENT_NAMES = new Set(["architecture-writer", "evolution-narrator"]);

type PathPolicy = {
	allowedPrefixes: string[];
	blockReason: string;
};

const AGENT_PATH_POLICIES = new Map<string, PathPolicy>([
	[
		"architecture-writer",
		{
			allowedPrefixes: ["docs/architecture/"],
			blockReason: ARCHITECTURE_WRITER_REASON,
		},
	],
	[
		"evolution-narrator",
		{
			allowedPrefixes: ["thesis.json"],
			blockReason: EVOLUTION_NARRATOR_REASON,
		},
	],
]);

type ToolDecision = { block: true; reason: string };

type ToolCallEvent = {
	toolName: string;
	input?: unknown;
};

type PiEventBus = {
	on: (
		name: "tool_call",
		handler: (event: ToolCallEvent) => Promise<ToolDecision | undefined>,
	) => void;
};

function currentAgent(): string | undefined {
	const raw = process.env.PI_SUBAGENT_STACK;
	if (!raw) return undefined;
	try {
		const stack = JSON.parse(raw);
		if (Array.isArray(stack) && stack.length > 0) {
			const last = stack[stack.length - 1];
			return typeof last === "string" ? last : undefined;
		}
	} catch (parseError) {
		void parseError;
		return undefined;
	}
	return undefined;
}

function normalizedPath(path: string): string {
	return path.split("\\").join("/");
}

function safePath(path: string): string | undefined {
	const normalized = normalizedPath(path);
	const parts = normalized.split("/");
	const cleanParts: string[] = [];
	for (const part of parts) {
		if (part === "..") return undefined;
		if (part !== "" && part !== ".") cleanParts.push(part);
	}
	return cleanParts.join("/");
}

function targetFromInput(input: unknown): string | undefined {
	if (!input || typeof input !== "object") return undefined;
	const fields = input as { path?: unknown; file_path?: unknown };
	if (typeof fields.path === "string") return fields.path;
	if (typeof fields.file_path === "string") return fields.file_path;
	return undefined;
}

function isAbsolutePath(path: string): boolean {
	const normalized = normalizedPath(path);
	if (normalized.startsWith("/")) return true;
	if (normalized.length > 2 && normalized.slice(1, 3) === ":/") return true;
	return false;
}

// Resolve symlinks on the deepest part of the path that exists on disk, then re-append
// the part that does not exist yet. A plain realpathSync throws for a file about to be
// written, and comparing an unresolved path against a resolved cwd silently blocks a
// legitimate write whenever the repo sits under a symlink -- on macOS the system temp
// directory is exactly that case, since /var is a link to /private/var.
function resolveSymlinks(path: string): string {
	const head = normalizedPath(path).split("/");
	const tail: string[] = [];
	while (head.length > 0) {
		const candidate = head.join("/");
		try {
			const real = normalizedPath(realpathSync(candidate === "" ? "/" : candidate));
			if (tail.length === 0) return real;
			const rest = tail.slice().reverse().join("/");
			return real + "/" + rest;
		} catch (resolveError) {
			void resolveError;
			const popped = head.pop();
			if (popped !== undefined) tail.push(popped);
		}
	}
	return normalizedPath(path);
}

function rootRelativePath(path: string): string | undefined {
	// Reject dot-segment escapes against the path as given, before any resolution.
	const p = safePath(path);
	if (!p) return undefined;
	if (!isAbsolutePath(path)) return p;

	const target = safePath(resolveSymlinks(path));
	const cwd = safePath(resolveSymlinks(process.cwd()));
	if (!target || !cwd) return undefined;
	if (target === cwd) return "";
	if (target.startsWith(cwd + "/")) return target.slice(cwd.length + 1);
	return undefined;
}

function isUnderPrefix(path: string, prefix: string): boolean {
	const p = rootRelativePath(path);
	if (!p) return false;
	return p.startsWith(prefix);
}

function isAllowedByPolicy(path: string, policy: PathPolicy): boolean {
	for (const prefix of policy.allowedPrefixes) {
		if (isUnderPrefix(path, prefix)) return true;
	}
	return false;
}

function isDesignArtifact(path: string): boolean {
	const p = safePath(path);
	if (!p) return false;
	const base = p.slice(p.lastIndexOf("/") + 1);
	if (base === "proposal.md" || base === "design.md") return true;
	if (p === "specs" || p.startsWith("specs/") || p.includes("/specs/")) return true;
	if (p.startsWith("docs/decisions/") || p.includes("/docs/decisions/")) return true;
	return false;
}

function block(event: ToolCallEvent, reason: string, target: string): ToolDecision {
	logBlocked("architect-scope", event.toolName, reason, target);
	return { block: true, reason: reason };
}

export default function (pi: PiEventBus) {
	pi.on("tool_call", async (event: ToolCallEvent): Promise<ToolDecision | undefined> => {
		if (event.toolName !== "write" && event.toolName !== "edit") return undefined;

		const agent = currentAgent();
		if (agent && OPEN_WRITERS.has(agent)) return undefined;

		const target = targetFromInput(event.input ?? {});
		const scopedAgent = agent ? SCOPED_AGENT_NAMES.has(agent) : false;
		const policy = scopedAgent && agent ? AGENT_PATH_POLICIES.get(agent) : undefined;

		if (scopedAgent && !policy) {
			return block(event, MISSING_POLICY_REASON, target ?? "");
		}

		const reason = policy ? policy.blockReason : DESIGN_REASON;
		if (!target) return block(event, reason, "");

		if (policy) {
			if (isAllowedByPolicy(target, policy)) return undefined;
			return block(event, reason, target);
		}

		if (isDesignArtifact(target)) return undefined;
		return block(event, reason, target);
	});
}
