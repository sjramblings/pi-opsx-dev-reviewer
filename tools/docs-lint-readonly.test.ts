import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

function docsLintRecipe(justfile: string): string {
	const match = justfile.match(/^docs-lint:\n((?:^[ \t].*\n)*)/m);
	if (match === null) throw new Error("docs-lint recipe is missing");
	return match[1];
}

test("reviewer docs-lint runs lychee without a checkout-mutating cache", () => {
	const recipe = docsLintRecipe(readFileSync("justfile.opsx", "utf8"));
	expect(recipe).toContain("run lychee        lychee --no-progress '**/*.md'");
	expect(recipe).not.toMatch(/(?:^|\s)--cache(?:\s|$)/);
});

test("the configured Vale vocabulary ships with the repository", () => {
	const config = readFileSync(".vale.ini", "utf8");
	const vocabulary = config.match(/^Vocab = ([A-Za-z0-9_-]+)$/m)?.[1];
	expect(vocabulary).toBe("DevReviewer");
	const acceptedTerms = readFileSync(`styles/config/vocabularies/${vocabulary}/accept.txt`, "utf8");
	expect(acceptedTerms.split("\n")).toContain("opsx");
});
