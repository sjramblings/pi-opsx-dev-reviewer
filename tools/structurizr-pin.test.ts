import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
	PIN_PATH,
	StructurizrPinError,
	loadPin,
	parsePin,
} from "./structurizr-pin.ts";

const pinBytes = readFileSync(PIN_PATH, "utf8");
const fixturePath = join(
	import.meta.dir,
	"fixtures",
	"structurizr",
	"workspace.dsl",
);
const fixture = readFileSync(fixturePath, "utf8");

/** Reparse the shipped pin from a structurally mutated copy. */
const mutate = (edit: (pin: Record<string, any>) => void): (() => unknown) => {
	const copy = JSON.parse(pinBytes);
	edit(copy);
	return () => parsePin(JSON.stringify(copy));
};

const expectPinError = (run: () => unknown, needle: string): void => {
	expect(run).toThrow(StructurizrPinError);
	try {
		run();
		throw new Error("expected CONFIG PIN rejection");
	} catch (error) {
		const message = (error as Error).message;
		expect(message.startsWith("CONFIG PIN: ")).toBe(true);
		expect(message).toContain(needle);
	}
};

// --- the shipped pin ------------------------------------------------------

test("the shipped pin loads and freezes every recorded value", () => {
	const pin = loadPin();

	expect(pin.schemaVersion).toBe(1);
	expect(pin.image.repository).toBe("structurizr/structurizr");
	expect(pin.image.tag).toBe("2026.06.28-playwright");
	expect(pin.image.indexDigest).toBe(
		"sha256:9bdc861e8c94f77f5f73bde70bdee410a65b82cbe8d341d3919a9ebd0cb17f8c",
	);
	expect(pin.image.reference).toBe(
		"structurizr/structurizr:2026.06.28-playwright@sha256:9bdc861e8c94f77f5f73bde70bdee410a65b82cbe8d341d3919a9ebd0cb17f8c",
	);
	expect(pin.image.entrypoint).toEqual(["/usr/local/structurizr.sh"]);
	expect(pin.image.platforms).toEqual({
		"linux/amd64":
			"sha256:99119a0586c11e99db513915f1a5580088c6a07bcaded7d7d27f65fd2ee3c29e",
		"linux/arm64":
			"sha256:b669b5dbf931f4e0bf900586f6b1b98a66b35192d123c17824da2ed1f850268e",
	});
	expect(pin.image.allowedEnvironmentNames).toEqual([
		"JAVA_HOME",
		"LANG",
		"LC_ALL",
		"PATH",
		"PLAYWRIGHT_BROWSERS_PATH",
		"PORT",
	]);

	expect(pin.upstream.tag).toBe("v2026.06.28");
	expect(pin.upstream.commit).toBe("9ff16634c3b8574584262ae8545510bbb1d1b4bd");
	expect(pin.upstream.applicationVersion).toBe("2026.06.28");
	expect(pin.upstream.librariesVersion).toBe("6.2.2");

	expect(pin.interface.platformProbeEntrypoint).toBe("/usr/bin/uname");
	expect(pin.interface.platformProbe).toEqual(["-s", "-m"]);
	expect(pin.interface.version).toEqual(["version"]);
	expect(pin.interface.validate).toEqual([
		"validate",
		"-w",
		"/workspace/workspace.dsl",
	]);
	expect(pin.interface.jsonExport).toEqual([
		"export",
		"-w",
		"/workspace/workspace.dsl",
		"-f",
		"json",
		"-o",
		"/output",
	]);
	expect(pin.interface.svgExport).toEqual([
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
	]);

	expect(pin.bun.version).toBe("1.3.14");
	expect(pin.bun.setupAction).toBe(
		"oven-sh/setup-bun@735343b667d3e6f658f44d0eca948eb6282f2b76",
	);
	expect(pin.bun.ciExecutableSha256).toBe(
		"9fd36f87e4b90b07632b987a2e4ec81ca15a62c81bf983190cea6d715be2ad74",
	);
	expect(pin.bun.archives["linux-x64"].sha256).toBe(
		"951ee2aee855f08595aeec6225226a298d3fea83a3dcd6465c09cbccdf7e848f",
	);
	expect(pin.bun.archives["linux-aarch64"].sha256).toBe(
		"a27ffb63a8310375836e0d6f668ae17fa8d8d18b88c37c821c65331973a19a3b",
	);
	expect(pin.bun.archives["darwin-aarch64"].sha256).toBe(
		"d8b96221828ad6f97ac7ac0ab7e95872341af763001e8803e8267652c2652620",
	);
	expect(pin.bun.archives["darwin-x64"].sha256).toBe(
		"4183df3374623e5bab315c547cfa0974533cd457d86b73b639f7a87974cd6633",
	);

	expect(pin.xmlParser.name).toBe("saxes");
	expect(pin.xmlParser.version).toBe("6.0.0");
	expect(pin.xmlParser.tarballSha256).toBe(
		"1cdf52fbbe1ccbd175c365d2b8e63f46e590e74aff23fa6a44a6ec51522e96db",
	);
	expect(pin.xmlParser.dependency.tarballSha256).toBe(
		"bdf900298963e4bd95b76aa95e96d29f05687e6ae662d617061778267b576da8",
	);
	expect(Object.keys(pin.xmlParser.files)).toHaveLength(7);

	expect(pin.timeoutsSeconds).toEqual({
		bunVersion: 10,
		dockerInfo: 60,
		indexInspect: 60,
		pull: 900,
		imageInspect: 60,
		platformProbe: 60,
		version: 60,
		validate: 60,
		jsonExport: 120,
		svgExport: 300,
		terminateGrace: 10,
		forceRemove: 30,
	});
});

