import { afterAll, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
	cpSync,
	linkSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadPin } from "./structurizr-pin.ts";
import {
	MANIFEST_SCHEMA_VERSION,
	StructurizrConsistencyError,
	VENDOR_ROOT,
	buildManifest,
	mapOutput,
	parseManifest,
	parseWorkspace,
	serializeManifest,
	verifyLineage,
	verifyManifestAgainstDirectory,
	verifyOutput,
	verifySvgFile,
	verifySvgText,
	verifyViewKeys,
} from "./structurizr-verify.ts";

const pin = loadPin();
const fixtureRoot = join(import.meta.dir, "fixtures", "structurizr");
const expectedJson = readFileSync(join(fixtureRoot, "expected", "workspace.json"), "utf8");
const passiveDir = join(fixtureRoot, "svg-safety", "passive");
const rejectedDir = join(fixtureRoot, "svg-safety", "rejected");

const scratch: string[] = [];
afterAll(() => {
	for (const dir of scratch) rmSync(dir, { recursive: true, force: true });
});

/** A payload directory holding the golden JSON plus the real passive SVGs. */
const makePayload = (): string => {
	const dir = mkdtempSync(join(tmpdir(), "structurizr-verify-"));
	scratch.push(dir);
	writeFileSync(join(dir, "workspace.json"), expectedJson);
	for (const name of readdirSync(passiveDir)) {
		cpSync(join(passiveDir, name), join(dir, name));
	}
	return dir;
};

const source = { path: "docs/architecture/structurizr/workspace.dsl", sha256: "a".repeat(64) };

const verifyPayload = (dir: string) =>
	verifyOutput({ directory: dir, source, pin, platform: "linux/arm64" });

const expectCode = (run: () => unknown, code: string, needle?: string): void => {
	let message = "";
	try {
		run();
		throw new Error(`expected CONSISTENCY ${code}`);
	} catch (error) {
		expect(error).toBeInstanceOf(StructurizrConsistencyError);
		message = (error as Error).message;
	}
	expect(message.startsWith(`CONSISTENCY ${code}: `)).toBe(true);
	if (needle !== undefined) expect(message).toContain(needle);
};

/** Re-serialize the golden workspace with one structural edit applied. */
const mutateWorkspace = (edit: (workspace: any) => void): string => {
	const copy = JSON.parse(expectedJson);
	edit(copy);
	return JSON.stringify(copy);
};

// --- JSON shape -----------------------------------------------------------

test("JSON: the golden workspace parses to three canonical views", () => {
	const workspace = parseWorkspace(expectedJson);
	expect(workspace.views.map((view) => view.key).sort()).toEqual([
		"component",
		"container",
		"context",
	]);
	expect(workspace.relationships.length).toBeGreaterThan(0);
	expect(workspace.elementIds.size).toBeGreaterThan(0);
});

test("JSON: invalid JSON is rejected", () => {
	expectCode(() => parseWorkspace("{ not json"), "JSON", "not valid JSON");
});

test("JSON: a non-object boundary type is rejected", () => {
	expectCode(() => parseWorkspace('{"model": [], "views": {}}'), "JSON", "must be an object");
	expectCode(
		() => parseWorkspace('{"model": {}, "views": {"systemContextViews": {}}}'),
		"JSON",
		"must be an array",
	);
});

test("JSON: an empty or non-string id is rejected", () => {
	expectCode(
		() => parseWorkspace(mutateWorkspace((w) => { w.model.people[0].id = ""; })),
		"JSON",
		"must be a non-empty string",
	);
	expectCode(
		() => parseWorkspace(mutateWorkspace((w) => { w.model.people[0].id = 7; })),
		"JSON",
		"must be a non-empty string",
	);
});

test("JSON: a view referencing an unknown element is rejected", () => {
	expectCode(
		() =>
			parseWorkspace(
				mutateWorkspace((w) => {
					w.views.systemContextViews[0].elements.push({ id: "9999" });
				}),
			),
		"JSON",
		"references unknown element 9999",
	);
});

