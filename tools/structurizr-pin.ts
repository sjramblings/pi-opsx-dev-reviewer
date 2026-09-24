/*
 * structurizr-pin.ts — load and freeze the immutable Structurizr toolchain pin.
 *
 * Runs via bun; not a pi extension.
 *
 * The pin is a closed schema: every object rejects missing, mistyped, and additional
 * fields. Mutable references (tag-only, "latest", "preview") and the retired
 * structurizr/cli and structurizr/lite distributions are rejected here, before any
 * Docker call is made.
 *
 * usage: import { loadPin } from "./structurizr-pin.ts"
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

export const PIN_PATH = join(import.meta.dir, "structurizr", "pin.json");

/** Repositories that carry a retired command interface and are never acceptable. */
const RETIRED_REPOSITORIES = ["structurizr/cli", "structurizr/lite"];

/** Tags that move and therefore cannot anchor an immutable pin. */
const MUTABLE_TAGS = ["latest", "preview", "edge", "main", "master"];

const DIGEST = /^sha256:[0-9a-f]{64}$/;
const BARE_SHA256 = /^[0-9a-f]{64}$/;
const COMMIT = /^[0-9a-f]{40}$/;
const SEMVER = /^\d+\.\d+\.\d+$/;
const ACTION_PIN = /^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/;

export class StructurizrPinError extends Error {
	readonly code = "CONFIG PIN";

	constructor(detail: string) {
		super(`CONFIG PIN: ${detail}`);
		this.name = "StructurizrPinError";
	}
}

const fail = (detail: string): never => {
	throw new StructurizrPinError(detail);
};

export type PinArchive = { url: string; sha256: string };

export type StructurizrPin = {
	schemaVersion: 1;
	image: {
		repository: string;
		tag: string;
		reference: string;
		indexDigest: string;
		entrypoint: string[];
		platforms: Record<string, string>;
		allowedEnvironmentNames: string[];
	};
	upstream: {
		tag: string;
		commit: string;
		releaseUrl: string;
		commitUrl: string;
		applicationVersion: string;
		librariesVersion: string;
	};
	interface: {
		platformProbeEntrypoint: string;
		platformProbe: string[];
		version: string[];
		validate: string[];
		jsonExport: string[];
		svgExport: string[];
	};
	xmlParser: {
		name: string;
		version: string;
		tarballUrl: string;
		tarballSha256: string;
		npmIntegrity: string;
		dependency: {
			name: string;
			version: string;
			tarballUrl: string;
			tarballSha256: string;
			npmIntegrity: string;
		};
		files: Record<string, string>;
		configuration: Record<string, unknown>;
	};
	bun: {
		version: string;
		setupAction: string;
		releaseUrl: string;
		ciExecutableSha256: string;
		archives: Record<string, PinArchive>;
	};
	timeoutsSeconds: Record<string, number>;
};

/** The only platforms this pin may target. Emulated targets are never pinned. */
export const SUPPORTED_PLATFORMS = ["linux/amd64", "linux/arm64"] as const;

const TIMEOUT_KEYS = [
	"bunVersion",
	"dockerInfo",
	"indexInspect",
	"pull",
	"imageInspect",
	"platformProbe",
	"version",
	"validate",
	"jsonExport",
	"svgExport",
	"terminateGrace",
	"forceRemove",
];

const ARCHIVE_KEYS = [
	"darwin-aarch64",
	"darwin-x64",
	"linux-aarch64",
	"linux-x64",
];

const PARSER_CONFIG_KEYS = [
	"xmlns",
	"fragment",
	"position",
	"defaultXMLVersion",
	"forceXMLVersion",
	"additionalNamespaces",
	"resolvePrefix",
	"doctype",
	"entities",
];

/** Assert an object has exactly the named keys — no missing, no additional. */
const closedObject = (
	value: unknown,
	keys: string[],
	where: string,
): Record<string, unknown> => {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return fail(`${where} must be an object`);
	}
	const actual = Object.keys(value as Record<string, unknown>).sort();
	const expected = [...keys].sort();
	const missing = expected.filter((k) => !actual.includes(k));
	const extra = actual.filter((k) => !expected.includes(k));
	if (missing.length > 0) {
		return fail(`${where} is missing field(s): ${missing.join(", ")}`);
	}
	if (extra.length > 0) {
		return fail(`${where} has additional field(s): ${extra.join(", ")}`);
	}
	return value as Record<string, unknown>;
};

const str = (value: unknown, where: string): string =>
	typeof value === "string" && value.length > 0
		? value
		: fail(`${where} must be a non-empty string`);

