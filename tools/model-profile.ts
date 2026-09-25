/*
 * model-profile.ts -- flip the agent line-up between named model profiles.
 *
 * The committed pins in agents/*.md are the source of truth and are never edited by this
 * tool. A profile is applied by writing project-local overrides to .pi/agents/, which the
 * subagent extension prefers over the global ~/.pi/agent/agents (precedence user < project,
 * see @mjakl/pi-subagent agents.ts). .pi/ is gitignored, so a temporary line-up can never be
 * committed by accident, and "off" is a directory delete.
 *
 *   bun tools/model-profile.ts status
 *   bun tools/model-profile.ts apply <profile>
 *   bun tools/model-profile.ts off
 */

import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const SRC_DIR = "agents";
const OVERRIDE_DIR = join(".pi", "agents");
const PROFILES_FILE = "model-profiles.json";
const MODEL_LINE = /^model:.*$/m;

// pi has TWO model layers and they are set in different places. The subagent pins live in agent
// files; pi's own session model lives in settings.json and is what /model rewrites. Switching only
// the first leaves the orchestrator silently on whatever it was last set to, which reads as "the
// toggle did not work". This tool owns both.
const SETTINGS = join(homedir(), ".pi", "agent", "settings.json");

type Profiles = Record<string, Record<string, string>>;

function fail(message: string): never {
	process.stderr.write(`model-profile: ${message}\n`);
	process.exit(1);
}

function rawProfiles(): { profiles?: Profiles; sessionDefault?: string } {
	if (!existsSync(PROFILES_FILE)) fail(`${PROFILES_FILE} not found -- run from the repo root.`);
	return JSON.parse(readFileSync(PROFILES_FILE, "utf8"));
}

function loadProfiles(): Profiles {
	const raw = rawProfiles();
	if (!raw.profiles) fail(`${PROFILES_FILE} has no "profiles" key.`);
	return raw.profiles;
}

function readSessionModel(): string {
	if (!existsSync(SETTINGS)) return "(no settings.json)";
	const s = JSON.parse(readFileSync(SETTINGS, "utf8"));
	return `${s.defaultProvider ?? "?"}/${s.defaultModel ?? "?"}`;
}

/** Set pi's own session model. Backed up once, because this is global state outside the repo. */
function writeSessionModel(pin: string): void {
	if (!existsSync(SETTINGS)) {
		process.stderr.write(`  skipped session model: ${SETTINGS} not found\n`);
		return;
	}
	const [provider, ...rest] = pin.split("/");
	const model = rest.join("/");
	if (!provider || !model) fail(`session pin "${pin}" must be provider/model`);
	const backup = `${SETTINGS}.orig`;
	if (!existsSync(backup)) copyFileSync(SETTINGS, backup);
	const s = JSON.parse(readFileSync(SETTINGS, "utf8"));
	s.defaultProvider = provider;
	s.defaultModel = model;
	writeFileSync(SETTINGS, JSON.stringify(s, null, 2) + "\n");
}

function agentNames(): string[] {
	if (!existsSync(SRC_DIR)) fail(`${SRC_DIR}/ not found -- run from the repo root.`);
	return readdirSync(SRC_DIR)
		.filter((f) => f.endsWith(".md"))
		.map((f) => f.replace(/\.md$/, ""))
		.sort();
}

function pinOf(path: string): string | undefined {
	if (!existsSync(path)) return undefined;
	return MODEL_LINE.exec(readFileSync(path, "utf8"))?.[0]?.replace(/^model:\s*/, "").trim();
}

// What matters for review independence is the TRAINING FAMILY, not the provider that routes
// the request. Cursor is a transport for many families at once, so cursor/gpt-5.3-codex-high
// and cursor/claude-4.6-opus-max are cross-family despite sharing a provider string.
function familyOf(pin: string): string {
	const [provider = "", id = ""] = pin.split("/");
	if (provider !== "cursor") return provider;
	if (id.startsWith("claude")) return "anthropic";
	if (id.startsWith("gpt") || id.includes("codex")) return "openai";
	if (id.startsWith("gemini")) return "google";
	if (id.includes("grok")) return "xai";
	if (id.startsWith("glm")) return "zhipu";
	if (id.startsWith("composer")) return "cursor-native";
	return `cursor:${id}`;
}