test("JSON: a relationship to an unknown element is rejected", () => {
	expectCode(
		() =>
			parseWorkspace(
				mutateWorkspace((w) => {
					w.model.people[0].relationships[0].destinationId = "8888";
				}),
			),
		"JSON",
		"is not a known element",
	);
});

test("JSON: a workspace exporting no views is rejected", () => {
	expectCode(
		() => parseWorkspace('{"model": {}, "views": {}}'),
		"JSON",
		"exports no views",
	);
});

test("JSON: an oversized or non-UTF-8 workspace is rejected", () => {
	const dir = makePayload();
	writeFileSync(join(dir, "workspace.json"), Buffer.from([0x7b, 0xff, 0xfe]));
	expectCode(() => verifyPayload(dir), "JSON", "strict UTF-8");
});

test("JSON: a symlinked or hard-linked workspace export is rejected", () => {
	const symDir = makePayload();
	const target = join(symDir, "real.json");
	writeFileSync(target, expectedJson);
	rmSync(join(symDir, "workspace.json"));
	symlinkSync(target, join(symDir, "workspace.json"));
	expectCode(() => verifyPayload(symDir), "JSON", "symbolic link");

	const hardDir = makePayload();
	const hardTarget = join(hardDir, "other.json");
	writeFileSync(hardTarget, expectedJson);
	rmSync(join(hardDir, "workspace.json"));
	linkSync(hardTarget, join(hardDir, "workspace.json"));
	expectCode(() => verifyPayload(hardDir), "JSON", "hard links");
});

// --- lineage --------------------------------------------------------------

test("lineage: the fixture shares an element and a relationship across all three views", () => {
	const workspace = parseWorkspace(expectedJson);
	expect(() => verifyLineage(workspace)).not.toThrow();
});

test("lineage: a missing canonical view is rejected", () => {
	const workspace = parseWorkspace(
		mutateWorkspace((w) => {
			w.views.componentViews = [];
		}),
	);
	expectCode(() => verifyLineage(workspace), "LINEAGE", "canonical view component is absent");
});

test("lineage: views that share no element are rejected", () => {
	const workspace = parseWorkspace(expectedJson);
	workspace.views = workspace.views.map((view) =>
		view.key === "component" ? { ...view, elementIds: [] } : view,
	);
	expectCode(() => verifyLineage(workspace), "LINEAGE", "share no element");
});

test("lineage: an additional non-canonical view reconciles without failing", () => {
	const workspace = parseWorkspace(
		mutateWorkspace((w) => {
			w.views.systemLandscapeViews = [
				{ key: "landscape", elements: [{ id: w.model.people[0].id }] },
			];
		}),
	);
	expect(workspace.views.map((v) => v.key).sort()).toEqual([
		"component",
		"container",
		"context",
		"landscape",
	]);
	expect(() => verifyLineage(workspace)).not.toThrow();
	expect(() => verifyViewKeys(workspace.views)).not.toThrow();
});

// --- view keys ------------------------------------------------------------

const keyViews = (...keys: string[]) =>
	keys.map((key) => ({ key, kind: "systemContext", elementIds: [] }));

test("view key: the canonical keys are accepted", () => {
	expect(() => verifyViewKeys(keyViews("context", "container", "component"))).not.toThrow();
});

test("view key: an unsafe key is rejected", () => {
	for (const key of ["-leading", "has space", "has/slash", "has.dot", "a".repeat(65), "_under"]) {
		expectCode(() => verifyViewKeys(keyViews(key)), "VIEW_KEY");
	}
});

test("view key: a 64-character key is the bound", () => {
	expect(() => verifyViewKeys(keyViews("a".repeat(64)))).not.toThrow();
	expectCode(() => verifyViewKeys(keyViews("a".repeat(65))), "VIEW_KEY");
});

test("view key: a -key suffix is rejected in any case", () => {
	expectCode(() => verifyViewKeys(keyViews("context-key")), "VIEW_KEY", "collide with a legend");
	expectCode(() => verifyViewKeys(keyViews("context-KEY")), "VIEW_KEY", "collide with a legend");
});

