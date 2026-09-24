/*
 * structurizr-verify.ts — consistency, SVG safety, and provenance manifest.
 *
 * Runs via bun; not a pi extension.
 *
 * Three fail-closed layers over renderer output:
 *   1. the exported workspace JSON really describes the views that were rendered;
 *   2. every SVG is passive and self-contained, accepted as-is or rejected — never
 *      sanitized, never rewritten;
 *   3. a schema-version 1 manifest records exactly what was verified.
 *
 * Determinism applies to serialization and recorded provenance only. Primary SVGs carry
 * renderer wall-clock text, so two safe renders may differ; that is accepted, and no
 * byte-equality assertion is ever made.
 *
 * usage: import { verifyOutput } from "./structurizr-verify.ts"
 */

import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import type { StructurizrPin } from "./structurizr-pin.ts";

const require = createRequire(import.meta.url);

/** The vendored, hash-pinned parser. Never resolved from the ambient node_modules. */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { SaxesParser } = require("./vendor/structurizr-xml/node_modules/saxes/saxes.js");

export const VENDOR_ROOT = join(
	import.meta.dir,
	"vendor",
	"structurizr-xml",
	"node_modules",
);

// --- limits ---------------------------------------------------------------

export const MAX_JSON_BYTES = 25 * 1024 * 1024;
export const MAX_SVG_BYTES = 25 * 1024 * 1024;
export const MAX_AGGREGATE_BYTES = 250 * 1024 * 1024;
export const MAX_ELEMENTS = 100_000;
export const MAX_DEPTH = 256;
export const MAX_ATTRIBUTES_PER_ELEMENT = 256;

export const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
export const XLINK_NAMESPACE = "http://www.w3.org/1999/xlink";
export const XML_NAMESPACE = "http://www.w3.org/XML/1998/namespace";
export const XMLNS_NAMESPACE = "http://www.w3.org/2000/xmlns/";

/** The only namespaces this option ever accepts in renderer output. */
export const PERMITTED_NAMESPACES = new Set([
	SVG_NAMESPACE,
	XLINK_NAMESPACE,
	XML_NAMESPACE,
	XMLNS_NAMESPACE,
]);

export const CANONICAL_VIEW_KEYS = ["context", "container", "component"] as const;
export const VIEW_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

export type ConsistencyCode = "JSON" | "LINEAGE" | "VIEW_KEY" | "SVG_SAFETY";

export class StructurizrConsistencyError extends Error {
	readonly errorClass = "CONSISTENCY";
	readonly code: ConsistencyCode;

	constructor(code: ConsistencyCode, detail: string) {
		super(`CONSISTENCY ${code}: ${detail}`);
		this.code = code;
		this.name = "StructurizrConsistencyError";
	}
}

const jsonFail = (detail: string): never => {
	throw new StructurizrConsistencyError("JSON", detail);
};
const lineageFail = (detail: string): never => {
	throw new StructurizrConsistencyError("LINEAGE", detail);
};
const viewKeyFail = (detail: string): never => {
	throw new StructurizrConsistencyError("VIEW_KEY", detail);
};
const svgFail = (detail: string): never => {
	throw new StructurizrConsistencyError("SVG_SAFETY", detail);
};

// --- shared filesystem rules ---------------------------------------------

/** Accept only a single-link regular file; symlinks, hard links, and specials fail. */
export const readRegularFile = (
	path: string,
	maxBytes: number,
	fail: (detail: string) => never,
): Buffer => {
	let stats;
	try {
		stats = lstatSync(path);
	} catch {
		return fail(`${path} does not exist`);
	}
	if (stats.isSymbolicLink()) return fail(`${path} is a symbolic link`);
	if (!stats.isFile()) return fail(`${path} is not a regular file`);
	if (stats.nlink !== 1) return fail(`${path} has ${stats.nlink} hard links`);
	if (stats.size > maxBytes) {
		return fail(`${path} is ${stats.size} bytes, over the ${maxBytes}-byte bound`);
	}
	return readFileSync(path);
};

