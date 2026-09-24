import { existsSync, readFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";

const TEMP_TRANSCRIPT = /\/tmp\/[^\s`)]+\.(?:raw|txt)\b/;
const REFLECTION_EXAMPLE = /`(\{"change":"\$1"[^\n`]+\})`/;
const MARKDOWN_LINK = /\[[^\]]*\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g;
const HTML_LINK = /\bhref=["']([^"']+)["']/gi;
const CODE_FILE_REFERENCE = /`((?:\.?[A-Za-z0-9_-]+\/)+[A-Za-z0-9_.-]+\.(?:html|json|md|ts|yaml|yml))`/g;
const REQUIRED_CLOSE_OUT_DOCS = ["README.md", "docs/close-out.md", "index.html"];
const RELATIVE_SESSION_PATH =
	/\brelative\s+(?:(?:session|transcript)\s+)?paths?\b|\b(?:session|transcript)\s+paths?\b[^.!?;]{0,80}\brelative\b/;
const RELATIVE_PATH_PERMISSION =
	/\b(?:accept|accepts|accepted|acceptance|allow|allows|allowed|permit|permits|permitted|permission|support|supports|supported|valid|acceptable|optional|optionally)\b|\b(?:may|can|could)\b[^.!?;]{0,80}\b(?:be\s+relative|accept(?:ed)?|allow(?:ed)?|permit(?:ted)?|use[ds]?|pass(?:ed)?|provid(?:e|ed)|suppl(?:y|ied))\b/;
const NEGATED_PATH_PERMISSION =
	/\b(?:do|does|did|is|are|was|were|may|might|can|could|must|shall|should|will|would)\s+not\b|\b(?:cannot|never|neither|nor|rejects?|forbids?|disallows?|prohibits?)\b|\b(?:do|does|did|is|are|was|were|can|could|should|would|will|must|shall)n['’]t\b|\bno\s+(?:permission|acceptance|relative)\b|\bnot\s+(?:an?\s+)?(?:accepted|allowed|permitted|supported|valid|acceptable|optional|recommended)\b/;
const PATH_PERMISSION_PREDICATES = new Set([
	"accept", "accepts", "accepted", "acceptance",
	"allow", "allows", "allowed",
	"permit", "permits", "permitted", "permission",
	"support", "supports", "supported",
	"valid", "acceptable",
]);
const PASSIVE_PATH_PERMISSION_PREDICATES = new Set([
	"accepted", "acceptance", "allowed", "permitted", "permission", "supported", "valid", "acceptable",
]);
const PREDICATE_NEGATIONS = new Set(["cannot", "neither", "never", "no", "not", "without"]);

type BoundaryActor = "loop" | "recorder";
type LocalReference = { document: string; target: string };
type TokenActor = { actor: BoundaryActor; index: number };

export function parseReflectionExample(markdown: string): Record<string, unknown> {
	const match = markdown.match(REFLECTION_EXAMPLE);
	if (match === null) throw new Error("reflection JSON example is missing or spans multiple lines");
	return JSON.parse(match[1]) as Record<string, unknown>;
}

export function temporaryTranscriptReferences(markdown: string): string[] {
	return markdown.match(TEMP_TRANSCRIPT) ?? [];
}

function localTarget(rawTarget: string): string | undefined {
	if (rawTarget === "" || rawTarget.startsWith("#") || rawTarget.startsWith("/")) return undefined;
	if (/^[a-z][a-z0-9+.-]*:/i.test(rawTarget)) return undefined;
	const withoutFragment = rawTarget.split("#", 1)[0].split("?", 1)[0];
	if (withoutFragment === "" || withoutFragment.includes("*") || withoutFragment.includes("<")) {
		return undefined;
	}
	try {
		return decodeURIComponent(withoutFragment);
	} catch (error) {
		void error;
		return withoutFragment;
	}
}

export function localReferences(document: string, content: string): LocalReference[] {
	const references = new Map<string, LocalReference>();
	for (const pattern of [MARKDOWN_LINK, HTML_LINK, CODE_FILE_REFERENCE]) {
		pattern.lastIndex = 0;
		for (const match of content.matchAll(pattern)) {
			const target = localTarget(match[1]);
			if (target !== undefined) references.set(target, { document, target });
		}
	}
	return [...references.values()];
}

export function unresolvedLocalReferences(root: string, documents: string[]): LocalReference[] {
	const unresolved: LocalReference[] = [];
	for (const document of documents) {
		const documentPath = join(root, document);
		if (!existsSync(documentPath)) {
			unresolved.push({ document, target: document });
			continue;
		}
		for (const reference of localReferences(document, readFileSync(documentPath, "utf8"))) {
			const resolved = normalize(join(root, dirname(document), reference.target));
			if (!existsSync(resolved)) unresolved.push(reference);
		}
	}
	return unresolved;
}

function semanticBlocks(content: string): string[] {
	return content
		.replace(/<\/(?:li|p|pre|section)>/gi, "\n\n")
		.replace(/<[^>]+>/g, " ")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#39;|&apos;/g, "'")
		.split(/\n\s*\n/)
		.map((block) => block.replace(/\s+/g, " ").trim().toLowerCase())
		.filter((block) => block !== "");
}

function semanticClauses(statements: string[]): string[] {
	return statements.flatMap((statement) =>
		statement
			.split(/;\s*|,\s*(?:and|but|while|whereas)\s+|\s+(?:and|but|while|whereas)\s+/)
			.filter((clause) => clause !== ""),
	);
}

function permitsRelativeSessionPath(clause: string): boolean {
	return RELATIVE_SESSION_PATH.test(clause) &&
		RELATIVE_PATH_PERMISSION.test(clause) &&
		!NEGATED_PATH_PERMISSION.test(clause);
}

function isReadableRecorderBoundary(clause: string): boolean {
	return (clause.includes("record-verdict") || clause.includes("recorder")) &&
		clause.includes("readable") &&
		RELATIVE_SESSION_PATH.test(clause) &&
		/\b(?:accepts|accepted)\b/.test(clause) &&
		!NEGATED_PATH_PERMISSION.test(clause);
}

function wordTokens(text: string): string[] {
	return text.toLowerCase().match(/[a-z]+(?:['’]t)?/g) ?? [];
}

function tokenActors(tokens: string[]): TokenActor[] {
	const actors: TokenActor[] = [];
	for (let index = 0; index < tokens.length; index += 1) {
		const token = tokens[index];
		if (token === "loop" || token === "protocol") {
			actors.push({ actor: "loop", index });
		} else if (token === "recorder" || (token === "record" && tokens[index + 1] === "verdict")) {
			actors.push({ actor: "recorder", index });
		}
	}
	return actors;
}

function predicateIsNegated(tokens: string[], predicateIndex: number, activeActorIndex?: number): boolean {
	const start = activeActorIndex === undefined ? 0 : activeActorIndex + 1;
	return tokens.slice(start, predicateIndex).some(
		(token) => PREDICATE_NEGATIONS.has(token) || token.endsWith("n't") || token.endsWith("n’t"),
	);
}

function passiveActorForPredicate(
	tokens: string[],
	actors: TokenActor[],
	predicateIndex: number,
): TokenActor | undefined {
	if (!PASSIVE_PATH_PERMISSION_PREDICATES.has(tokens[predicateIndex])) return undefined;
	const connectorIndex = tokens.findIndex(
		(token, index) =>
			index > predicateIndex && index <= predicateIndex + 3 && (token === "by" || token === "under"),
	);
	if (connectorIndex === -1) return undefined;
	return actors.find(({ index }) => index > connectorIndex && index <= connectorIndex + 3);
}

function activeActorForPredicate(actors: TokenActor[], predicateIndex: number): TokenActor | undefined {
	return actors.findLast(({ index }) => index < predicateIndex);
}

function statementPositivelyPermitsRelativePathUnderLoop(statement: string): boolean {
	if (!RELATIVE_SESSION_PATH.test(statement)) return false;
	for (const segment of semanticClauses([statement])) {
		const tokens = wordTokens(segment);
		const actors = tokenActors(tokens);
		for (let predicateIndex = 0; predicateIndex < tokens.length; predicateIndex += 1) {
			if (!PATH_PERMISSION_PREDICATES.has(tokens[predicateIndex])) continue;
			const passiveActor = passiveActorForPredicate(tokens, actors, predicateIndex);
			const actor = passiveActor ?? activeActorForPredicate(actors, predicateIndex);
			if (actor?.actor !== "loop") continue;
			const activeActorIndex = passiveActor === undefined ? actor.index : undefined;
			if (!predicateIsNegated(tokens, predicateIndex, activeActorIndex)) return true;
		}
	}
	return false;
}

function isRecorderOnlyRelativePathAcceptance(clause: string): boolean {
	return isReadableRecorderBoundary(clause) &&
		!statementPositivelyPermitsRelativePathUnderLoop(clause);
}

export function sessionPathContractFailures(document: string, content: string): string[] {
	const blocks = semanticBlocks(content);
	const statements = blocks.flatMap((block) => block.split(/(?<=[.!?])\s+/));
	// Evaluate positive loop predicates while the statement still owns its relative-path subject.
	// Local predicate negation is resolved inside coordinated segments, so a recorder negation does
	// not erase a later positive loop predicate that shares that subject.
	const statementPermitsRelativeLoopPath = statements.some(statementPositivelyPermitsRelativePathUnderLoop);
	const clauses = semanticClauses(statements);
	const mandatory = /\b(?:must|shall|required|requires)\b/;
	const weak = /\b(?:may|might|can|optional|optionally|prefer|recommended)\b|if (?:available|possible)|when (?:available|possible)/;
	const protocolStatements = statements.filter(
		(statement) =>
			(statement.includes("loop") || statement.includes("protocol")) &&
			statement.includes("session") &&
			statement.includes("path"),
	);
	const hasUnnegatedWeakPermission = (statement: string): boolean =>
		semanticClauses([statement]).some((clause) => weak.test(clause) && !NEGATED_PATH_PERMISSION.test(clause));
	const protocolIsExplicit = protocolStatements.some(
		(statement) =>
			statement.includes("absolute") &&
			statement.includes("persisted") &&
			mandatory.test(statement) &&
			!hasUnnegatedWeakPermission(statement),
	);
	const protocolIsContradictory =
		statementPermitsRelativeLoopPath ||
		protocolStatements.some(hasUnnegatedWeakPermission) ||
		clauses.some((clause) => permitsRelativeSessionPath(clause) && !isRecorderOnlyRelativePathAcceptance(clause));
	const recorderBoundaryIsExplicit = clauses.some(isReadableRecorderBoundary);
	const failures: string[] = [];
	if (!protocolIsExplicit || protocolIsContradictory) {
		failures.push(`${document}: loop protocol must require an absolute persisted session path without optional or contradictory wording`);
	}
	if (!recorderBoundaryIsExplicit) {
		failures.push(`${document}: recorder must explicitly distinguish its acceptance of a readable relative path from the loop protocol`);
	}
	return failures;
}

export function checkDocsContracts(root = "."): string[] {
	const failures: string[] = [];
	const prompt = join(root, "prompts", "opsx-retro.md");
	if (existsSync(prompt)) {
		try {
			parseReflectionExample(readFileSync(prompt, "utf8"));
		} catch (error) {
			failures.push(`prompts/opsx-retro.md: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	for (const path of new Bun.Glob("openspec/changes/**/docs/**/*.md").scanSync(root)) {
		if (temporaryTranscriptReferences(readFileSync(join(root, path), "utf8")).length > 0)
			failures.push(`${path}: cites an ephemeral /tmp .raw/.txt transcript`);
	}

	const presentCloseOutDocs = REQUIRED_CLOSE_OUT_DOCS.filter((document) => existsSync(join(root, document)));
	for (const reference of unresolvedLocalReferences(root, presentCloseOutDocs)) {
		failures.push(`${reference.document}: unresolved local reference ${reference.target}`);
	}
	for (const document of presentCloseOutDocs) {
		const content = readFileSync(join(root, document), "utf8");
		// Consuming repositories may install this checker without the kit close-out guide.
		// Apply the session contract only to documents that actually describe both surfaces.
		if (content.includes("record-verdict") && content.includes("opsx-loop")) {
			failures.push(...sessionPathContractFailures(document, content));
		}
	}
	return failures;
}

if (import.meta.main) {
	const failures = checkDocsContracts();
	if (failures.length > 0) {
		for (const failure of failures) console.error(`  ${failure}`);
		console.error(`docs-contracts: FAIL — ${failures.length} problem(s)`);
		process.exit(1);
	}
	console.log("docs-contracts: clean");
}
