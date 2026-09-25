/*
 * structurizr-source.ts — accept exactly one repository-contained regular model file.
 *
 * Runs via bun; not a pi extension.
 *
 * Version 1 has no source closure because source expansion is prohibited. The model
 * argument is a compatibility affordance: omitted, or the exact repository-relative
 * POSIX string. The opened file is mounted, never its parent, so an unrecognized
 * source lookup cannot reach another repository file.
 *
 * usage: import { resolveSource } from "./structurizr-source.ts"
 */

import { execFileSync } from "node:child_process";
import {
	closeSync,
	constants,
	fstatSync,
	lstatSync,
	openSync,
	readFileSync,
	realpathSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve, sep } from "node:path";

/** The only model path this option ever reads. */
export const CANONICAL_MODEL_PATH = "docs/architecture/structurizr/workspace.dsl";

/** A model larger than this is refused before it is opened for content. */
export const MAX_MODEL_BYTES = 5 * 1024 * 1024;

/** The only leading directives a version 1 model may carry. */
export const PERMITTED_DIRECTIVES = [
	"!identifiers hierarchical",
	"!impliedRelationships true",
	"!impliedRelationships false",
];

export type SourceCode =
	| "MODEL_PATH"
	| "SOURCE_DIRECTIVE"
	| "WORKSPACE_EXTENDS";

export class StructurizrSourceError extends Error {
	readonly errorClass = "CONFIG";
	readonly code: SourceCode;

	constructor(code: SourceCode, detail: string) {
		super(`CONFIG ${code}: ${detail}`);
		this.code = code;
		this.name = "StructurizrSourceError";
	}
}

const modelPath = (detail: string): never => {
	throw new StructurizrSourceError("MODEL_PATH", detail);
};

/** Discover the repository root. */
export const gitRoot = (cwd: string): string => {
	try {
		return execFileSync("git", ["rev-parse", "--show-toplevel"], {
			cwd,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		}).trim();
	} catch {
		return modelPath(`${cwd} is not inside a Git repository`);
	}
};

/**
 * Accept an omitted argument or the exact canonical POSIX string. Absolute paths,
 * alternate spellings, and any traversal are refused before the filesystem is touched.
 */
export const normalizeModelArgument = (argument?: string): string => {
	if (argument === undefined || argument === "") return CANONICAL_MODEL_PATH;
	if (argument !== CANONICAL_MODEL_PATH) {
		return modelPath(
			`model must be omitted or exactly ${CANONICAL_MODEL_PATH}, got ${JSON.stringify(argument)}`,
		);
	}
	return CANONICAL_MODEL_PATH;
};

/**
 * Walk from the repository root to the model parent, rejecting every symlink and
 * non-directory ancestor. Traversal is lstat-based, so a swapped ancestor is caught
 * before the file is opened.
 */
export const verifyAncestors = (root: string, relativePath: string): void => {
	const segments = relativePath.split("/").slice(0, -1);
	let current = root;
	for (const segment of segments) {
		current = join(current, segment);
		let stats;
		try {
			stats = lstatSync(current);
		} catch {
			modelPath(`ancestor ${current} does not exist`);
			return;
		}
		if (stats.isSymbolicLink()) {
			modelPath(`ancestor ${current} is a symbolic link`);
		}
		if (!stats.isDirectory()) {
			modelPath(`ancestor ${current} is not a directory`);
		}
	}
};

export type ResolvedSource = {
	/** Absolute path of the single regular file to mount read-only. */
	path: string;
	/** Repository-relative POSIX path. */
	relativePath: string;
	/** Exact bytes as they sit on disk; never rewritten. */
	bytes: Buffer;
	/** Decoded content, proven strict UTF-8. */
	text: string;
	/** SHA-256 over LF-normalized bytes, for the manifest only. */
	sha256: string;
	/** Byte length of the file on disk. */
	byteLength: number;
};

/** Normalize CRLF and lone CR to LF for hashing without touching the mounted bytes. */
export const normalizeForHash = (bytes: Buffer): Buffer =>
	Buffer.from(bytes.toString("binary").replace(/\r\n/g, "\n").replace(/\r/g, "\n"), "binary");

/** Strip quoted strings and line comments so lexical scans see structure, not prose. */
const structuralLine = (line: string): string => {
	let out = "";
	let inString = false;
	for (let i = 0; i < line.length; i += 1) {
		const char = line[i];
		if (inString) {
			if (char === '"') inString = false;
			continue;
		}
		if (char === '"') {
			inString = true;
			out += " ";
			continue;
		}
		if (char === "#") break;
		if (char === "/" && line[i + 1] === "/") break;
		out += char;
	}
	return out;
};

/**
 * Reject every leading directive outside the permitted three, and any true workspace
 * extension. Descriptive text containing "extends" is not matched.
 */