/** Decode strict UTF-8 or fail with the caller's code. */
export const decodeStrictUtf8 = (
	bytes: Buffer,
	path: string,
	fail: (detail: string) => never,
): string => {
	try {
		return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
	} catch {
		return fail(`${path} is not strict UTF-8`);
	}
};

// --- 3.1 workspace JSON ---------------------------------------------------

type Element = { id: string; kind: string; children: Element[] };

export type WorkspaceModel = {
	elementIds: Set<string>;
	/** Every relationship, source-declared and implied, flattened to id pairs. */
	relationships: Array<{ sourceId: string; destinationId: string }>;
	views: Array<{ key: string; kind: string; elementIds: string[] }>;
};

const asObject = (value: unknown, where: string): Record<string, unknown> => {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return jsonFail(`${where} must be an object`);
	}
	return value as Record<string, unknown>;
};

const asArray = (value: unknown, where: string): unknown[] => {
	if (value === undefined) return [];
	if (!Array.isArray(value)) return jsonFail(`${where} must be an array`);
	return value;
};

const nonEmptyId = (value: unknown, where: string): string => {
	if (typeof value !== "string" || value.length === 0) {
		return jsonFail(`${where} must be a non-empty string`);
	}
	return value;
};

/** Walk people, systems, containers, and components into a flat element set. */
const collectElements = (model: Record<string, unknown>): Element[] => {
	const out: Element[] = [];

	for (const person of asArray(model.people, "model.people")) {
		const record = asObject(person, "model.people[]");
		out.push({ id: nonEmptyId(record.id, "person.id"), kind: "person", children: [] });
	}

	for (const system of asArray(model.softwareSystems, "model.softwareSystems")) {
		const systemRecord = asObject(system, "model.softwareSystems[]");
		const systemNode: Element = {
			id: nonEmptyId(systemRecord.id, "softwareSystem.id"),
			kind: "softwareSystem",
			children: [],
		};
		out.push(systemNode);

		for (const container of asArray(systemRecord.containers, "softwareSystem.containers")) {
			const containerRecord = asObject(container, "containers[]");
			const containerNode: Element = {
				id: nonEmptyId(containerRecord.id, "container.id"),
				kind: "container",
				children: [],
			};
			systemNode.children.push(containerNode);
			out.push(containerNode);

			for (const component of asArray(containerRecord.components, "container.components")) {
				const componentRecord = asObject(component, "components[]");
				const componentNode: Element = {
					id: nonEmptyId(componentRecord.id, "component.id"),
					kind: "component",
					children: [],
				};
				containerNode.children.push(componentNode);
				out.push(componentNode);
			}
		}
	}

	return out;
};

/** Relationships hang off their source element; flatten every level. */
const collectRelationships = (
	model: Record<string, unknown>,
): Array<{ sourceId: string; destinationId: string }> => {
	const out: Array<{ sourceId: string; destinationId: string }> = [];

	const visit = (node: unknown, where: string): void => {
		const record = asObject(node, where);
		for (const relationship of asArray(record.relationships, `${where}.relationships`)) {
			const relationshipRecord = asObject(relationship, `${where}.relationships[]`);
			out.push({
				sourceId: nonEmptyId(relationshipRecord.sourceId, "relationship.sourceId"),
				destinationId: nonEmptyId(
					relationshipRecord.destinationId,
					"relationship.destinationId",
				),
			});
		}
		for (const key of ["containers", "components"]) {
			for (const child of asArray(record[key], `${where}.${key}`)) {
				visit(child, `${where}.${key}[]`);
			}
		}
	};

	for (const person of asArray(model.people, "model.people")) visit(person, "person");
	for (const system of asArray(model.softwareSystems, "model.softwareSystems")) {
		visit(system, "softwareSystem");
	}

	return out;
};