test("view key: duplicate and case-colliding keys are rejected", () => {
	expectCode(() => verifyViewKeys(keyViews("context", "context")), "VIEW_KEY", "case-folded");
	expectCode(() => verifyViewKeys(keyViews("context", "Context")), "VIEW_KEY", "case-folded");
});

// --- filename mapping -----------------------------------------------------

test("filename: each key maps to one primary and at most one legend", () => {
	const dir = makePayload();
	const workspace = parseWorkspace(expectedJson);
	const inventory = mapOutput(dir, workspace.views);

	expect([...inventory.primary.keys()].sort()).toEqual(["component", "container", "context"]);
	expect([...inventory.legend.keys()].sort()).toEqual(["component", "container", "context"]);
});

test("filename: a missing primary SVG is rejected", () => {
	const dir = makePayload();
	rmSync(join(dir, "component.svg"));
	expectCode(() => verifyPayload(dir), "JSON", "has no component.svg");
});

test("filename: an unexpected output file is rejected", () => {
	const dir = makePayload();
	writeFileSync(join(dir, "extra.svg"), "<svg/>");
	expectCode(() => verifyPayload(dir), "JSON", "unexpected output file extra.svg");
});

test("filename: a legend with no matching view is rejected", () => {
	const dir = makePayload();
	cpSync(join(dir, "context-key.svg"), join(dir, "landscape-key.svg"));
	expectCode(() => verifyPayload(dir), "JSON", "unexpected output file");
});

test("filename: a symlinked or special output file is rejected", () => {
	const dir = makePayload();
	const real = join(dir, "context.svg");
	const copy = join(dir, "context.copy");
	cpSync(real, copy);
	rmSync(real);
	symlinkSync(copy, real);
	expectCode(() => verifyPayload(dir), "JSON", "unexpected output file");
});

// --- SVG safety -----------------------------------------------------------

test("SVG safety: every pinned passive example is accepted byte for byte", () => {
	const names = readdirSync(passiveDir).sort();
	expect(names.length).toBe(6);
	for (const name of names) {
		const path = join(passiveDir, name);
		const before = readFileSync(path);
		const report = verifySvgFile(path);
		expect(report.elements).toBeGreaterThan(0);
		expect(report.maxDepth).toBeGreaterThan(0);
		// Acceptance never rewrites the file.
		expect(readFileSync(path).equals(before)).toBe(true);
	}
});

test("SVG safety: every rejection fixture is refused", () => {
	const names = readdirSync(rejectedDir).sort();
	expect(names.length).toBeGreaterThanOrEqual(29);

	const accepted: string[] = [];
	for (const name of names) {
		try {
			verifySvgFile(join(rejectedDir, name));
			accepted.push(name);
		} catch (error) {
			expect(error).toBeInstanceOf(StructurizrConsistencyError);
			expect((error as Error).message.startsWith("CONSISTENCY SVG_SAFETY: ")).toBe(true);
			// The message names the offending file.
			expect((error as Error).message).toContain(name);
		}
	}
	expect(accepted).toEqual([]);
});

test("SVG safety: the observed passive forms stay permitted", () => {
	const svg = (body: string) =>
		`<svg xmlns="http://www.w3.org/2000/svg" version="1.1" viewBox="0 0 10 10">${body}</svg>`;

	// A local functional IRI, an empty image, and plain CSS are what the renderer emits.
	expect(() =>
		verifySvgText(svg('<path d="M0 0" marker-end="url(#v-1)"/>'), "ok.svg", 1),
	).not.toThrow();
	expect(() => verifySvgText(svg("<image  id=\"v-1\"/>"), "ok.svg", 1)).not.toThrow();
	expect(() =>
		verifySvgText(svg("<style>.a .b * { vector-effect: non-scaling-stroke; }</style>"), "ok.svg", 1),
	).not.toThrow();
	expect(() =>
		verifySvgText(svg('<defs><marker id="v-1" orient="auto"/></defs>'), "ok.svg", 1),
	).not.toThrow();
});

