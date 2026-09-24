/*
 * harness-selftest -- project-local fail-closed guard for marker-bearing sessions.
 *
 * A valid delegated child is exempt before handshake evaluation. Every marker-bearing
 * top-level process must carry the current PID handshake from force-delegate.
 *
 * Loader safety: no regex literals, raw backticks, or apostrophes anywhere in this file.
 */

import { existsSync } from "fs";
import { join } from "path";

type ExtensionContext = {
	ui?: { notify?: (message: string, level?: "error") => void };
	shutdown?: () => void;
};

type ExtensionHandler = (event: unknown, context: ExtensionContext) => unknown;

type UserBashResult = {
	result: {
		output: string;
		exitCode: undefined;
		cancelled: true;
		truncated: false;
	};
};

type ExtensionApi = {
	on: (name: string, handler: ExtensionHandler) => void;
};

const HALT_REASON =
	"HARNESS UNGUARDED -- force-delegate did not load in this top-level process. " +
	"Stop now. In the primary checkout run just check-extensions and repair the guard. " +
	"For a linked checkout, return to the primary, remove the unsafe worktree if needed, " +
	"then recreate it safely with just worktree <name> before restarting pi.";

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

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function reportSideChannelFailure(channel: string, error: unknown): void {
	process.stderr.write(
		"harness-selftest: " + channel + " failed after HALT: " + errorMessage(error) + "\n",
	);
}

export default function (pi: ExtensionApi): void {
	let halted = false;

	pi.on("session_start", (_event: unknown, context: ExtensionContext): void => {
		halted = false;
		if (!existsSync(join(process.cwd(), ".harness-marker"))) return;
		if (isDelegatedChild(process.env.PI_SUBAGENT_DEPTH)) return;
		if (process.env.__FORCE_DELEGATE_LOADED === String(process.pid)) return;

		halted = true;
		process.stderr.write("\n########## " + HALT_REASON + " ##########\n\n");
		if (context.ui && typeof context.ui.notify === "function") {
			try {
				context.ui.notify(HALT_REASON, "error");
			} catch (error) {
				reportSideChannelFailure("notification", error);
			}
		}
		if (typeof context.shutdown === "function") {
			try {
				context.shutdown();
			} catch (error) {
				reportSideChannelFailure("shutdown", error);
			}
		}
		process.exit(1);
	});

	pi.on("input", (): { action: "handled" } | undefined => {
		if (!halted) return undefined;
		return { action: "handled" };
	});

	pi.on("tool_call", (): { block: true; reason: string } | undefined => {
		if (!halted) return undefined;
		return { block: true, reason: HALT_REASON };
	});

	pi.on("user_bash", (): UserBashResult | undefined => {
		if (!halted) return undefined;
		return {
			result: {
				output: HALT_REASON,
				exitCode: undefined,
				cancelled: true,
				truncated: false,
			},
		};
	});
}