const VIEW_ARRAYS: Array<[string, string]> = [
	["systemLandscapeViews", "systemLandscape"],
	["systemContextViews", "systemContext"],
	["containerViews", "container"],
	["componentViews", "component"],
	["dynamicViews", "dynamic"],
	["deploymentViews", "deployment"],
	["filteredViews", "filtered"],
	["imageViews", "image"],
];

/** Parse the exported workspace into the shape the gate reasons over. */
export const parseWorkspace = (raw: string): WorkspaceModel => {
	let root: unknown;
	try {
		root = JSON.parse(raw);
	} catch (error) {
		return jsonFail(`workspace.json is not valid JSON: ${(error as Error).message}`);
	}

	const workspace = asObject(root, "workspace");
	const model = asObject(workspace.model, "workspace.model");
	const viewsRoot = asObject(workspace.views, "workspace.views");

	const elements = collectElements(model);
	const elementIds = new Set(elements.map((element) => element.id));
	if (elementIds.size !== elements.length) {
		jsonFail("workspace model repeats an element id");
	}

	const relationships = collectRelationships(model);
	for (const relationship of relationships) {
		if (!elementIds.has(relationship.sourceId)) {
			jsonFail(`relationship source ${relationship.sourceId} is not a known element`);
		}
		if (!elementIds.has(relationship.destinationId)) {
			jsonFail(
				`relationship destination ${relationship.destinationId} is not a known element`,
			);
		}
	}

	const views: WorkspaceModel["views"] = [];
	for (const [arrayName, kind] of VIEW_ARRAYS) {
		for (const view of asArray(viewsRoot[arrayName], `views.${arrayName}`)) {
			const viewRecord = asObject(view, `views.${arrayName}[]`);
			const key = nonEmptyId(viewRecord.key, `views.${arrayName}[].key`);
			const referenced: string[] = [];
			for (const entry of asArray(viewRecord.elements, `views.${arrayName}[].elements`)) {
				const entryRecord = asObject(entry, `views.${arrayName}[].elements[]`);
				const id = nonEmptyId(entryRecord.id, "view element id");
				if (!elementIds.has(id)) {
					jsonFail(`view ${key} references unknown element ${id}`);
				}
				referenced.push(id);
			}
			views.push({ key, kind, elementIds: referenced });
		}
	}

	if (views.length === 0) jsonFail("workspace exports no views");

	return { elementIds, relationships, views };
};

/** Every exported key must be safe, bounded, and free of legend or case collisions. */
export const verifyViewKeys = (views: WorkspaceModel["views"]): void => {
	const seen = new Map<string, string>();

	for (const view of views) {
		if (!VIEW_KEY_PATTERN.test(view.key)) {
			viewKeyFail(`view key ${JSON.stringify(view.key)} is not a safe 1-64 character key`);
		}
		if (view.key.toLowerCase().endsWith("-key")) {
			viewKeyFail(
				`view key ${JSON.stringify(view.key)} ends with -key and would collide with a legend file`,
			);
		}
		const folded = view.key.toLowerCase();
		const previous = seen.get(folded);
		if (previous !== undefined) {
			viewKeyFail(
				`view keys ${JSON.stringify(previous)} and ${JSON.stringify(view.key)} collide when case-folded`,
			);
		}
		seen.set(folded, view.key);
	}
};

/**
 * Prove the canonical views really describe one system: they must share an element, and
 * a source relationship must reach across them directly or through a linked ancestor.
 */