test("SVG safety: structural limits are enforced", () => {
	const deep = `<svg xmlns="http://www.w3.org/2000/svg">${"<g>".repeat(300)}${"</g>".repeat(300)}</svg>`;
	expectCode(() => verifySvgText(deep, "deep.svg", 1), "SVG_SAFETY", "exceeds depth");

	const many = `<svg xmlns="http://www.w3.org/2000/svg">${"<g/>".repeat(100_001)}</svg>`;
	expectCode(() => verifySvgText(many, "many.svg", 1), "SVG_SAFETY", "exceeds 100000 elements");

	const attributes = Array.from({ length: 300 }, (_, i) => `a${i}="1"`).join(" ");
	expectCode(
		() => verifySvgText(`<svg xmlns="http://www.w3.org/2000/svg"><g ${attributes}/></svg>`, "wide.svg", 1),
		"SVG_SAFETY",
		"exceeds 256 attributes",
	);
});

test("SVG safety: no external entity or resource is ever fetched", async () => {
	const originalFetch = globalThis.fetch;
	let fetched = 0;
	globalThis.fetch = (async (...args: unknown[]) => {
		fetched += 1;
		throw new Error(`unexpected network access to ${String(args[0])}`);
	}) as typeof fetch;

	try {
		for (const name of readdirSync(passiveDir)) verifySvgFile(join(passiveDir, name));
		// The entity fixture is refused at the doctype, before any resolution.
		expectCode(
			() => verifySvgFile(join(rejectedDir, "entity.svg")),
			"SVG_SAFETY",
			"doctype",
		);
	} finally {
		globalThis.fetch = originalFetch;
	}

	expect(fetched).toBe(0);
});

test("SVG safety: the vendored parser matches its pinned hashes", () => {
	for (const [relative, expectedHash] of Object.entries(pin.xmlParser.files)) {
		const bytes = readFileSync(join(VENDOR_ROOT, relative));
		expect(createHash("sha256").update(bytes).digest("hex")).toBe(expectedHash);
	}
});

// --- manifest -------------------------------------------------------------

test("manifest: serialization is exact for controlled bytes", () => {
	const manifest = {
		schemaVersion: MANIFEST_SCHEMA_VERSION,
		source: { path: "docs/architecture/structurizr/workspace.dsl", sha256: "b".repeat(64) },
		image: {
			reference: pin.image.reference,
			platform: "linux/amd64",
			application: "2026.06.28",
			libraries: "6.2.2",
		},
		bun: { version: "1.3.14" },
		// Deliberately unsorted on the way in.
		views: ["context", "component", "container"],
		files: [
			{ path: "context.svg", bytes: 2, sha256: "c".repeat(64) },
			{ path: "component.svg", bytes: 1, sha256: "d".repeat(64) },
		],
	};

	const text = serializeManifest(manifest);
	expect(text.endsWith("}\n")).toBe(true);
	expect(text.includes("\r")).toBe(false);
	expect(text.split("\n").pop()).toBe("");

	const parsed = JSON.parse(text);
	expect(parsed.views).toEqual(["component", "container", "context"]);
	expect(parsed.files.map((f: any) => f.path)).toEqual(["component.svg", "context.svg"]);
	expect(Object.keys(parsed)).toEqual([
		"schemaVersion",
		"source",
		"image",
		"bun",
		"views",
		"files",
	]);
});

test("manifest: every published non-manifest file is recorded once", () => {
	const dir = makePayload();
	const result = verifyPayload(dir);

	const recorded = result.manifest.files.map((file) => file.path).sort();
	const present = readdirSync(dir).sort();
	expect(recorded).toEqual(present);
	expect(new Set(recorded).size).toBe(recorded.length);

	for (const file of result.manifest.files) {
		expect(file.bytes).toBeGreaterThan(0);
		expect(file.sha256).toMatch(/^[0-9a-f]{64}$/);
		const actual = createHash("sha256").update(readFileSync(join(dir, file.path))).digest("hex");
		expect(file.sha256).toBe(actual);
	}
});

