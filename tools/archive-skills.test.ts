import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const cursorArchivePath = ".cursor/skills/openspec-archive-change/SKILL.md";
const cursorSyncPath = ".cursor/skills/openspec-sync-specs/SKILL.md";
const piArchivePath = ".pi/skills/openspec-archive-change/SKILL.md";
const piSyncPath = ".pi/skills/openspec-sync-specs/SKILL.md";

function read(path: string): string {
	return readFileSync(path, "utf8");
}

function expectGuardedArchiveFallback(markdown: string): void {
	expect(markdown).not.toMatch(/\b(?:mkdir|mv)\b/);
	expect(markdown).not.toMatch(/\bopenspec\s+archive\b/i);

	const syncStep = markdown.indexOf("4. **Intelligently sync only the refused capability**");
	const retryStep = markdown.indexOf("5. **Retry the sanctioned archive path**");
	const retryCommand = 'just archive-change "<name>"';
	expect(syncStep).toBeGreaterThanOrEqual(0);
	expect(retryStep).toBeGreaterThan(syncStep);
	expect(markdown.indexOf(retryCommand, retryStep)).toBeGreaterThan(retryStep);

	const terminalArchiveCommands = markdown
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => /^(?:just\s+archive-change|openspec\s+archive|mkdir|mv)\b/i.test(line));
	expect(terminalArchiveCommands).toEqual([retryCommand]);
	expect(markdown).toContain("promotion guard across every\n   capability (including siblings)");
	expect(markdown).toContain("Only after the retry succeeds");
	expect(markdown).toContain("report only the state established by its output");
}

function expectIntelligentMergePreserved(markdown: string): void {
	expect(markdown).toContain("Apply the named delta spec to its main spec");
	expect(markdown).toContain("Apply changes intelligently");
	expect(markdown).toContain("Preserve scenarios/content not mentioned in the delta");
	expect(markdown).toContain("## Key Principle: Intelligent Merging");
	expect(markdown).toContain("Make the named delta safe for deterministic promotion");
	expect(markdown).toContain("complete requirement now present in the resulting main spec");
}

test("archive fallback retries only the sanctioned whole-change archive path", () => {
	expectGuardedArchiveFallback(read(cursorArchivePath));
});

test("intelligent capability-scoped merge remains the guard-safe fallback", () => {
	expectIntelligentMergePreserved(read(cursorSyncPath));
});

test("installed pi archive and sync skills are identical to their cursor twins", () => {
	if (!existsSync(".pi")) return; // A source-only checkout has no installed project skill tree.

	expect(existsSync(piArchivePath)).toBe(true);
	expect(existsSync(piSyncPath)).toBe(true);
	const cursorArchive = read(cursorArchivePath);
	const cursorSync = read(cursorSyncPath);
	const piArchive = read(piArchivePath);
	const piSync = read(piSyncPath);

	expect(piArchive).toBe(cursorArchive);
	expect(piSync).toBe(cursorSync);
	expectGuardedArchiveFallback(piArchive);
	expectIntelligentMergePreserved(piSync);
});