export const scanDirectives = (text: string): void => {
	const lines = text.split("\n");
	let inBlockComment = false;

	for (const raw of lines) {
		let line = raw;

		if (inBlockComment) {
			const end = line.indexOf("*/");
			if (end === -1) continue;
			line = line.slice(end + 2);
			inBlockComment = false;
		}
		const blockStart = line.indexOf("/*");
		if (blockStart !== -1 && !line.slice(0, blockStart).includes('"')) {
			const end = line.indexOf("*/", blockStart + 2);
			if (end === -1) {
				inBlockComment = true;
				line = line.slice(0, blockStart);
			} else {
				line = line.slice(0, blockStart) + line.slice(end + 2);
			}
		}

		// Only leading spaces and tabs are skipped before a directive.
		const directiveCandidate = line.replace(/^[ \t]+/, "");
		if (directiveCandidate.startsWith("!")) {
			const directive = directiveCandidate.replace(/[\r\n]+$/, "").trimEnd();
			if (!PERMITTED_DIRECTIVES.includes(directive)) {
				throw new StructurizrSourceError(
					"SOURCE_DIRECTIVE",
					`directive ${JSON.stringify(directive)} is not one of ${PERMITTED_DIRECTIVES.join(", ")}`,
				);
			}
			continue;
		}

		const tokens = structuralLine(line).trim().split(/\s+/).filter(Boolean);
		if (tokens[0] === "workspace" && tokens[1] === "extends") {
			throw new StructurizrSourceError(
				"WORKSPACE_EXTENDS",
				"a version 1 model may not extend another workspace",
			);
		}
	}
};

/**
 * Resolve, open, and validate the one model file. Every rejection happens before Docker
 * is queried.
 */
export const resolveSource = (options?: {
	argument?: string;
	cwd?: string;
	root?: string;
}): ResolvedSource => {
	const cwd = options?.cwd ?? process.cwd();
	const relativePath = normalizeModelArgument(options?.argument);
	const root = options?.root ?? gitRoot(cwd);

	let realRoot: string;
	try {
		realRoot = realpathSync(root);
	} catch {
		return modelPath(`repository root ${root} cannot be resolved`);
	}

	verifyAncestors(realRoot, relativePath);

	const target = join(realRoot, ...relativePath.split("/"));

	// O_NOFOLLOW refuses a symlinked final component at the syscall boundary.
	// O_NONBLOCK keeps a FIFO from blocking this open until a writer appears; the
	// fstat below rejects it as a non-regular file either way.
	let fd: number;
	try {
		fd = openSync(
			target,
			constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
		);
	} catch (error) {
		const code = (error as NodeJS.ErrnoException).code;
		if (code === "ELOOP" || code === "EMLINK") {
			return modelPath(`${relativePath} is a symbolic link`);
		}
		if (code === "ENOENT") {
			return modelPath(`${relativePath} does not exist`);
		}
		return modelPath(`${relativePath} cannot be opened: ${String(code)}`);
	}

	try {
		const stats = fstatSync(fd);
		if (!stats.isFile()) {
			return modelPath(`${relativePath} is not a regular file`);
		}
		if (stats.size > MAX_MODEL_BYTES) {
			return modelPath(
				`${relativePath} is ${stats.size} bytes, over the ${MAX_MODEL_BYTES}-byte bound`,
			);
		}

		// The opened object's real path must be exactly the real-root join.
		const realTarget = realpathSync(target);
		const expected = resolve(realRoot, ...relativePath.split("/"));
		if (realTarget !== expected) {
			return modelPath(
				`${relativePath} resolves to ${realTarget}, not ${expected}`,
			);
		}
		if (!realTarget.startsWith(realRoot + sep)) {
			return modelPath(`${relativePath} escapes the repository root`);
		}

		const bytes = readFileSync(fd);

		let text: string;
		try {
			text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
		} catch {
			return modelPath(`${relativePath} is not strict UTF-8`);
		}

		scanDirectives(text);

		return {
			path: realTarget,
			relativePath,
			bytes,
			text,
			sha256: createHash("sha256").update(normalizeForHash(bytes)).digest("hex"),
			byteLength: bytes.byteLength,
		};
	} finally {
		closeSync(fd);
	}
};

/** The read-only mount spec for the one opened model file, never its parent. */
export const modelMount = (source: ResolvedSource): string =>
	`${source.path}:/workspace/workspace.dsl:ro`;

/** Guard against ever mounting the model's directory. */
export const assertNotParentMount = (mount: string, source: ResolvedSource): void => {
	const parent = dirname(source.path);
	if (mount.startsWith(`${parent}:`)) {
		modelPath("refusing to mount the model parent directory");
	}
};
