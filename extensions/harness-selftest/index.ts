/*
 * harness-selftest -- a session-start canary that turns a SILENT enforcer-load failure
 * into a LOUD halt.
 *
 * The dogfood (see SHAKEDOWN.md) found that force-delegate can fail to load in pi and be
 * silently disabled, leaving the main agent able to write freely while everyone believes
 * delegation is enforced. This canary detects that at session start and refuses to be
 * quiet about it.
 *
 * Mechanism: force-delegate sets process.env.__FORCE_DELEGATE_LOADED = "1" when it loads
 * and activates for the main agent. Both run in the same main pi process, so this canary
 * reads that flag on session_start. If the flag is absent, force-delegate did not load --
 * so it prints a loud banner and asks the agent to stop. Subagents (depth > 0) skip the
 * check, since force-delegate no-ops there by design.
 *
 * pi-loader note: no regex literals, no raw backticks, no apostrophes (see SHAKEDOWN.md
 * and "just check-extensions"). Keep it that way.
 *
 * Install (per OpenSpec project): copy this folder to  <repo>/.pi/extensions/
 */

const HALT_BANNER =
	"HARNESS UNGUARDED -- force-delegate did not load, so the main agent is NOT read-only " +
	"and can write and run mutating commands directly. Delegation is not being enforced. " +
	"Stop now: run (just check-extensions), fix the extension, and restart. See SHAKEDOWN.md.";

export default function (pi: any) {
	pi.on("session_start", async (_event: any, ctx: any) => {
		// Subagents legitimately have no force-delegate; only the main agent is guarded.
		if (Number(process.env.PI_SUBAGENT_DEPTH ?? "0") > 0) return;

		if (process.env.__FORCE_DELEGATE_LOADED === "1") return; // guard active -- quiet OK

		process.stderr.write("\n########## " + HALT_BANNER + " ##########\n\n");
		if (ctx && ctx.ui && typeof ctx.ui.notify === "function") {
			try {
				ctx.ui.notify(HALT_BANNER);
			} catch {
				// notify is best-effort; the stderr banner is the reliable signal.
			}
		}
	});
}