export const verifyLineage = (workspace: WorkspaceModel): void => {
	const canonical = CANONICAL_VIEW_KEYS.map((key) => {
		const view = workspace.views.find((candidate) => candidate.key === key);
		if (view === undefined) {
			return lineageFail(`the canonical view ${key} is absent from the export`);
		}
		return view;
	});

	const [context, container, component] = canonical;

	const shared = context.elementIds.filter(
		(id) => container.elementIds.includes(id) && component.elementIds.includes(id),
	);
	if (shared.length === 0) {
		lineageFail(
			"the context, container, and component views share no element, so they do not describe one system",
		);
	}

	// At least one relationship must be visible in every canonical view.
	const crossing = workspace.relationships.filter(
		(relationship) =>
			[context, container, component].every(
				(view) =>
					view.elementIds.includes(relationship.sourceId) ||
					view.elementIds.includes(relationship.destinationId),
			) && relationship.sourceId !== relationship.destinationId,
	);
	if (crossing.length === 0) {
		lineageFail(
			"no source relationship reaches across the context, container, and component views",
		);
	}
};

// --- output file mapping --------------------------------------------------

export type OutputInventory = {
	workspaceJson: string;
	/** key -> primary SVG path. */
	primary: Map<string, string>;
	/** key -> legend SVG path, when the renderer emitted one. */
	legend: Map<string, string>;
};

/** Map every exported key onto exactly one primary SVG and at most one legend. */
export const mapOutput = (
	directory: string,
	views: WorkspaceModel["views"],
): OutputInventory => {
	let entries: string[];
	try {
		entries = readdirSync(directory);
	} catch {
		return jsonFail(`output directory ${directory} cannot be read`);
	}

	const expectedPrimary = new Map(views.map((view) => [`${view.key}.svg`, view.key]));
	const expectedLegend = new Map(views.map((view) => [`${view.key}-key.svg`, view.key]));

	const primary = new Map<string, string>();
	const legend = new Map<string, string>();

	for (const entry of entries) {
		const path = join(directory, entry);
		if (entry === "workspace.json") continue;
		if (entry === "manifest.json") continue;

		const primaryKey = expectedPrimary.get(entry);
		const legendKey = expectedLegend.get(entry);

		if (primaryKey === undefined && legendKey === undefined) {
			jsonFail(`unexpected output file ${entry}`);
		}
		if (primaryKey !== undefined) {
			if (primary.has(primaryKey)) jsonFail(`duplicate primary output for ${primaryKey}`);
			primary.set(primaryKey, path);
		} else if (legendKey !== undefined) {
			if (legend.has(legendKey)) jsonFail(`duplicate legend output for ${legendKey}`);
			legend.set(legendKey, path);
		}
	}

	for (const view of views) {
		if (!primary.has(view.key)) {
			jsonFail(`view ${view.key} has no ${view.key}.svg`);
		}
	}

	const workspaceJson = join(directory, "workspace.json");
	readRegularFile(workspaceJson, MAX_JSON_BYTES, jsonFail);

	return { workspaceJson, primary, legend };
};

// --- 3.2 SVG safety -------------------------------------------------------

/** Elements that can execute, embed, or navigate. Never permitted. */
const PROHIBITED_ELEMENTS = new Set([
	"script",
	"foreignobject",
	"iframe",
	"embed",
	"object",
	"audio",
	"video",
	"animate",
	"animatetransform",
	"animatemotion",
	"set",
	"handler",
	"listener",
	"a",
	"use",
	"filter",
	"feimage",
	"cursor",
	"font-face-uri",
]);

/** Attributes that name a resource. Only a local fragment is ever acceptable. */
const URL_BEARING_ATTRIBUTES = new Set([
	"href",
	"src",
	"data",
	"from",
	"to",
	"values",
	"by",
	"begin",
	"end",
	"path",
	"formaction",
	"action",
	"poster",
	"background",
	"ping",
	"srcset",
	"content",
	"filter",
	"clip-path",
	"mask",
	"marker",
	"marker-start",
	"marker-mid",
	"marker-end",
	"fill",
	"stroke",
	"style",
	"cursor",
	"clip",
]);

/** Attributes whose value is a bare IRI rather than a CSS-ish value. */
const IRI_ATTRIBUTES = new Set(["href", "src", "data", "poster", "background"]);