function status(): void {
	const overridden = existsSync(OVERRIDE_DIR);
	process.stdout.write(
		overridden
			? `profile: ACTIVE project override in ${OVERRIDE_DIR}/\n\n`
			: `profile: off -- the committed pins in ${SRC_DIR}/ apply\n\n`,
	);
	const pins = new Map<string, string>();
	for (const name of agentNames()) {
		const committed = pinOf(join(SRC_DIR, `${name}.md`)) ?? "(no pin)";
		const active = pinOf(join(OVERRIDE_DIR, `${name}.md`)) ?? committed;
		pins.set(name, active);
		const suffix = active === committed ? "" : `   (committed: ${committed})`;
		process.stdout.write(`  ${name.padEnd(20)} ${active}${suffix}\n`);
	}
	// The reviewer role only means something if it does not share a corpus with the developer.
	const devFamily = familyOf(pins.get("developer") ?? "");
	const revFamily = familyOf(pins.get("reviewer") ?? "");
	if (devFamily && devFamily === revFamily) {
		process.stdout.write(
			`\n  WARNING: developer and reviewer are both ${devFamily}.\n` +
				`  The reviewer shares the blind spots of the developer, so a PASS is correlated\n` +
				`  blindness rather than independent confirmation.\n`,
		);
	} else if (devFamily && revFamily) {
		process.stdout.write(`\n  cross-family review: ${devFamily} implements, ${revFamily} reviews.\n`);
	}
	// The layer people forget. /model rewrites this and nothing else does.
	process.stdout.write(`\n  session model (pi itself): ${readSessionModel()}\n`);
}

function apply(profileName: string): void {
	const profiles = loadProfiles();
	const profile = profiles[profileName];
	if (!profile) {
		fail(`unknown profile "${profileName}". Available: ${Object.keys(profiles).join(", ")}, off`);
	}
	mkdirSync(OVERRIDE_DIR, { recursive: true });
	let written = 0;
	for (const name of agentNames()) {
		const model = profile[name];
		if (name.startsWith("_")) continue;
		if (!model) {
			process.stderr.write(`  skipped ${name}: profile "${profileName}" has no entry\n`);
			continue;
		}
		const src = readFileSync(join(SRC_DIR, `${name}.md`), "utf8");
		if (!MODEL_LINE.test(src)) {
			process.stderr.write(`  skipped ${name}: no model: line in ${SRC_DIR}/${name}.md\n`);
			continue;
		}
		writeFileSync(join(OVERRIDE_DIR, `${name}.md`), src.replace(MODEL_LINE, `model: ${model}`));
		written++;
	}
	const sessionPin = profile["_session"];
	if (sessionPin) {
		writeSessionModel(sessionPin);
		process.stdout.write(`  session model -> ${sessionPin}\n`);
	} else {
		process.stderr.write(`  WARNING: profile "${profileName}" has no _session pin; pi's own model left unchanged\n`);
	}
	process.stdout.write(`applied "${profileName}" to ${written} agent(s) in ${OVERRIDE_DIR}/\n\n`);
	status();
	process.stdout.write(`\nVerify the ids resolve:  pi --list-models\n`);
}

function off(): void {
	if (!existsSync(OVERRIDE_DIR)) {
		process.stdout.write(`already off -- no ${OVERRIDE_DIR}/\n`);
	} else {
		rmSync(OVERRIDE_DIR, { recursive: true, force: true });
		process.stdout.write(`removed ${OVERRIDE_DIR}/ -- the committed pins apply again\n`);
	}
	const fallback = rawProfiles().sessionDefault;
	if (fallback) {
		writeSessionModel(fallback);
		process.stdout.write(`session model -> ${fallback}\n\n`);
	} else {
		process.stderr.write(`WARNING: no sessionDefault in ${PROFILES_FILE}; pi's own model left unchanged\n\n`);
	}
	status();
}

const [command, arg] = process.argv.slice(2);
if (command === "status" || command === undefined) status();
else if (command === "off") off();
else if (command === "apply") arg ? apply(arg) : fail("apply needs a profile name");
else fail(`unknown command "${command}". Use: status | apply <profile> | off`);
