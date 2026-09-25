import { afterEach, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
	existsSync,
	lstatSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const repoRoot = join(import.meta.dir, "..");
const installer = join(repoRoot, "install.sh");
const roots: string[] = [];

type InstallMode = "guards" | "project";
type Fixture = {
	root: string;
	target: string;
	mode: InstallMode;
};

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function runChecked(command: string, args: string[], cwd?: string): void {
	const result = spawnSync(command, args, {
		cwd,
		encoding: "utf8",
		timeout: 30_000,
	});
	if (result.error !== undefined) throw result.error;
	if (result.status !== 0) {
		throw new Error(
			`${command} ${args.join(" ")} failed with ${String(result.status)}\n${result.stdout}${result.stderr}`,
		);
	}
}

function makeFixture(mode: InstallMode): Fixture {
	const root = mkdtempSync(join(tmpdir(), `canary refusal ${mode} `));
	roots.push(root);
	if (mode === "project") {
		const target = join(root, "project with spaces");
		mkdirSync(target);
		return { root, target, mode };
	}

	const primary = join(root, "primary checkout");
	const target = join(root, "linked worktree");
	mkdirSync(primary);
	runChecked("git", ["init", "-q"], primary);
	runChecked("git", ["config", "user.email", "probe@example.invalid"], primary);
	runChecked("git", ["config", "user.name", "Canary Probe"], primary);
	writeFileSync(join(primary, "tracked.txt"), "fixture\n");
	runChecked("git", ["add", "tracked.txt"], primary);
	runChecked("git", ["commit", "-q", "-m", "fixture"], primary);
	runChecked("git", ["worktree", "add", "-q", "-b", "session/probe", target], primary);
	mkdirSync(join(primary, "memory"));
	writeFileSync(join(primary, "memory", "primary-sentinel.txt"), "preserve primary\n");
	return { root, target, mode };
}

function runInstall(fixture: Fixture): ReturnType<typeof spawnSync> {
	const args = fixture.mode === "project"
		? [installer, "--here", fixture.target]
		: [installer, "--guards", fixture.target];
	return spawnSync("bash", args, {
		encoding: "utf8",
		timeout: 60_000,
		env: {
			...process.env,
			HOME: join(fixture.root, "home"),
			PI_CODING_AGENT_DIR: join(fixture.root, "agent dir"),
		},
	});
}

function canaryPath(fixture: Fixture): string {
	return join(fixture.target, ".pi", "extensions", "worktree-canary");
}

function expectRefusal(result: ReturnType<typeof spawnSync>): void {
	expect(result.error).toBeUndefined();
	expect(result.status, `${result.stdout}${result.stderr}`).not.toBe(0);
	expect(`${result.stdout}${result.stderr}`).toContain("inspect and remove it manually, then rerun");
}

function expectSuccessfulInstall(fixture: Fixture): void {
	const result = runInstall(fixture);
	expect(result.error).toBeUndefined();
	expect(result.status, `${result.stdout}${result.stderr}`).toBe(0);
	expect(existsSync(canaryPath(fixture))).toBe(false);
	if (fixture.mode === "guards") {
		expect(readFileSync(join(fixture.root, "primary checkout", "memory", "primary-sentinel.txt"), "utf8"))
			.toBe("preserve primary\n");
	}
}

for (const mode of ["guards", "project"] as const) {
	test(`${mode} install refuses a known stale canary byte-for-byte until the operator removes it`, () => {
		const fixture = makeFixture(mode);
		const canary = canaryPath(fixture);
		mkdirSync(canary, { recursive: true });
		const source = join(canary, "index.ts");
		const priorTest = join(canary, "index.test.ts");
		writeFileSync(source, "known source\n");
		writeFileSync(priorTest, "known prior broad copy\n");

		expectRefusal(runInstall(fixture));
		expect(readFileSync(source, "utf8")).toBe("known source\n");
		expect(readFileSync(priorTest, "utf8")).toBe("known prior broad copy\n");

		// The operator, not the installer, owns inspection and removal of stale local data.
		rmSync(canary, { recursive: true });
		expectSuccessfulInstall(fixture);
		expectSuccessfulInstall(fixture);
	});

	test(`${mode} install refuses an unknown stale canary entry byte-for-byte`, () => {
		const fixture = makeFixture(mode);
		const canary = canaryPath(fixture);
		mkdirSync(canary, { recursive: true });
		const known = join(canary, "index.ts");
		const unknown = join(canary, "unknown sentinel.txt");
		writeFileSync(known, "known source\n");
		writeFileSync(unknown, "unknown data\n");

		expectRefusal(runInstall(fixture));
		expect(readFileSync(known, "utf8")).toBe("known source\n");
		expect(readFileSync(unknown, "utf8")).toBe("unknown data\n");
	});

	test(`${mode} install refuses nested stale canary data byte-for-byte without traversal`, () => {
		const fixture = makeFixture(mode);
		const nested = join(canaryPath(fixture), "nested sentinel");
		mkdirSync(nested, { recursive: true });
		const data = join(nested, "data.txt");
		writeFileSync(data, "unknown nested data\n");

		expectRefusal(runInstall(fixture));
		expect(readFileSync(data, "utf8")).toBe("unknown nested data\n");
	});

	test(`${mode} install refuses a stale canary leaf symlink and preserves its external target`, () => {
		const fixture = makeFixture(mode);
		const canary = canaryPath(fixture);
		mkdirSync(canary, { recursive: true });
		const external = join(fixture.root, "external leaf target.txt");
		const leaf = join(canary, "index.ts");
		writeFileSync(external, "external leaf data\n");
		symlinkSync(external, leaf);

		expectRefusal(runInstall(fixture));
		expect(lstatSync(leaf).isSymbolicLink()).toBe(true);
		expect(readFileSync(external, "utf8")).toBe("external leaf data\n");
	});

	test(`${mode} install refuses a local canary symlink and preserves its external directory`, () => {
		const fixture = makeFixture(mode);
		const external = join(fixture.root, "external canary target");
		mkdirSync(external);
		const sentinel = join(external, "sentinel.txt");
		writeFileSync(sentinel, "external directory data\n");
		const canary = canaryPath(fixture);
		mkdirSync(join(canary, ".."), { recursive: true });
		symlinkSync(external, canary);

		expectRefusal(runInstall(fixture));
		expect(lstatSync(canary).isSymbolicLink()).toBe(true);
		expect(readFileSync(sentinel, "utf8")).toBe("external directory data\n");
	});

	test(`${mode} install refuses a wrong-type local canary byte-for-byte`, () => {
		const fixture = makeFixture(mode);
		const canary = canaryPath(fixture);
		mkdirSync(join(canary, ".."), { recursive: true });
		writeFileSync(canary, "not a directory\n");

		expectRefusal(runInstall(fixture));
		expect(readFileSync(canary, "utf8")).toBe("not a directory\n");
	});

	for (const parent of [".pi", ".pi/extensions"] as const) {
		test(`${mode} install refuses a symlinked ${parent} parent and leaves its external sentinel untouched`, () => {
			const fixture = makeFixture(mode);
			const external = join(fixture.root, `external ${parent.replace("/", " ")}`);
			mkdirSync(external);
			const sentinel = join(external, "sentinel.txt");
			writeFileSync(sentinel, "external parent data\n");
			const parentPath = join(fixture.target, ...parent.split("/"));
			mkdirSync(join(parentPath, ".."), { recursive: true });
			symlinkSync(external, parentPath);

			const result = runInstall(fixture);
			expect(result.error).toBeUndefined();
			expect(result.status, `${result.stdout}${result.stderr}`).not.toBe(0);
			expect(`${result.stdout}${result.stderr}`).toContain("is a symlink; refusing install");
			expect(lstatSync(parentPath).isSymbolicLink()).toBe(true);
			expect(readFileSync(sentinel, "utf8")).toBe("external parent data\n");
		});

		test(`${mode} install refuses a wrong-type ${parent} parent byte-for-byte`, () => {
			const fixture = makeFixture(mode);
			const parentPath = join(fixture.target, ...parent.split("/"));
			mkdirSync(join(parentPath, ".."), { recursive: true });
			writeFileSync(parentPath, "wrong parent type\n");

			const result = runInstall(fixture);
			expect(result.error).toBeUndefined();
			expect(result.status, `${result.stdout}${result.stderr}`).not.toBe(0);
			expect(`${result.stdout}${result.stderr}`).toContain("is not a directory; refusing install");
			expect(readFileSync(parentPath, "utf8")).toBe("wrong parent type\n");
		});
	}

	test(`${mode} install without a stale canary converges on repeat and remains canary-free`, () => {
		const fixture = makeFixture(mode);
		expectSuccessfulInstall(fixture);
		expectSuccessfulInstall(fixture);
	});
}
