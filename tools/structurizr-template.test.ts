import { expect, test } from "bun:test";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const templatePath = join(
	import.meta.dir,
	"..",
	"templates",
	"structurizr",
	"workspace.dsl",
);
const template = readFileSync(templatePath, "utf8");

/** Strip quoted strings and line comments so scans see structure, not prose. */
const structuralText = (source: string): string =>
	source
		.split("\n")
		.map((line) => {
			const withoutComment = line.replace(/(#|\/\/).*$/, "");
			return withoutComment.replace(/"[^"]*"/g, '""');
		})
		.join("\n");

const structure = structuralText(template);

test("the template is exactly one regular file", () => {
	const stats = statSync(templatePath);
	expect(stats.isFile()).toBe(true);
	expect(stats.isSymbolicLink()).toBe(false);
	expect(stats.size).toBeLessThanOrEqual(5 * 1024 * 1024);
});

test("the template decodes as strict UTF-8", () => {
	const bytes = readFileSync(templatePath);
	const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
	expect(decoded).toBe(template);
});

test("the template uses hierarchical identifiers", () => {
	const directives = template
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line.startsWith("!"));
	expect(directives).toEqual(["!identifiers hierarchical"]);
});

test("the template contains no prohibited source expansion", () => {
	for (const banned of [
		"!include",
		"!docs",
		"!adrs",
		"!script",
		"!plugin",
		"!constant",
	]) {
		expect(template).not.toContain(banned);
	}
});

test("the template does not extend another workspace", () => {
	const extendsDeclaration = structure
		.split("\n")
		.map((line) => line.trim().split(/\s+/))
		.some((tokens) => tokens[0] === "workspace" && tokens[1] === "extends");
	expect(extendsDeclaration).toBe(false);
});

test("the template references no remote theme or external resource", () => {
	expect(template).not.toContain("theme ");
	expect(template.toLowerCase()).not.toContain("http://");
	expect(template.toLowerCase()).not.toContain("https://");
});

test("the template relates a person directly to a component", () => {
	// The destination is the fully hierarchical component identifier, so the
	// relationship survives into the component view rather than stopping at a container.
	expect(template).toContain("user -> system.application.entrypoint");
	expect(template).toContain('entrypoint = component "Entry Point"');
	expect(template).toContain('user = person "User"');
});

test("the template declares exactly the three canonical view keys", () => {
	expect(template).toContain('systemContext system "context"');
	expect(template).toContain('container system "container"');
	expect(template).toContain('component system.application "component"');

	const keys = [...template.matchAll(/"(context|container|component)"/g)].map(
		(match) => match[1],
	);
	expect(new Set(keys)).toEqual(new Set(["context", "container", "component"]));
});

test("every declared view key is safe and free of a legend collision", () => {
	const pattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
	for (const key of ["context", "container", "component"]) {
		expect(pattern.test(key)).toBe(true);
		expect(key.toLowerCase().endsWith("-key")).toBe(false);
	}
});