test("manifest: the recorded provenance is exactly the pinned provenance", () => {
	const dir = makePayload();
	const { manifest } = verifyPayload(dir);

	expect(manifest.image.reference).toBe(pin.image.reference);
	expect(manifest.image.application).toBe(pin.upstream.applicationVersion);
	expect(manifest.image.libraries).toBe(pin.upstream.librariesVersion);
	expect(manifest.image.platform).toBe("linux/arm64");
	expect(manifest.bun.version).toBe("1.3.14");
	expect(manifest.source).toEqual(source);
});

test("manifest: an unsupported schema version is rejected", () => {
	expectCode(
		() => parseManifest(JSON.stringify({ schemaVersion: 2, files: [] })),
		"JSON",
		"unsupported manifest schemaVersion",
	);
});

test("manifest: volatile fields are rejected", () => {
	const dir = makePayload();
	const { manifest } = verifyPayload(dir);
	for (const key of ["timestamp", "hostname", "pid", "nonce", "runId"]) {
		const polluted = { ...manifest, [key]: "x" };
		expectCode(
			() => parseManifest(JSON.stringify(polluted)),
			"JSON",
			`volatile field ${key}`,
		);
	}
});

test("manifest: an absolute path is rejected", () => {
	const dir = makePayload();
	const { manifest } = verifyPayload(dir);
	const polluted = {
		...manifest,
		files: [{ path: "/etc/passwd", bytes: 1, sha256: "e".repeat(64) }],
	};
	expectCode(() => parseManifest(JSON.stringify(polluted)), "JSON", "is absolute");
});

test("manifest: file-set, size, and hash drift are each rejected", () => {
	const dir = makePayload();
	const { manifest } = verifyPayload(dir);

	expect(() => verifyManifestAgainstDirectory(manifest, dir)).not.toThrow();

	// File-set drift.
	writeFileSync(join(dir, "context.svg.bak"), "x");
	expectCode(() => verifyManifestAgainstDirectory(manifest, dir), "JSON", "does not match");
	rmSync(join(dir, "context.svg.bak"));

	// Size drift.
	const sizeDrift = {
		...manifest,
		files: manifest.files.map((f) =>
			f.path === "context.svg" ? { ...f, bytes: f.bytes + 1 } : f,
		),
	};
	expectCode(() => verifyManifestAgainstDirectory(sizeDrift, dir), "JSON", "manifest records");

	// Hash drift.
	const hashDrift = {
		...manifest,
		files: manifest.files.map((f) =>
			f.path === "context.svg" ? { ...f, sha256: "f".repeat(64) } : f,
		),
	};
	expectCode(() => verifyManifestAgainstDirectory(hashDrift, dir), "JSON", "hashes");
});

test("renderer metadata: two safe renders differing only in wall-clock text both pass", () => {
	const first = makePayload();
	const second = makePayload();

	// Simulate the renderer's minute-bearing metadata text changing between runs.
	const path = join(second, "context.svg");
	const original = readFileSync(path, "utf8");
	const altered = original.replace(
		"</svg>",
		"<text>generated 12:31</text></svg>",
	);
	expect(altered).not.toBe(original);
	writeFileSync(path, altered);

	const a = verifyPayload(first);
	const b = verifyPayload(second);

	// Both are independently safe.
	const hashA = a.manifest.files.find((f) => f.path === "context.svg")!.sha256;
	const hashB = b.manifest.files.find((f) => f.path === "context.svg")!.sha256;

	// The recorded hashes differ, and that is explicitly accepted.
	expect(hashA).not.toBe(hashB);
	expect(b.manifest.files.find((f) => f.path === "context.svg")!.bytes).toBeGreaterThan(
		a.manifest.files.find((f) => f.path === "context.svg")!.bytes,
	);
});

test("renderer metadata: serialization is deterministic for identical input", () => {
	const dir = makePayload();
	const first = verifyPayload(dir).manifestText;
	const second = verifyPayload(dir).manifestText;
	expect(first).toBe(second);
});

test("manifest: no byte-equality assertion is made across renders", () => {
	// Guard the design commitment: the gate must never require identical SVG bytes.
	const body = readFileSync(join(import.meta.dir, "structurizr-verify.ts"), "utf8");
	expect(body).not.toContain("toEqual(previousBytes)");
	expect(body).toContain("byte-equality assertion is ever made");
});