const LOCAL_FRAGMENT = /^#[A-Za-z_][\w.:-]*$/;
const FUNCTIONAL_IRI = /url\(\s*(['"]?)([^)'"]*)\1\s*\)/gi;

/** A functional IRI may only point at a local fragment in this document. */
const assertFunctionalIris = (value: string, where: string): void => {
	FUNCTIONAL_IRI.lastIndex = 0;
	let match = FUNCTIONAL_IRI.exec(value);
	while (match !== null) {
		const target = match[2].trim();
		if (!LOCAL_FRAGMENT.test(target)) {
			svgFail(`${where} references non-local resource ${JSON.stringify(target)}`);
		}
		match = FUNCTIONAL_IRI.exec(value);
	}
};

/** CSS text must carry no escape, comment, at-rule, or external reference. */
export const assertPassiveCss = (value: string, where: string): void => {
	if (value.includes("\\")) svgFail(`${where} contains a CSS escape`);
	if (value.includes("/*") || value.includes("*/")) svgFail(`${where} contains a CSS comment`);
	if (value.includes("@")) svgFail(`${where} contains a CSS at-rule`);
	if (/expression\s*\(/i.test(value)) svgFail(`${where} contains a CSS expression`);
	if (/behaviou?r\s*:/i.test(value)) svgFail(`${where} contains a CSS behavior`);
	assertFunctionalIris(value, where);
};

const hasAsciiControl = (value: string): boolean => {
	for (let i = 0; i < value.length; i += 1) {
		const code = value.charCodeAt(i);
		// Tab, LF, and CR are the only control characters XML text may carry.
		if (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) return true;
		if (code === 0x7f) return true;
	}
	return false;
};

export type SvgSafetyReport = { elements: number; maxDepth: number; byteLength: number };

/**
 * Parse one SVG and accept it only if every construct is passive and self-contained.
 * Nothing is sanitized or rewritten; the file is accepted or rejected as it stands.
 */
export const verifySvgText = (
	text: string,
	path: string,
	byteLength: number,
): SvgSafetyReport => {
	if (text.trim().length === 0) svgFail(`${path} is empty`);
	if (hasAsciiControl(text)) svgFail(`${path} contains a disallowed ASCII control character`);

	const parser = new SaxesParser({
		xmlns: true,
		fragment: false,
		position: true,
		defaultXMLVersion: "1.0",
		forceXMLVersion: true,
		additionalNamespaces: undefined,
		resolvePrefix: undefined,
	});

	let elements = 0;
	let depth = 0;
	let maxDepth = 0;
	let sawRoot = false;
	let failure: Error | undefined;

	const guard = (run: () => void): void => {
		if (failure !== undefined) return;
		try {
			run();
		} catch (error) {
			failure = error as Error;
		}
	};

	parser.on("error", (error: Error) => {
		if (failure === undefined) {
			failure = new StructurizrConsistencyError(
				"SVG_SAFETY",
				`${path} is not well-formed XML: ${error.message}`,
			);
		}
	});

	parser.on("doctype", () => {
		guard(() => svgFail(`${path} declares a doctype`));
	});

	parser.on("processinginstruction", (instruction: { target: string }) => {
		guard(() => {
			// Only the XML declaration is tolerated, and saxes reports that separately.
			svgFail(`${path} carries processing instruction ${instruction.target}`);
		});
	});

	parser.on("opentag", (node: any) => {
		guard(() => {
			elements += 1;
			depth += 1;
			maxDepth = Math.max(maxDepth, depth);

			if (elements > MAX_ELEMENTS) svgFail(`${path} exceeds ${MAX_ELEMENTS} elements`);
			if (depth > MAX_DEPTH) svgFail(`${path} exceeds depth ${MAX_DEPTH}`);

			const local = String(node.local ?? node.name).toLowerCase();
			const uri = String(node.uri ?? "");

			if (!sawRoot) {
				sawRoot = true;
				if (local !== "svg" || uri !== SVG_NAMESPACE) {
					svgFail(`${path} root element must be svg in ${SVG_NAMESPACE}`);
				}
			}

			if (uri !== SVG_NAMESPACE && uri !== "" && uri !== XLINK_NAMESPACE) {
				svgFail(`${path} contains foreign-namespace element ${node.name}`);
			}
			if (PROHIBITED_ELEMENTS.has(local)) {
				svgFail(`${path} contains prohibited element ${local}`);
			}

			const attributes = node.attributes ?? {};
			const names = Object.keys(attributes);
			if (names.length > MAX_ATTRIBUTES_PER_ELEMENT) {
				svgFail(`${path} element ${local} exceeds ${MAX_ATTRIBUTES_PER_ELEMENT} attributes`);
			}

			for (const name of names) {
				const attribute = attributes[name];
				const value = String(
					typeof attribute === "object" && attribute !== null
						? (attribute as any).value
						: attribute,
				);
				const attributeUri = String(
					typeof attribute === "object" && attribute !== null
						? ((attribute as any).uri ?? "")
						: "",
				);
				const localName = String(
					typeof attribute === "object" && attribute !== null
						? ((attribute as any).local ?? name)
						: name,
				).toLowerCase();
				const where = `${path} ${local}@${name}`;

				// A namespace declaration is structure, not a resource reference. Its
				// value is still held to the permitted-namespace set below.
				if (attributeUri === XMLNS_NAMESPACE || name === "xmlns") {
					if (!PERMITTED_NAMESPACES.has(value)) {
						svgFail(`${where} declares foreign namespace ${JSON.stringify(value)}`);
					}
					continue;
				}

				if (localName.startsWith("on")) svgFail(`${where} is an event handler`);

				if (attributeUri === XML_NAMESPACE && localName === "base") {
					if (value.trim().length > 0) svgFail(`${where} sets a non-empty xml:base`);
				}

				if (attributeUri !== "" && !PERMITTED_NAMESPACES.has(attributeUri)) {
					svgFail(`${where} is in foreign namespace ${attributeUri}`);
				}

				if (IRI_ATTRIBUTES.has(localName)) {
					// The observed passive output carries no href at all.
					if (!LOCAL_FRAGMENT.test(value.trim())) {
						svgFail(`${where} points outside this document: ${JSON.stringify(value)}`);
					}
				} else if (URL_BEARING_ATTRIBUTES.has(localName)) {
					assertPassiveCss(value, where);
				} else {
					assertFunctionalIris(value, where);
				}
			}
		});
	});

	parser.on("closetag", () => {
		guard(() => {
			depth -= 1;
		});
	});

	parser.on("text", (chunk: string) => {
		guard(() => {
			// <style> content is CSS, not markup; hold it to the same passive rules.
			if (chunk.includes("@") || chunk.includes("\\") || chunk.includes("/*")) {
				assertPassiveCss(chunk, `${path} text`);
			}
			assertFunctionalIris(chunk, `${path} text`);
		});
	});

	parser.write(text);
	parser.close();

	if (failure !== undefined) throw failure;
	if (!sawRoot) svgFail(`${path} has no root element`);

	return { elements, maxDepth, byteLength };
};

/** Verify one SVG file end to end under every filesystem and content rule. */
export const verifySvgFile = (path: string): SvgSafetyReport => {
	const bytes = readRegularFile(path, MAX_SVG_BYTES, svgFail);
	const text = decodeStrictUtf8(bytes, path, svgFail);
	return verifySvgText(text, path, bytes.byteLength);
};

// --- 3.3 provenance manifest ---------------------------------------------

export const MANIFEST_SCHEMA_VERSION = 1;

export type ManifestFile = { path: string; bytes: number; sha256: string };

export type Manifest = {
	schemaVersion: number;
	source: { path: string; sha256: string };
	image: { reference: string; platform: string; application: string; libraries: string };
	bun: { version: string };
	views: string[];
	files: ManifestFile[];
};

/** Fields that would make the manifest a record of when and where, not what. */
const VOLATILE_KEYS = [
	"timestamp",
	"generatedAt",
	"date",
	"hostname",
	"host",
	"pid",
	"nonce",
	"runId",
	"user",
	"cwd",
];

const sha256 = (bytes: Buffer): string =>
	createHash("sha256").update(bytes).digest("hex");

/**
 * Serialize the manifest deterministically: schema key order, canonical views sorted,
 * files by lexical path, LF, exactly one terminal newline.
 */
export const serializeManifest = (manifest: Manifest): string => {
	const ordered = {
		schemaVersion: manifest.schemaVersion,
		source: { path: manifest.source.path, sha256: manifest.source.sha256 },
		image: {
			reference: manifest.image.reference,
			platform: manifest.image.platform,
			application: manifest.image.application,
			libraries: manifest.image.libraries,
		},
		bun: { version: manifest.bun.version },
		views: [...manifest.views].sort(),
		files: [...manifest.files]
			.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
			.map((file) => ({ path: file.path, bytes: file.bytes, sha256: file.sha256 })),
	};
	return `${JSON.stringify(ordered, null, 2).replace(/\r\n/g, "\n")}\n`;
};

/** Build the manifest from what was actually verified. */
export const buildManifest = (options: {
	source: { path: string; sha256: string };
	pin: StructurizrPin;
	platform: string;
	directory: string;
	views: string[];
	files: string[];
}): Manifest => {
	const files: ManifestFile[] = options.files.map((name) => {
		const bytes = readRegularFile(join(options.directory, name), MAX_SVG_BYTES, jsonFail);
		if (bytes.byteLength <= 0) jsonFail(`${name} is empty`);
		return { path: name, bytes: bytes.byteLength, sha256: sha256(bytes) };
	});

	return {
		schemaVersion: MANIFEST_SCHEMA_VERSION,
		source: options.source,
		image: {
			reference: options.pin.image.reference,
			platform: options.platform,
			application: options.pin.upstream.applicationVersion,
			libraries: options.pin.upstream.librariesVersion,
		},
		bun: { version: options.pin.bun.version },
		views: options.views,
		files,
	};
};

/** Read a manifest back, rejecting an unsupported schema or any volatile field. */
export const parseManifest = (raw: string): Manifest => {
	let root: unknown;
	try {
		root = JSON.parse(raw);
	} catch (error) {
		return jsonFail(`manifest is not valid JSON: ${(error as Error).message}`);
	}
	const record = asObject(root, "manifest");

	if (record.schemaVersion !== MANIFEST_SCHEMA_VERSION) {
		jsonFail(
			`unsupported manifest schemaVersion ${JSON.stringify(record.schemaVersion)}`,
		);
	}

	const seen = JSON.stringify(record).toLowerCase();
	for (const key of VOLATILE_KEYS) {
		if (seen.includes(`"${key.toLowerCase()}"`)) {
			jsonFail(`manifest carries volatile field ${key}`);
		}
	}

	const files = asArray(record.files, "manifest.files").map((entry) => {
		const fileRecord = asObject(entry, "manifest.files[]");
		const path = nonEmptyId(fileRecord.path, "manifest file path");
		if (path.startsWith("/")) jsonFail(`manifest file path ${path} is absolute`);
		const bytes = fileRecord.bytes;
		if (typeof bytes !== "number" || !Number.isSafeInteger(bytes) || bytes <= 0) {
			jsonFail(`manifest file ${path} must record a positive byte count`);
		}
		const digest = nonEmptyId(fileRecord.sha256, "manifest file sha256");
		if (!/^[0-9a-f]{64}$/.test(digest)) {
			jsonFail(`manifest file ${path} has a malformed digest`);
		}
		return { path, bytes: bytes as number, sha256: digest };
	});

	const image = asObject(record.image, "manifest.image");
	const source = asObject(record.source, "manifest.source");
	const bun = asObject(record.bun, "manifest.bun");

	return {
		schemaVersion: MANIFEST_SCHEMA_VERSION,
		source: {
			path: nonEmptyId(source.path, "manifest.source.path"),
			sha256: nonEmptyId(source.sha256, "manifest.source.sha256"),
		},
		image: {
			reference: nonEmptyId(image.reference, "manifest.image.reference"),
			platform: nonEmptyId(image.platform, "manifest.image.platform"),
			application: nonEmptyId(image.application, "manifest.image.application"),
			libraries: nonEmptyId(image.libraries, "manifest.image.libraries"),
		},
		bun: { version: nonEmptyId(bun.version, "manifest.bun.version") },
		views: asArray(record.views, "manifest.views").map((view) =>
			nonEmptyId(view, "manifest.views[]"),
		),
		files,
	};
};

/** Re-check every published file against the manifest it shipped with. */
export const verifyManifestAgainstDirectory = (
	manifest: Manifest,
	directory: string,
): void => {
	const present = readdirSync(directory)
		.filter((name) => name !== "manifest.json")
		.sort();
	const recorded = manifest.files.map((file) => file.path).sort();

	if (present.length !== recorded.length || present.some((n, i) => n !== recorded[i])) {
		jsonFail(
			`published file set ${JSON.stringify(present)} does not match the manifest ${JSON.stringify(recorded)}`,
		);
	}

	for (const file of manifest.files) {
		const bytes = readRegularFile(join(directory, file.path), MAX_SVG_BYTES, jsonFail);
		if (bytes.byteLength !== file.bytes) {
			jsonFail(`${file.path} is ${bytes.byteLength} bytes, manifest records ${file.bytes}`);
		}
		const digest = sha256(bytes);
		if (digest !== file.sha256) {
			jsonFail(`${file.path} hashes ${digest}, manifest records ${file.sha256}`);
		}
	}
};

// --- composed verification -----------------------------------------------

export type VerifyResult = {
	workspace: WorkspaceModel;
	inventory: OutputInventory;
	manifest: Manifest;
	manifestText: string;
	aggregateBytes: number;
};

/** Run every consistency, safety, and provenance layer over one payload directory. */
export const verifyOutput = (options: {
	directory: string;
	source: { path: string; sha256: string };
	pin: StructurizrPin;
	platform: string;
}): VerifyResult => {
	const jsonBytes = readRegularFile(
		join(options.directory, "workspace.json"),
		MAX_JSON_BYTES,
		jsonFail,
	);
	const workspace = parseWorkspace(
		decodeStrictUtf8(jsonBytes, "workspace.json", jsonFail),
	);

	verifyViewKeys(workspace.views);
	verifyLineage(workspace);

	const inventory = mapOutput(options.directory, workspace.views);

	let aggregateBytes = jsonBytes.byteLength;
	const svgPaths = [...inventory.primary.values(), ...inventory.legend.values()];
	for (const path of svgPaths) {
		const report = verifySvgFile(path);
		aggregateBytes += report.byteLength;
		if (aggregateBytes > MAX_AGGREGATE_BYTES) {
			svgFail(`published output exceeds the ${MAX_AGGREGATE_BYTES}-byte aggregate bound`);
		}
	}

	const files = readdirSync(options.directory)
		.filter((name) => name !== "manifest.json")
		.sort();

	const manifest = buildManifest({
		source: options.source,
		pin: options.pin,
		platform: options.platform,
		directory: options.directory,
		views: workspace.views.map((view) => view.key),
		files,
	});

	return {
		workspace,
		inventory,
		manifest,
		manifestText: serializeManifest(manifest),
		aggregateBytes,
	};
};
