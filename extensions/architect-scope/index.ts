/*
 * architect-scope -- structurally holds the solution-architect design-artifacts-ONLY
 * boundary, and fails CLOSED.
 *
 * The solution-architect agent settles design (proposal.md, design.md, specs/**,
 * docs/decisions/**) and must never touch production code or tests. pi cannot path-gate
 * edit/write natively, but a tool_call handler can. This extension is loaded in every
 * agent process; it lets a positively-identified writer agent (developer, tech-writer)
 * write freely, restricts the architect to design artifacts, and BLOCKS every other case
 * -- including an unidentified/empty/unparseable PI_SUBAGENT_STACK. An unknown agent is
 * treated as unsafe, not safe, so a future change to how the stack is populated fails
 * closed (blocked) rather than open (unrestricted write).
 *
 * Agent identity comes from PI_SUBAGENT_STACK (set by @mjakl/pi-subagent): a JSON array
 * of ancestor agent names whose last element is the agent this process runs as.
 *
 * pi-loader note (LOAD-BREAKERS -- do not reintroduce): pi 0.79.9 loads extensions with a
 * fragile tokenizer that fails the whole file with "Unterminated string constant" and
 * SILENTLY disables it. It chokes on regex literals, raw backticks, and apostrophes (even
 * inside comments and double-quoted strings). So: use new RegExp / string methods, no
 * backticks, no apostrophes anywhere. Keep every quote character balanced.
 *
 * Install (per OpenSpec project): copy this folder to  <repo>/.pi/extensions/
 */

import { logBlocked } from "../lib/tool-events";

const REASON =
	"architect-scope: writes are restricted to design artifacts (proposal.md, design.md, " +
	"specs/**, docs/decisions/**) for the solution-architect and for any unidentified " +
	"agent. This path is production code or tests -- hand the change to the developer " +
	"subagent.";

// Agents positively allowed to write anywhere. Everyone else (architect, unknown) is
// restricted to design artifacts.
const FREE_WRITERS = new Set(["developer", "tech-writer"]);

function currentAgent(): string | undefined {
	const raw = process.env.PI_SUBAGENT_STACK;
	if (!raw) return undefined;
	try {
		const stack = JSON.parse(raw);
		if (Array.isArray(stack) && stack.length > 0) {
			const last = stack[stack.length - 1];
			return typeof last === "string" ? last : undefined;
		}
	} catch {
		// Unparseable stack -> unknown agent -> restricted (fail closed).
	}
	return undefined;
}

// A path is a design artifact if its basename is proposal.md/design.md, or it lives under
// a specs/ or docs/decisions/ directory. Matched on normalized forward-slash form using
// string methods only (no regex literals).
function isDesignArtifact(path: string): boolean {
	const p = path.split("\\").join("/");
	const base = p.slice(p.lastIndexOf("/") + 1);
	if (base === "proposal.md" || base === "design.md") return true;
	if (p === "specs" || p.startsWith("specs/") || p.includes("/specs/")) return true;
	if (p.startsWith("docs/decisions/") || p.includes("/docs/decisions/")) return true;
	return false;
}

export default function (pi: any) {
	pi.on("tool_call", async (event: any) => {
		if (event.toolName !== "write" && event.toolName !== "edit") return undefined;

		const agent = currentAgent();
		// Positively-identified free writers keep full write.
		if (agent && agent !== "solution-architect" && FREE_WRITERS.has(agent)) {
			return undefined;
		}

		// Architect OR any unidentified agent: allow only design artifacts.
		const input = event.input ?? {};
		const target = typeof input.path === "string"
			? input.path
			: typeof input.file_path === "string"
				? input.file_path
				: undefined;

		// No parseable target -> block rather than allow (fail closed).
		if (!target) {
			logBlocked("architect-scope", event.toolName, REASON, "");
			return { block: true, reason: REASON };
		}
		if (isDesignArtifact(target)) return undefined;
		logBlocked("architect-scope", event.toolName, REASON, target);
		return { block: true, reason: REASON };
	});
}