test("the loaded pin is frozen against mutation", () => {
	const pin = loadPin();
	expect(Object.isFrozen(pin)).toBe(true);
});

// --- closed schema --------------------------------------------------------

test("a malformed pin is rejected before Docker is queried", () => {
	expectPinError(() => parsePin("{ not json"), "not valid JSON");
});

test("an additional field is rejected", () => {
	expectPinError(
		mutate((pin) => {
			pin.image.registryMirror = "example.invalid";
		}),
		"additional field(s): registryMirror",
	);
	expectPinError(
		mutate((pin) => {
			pin.extra = true;
		}),
		"additional field(s): extra",
	);
});

test("a missing field is rejected", () => {
	expectPinError(
		mutate((pin) => {
			delete pin.image.entrypoint;
		}),
		"missing field(s): entrypoint",
	);
	expectPinError(
		mutate((pin) => {
			delete pin.timeoutsSeconds.pull;
		}),
		"missing field(s): pull",
	);
});

test("a mistyped field is rejected", () => {
	expectPinError(
		mutate((pin) => {
			pin.timeoutsSeconds.pull = "900";
		}),
		"pin.timeoutsSeconds.pull must be a positive integer",
	);
	expectPinError(
		mutate((pin) => {
			pin.image.entrypoint = "/usr/local/structurizr.sh";
		}),
		"pin.image.entrypoint must be a non-empty array",
	);
	expectPinError(
		mutate((pin) => {
			pin.schemaVersion = "1";
		}),
		"unsupported schemaVersion",
	);
});

// --- mutable and retired references --------------------------------------

test("the latest tag is rejected as mutable", () => {
	expectPinError(
		mutate((pin) => {
			pin.image.tag = "latest";
			pin.image.reference = `${pin.image.repository}:latest@${pin.image.indexDigest}`;
		}),
		"tag latest is mutable",
	);
});

test("a tag-only reference is rejected", () => {
	expectPinError(
		mutate((pin) => {
			pin.image.reference = "structurizr/structurizr:2026.06.28-playwright";
		}),
		"a tag-only reference is mutable",
	);
});

test("the retired structurizr/cli distribution is rejected", () => {
	expectPinError(
		mutate((pin) => {
			pin.image.repository = "structurizr/cli";
		}),
		"structurizr/cli is a retired distribution",
	);
});

test("the retired structurizr/lite distribution is rejected", () => {
	expectPinError(
		mutate((pin) => {
			pin.image.repository = "structurizr/lite";
		}),
		"structurizr/lite is a retired distribution",
	);
});

test("a reference that disagrees with repository, tag, or digest is rejected", () => {
	expectPinError(
		mutate((pin) => {
			pin.image.reference =
				"structurizr/structurizr:2026.06.28-playwright@sha256:0000000000000000000000000000000000000000000000000000000000000000";
		}),
		"reference must be",
	);
});

test("a non-digest platform manifest is rejected", () => {
	expectPinError(
		mutate((pin) => {
			pin.image.platforms["linux/amd64"] = "99119a05";
		}),
		"must be a sha256:<64 hex> digest",
	);
});

test("a third OCI target is rejected", () => {
	expectPinError(
		mutate((pin) => {
			pin.image.platforms["linux/riscv64"] = pin.image.platforms["linux/arm64"];
		}),
		"additional field(s): linux/riscv64",
	);
});

test("identical platform digests are rejected", () => {
	expectPinError(
		mutate((pin) => {
			pin.image.platforms["linux/amd64"] = pin.image.platforms["linux/arm64"];
		}),
		"platform manifest digests must differ",
	);
});

// --- interface freeze -----------------------------------------------------