const strArray = (value: unknown, where: string): string[] => {
	if (!Array.isArray(value) || value.length === 0) {
		return fail(`${where} must be a non-empty array`);
	}
	value.forEach((item, index) => {
		if (typeof item !== "string") {
			fail(`${where}[${index}] must be a string`);
		}
	});
	return value as string[];
};

const exactArray = (value: unknown, expected: string[], where: string): string[] => {
	const actual = strArray(value, where);
	if (
		actual.length !== expected.length ||
		actual.some((item, index) => item !== expected[index])
	) {
		return fail(
			`${where} must be exactly ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
		);
	}
	return actual;
};

const digest = (value: unknown, where: string): string => {
	const raw = str(value, where);
	return DIGEST.test(raw) ? raw : fail(`${where} must be a sha256:<64 hex> digest`);
};

const bareSha = (value: unknown, where: string): string => {
	const raw = str(value, where);
	return BARE_SHA256.test(raw)
		? raw
		: fail(`${where} must be 64 lowercase hexadecimal characters`);
};

const httpsUrl = (value: unknown, where: string): string => {
	const raw = str(value, where);
	return raw.startsWith("https://") ? raw : fail(`${where} must be an https URL`);
};

const positiveInt = (value: unknown, where: string): number =>
	typeof value === "number" && Number.isSafeInteger(value) && value > 0
		? value
		: fail(`${where} must be a positive integer`);

/**
 * Parse pin bytes into a frozen pin. Every rejection is CONFIG PIN and happens
 * before Docker is queried.
 */
export const parsePin = (raw: string): StructurizrPin => {
	let root: unknown;
	try {
		root = JSON.parse(raw);
	} catch (error) {
		return fail(`pin is not valid JSON: ${(error as Error).message}`);
	}

	const top = closedObject(
		root,
		["schemaVersion", "image", "upstream", "interface", "xmlParser", "bun", "timeoutsSeconds"],
		"pin",
	);

	if (top.schemaVersion !== 1) {
		fail(`unsupported schemaVersion ${JSON.stringify(top.schemaVersion)}; expected 1`);
	}

	// --- image -------------------------------------------------------------
	const image = closedObject(
		top.image,
		[
			"repository",
			"tag",
			"reference",
			"indexDigest",
			"entrypoint",
			"platforms",
			"allowedEnvironmentNames",
		],
		"pin.image",
	);
	const repository = str(image.repository, "pin.image.repository");
	if (RETIRED_REPOSITORIES.includes(repository)) {
		fail(`repository ${repository} is a retired distribution and is not supported`);
	}
	if (repository !== "structurizr/structurizr") {
		fail(`repository must be structurizr/structurizr, got ${repository}`);
	}
	const tag = str(image.tag, "pin.image.tag");
	if (MUTABLE_TAGS.includes(tag)) {
		fail(`tag ${tag} is mutable and cannot anchor a pin`);
	}
	const indexDigest = digest(image.indexDigest, "pin.image.indexDigest");
	const reference = str(image.reference, "pin.image.reference");
	if (!reference.includes("@")) {
		fail("reference must be tag@digest; a tag-only reference is mutable");
	}
	if (reference !== `${repository}:${tag}@${indexDigest}`) {
		fail(
			`reference must be ${repository}:${tag}@${indexDigest}, got ${reference}`,
		);
	}
	const entrypoint = exactArray(
		image.entrypoint,
		["/usr/local/structurizr.sh"],
		"pin.image.entrypoint",
	);
	const platforms = closedObject(
		image.platforms,
		[...SUPPORTED_PLATFORMS],
		"pin.image.platforms",
	);
	const platformDigests: Record<string, string> = {};
	for (const platform of SUPPORTED_PLATFORMS) {
		platformDigests[platform] = digest(
			platforms[platform],
			`pin.image.platforms["${platform}"]`,
		);
	}
	if (platformDigests["linux/amd64"] === platformDigests["linux/arm64"]) {
		fail("the two platform manifest digests must differ");
	}
	const allowedEnvironmentNames = strArray(
		image.allowedEnvironmentNames,
		"pin.image.allowedEnvironmentNames",
	);
	const sortedEnv = [...allowedEnvironmentNames].sort();
	if (allowedEnvironmentNames.some((name, i) => name !== sortedEnv[i])) {
		fail("pin.image.allowedEnvironmentNames must be sorted");
	}
	if (new Set(allowedEnvironmentNames).size !== allowedEnvironmentNames.length) {
		fail("pin.image.allowedEnvironmentNames must not repeat a name");
	}

	// --- upstream ----------------------------------------------------------
	const upstream = closedObject(
		top.upstream,
		[
			"tag",
			"commit",
			"releaseUrl",
			"commitUrl",
			"applicationVersion",
			"librariesVersion",
		],
		"pin.upstream",
	);
	const commit = str(upstream.commit, "pin.upstream.commit");
	if (!COMMIT.test(commit)) {
		fail("pin.upstream.commit must be 40 lowercase hexadecimal characters");
	}
	const upstreamTag = str(upstream.tag, "pin.upstream.tag");
	const releaseUrl = httpsUrl(upstream.releaseUrl, "pin.upstream.releaseUrl");
	const commitUrl = httpsUrl(upstream.commitUrl, "pin.upstream.commitUrl");
	if (!releaseUrl.endsWith(`/${upstreamTag}`)) {
		fail("pin.upstream.releaseUrl must end with the upstream tag");
	}
	if (!commitUrl.endsWith(`/${commit}`)) {
		fail("pin.upstream.commitUrl must end with the upstream commit");
	}
	const applicationVersion = str(
		upstream.applicationVersion,
		"pin.upstream.applicationVersion",
	);
	if (!tag.startsWith(applicationVersion)) {
		fail("pin.image.tag must begin with the upstream applicationVersion");
	}
	const librariesVersion = str(
		upstream.librariesVersion,
		"pin.upstream.librariesVersion",
	);
	if (!SEMVER.test(librariesVersion)) {
		fail("pin.upstream.librariesVersion must be a semantic version");
	}

	// --- interface ---------------------------------------------------------
	const iface = closedObject(
		top.interface,
		[
			"platformProbeEntrypoint",
			"platformProbe",
			"version",
			"validate",
			"jsonExport",
			"svgExport",
		],
		"pin.interface",
	);
	const parsed = {
		platformProbeEntrypoint: str(
			iface.platformProbeEntrypoint,
			"pin.interface.platformProbeEntrypoint",
		),
		platformProbe: exactArray(
			iface.platformProbe,
			["-s", "-m"],
			"pin.interface.platformProbe",
		),
		version: exactArray(iface.version, ["version"], "pin.interface.version"),
		validate: exactArray(
			iface.validate,
			["validate", "-w", "/workspace/workspace.dsl"],
			"pin.interface.validate",
		),
		jsonExport: exactArray(
			iface.jsonExport,
			["export", "-w", "/workspace/workspace.dsl", "-f", "json", "-o", "/output"],
			"pin.interface.jsonExport",
		),
		svgExport: exactArray(
			iface.svgExport,
			[
				"export",
				"-w",
				"/workspace/workspace.dsl",
				"-f",
				"svg",
				"-o",
				"/output",
				"-mode",
				"light",
				"-animation",
				"false",
			],
			"pin.interface.svgExport",
		),
	};
	if (parsed.platformProbeEntrypoint !== "/usr/bin/uname") {
		fail("pin.interface.platformProbeEntrypoint must be /usr/bin/uname");
	}

	// --- xmlParser ---------------------------------------------------------
	const xmlParser = closedObject(
		top.xmlParser,
		[
			"name",
			"version",
			"tarballUrl",
			"tarballSha256",
			"npmIntegrity",
			"dependency",
			"files",
			"configuration",
		],
		"pin.xmlParser",
	);
	const dependency = closedObject(
		xmlParser.dependency,
		["name", "version", "tarballUrl", "tarballSha256", "npmIntegrity"],
		"pin.xmlParser.dependency",
	);
	const parserFiles = xmlParser.files;
	if (
		typeof parserFiles !== "object" ||
		parserFiles === null ||
		Array.isArray(parserFiles)
	) {
		fail("pin.xmlParser.files must be an object");
	}
	const fileEntries = Object.entries(parserFiles as Record<string, unknown>);
	if (fileEntries.length === 0) {
		fail("pin.xmlParser.files must not be empty");
	}
	for (const [name, value] of fileEntries) {
		bareSha(value, `pin.xmlParser.files["${name}"]`);
	}
	closedObject(xmlParser.configuration, PARSER_CONFIG_KEYS, "pin.xmlParser.configuration");
	const config = xmlParser.configuration as Record<string, unknown>;
	if (config.doctype !== "reject") {
		fail("pin.xmlParser.configuration.doctype must be reject");
	}
	if (config.entities !== "xml-builtins-only") {
		fail("pin.xmlParser.configuration.entities must be xml-builtins-only");
	}
	if (config.additionalNamespaces !== false || config.resolvePrefix !== false) {
		fail("pin.xmlParser.configuration must not permit additional namespaces");
	}
	if (config.xmlns !== true || config.fragment !== false) {
		fail("pin.xmlParser.configuration must be namespace-aware and non-fragment");
	}

	// --- bun ---------------------------------------------------------------
	const bun = closedObject(
		top.bun,
		["version", "setupAction", "releaseUrl", "ciExecutableSha256", "archives"],
		"pin.bun",
	);
	const bunVersion = str(bun.version, "pin.bun.version");
	if (!SEMVER.test(bunVersion)) {
		fail("pin.bun.version must be an exact semantic version");
	}
	const setupAction = str(bun.setupAction, "pin.bun.setupAction");
	if (!ACTION_PIN.test(setupAction)) {
		fail("pin.bun.setupAction must be pinned to a 40-hex commit");
	}
	const bunRelease = httpsUrl(bun.releaseUrl, "pin.bun.releaseUrl");
	if (!bunRelease.endsWith(`bun-v${bunVersion}`)) {
		fail("pin.bun.releaseUrl must end with the pinned bun version");
	}
	const ciExecutableSha256 = bareSha(
		bun.ciExecutableSha256,
		"pin.bun.ciExecutableSha256",
	);
	const archives = closedObject(bun.archives, ARCHIVE_KEYS, "pin.bun.archives");
	const parsedArchives: Record<string, PinArchive> = {};
	for (const key of ARCHIVE_KEYS) {
		const entry = closedObject(archives[key], ["url", "sha256"], `pin.bun.archives["${key}"]`);
		const url = httpsUrl(entry.url, `pin.bun.archives["${key}"].url`);
		const expected = `https://github.com/oven-sh/bun/releases/download/bun-v${bunVersion}/bun-${key}.zip`;
		if (url !== expected) {
			fail(`pin.bun.archives["${key}"].url must be ${expected}`);
		}
		parsedArchives[key] = {
			url,
			sha256: bareSha(entry.sha256, `pin.bun.archives["${key}"].sha256`),
		};
	}

	// --- timeouts ----------------------------------------------------------
	const timeouts = closedObject(top.timeoutsSeconds, TIMEOUT_KEYS, "pin.timeoutsSeconds");
	const parsedTimeouts: Record<string, number> = {};
	for (const key of TIMEOUT_KEYS) {
		parsedTimeouts[key] = positiveInt(timeouts[key], `pin.timeoutsSeconds.${key}`);
	}

	const pin: StructurizrPin = {
		schemaVersion: 1,
		image: {
			repository,
			tag,
			reference,
			indexDigest,
			entrypoint,
			platforms: platformDigests,
			allowedEnvironmentNames,
		},
		upstream: {
			tag: upstreamTag,
			commit,
			releaseUrl,
			commitUrl,
			applicationVersion,
			librariesVersion,
		},
		interface: parsed,
		xmlParser: {
			name: str(xmlParser.name, "pin.xmlParser.name"),
			version: str(xmlParser.version, "pin.xmlParser.version"),
			tarballUrl: httpsUrl(xmlParser.tarballUrl, "pin.xmlParser.tarballUrl"),
			tarballSha256: bareSha(xmlParser.tarballSha256, "pin.xmlParser.tarballSha256"),
			npmIntegrity: str(xmlParser.npmIntegrity, "pin.xmlParser.npmIntegrity"),
			dependency: {
				name: str(dependency.name, "pin.xmlParser.dependency.name"),
				version: str(dependency.version, "pin.xmlParser.dependency.version"),
				tarballUrl: httpsUrl(
					dependency.tarballUrl,
					"pin.xmlParser.dependency.tarballUrl",
				),
				tarballSha256: bareSha(
					dependency.tarballSha256,
					"pin.xmlParser.dependency.tarballSha256",
				),
				npmIntegrity: str(
					dependency.npmIntegrity,
					"pin.xmlParser.dependency.npmIntegrity",
				),
			},
			files: parserFiles as Record<string, string>,
			configuration: config,
		},
		bun: {
			version: bunVersion,
			setupAction,
			releaseUrl: bunRelease,
			ciExecutableSha256,
			archives: parsedArchives,
		},
		timeoutsSeconds: parsedTimeouts,
	};

	return Object.freeze(pin);
};

/** Read and validate the repository pin. */
export const loadPin = (path: string = PIN_PATH): StructurizrPin => {
	let raw: string;
	try {
		raw = readFileSync(path, "utf8");
	} catch (error) {
		return fail(`cannot read pin at ${path}: ${(error as Error).message}`);
	}
	return parsePin(raw);
};