test("every command vector is frozen exactly", () => {
	expectPinError(
		mutate((pin) => {
			pin.interface.svgExport = pin.interface.svgExport.filter(
				(a: string) => a !== "-animation" && a !== "false",
			);
		}),
		"pin.interface.svgExport must be exactly",
	);
	expectPinError(
		mutate((pin) => {
			pin.interface.svgExport[8] = "dark";
		}),
		"pin.interface.svgExport must be exactly",
	);
	expectPinError(
		mutate((pin) => {
			pin.interface.validate = ["validate"];
		}),
		"pin.interface.validate must be exactly",
	);
	expectPinError(
		mutate((pin) => {
			pin.interface.platformProbeEntrypoint = "/bin/sh";
		}),
		"platformProbeEntrypoint must be /usr/bin/uname",
	);
});

test("a non-hardened parser configuration is rejected", () => {
	expectPinError(
		mutate((pin) => {
			pin.xmlParser.configuration.doctype = "allow";
		}),
		"doctype must be reject",
	);
	expectPinError(
		mutate((pin) => {
			pin.xmlParser.configuration.entities = "all";
		}),
		"entities must be xml-builtins-only",
	);
	expectPinError(
		mutate((pin) => {
			pin.xmlParser.configuration.resolvePrefix = true;
		}),
		"must not permit additional namespaces",
	);
});

test("an unpinned or drifting Bun record is rejected", () => {
	expectPinError(
		mutate((pin) => {
			pin.bun.setupAction = "oven-sh/setup-bun@v2";
		}),
		"setupAction must be pinned to a 40-hex commit",
	);
	expectPinError(
		mutate((pin) => {
			pin.bun.version = "1.3";
		}),
		"pin.bun.version must be an exact semantic version",
	);
	expectPinError(
		mutate((pin) => {
			pin.bun.archives["linux-x64"].url =
				"https://github.com/oven-sh/bun/releases/download/bun-v1.3.9/bun-linux-x64.zip";
		}),
		"must be https://github.com/oven-sh/bun/releases/download/bun-v1.3.14/bun-linux-x64.zip",
	);
	expectPinError(
		mutate((pin) => {
			pin.bun.archives["linux-x64"].sha256 = "deadbeef";
		}),
		"must be 64 lowercase hexadecimal characters",
	);
});

test("upstream provenance must agree with the image tag", () => {
	expectPinError(
		mutate((pin) => {
			pin.upstream.commit = "9ff16634";
		}),
		"commit must be 40 lowercase hexadecimal characters",
	);
	expectPinError(
		mutate((pin) => {
			pin.upstream.applicationVersion = "2026.05.22";
		}),
		"tag must begin with the upstream applicationVersion",
	);
	expectPinError(
		mutate((pin) => {
			pin.upstream.commitUrl =
				"https://github.com/structurizr/structurizr/commit/0000000000000000000000000000000000000000";
		}),
		"commitUrl must end with the upstream commit",
	);
});

// --- evidence URLs --------------------------------------------------------

/** The three URLs a reviewer must open to re-check this pin by hand. */
const evidenceUrls = (): string[] => {
	const pin = loadPin();
	return [pin.upstream.releaseUrl, pin.upstream.commitUrl, pin.bun.releaseUrl];
};

test("the pin records exactly the three reviewable evidence URLs", () => {
	expect(evidenceUrls()).toEqual([
		"https://github.com/structurizr/structurizr/releases/tag/v2026.06.28",
		"https://github.com/structurizr/structurizr/commit/9ff16634c3b8574584262ae8545510bbb1d1b4bd",
		"https://github.com/oven-sh/bun/releases/tag/bun-v1.3.14",
	]);
});

// Live reachability is opt-in so the default suite stays offline-deterministic.
// The governed attestation workflow sets STRUCTURIZR_LIVE_URLS=1.
const liveUrls = process.env.STRUCTURIZR_LIVE_URLS === "1";

test.if(liveUrls)("all three evidence URLs resolve", async () => {
	for (const url of evidenceUrls()) {
		const response = await fetch(url, { redirect: "follow" });
		expect(response.status).toBe(200);
	}
}, 60_000);

// --- the executable fixture ----------------------------------------------

test("the fixture is one self-contained file with no source expansion", () => {
	const directives = fixture
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line.startsWith("!"));

	expect(directives).toEqual(["!identifiers hierarchical"]);

	for (const banned of [
		"!include",
		"!docs",
		"!adrs",
		"!script",
		"!plugin",
		"workspace extends",
	]) {
		expect(fixture).not.toContain(banned);
	}
});

test("the fixture relates one person directly to one component", () => {
	expect(fixture).toContain('reader = person "Reader"');
	expect(fixture).toContain('probe = component "Pin Probe"');
	// The relationship targets the component itself, not its container or system.
	expect(fixture).toContain("reader -> kit.renderer.probe");
});

test("the fixture declares exactly the three canonical view keys", () => {
	expect(fixture).toContain('systemContext kit "context"');
	expect(fixture).toContain('container kit "container"');
	expect(fixture).toContain('component kit.renderer "component"');
});
