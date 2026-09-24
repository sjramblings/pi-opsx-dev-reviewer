# Design—Add Structurizr Diagram Option

<!-- cspell:ignore CLOEXEC CREAT EEXIST fstat fstatat mkdirat openat RDONLY realpath renameat toplevel unlinkat WRONLY xmlchars -->
<!-- vale Vale.Spelling = NO -->
<!-- vale Vale.Terms = NO -->
<!-- vale write-good.ThereIs = NO -->

## Context

The originating `add-architecture-diagrams` design selected Mermaid because GitHub renders it
without a build step. Its removed Structurizr task had no model, renderer, output, CI, or consistency
contract. This change is a separate optional model-based path; Mermaid remains mandatory under the
existing `architecture-doc` contract.

The first and second spec reviews are recorded verbatim in `review-log.md`. In addition to the first
review's source, output, renderer, platform, runtime, credential, documentation, and error-contract
gaps, the second review found unconditional recipe packaging, a linked lock ancestor, unverifiable
abandoned-stage deletion, host/translation ambiguity, an overstated GitHub credential boundary,
incomplete timeout codes, an unselected XML parser, and no governed two-native-target attestation.
The following decisions settle every contract before production code is written.

### Constraints and resolved assumptions

- **HARD—existing contract:** arc42 sections 3, 5, and 7 still require Mermaid. Structurizr cannot
  satisfy or weaken that gate.
- **HARD—trust boundary:** pull-request-authored DSL and generated SVG are untrusted input and output.
  The verifier/renderer subprocess and render containers may receive no repository, environment, or
  GitHub credential; GitHub's own action runtime remains outside that claim.
- **HARD—filesystem invariant:** a renderer may read only the opted-in model and may publish only
  regular files under the exact generated root. Repository/output traversal uses retained directory
  descriptors and no-follow operations; a symlink must never be followed for locking, cleanup,
  mounting, validation, or publication.
- **HARD—upstream interface:** the consolidated image exposes a process command interface, not a JSON
  API. Compatibility therefore depends on its exact `version`, `validate`, and `export` arguments and
  emitted file schemas.
- **SOFT—repository layout:** authored source is under `docs/architecture/structurizr/` and generated
  bytes are under `build/architecture/structurizr/` to match existing source/build conventions.
- **ASSUMPTION—includes are needed:** rejected for version 1. One owned file is sufficient for the
  minimum C4 model and removes an otherwise unnecessary source-closure and manifest problem.
- **ASSUMPTION—pinned rendering is byte-deterministic:** disproved. A repeated native arm64 probe with
  unchanged source and image produced identical `workspace.json` and legend SVGs, but each primary
  SVG differed at its renderer-generated wall-clock metadata text. No output rewrite is permitted,
  so this design promises provenance and semantic validation, not byte-identical SVGs.
- **ASSUMPTION—both image platforms were exercised:** false at design time. Only the arm64 manifest
  was executed during settlement. Published manifests are discovery evidence, not support evidence;
  stable required native CI jobs and a closed attestation set now gate pin acceptance and shipment.

## Goals / Non-Goals

**Goals:**

- Seed one team-owned DSL file and derive a minimum context/container/component set from it.
- Prove cross-level element and relationship lineage from one exported workspace.
- Reject active or externally referential SVG without rewriting renderer output.
- Make render and clean operations race-free, path-contained, and explicit about unsafe retained
  state.
- Use a verifiable renderer, vendored XML parser, and Bun pin on a closed native OCI target matrix.
- Limit the credential guarantee to scrubbed verifier/renderer subprocesses and containers.
- Preserve Mermaid as the installed and authoring default through physically separate packaging.

**Non-Goals:**

- Includes, workspace extension, DSL scripts/plugins, remote themes, custom DSL file selection, or
  multi-file source manifests in version 1.
- Replacing Mermaid, embedding Structurizr output into the architecture HTML, or letting SVG output
  satisfy `arch-lint` diagram presence.
- Structurizr servers, workspace push/pull, API keys, editable CI layout, PNG, committed generated
  output, or historical backfill.
- Byte-identical SVGs, cross-platform byte equality, Windows hosts/containers, WSL, or OCI emulation.
- Sanitizing or rewriting unsafe SVG. Unsafe renderer output is rejected in full.

## Decisions

### Decision 1: Accept one exact regular model and prohibit source expansion (two-way door)

`./install.sh --here <repo> --with-structurizr` is the only activation path. Structurizr recipes live
only in `justfile.structurizr`; `justfile.opsx` contains no Structurizr text or import. Opt-in adds one
installer-owned, comment-delimited `import "justfile.structurizr"` block to the detected host
`justfile`/`Justfile` and one installer-owned block containing the three exact ignore entries. An
ordinary install into a never-opted repository creates none of those blocks and no item in the
inventory below. An ordinary rerun into an already opted-in repository neither refreshes nor removes
the option; activation and removal are always explicit.

The complete consumer opt-in inventory is closed:

- `justfile.structurizr`;
- `tools/structurizr-source.ts`, `tools/structurizr-fs.ts`, `tools/structurizr-docker.ts`,
  `tools/structurizr-verify.ts`, `tools/structurizr-render.ts`, and
  `tools/structurizr-probe.ts`;
- `tools/structurizr/pin.json` and `tools/structurizr/pin-evidence.md`;
- `tools/vendor/structurizr-xml/NOTICE.md`,
  `tools/vendor/structurizr-xml/node_modules/saxes/saxes.js`, and its `package.json`;
- `tools/vendor/structurizr-xml/node_modules/xmlchars/package.json`, `LICENSE`,
  `xml/1.0/ed5.js`, `xml/1.1/ed2.js`, and `xmlns/1.0/ed3.js`;
- `.github/workflows/structurizr.yml`; and
- team-owned `docs/architecture/structurizr/workspace.dsl`, seeded only when absent.

No test, fixture, template, attestation workflow, or generated output is copied to a consumer. An
opt-in rerun refreshes each listed kit-owned file by same-directory temporary write plus atomic
rename, rewrites each managed block as one exact copy, removes no unknown file, and preserves the
model byte-for-byte. Source and target that are the same `(device,
inode)` are a successful no-op, which lets this repository dogfood by running its own installer.
Dogfood MUST activate with `./install.sh --here "$PWD" --with-structurizr`; its pre-existing team
model is hash-checked before and after the rerun and MUST NOT be replaced by the template.

Removal is explicit and data-preserving. After `just structurizr-clean`,
`./install.sh --here <repo> --remove-structurizr` fails if the lock, any stage, or final output still
exists; otherwise it removes the managed import/ignore blocks and every kit-owned inventory item,
but retains `docs/architecture/structurizr/workspace.dsl` and reports that retained team-owned path.
The operator may then archive or delete that source explicitly. Removal is idempotent, performs no
Docker/Bun call, and never interprets an ordinary install as removal.

The public command remains `just structurizr-render [model]`, but the optional argument is a
compatibility affordance: it may be omitted or must be the exact repository-relative POSIX string
`docs/architecture/structurizr/workspace.dsl`. Absolute paths, alternate spellings, `.`/`..`, and any
other model are `CONFIG MODEL_PATH`.

The tool discovers the repository root with `git rev-parse --show-toplevel`. Before opening or
mounting the model, it traverses from the retained root descriptor with `fstatat`/`openat` no-follow
operations, rejects every symlink and non-directory ancestor, and verifies with `fstat` that the
opened object is one regular file of at most 5 MiB. Its real path must equal the real
repository root joined to the exact model path. The file must decode as strict UTF-8; its manifest
hash is SHA-256 over CRLF/CR converted to LF, without changing the file supplied to Structurizr.

Version 1 has no source closure because source expansion is prohibited. In the line-oriented DSL
preflight, after only leading spaces/tabs are skipped, the only permitted `!` directives are the
exact, case-sensitive forms `!identifiers hierarchical`, `!impliedRelationships true`, and
`!impliedRelationships false`. Every other leading `!` directive, including `!include`, `!docs`,
`!adrs`, `!script`, and `!plugin`, is `CONFIG SOURCE_DIRECTIVE`. A DSL lexical scan outside quoted
strings and line comments rejects a declaration whose first two tokens are `workspace` and `extends`
with `CONFIG WORKSPACE_EXTENDS`; descriptive text containing “extends” is not matched. The model mount
contains that one file, not its
parent directory, so an unrecognized source lookup also cannot read another repository file.

All exported view keys, including non-canonical keys, must match
`[A-Za-z0-9][A-Za-z0-9_-]{0,63}`, must not end with ASCII-case-insensitive `-key`, and must be unique
both byte-for-byte and after ASCII lowercase across every workspace view array. This prevents
case-insensitive-host collisions and primary/legend collisions. The exact case-sensitive canonical
keys are `context`, `container`, and `component`.

Rejected: transitive includes, because canonicalizing their grammar, symlink-safe closure, ordering,
and trigger identity adds no version 1 value. Rejected: any model under a broad directory, because it
turns a convenience argument into a credential-mount primitive.

### Decision 2: Pin the verified consolidated interface and run native Linux OCI targets only (one-way door)

The exact image reference is:

```text
structurizr/structurizr:2026.06.28-playwright@sha256:9bdc861e8c94f77f5f73bde70bdee410a65b82cbe8d341d3919a9ebd0cb17f8c
```

`tools/structurizr/pin.json` has schema version 1 and records repository, tag, full reference, index
digest, upstream tag `v2026.06.28`, upstream commit
`9ff16634c3b8574584262ae8545510bbb1d1b4bd`, application `2026.06.28`, libraries `6.2.2`, and exactly
these target manifests:

- `linux/amd64` → `sha256:99119a0586c11e99db513915f1a5580088c6a07bcaded7d7d27f65fd2ee3c29e`
- `linux/arm64` → `sha256:b669b5dbf931f4e0bf900586f6b1b98a66b35192d123c17824da2ed1f850268e`

The exact pin shape is the following closed JSON schema; readers reject missing, mistyped, or
additional fields. Each archive value is an object with exact `url` and `sha256` strings. The four
archive URLs use
`https://github.com/oven-sh/bun/releases/download/bun-v1.3.14/bun-<platform>.zip` with platform names
`darwin-aarch64`, `darwin-x64`, `linux-aarch64`, and `linux-x64` and the hashes in Decision 6.

```json
{
  "schemaVersion": 1,
  "image": {
    "repository": "structurizr/structurizr",
    "tag": "2026.06.28-playwright",
    "reference": "<full tag@index-digest reference>",
    "indexDigest": "<sha256 digest>",
    "entrypoint": ["/usr/local/structurizr.sh"],
    "platforms": {
      "linux/amd64": "<manifest digest>",
      "linux/arm64": "<manifest digest>"
    },
    "allowedEnvironmentNames": [
      "JAVA_HOME", "LANG", "LC_ALL", "PATH", "PLAYWRIGHT_BROWSERS_PATH", "PORT"
    ]
  },
  "upstream": {
    "tag": "v2026.06.28",
    "commit": "9ff16634c3b8574584262ae8545510bbb1d1b4bd",
    "releaseUrl": "https://github.com/structurizr/structurizr/releases/tag/v2026.06.28",
    "commitUrl": "https://github.com/structurizr/structurizr/commit/9ff16634c3b8574584262ae8545510bbb1d1b4bd",
    "applicationVersion": "2026.06.28",
    "librariesVersion": "6.2.2"
  },
  "interface": {
    "platformProbeEntrypoint": "/usr/bin/uname",
    "platformProbe": ["-s", "-m"],
    "version": ["version"],
    "validate": ["validate", "-w", "/workspace/workspace.dsl"],
    "jsonExport": ["export", "-w", "/workspace/workspace.dsl", "-f", "json", "-o", "/output"],
    "svgExport": ["export", "-w", "/workspace/workspace.dsl", "-f", "svg", "-o", "/output", "-mode", "light", "-animation", "false"]
  },
  "xmlParser": {
    "name": "saxes",
    "version": "6.0.0",
    "tarballUrl": "https://registry.npmjs.org/saxes/-/saxes-6.0.0.tgz",
    "tarballSha256": "1cdf52fbbe1ccbd175c365d2b8e63f46e590e74aff23fa6a44a6ec51522e96db",
    "npmIntegrity": "sha512-xAg7SOnEhrm5zI3puOOKyy1OMcMlIJZYNJY7xLBwSze0UjhPLnWfj2GF2EpT0jmzaJKIWKHLsaSSajf35bcYnA==",
    "dependency": {
      "name": "xmlchars",
      "version": "2.2.0",
      "tarballUrl": "https://registry.npmjs.org/xmlchars/-/xmlchars-2.2.0.tgz",
      "tarballSha256": "bdf900298963e4bd95b76aa95e96d29f05687e6ae662d617061778267b576da8",
      "npmIntegrity": "sha512-JZnDKK8B0RCDw84FNdDAIpZK+JuJw+s7Lz8nksI7SIuU3UXJJslUthsi+uWBUYOwPFwW7W7PRLRfUKpxjtjFCw=="
    },
    "files": {
      "saxes/saxes.js": "d00e2ba27ed7d6ac961d03ff14d6b8c0eb5bf063ed2c996c22c6df06ac121423",
      "saxes/package.json": "32052572b41c2a890ed0854798c48454cc5991dcaafe5fb1718a4253046acfd3",
      "xmlchars/package.json": "a91c0b20003ff9399dde1de8c59681f1b6901c6fb1aac71780a3a876dc548583",
      "xmlchars/LICENSE": "45d196313c2647d313cc65ca9b093d2d6974b64d35ee7346f2c60c9d518dff2c",
      "xmlchars/xml/1.0/ed5.js": "ea350479ab6f6553c0c3395c30ec440fb39821f6902081939831ddf1b5e8fd0f",
      "xmlchars/xml/1.1/ed2.js": "461d5c71cc6076dc16aebbfd2d3c506481df5a74f43631d82372a6ffdc239d69",
      "xmlchars/xmlns/1.0/ed3.js": "ff14ffa3a2cdfdd1b6077c4a8443dc949f53d5bb56de5ed89d4dbc5d9fdf08f7"
    },
    "configuration": {
      "xmlns": true,
      "fragment": false,
      "position": true,
      "defaultXMLVersion": "1.0",
      "forceXMLVersion": true,
      "additionalNamespaces": false,
      "resolvePrefix": false,
      "doctype": "reject",
      "entities": "xml-builtins-only"
    }
  },
  "bun": {
    "version": "1.3.14",
    "setupAction": "oven-sh/setup-bun@735343b667d3e6f658f44d0eca948eb6282f2b76",
    "releaseUrl": "https://github.com/oven-sh/bun/releases/tag/bun-v1.3.14",
    "ciExecutableSha256": "9fd36f87e4b90b07632b987a2e4ec81ca15a62c81bf983190cea6d715be2ad74",
    "archives": {
      "darwin-aarch64": { "url": "<exact URL>", "sha256": "<digest>" },
      "darwin-x64": { "url": "<exact URL>", "sha256": "<digest>" },
      "linux-aarch64": { "url": "<exact URL>", "sha256": "<digest>" },
      "linux-x64": { "url": "<exact URL>", "sha256": "<digest>" }
    }
  },
  "timeoutsSeconds": {
    "bunVersion": 10,
    "dockerInfo": 60,
    "indexInspect": 60,
    "pull": 900,
    "imageInspect": 60,
    "platformProbe": 60,
    "version": 60,
    "validate": 60,
    "jsonExport": 120,
    "svgExport": 300,
    "terminateGrace": 10,
    "forceRemove": 30
  }
}
```

Supported clients are `uname -s` Linux or Darwin. The authority for the OCI target is the Docker
server, not the client process architecture: one bounded `docker info --format '{{json .}}'` must
report `OSType=linux` and `Architecture=amd64|x86_64|arm64|aarch64`, normalized to exactly
`linux/amd64` or `linux/arm64`. On Darwin it must additionally report
`OperatingSystem=Docker Desktop`; both Intel Docker Desktop reporting `amd64` and Apple Silicon Docker
Desktop reporting `arm64` are accepted. A Bun process translated by macOS Rosetta is not an OCI
container and is neither accepted nor rejected on its own; Docker's target remains authoritative.

Every index, pull, create, inspect, and run operation passes the normalized platform explicitly. A
fresh no-network container overrides the entrypoint with `/usr/bin/uname` and runs `-s -m`; only
`Linux x86_64` for `linux/amd64` or `Linux aarch64` for `linux/arm64` is accepted. Container inspect
must independently report the selected platform and selected manifest. `DOCKER_DEFAULT_PLATFORM`
must be absent or exactly equal to that target. No cross-target request is ever made, so Docker
Desktop Rosetta-for-Linux and binfmt/QEMU paths are not eligible. A conflicting default, Windows
container mode, wrong manifest/platform, or in-container mismatch is `DEPENDENCY PLATFORM`.
Unobservable implementation details inside a truthful Docker server are outside the claim; the
contract proves target equality at the server, image, created-container, and running-container
boundaries rather than guessing host CPU translation from `uname -m`.

Canonical render CI requires a native `ubuntu-24.04` runner whose `runner.arch` is `X64`, server is
`linux/amd64`, and container probe is `Linux x86_64`. The governed second pin-attestation job uses
`ubuntu-24.04-arm`, `runner.arch=ARM64`, server `linux/arm64`, and `Linux aarch64`. Neither job sets
`DOCKER_DEFAULT_PLATFORM` until server equality has passed.

The application boundary is exactly these commands, each in a fresh container after the separate
`/usr/bin/uname -s -m` platform probe:

```text
version
validate -w /workspace/workspace.dsl
export -w /workspace/workspace.dsl -f json -o /output
export -w /workspace/workspace.dsl -f svg -o /output -mode light -animation false
```

`version` must exit 0 and emit lines matching `structurizr: 2026.06.28` and `structurizr-*: 6.2.2`.
`validate` has no response body contract beyond exit 0. JSON export must create exactly one regular
`/output/workspace.json` before SVG export. SVG export must create one `<view-key>.svg` per exported
view and may create only corresponding `<view-key>-key.svg` legend files. Missing, duplicate,
unexpected, symlink, or non-regular output is rejected.

Each container is named `structurizr-<32-lowercase-hex-nonce>` and is created with the selected
platform, `--network=none`, `--cap-drop=ALL`, `--security-opt=no-new-privileges`, the host UID:GID, a
read-only bind mount of the exact model file at `/workspace/workspace.dsl`, and a writable bind mount
of only the current staging `payload/` directory at `/output`. The owner marker and staging parent are
not mounted. The Docker socket, repository root, model parent,
host home, and credentials are never mounted. The container filesystem remains ephemeral and
writable because the exporter creates a temporary static site and Playwright driver state.

Every bounded operation uses the exact `timeoutsSeconds` field above. The host wrapper starts each
Docker CLI in its own process group. At timeout it sends `SIGTERM` to the process group, waits 10
seconds, sends `SIGKILL` if needed, and then performs a separately bounded 30-second
`docker rm -f <exact-generated-container-name>` when a container name was allocated. Decision 8 maps
each operation and force-remove outcome to one exact code; “classified by stage” is not an allowed
implementation shortcut.

The image is rejected if `docker image inspect` shows a different repo digest, entrypoint other than
`/usr/local/structurizr.sh`, or an image-config environment name outside `PATH`, `LANG`, `LC_ALL`,
`JAVA_HOME`, `PLAYWRIGHT_BROWSERS_PATH`, and `PORT`. Runtime overrides add only `HOME=/tmp` and
`TMPDIR=/tmp`; Docker's generated `HOSTNAME` is also allowed. No host environment variable is passed
with an unvalued `--env` flag.

Rejected: `latest`, tag-only references, `structurizr/cli`, and `structurizr/lite`. Rejected:
transparent emulation, because platform-specific failures and timing make support unverifiable.

### Decision 3: Verify one JSON model and accept only passive, self-contained SVG (one-way door)

The verifier parses `workspace.json` as strict UTF-8 JSON with a 25 MiB file limit. The top level,
`model`, and `views` must be objects. Every recognized view collection must be an array; each view,
element reference, and relationship reference must be an object of the shape used by application
6.2.2. IDs and keys must be non-empty strings. The verifier flattens model elements and source and
implied relationships, then enforces:

1. exactly one workspace has at least one system-context, container, and component view and unique
   canonical keys;
2. every view element and relationship ID resolves to that model;
3. at least one element ID occurs in all three canonical views;
4. at least one source relationship ID is represented in all three canonical views directly or by a
   `linkedRelationshipId`; and
5. every exported view has one corresponding accepted primary SVG.

Every primary and legend SVG is independently validated by the only approved parser boundary:
CommonJS `saxes` 6.0.0 with `xmlchars` 2.2.0, vendored under the exact inventory in Decision 1. The
upstream tarball SHA-256 and npm integrity values are pinned in Decision 2. Before any SVG parse, the
verifier hashes every runtime vendor file and compares this closed inventory:

| Vendored path relative to `tools/vendor/structurizr-xml/node_modules/` | SHA-256 |
| --- | --- |
| `saxes/saxes.js` | `d00e2ba27ed7d6ac961d03ff14d6b8c0eb5bf063ed2c996c22c6df06ac121423` |
| `saxes/package.json` | `32052572b41c2a890ed0854798c48454cc5991dcaafe5fb1718a4253046acfd3` |
| `xmlchars/package.json` | `a91c0b20003ff9399dde1de8c59681f1b6901c6fb1aac71780a3a876dc548583` |
| `xmlchars/LICENSE` | `45d196313c2647d313cc65ca9b093d2d6974b64d35ee7346f2c60c9d518dff2c` |
| `xmlchars/xml/1.0/ed5.js` | `ea350479ab6f6553c0c3395c30ec440fb39821f6902081939831ddf1b5e8fd0f` |
| `xmlchars/xml/1.1/ed2.js` | `461d5c71cc6076dc16aebbfd2d3c506481df5a74f43631d82372a6ffdc239d69` |
| `xmlchars/xmlns/1.0/ed3.js` | `ff14ffa3a2cdfdd1b6077c4a8443dc949f53d5bb56de5ed89d4dbc5d9fdf08f7` |

Missing, extra, or mismatched runtime vendor files are `DEPENDENCY XML_PARSER`; there is no package
manager resolution or fallback parser. The constructor options are exactly `xmlns: true`,
`fragment: false`, `position: true`, `defaultXMLVersion: "1.0"`, and
`forceXMLVersion: true`; `additionalNamespaces` and `resolvePrefix` are not supplied. The verifier
never mutates `parser.ENTITIES`, so only the five XML built-ins exist, and a `doctype` event is an
immediate rejection. No parser callback may perform filesystem or network access.

Before parsing, each file must be a non-empty strict UTF-8 regular file no larger than 25 MiB and
contain neither `<!DOCTYPE` nor an XML processing instruction other than an optional leading XML
declaration. Parser error is terminal—no recovery or second parser is permitted. The streamed count
is limited to 100,000 elements, depth 256, 256 attributes per element, and 250 MiB across all SVGs.
The root expanded name must be `{http://www.w3.org/2000/svg}svg`; elements in another namespace are
rejected.

The following policy is exact and rejecting; it never rewrites:

- Reject element local names, ASCII-case-insensitively: `script`, `foreignObject`, `animate`,
  `animateColor`, `animateMotion`, `animateTransform`, `animation`, `set`, `discard`, `a`, `audio`,
  `video`, `iframe`, `object`, `embed`, `canvas`, `base`, `cursor`, `feImage`, `font-face-uri`,
  `handler`, `listener`, and `link`.
- Reject every attribute whose local name starts with `on`, ASCII-case-insensitively, and reject every
  non-empty `xml:base` attribute.
- For `href`, `xlink:href`, `src`, `data`, `poster`, `action`, `formaction`, and `cite`, permit only an
  empty value or a same-document fragment matching `#[A-Za-z_][A-Za-z0-9_.:-]{0,127}`. Since `a` is
  prohibited, fragments cannot create navigation. External, protocol-relative, absolute, relative,
  `file:`, `data:`, `blob:`, and other scheme values are rejected.
- In every `style` element and `style` attribute, reject comments (`/*`), backslash escapes, any `@`
  token, ASCII-case-insensitive `url` or `expression` followed by optional ASCII whitespace and `(`,
  and ASCII-case-insensitive `-moz-binding` or `behavior` followed by optional whitespace and `:`.
  This makes imports, active legacy CSS, and encoded or direct CSS URL forms unrepresentable without
  relying on regex decoding.
- In presentation IRI attributes `marker-start`, `marker-mid`, `marker-end`, `fill`, `stroke`,
  `clip-path`, `mask`, `filter`, `cursor`, and `color-profile`, permit ordinary non-IRI values or exactly
  `url(#[A-Za-z_][A-Za-z0-9_.:-]{0,127})`; any other `url(` form is rejected.
- Reject ASCII control characters other than tab, LF, and CR in attribute values. Empty `image`
  elements are permitted for compatibility, but an `image` with any non-empty URL-bearing attribute
  is rejected by the preceding rule.

This policy permits the pinned renderer's observed `<style>`, `<marker>`, `marker-end="url(#...)"`,
and empty `<image>` output while excluding script, events, foreign HTML, animation, embedding, and
external/data/relative resource loads. “Parseable SVG” alone is not acceptance.

The security corpus MUST include external and parameter entities, local-file and HTTP XXE, nested
entity expansion, undefined entities, malformed/truncated XML, duplicate attributes, namespace
shadowing, extra roots, DTDs, processing instructions, depth/count/attribute limits, and every active
SVG/CSS/URL rule. Tests install filesystem/network tripwires and prove no resolver call occurs; they
also mutate every vendored file and prove fail-closed integrity before parsing.

Rejected: sanitization, because rewriting can change semantics and creates a second renderer.
Rejected: trusting artifacts because they came from a pinned image; untrusted DSL still influences
what maintainers later open. Rejected: DOMParser, a handwritten XML recognizer, package-manager
resolution, or future parser selection, because each changes namespace/entity/error semantics.

### Decision 4: Root all lifecycle operations in retained descriptors (one-way door)

After valid invocation syntax, the command obtains the repository path from
`git rev-parse --show-toplevel`, resolves it once with `realpath`, opens that exact real path with
`O_RDONLY|O_DIRECTORY|O_NOFOLLOW|O_CLOEXEC`, and records the root `(device,inode)`. All later
filesystem operations use POSIX descriptor-relative `openat`, `mkdirat`, `fstatat` with
`AT_SYMLINK_NOFOLLOW`, `renameat`, and `unlinkat`; a path-based or link-following fallback is
prohibited. `build` and then `architecture` are opened from the retained parent descriptor with
`O_DIRECTORY|O_NOFOLLOW`; absent components are `mkdirat`-created one at a time and immediately
opened/fstat-checked. A symlink, non-directory, identity change, unsupported safe syscall, or root
that no longer resolves to the retained identity is `IO PATH` before lock acquisition.

Render and clean share `build/architecture/.structurizr-lock`. Only after the safe lock-parent
descriptor exists, the command performs one atomic
`openat(parentFd, ".structurizr-lock", O_WRONLY|O_CREAT|O_EXCL|O_NOFOLLOW|O_CLOEXEC, 0600)`.
`EEXIST` for any existing object is `IO LOCK_BUSY`; any other open error is `IO PATH`. This is the
only lock-acquisition operation—there is no check-then-create race. The owner writes, fsyncs, and
retains the descriptor for this closed one-line UTF-8 JSON, with keys in shown order:

```json
{"schemaVersion":1,"kind":"structurizr-lock","command":"render|clean","pid":123,"nonce":"0123456789abcdef0123456789abcdef"}
```

`command` is exactly `render` or `clean`, `pid` is a positive safe integer, and `nonce` is freshly
generated cryptographic lowercase hex matching `[0-9a-f]{32}`. Before each destructive phase and
unlock, traversal from the retained root descriptor must still yield the recorded lock-parent and
lock `(device,inode)` identities. The owner unlinks by retained parent descriptor only when the open
lock bytes, nonce, link count one, and identity still match. A replaced path is retained and reported.

A render creates exactly one sibling directory with
`mkdirat(lockParentFd, ".structurizr-stage-<nonce>", 0700)`; `EEXIST` is
`IO UNSAFE_OUTPUT`. It exclusively creates a single-link regular `.structurizr-owner.json` mode 0600
outside `payload/`, with this closed one-line UTF-8 JSON and key order:

```json
{"schemaVersion":1,"kind":"structurizr-stage","nonce":"0123456789abcdef0123456789abcdef","stageName":".structurizr-stage-0123456789abcdef0123456789abcdef","lock":{"device":"123","inode":"456"}}
```

`device` and `inode` are canonical unsigned base-10 strings from the live lock `fstat`; no sign,
leading zero except `"0"`, whitespace, or numeric JSON form is accepted. The directory suffix,
`nonce`, `stageName`, live lock JSON nonce, and live lock identity must all agree. Only the render
process holding that live descriptor and nonce has deletion authority. PID, a well-formed marker,
or a matching directory name alone never authorizes deletion.

Only `payload/` is mounted. Before publish, all entries are reopened relative to retained stage
handles and must be expected directories or single-link regular files. At the final phase the command
re-traverses from the retained root, compares every recorded ancestor identity, verifies that the
final name is absent, and atomically `renameat`s `payload/` to `structurizr` within the same retained
lock parent. A changed canonical ancestor fails `IO PATH`; unsafe final or stage content fails
`IO UNSAFE_OUTPUT`; neither is followed or removed.

A safe previous final root is removed after lock acquisition and before dependency/render work, so
ordinary later failure leaves no stale success. Current-run failure removes staging only when the
live-lock and complete owner tuple above still match; mismatch is retained and adds `IO CLEANUP`.
Lock contention and unsafe pre-existing state remain untouched.

Neither clean nor a later render automatically collects an abandoned stage, even if its JSON is
well-formed. Any `.structurizr-stage-*` not owned by the current live lock causes
`IO UNSAFE_OUTPUT` and is retained. Crash recovery is an explicit operator procedure: stop all
Structurizr commands, confirm no owner process/container exists, record the stale lock and stage
names, remove those exact repository entries without following links, and rerun clean. Missing,
malformed, extra-field, wrong-nonce, wrong-suffix, wrong-lock-identity, linked, hard-linked, or special
owner/stage state has the same retain-and-recover result; automation never guesses abandonment.
A clean with no final, lock conflict, or abandoned stage is idempotently successful.

The exact managed root ignore entries remain:

```gitignore
/build/architecture/structurizr/
/build/architecture/.structurizr-lock
/build/architecture/.structurizr-stage-*/
```

Precedence at this boundary is deliberate: invalid invocation precedes root work; unsafe/unavailable
repository or lock-parent establishment is `IO PATH`; only then can atomic `EEXIST` be
`IO LOCK_BUSY`; final/stage checks follow the acquired lock. Rejected: path-based ancestor checks,
a check-then-create lock, deletion before locking, PID reclamation, and abandoned-stage collection.

### Decision 5: Manifest provenance is deterministic; renderer bytes are not (two-way door)

The published root contains only accepted SVG/legend files, `workspace.json`, and `manifest.json`.
Manifest schema version 1 is:

```json
{
  "schemaVersion": 1,
  "source": {
    "path": "docs/architecture/structurizr/workspace.dsl",
    "sha256": "<64 lowercase hex>"
  },
  "renderer": {
    "image": "<full tag@index-digest reference>",
    "platform": "linux/amd64|linux/arm64",
    "applicationVersion": "2026.06.28",
    "librariesVersion": "6.2.2"
  },
  "verifier": { "bunVersion": "1.3.14" },
  "canonicalViews": ["component", "container", "context"],
  "views": ["<lexicographically sorted view keys>"],
  "files": [
    { "path": "<relative output filename>", "bytes": 1, "sha256": "<64 lowercase hex>" }
  ]
}
```

`files` excludes `manifest.json`, includes every other published file, and is sorted by path. Object
keys are serialized in the displayed order, arrays are lexicographically sorted where stated, JSON
uses LF with one terminal newline, and there is no timestamp, host path, run ID, PID, or nonce. Readers
reject unsupported schema versions and any file-set/hash mismatch.

The source hash and manifest serialization are deterministic. The exact output hashes prove which
bytes were uploaded; they do not assert that another run will have the same hashes. The pinned
renderer inserts its wall-clock “last modified” text into primary SVGs, and post-render rewriting is
forbidden. Repeated successful rendering is idempotent in lifecycle and semantics—it replaces the
same root and must pass the same lineage and safety rules—but is not byte-idempotent. CI performs one
verified render, not a meaningless byte-comparison retry.

Rejected: preserving the old byte-equality claim, because the independently observed renderer output
falsifies it. Rejected: deleting metadata from SVG, because no-rewrite is the safer ownership rule.

### Decision 6: Pin Bun 1.3.14 and separate verifier compatibility from SVG reproducibility (two-way door)

CI uses `oven-sh/setup-bun@735343b667d3e6f658f44d0eca948eb6282f2b76` with
`bun-version: 1.3.14`. The release URL is
`https://github.com/oven-sh/bun/releases/tag/bun-v1.3.14`; the canonical CI archive is
`bun-linux-x64.zip` with SHA-256
`951ee2aee855f08595aeec6225226a298d3fea83a3dcd6465c09cbccdf7e848f`, and its unzipped `bun`
executable has SHA-256 `9fd36f87e4b90b07632b987a2e4ec81ca15a62c81bf983190cea6d715be2ad74`.
The workflow checks the action's download URL, `bun --version`, and executable hash before invoking
the verifier.

The pin manifest also records release-API archive digests for supported local binaries:

- Darwin arm64: `d8b96221828ad6f97ac7ac0ab7e95872341af763001e8803e8267652c2652620`
- Darwin x64: `4183df3374623e5bab315c547cfa0974533cd457d86b73b639f7a87974cd6633`
- Linux arm64: `a27ffb63a8310375836e0d6f668ae17fa8d8d18b88c37c821c65331973a19a3b`
- Linux x64: `951ee2aee855f08595aeec6225226a298d3fea83a3dcd6465c09cbccdf7e848f`

Local render supports only Bun reporting exactly `1.3.14`; other versions are `DEPENDENCY BUN_VERSION`.
Local archive checksum enforcement is an installation concern, not a render function, but the four
recorded checksums give operators a provenance check. Bun is responsible for path checks, JSON/XML
verification, and manifest assembly; it cannot make the upstream SVG bytes reproducible, and this
design does not claim that it does.

### Decision 7: Guarantee credential absence only inside scrubbed render boundaries (one-way door)

The opted-in workflow runs on pull requests, pushes to `main`, and manual dispatch. Path filters cover
the exact model, `tools/structurizr/**`, Structurizr recipes and pin, installer and Structurizr
templates, the workflow, and the verifier's Bun pin. There is no includes glob because includes are
prohibited.

The job declares only `permissions: contents: read`. Checkout is pinned to
`actions/checkout@08c6903cd8c0fde910a37f88322edcfb5dd907a8` with `persist-credentials: false`.
Artifact upload is pinned to
`actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02` and occurs only after render
success. Workflow source may not reference `github.token`, `secrets`, repository/environment
secrets, OIDC, packages, `pull_request_target`, or credential-bearing services. GitHub-managed
checkout and Actions-runtime credentials are used only by those pinned checkout/upload actions, but
the design does not claim that workflow text can prove those service values are absent elsewhere in
the runner job.

The enforceable guarantee starts at process creation. The render step invokes the Bun
verifier/renderer with `env -i` and exactly these named non-secret host variables: `PATH`, an empty
job-temporary `HOME`, `TMPDIR`, `CI=true`, `DOCKER_DEFAULT_PLATFORM=linux/amd64`, and
`BUN_CONFIG_NO_TELEMETRY=1`. The wrapper captures its own environment before any model read and fails
if a seventh name exists. All Docker client operations, including pull and probe, descend from that
scrubbed process. Containers receive only the image-config allowlist and explicit `HOME`/`TMPDIR`
from Decision 2; no `GITHUB_*`, `ACTIONS_*`, token, cookie, credential file, host home, or Docker
config directory is passed or mounted.

Upload runs only after successful publication, uses `if-no-files-found: error`, artifact name
`structurizr-c4-${{ github.sha }}`, and requested retention 14 days. CI never commits or pushes output.

Tests parse workflow structure and execute the exact `env -i` command through environment/Docker
capture shims. They prove subprocess/container inputs, not GitHub's internal service-token
availability. Rejected: claiming action-level physical token isolation or “no token in the job”; the
enforceable claim is no credential at the verifier/renderer subprocess and container boundaries.

### Decision 8: Use one ordered failure taxonomy and make documentation a completion gate (two-way door)

Errors are one line beginning `<CLASS> <CODE>:` and exit non-zero. Checks are sequential in this
exact precedence; slash-separated codes on one numbered line are evaluated left to right:

1. `CONFIG INVOCATION`;
2. `IO PATH` for repository realpath/root/lock-parent establishment;
3. `IO LOCK_BUSY` for atomic lock `EEXIST`;
4. `IO UNSAFE_OUTPUT` for final or non-current stage preflight;
5. `CONFIG PIN` / `CONFIG MODEL_PATH` / `CONFIG SOURCE_DIRECTIVE` /
   `CONFIG WORKSPACE_EXTENDS`;
6. `DEPENDENCY BUN_TIMEOUT` / `DEPENDENCY BUN_VERSION` /
   `DEPENDENCY XML_PARSER`;
7. `DEPENDENCY DOCKER_TIMEOUT` / `DEPENDENCY DOCKER` /
   `DEPENDENCY PLATFORM`;
8. `DEPENDENCY OCI_INDEX_TIMEOUT` / `DEPENDENCY IMAGE`;
9. `DEPENDENCY IMAGE_PULL_TIMEOUT` / `DEPENDENCY IMAGE`;
10. `DEPENDENCY IMAGE_INSPECT_TIMEOUT` / `DEPENDENCY IMAGE`;
11. `DEPENDENCY PLATFORM_PROBE_TIMEOUT` / `DEPENDENCY PLATFORM`;
12. `DEPENDENCY VERSION_TIMEOUT` / `DEPENDENCY VERSION_OUTPUT` /
    `DEPENDENCY IMAGE`;
13. `VALIDATION DSL_TIMEOUT` / `VALIDATION DSL`;
14. `RENDER JSON_TIMEOUT` / `RENDER JSON` / `RENDER JSON_OUTPUT`;
15. `RENDER SVG_TIMEOUT` / `RENDER SVG` / `RENDER SVG_OUTPUT`;
16. `CONSISTENCY JSON` / `CONSISTENCY LINEAGE` / `CONSISTENCY VIEW_KEY` /
    `CONSISTENCY SVG_SAFETY`;
17. `IO PUBLISH`;
18. `IO FORCE_REMOVE_TIMEOUT` / `IO FORCE_REMOVE` / `IO CLEANUP` when no earlier primary exists.

This binds every bounded operation: Bun version=10 seconds; Docker info=60; OCI index=60; pull=900;
local image/config inspect=60; in-container platform probe=60; version=60; DSL validate=60; JSON
export=120; SVG export=300; and force-remove=30. The 10-second TERM grace is part of the already
selected operation timeout and never selects a new primary.

A non-zero command uses its non-timeout stage code. Unexpected or malformed Docker info is
`DEPENDENCY DOCKER`; index/config/digest/entrypoint/environment mismatch is `DEPENDENCY IMAGE`;
unexpected platform-probe bytes are `DEPENDENCY PLATFORM`; and unexpected version bytes are
`DEPENDENCY VERSION_OUTPUT`. After a successful JSON command, anything other than exactly one
single-link regular `workspace.json` is `RENDER JSON_OUTPUT`. After a successful SVG command, any
missing/extra/duplicate/linked/special or unsafe-key-derived filesystem entry is
`RENDER SVG_OUTPUT`. Content/lineage/parser-policy failures discovered after that inventory use the
`CONSISTENCY` codes, and a mutation after verification uses `IO PUBLISH`.

Force-remove is attempted only for the exact allocated container. If it times out or fails after an
earlier timeout/command/verification error, `IO FORCE_REMOVE_TIMEOUT` or `IO FORCE_REMOVE` is an
appended secondary diagnostic and the earlier primary remains. If routine post-success removal is
the first failure, that force-remove code is primary and publication is prohibited. Owned-stage or
lock cleanup failure is likewise secondary to any earlier primary, otherwise `IO CLEANUP`.

Checks stop at the first failure and do not run later stages. There is no `PARTIAL` success. Ordinary
failures after safe final-root removal leave the final absent; lock contention, unsafe existing
output, and abandoned/mismatched staging are retained without mutation.

Shipping this user-visible architecture path requires all of the following after code lands:

- the architecture-writer refreshes arc42 sections 1–8 and 10–12 from shipped evidence, section 9
  indexes an ADR only if an authorized ADR owner created one, and `just architecture-html` plus
  `just arch-lint` pass;
- the tech-writer adds or updates a Structurizr how-to, `README.md`, and root `index.html`, preserving
  Mermaid-first guidance; and
- `just docs-lint` passes with no skipped required tool in the completion environment.

A passing renderer without those architecture and entry-document artifacts is an incomplete change.
This design settlement cannot edit `tasks.md` or `docs/architecture/**`; the apply orchestrator must
map these normative completion gates into authorized downstream work rather than treating existing
task wording as a waiver.

### Decision 9: Accept a pin only with a governed two-native-job attestation set (one-way door)

Repository pin changes are governed by `.github/workflows/structurizr-pin-attestation.yml`, separate
from the installed consumer render workflow. It runs for pull requests that change the pin, probe,
fixture, vendored parser, parser policy/corpus, or itself, and by manual dispatch. Its stable required
jobs are `structurizr-pin / native-amd64` on `ubuntu-24.04` and
`structurizr-pin / native-arm64` on `ubuntu-24.04-arm`, followed by
`structurizr-pin / verify-attestation-set`. Repository rules MUST require all three checks before a
pin-impacting PR merges; lack of that externally configured ruleset is a shipment blocker, not a
claim this design can prove from workflow YAML.

Both native jobs use the same checked-out commit and closed pin, scrub their probe environment as in
Decision 7, execute the exact one-file fixture through platform probe, version, validate, JSON export,
SVG export, consistency, parser-integrity, and SVG-safety-corpus checks, and upload an artifact named
`structurizr-pin-<amd64|arm64>-<40-lowercase-git-commit>`. The merge job downloads both by exact name,
validates all hashes and cross-pin fields, and uploads
`structurizr-pin-attestation-set-<40-lowercase-git-commit>`. Attestation upload uses the same pinned
upload action and contains no Docker config, environment dump, credential, or unrestricted
`docker info` output.

Each native artifact has exactly `attestation.json`, `source/workspace.dsl`, the verified
`output/workspace.json` and SVG/legend files, and these bounded raw files:
`raw/docker-server.json`, `raw/oci-index.json`, `raw/image-inspect.json`,
`raw/platform-probe.stdout`, `raw/version.stdout`, `raw/version.stderr`,
`raw/validate.stdout`, `raw/validate.stderr`, `raw/json-export.stdout`,
`raw/json-export.stderr`, `raw/svg-export.stdout`, `raw/svg-export.stderr`,
`raw/output-inventory.json`, and `raw/svg-safety.json`. `docker-server.json` contains only
`OSType`, `Architecture`, `OperatingSystem`, and `KernelVersion`; “raw” means unedited command bytes
at this approved field boundary, not a secret-bearing engine dump.

`attestation.json` is strict UTF-8 JSON with no additional fields and this schema; every digest is
64 lowercase hexadecimal, byte count is a positive safe integer, `gitCommit` is 40 lowercase
hexadecimal, and `files` contains every artifact file except `attestation.json`, sorted by path:

```json
{
  "schemaVersion": 1,
  "pin": {
    "path": "tools/structurizr/pin.json",
    "sha256": "<digest of exact pin bytes>",
    "imageReference": "<full tag@index reference>",
    "indexDigest": "<pinned digest>",
    "manifestDigest": "<pinned platform manifest>",
    "upstreamCommit": "<pinned commit>",
    "applicationVersion": "2026.06.28",
    "librariesVersion": "6.2.2",
    "xmlParser": "saxes@6.0.0+xmlchars@2.2.0"
  },
  "execution": {
    "gitCommit": "<commit>",
    "runnerLabel": "ubuntu-24.04|ubuntu-24.04-arm",
    "runnerArch": "X64|ARM64",
    "dockerServer": "linux/amd64|linux/arm64",
    "requestedPlatform": "linux/amd64|linux/arm64",
    "containerKernel": "Linux",
    "containerMachine": "x86_64|aarch64"
  },
  "fixture": {
    "path": "tools/fixtures/structurizr/workspace.dsl",
    "sha256": "<digest>"
  },
  "commands": {
    "platformProbe": { "timeoutSeconds": 60, "exitCode": 0 },
    "version": { "timeoutSeconds": 60, "exitCode": 0 },
    "validate": { "timeoutSeconds": 60, "exitCode": 0 },
    "jsonExport": { "timeoutSeconds": 120, "exitCode": 0 },
    "svgExport": { "timeoutSeconds": 300, "exitCode": 0 }
  },
  "checks": {
    "nativeTarget": true,
    "pin": true,
    "parserIntegrity": true,
    "lineage": true,
    "svgSafety": true,
    "outputInventory": true
  },
  "files": [
    { "path": "<relative artifact path>", "bytes": 1, "sha256": "<digest>" }
  ]
}
```

The two enum alternatives must agree by column: the amd64 job uses `ubuntu-24.04`, `X64`, all amd64
values, and `x86_64`; arm64 uses `ubuntu-24.04-arm`, `ARM64`, all arm64 values, and `aarch64`.
`attestation-set.json` in the merged artifact is also closed and exact:

```json
{
  "schemaVersion": 1,
  "pinSha256": "<same pin digest>",
  "gitCommit": "<same commit>",
  "indexDigest": "<same pinned index digest>",
  "attestations": [
    { "platform": "linux/amd64", "artifactName": "<exact native artifact name>", "sha256": "<attestation.json digest>" },
    { "platform": "linux/arm64", "artifactName": "<exact native artifact name>", "sha256": "<attestation.json digest>" }
  ]
}
```

The merged artifact contains exactly `attestation-set.json`, `linux-amd64/attestation.json`, and
`linux-arm64/attestation.json`; its array order is amd64 then arm64. A manifest listing, markdown
claim, emulated job, skipped corpus, different pin hash/commit, failed command, missing raw/output
file, extra field/file, or expired/unavailable required check cannot accept a pin. The artifact is
live CI evidence tied to exact pin bytes and commit; it is not committed executable output and does
not claim cross-platform byte equality.

## Renderer provenance and independent evidence

<!-- cspell:ignore buildx -->

The following evidence was collected during this settlement; it is deliberately limited to what was
actually observed.

- `docker buildx imagetools inspect '<full-reference>' --raw` and Docker Hub
  `https://hub.docker.com/v2/repositories/structurizr/structurizr/tags/2026.06.28-playwright` both
  returned index digest `9bdc...17f8c` and the recorded arm64/amd64 manifests. The Docker Hub API
  reports both images active and an update time of `2026-06-28T16:27:54.349733Z`.
- GitHub release `https://github.com/structurizr/structurizr/releases/tag/v2026.06.28` exists; tag API
  resolved commit `9ff16634c3b8574584262ae8545510bbb1d1b4bd`. GitHub marks the release mutable and the
  commit unverified, so the OCI digest and recorded commit—not tag immutability—are the executable
  provenance anchors.
- On a native arm64 Docker Desktop engine, `<full-reference> version` reported application
  `2026.06.28`, libraries `6.2.2`, Java 25.0.2, and Linux aarch64. The exact validate/JSON/SVG commands
  succeeded for a one-file hierarchical fixture. JSON export emitted `workspace.json`; SVG export
  emitted each key plus legend files. An unprivileged run with network disabled, all capabilities
  dropped, and `no-new-privileges` also succeeded. During this second settlement, Docker reported
  `linux/aarch64`, image inspect reported `linux/arm64` with entrypoint
  `/usr/local/structurizr.sh`, and the pinned image executed
  `/usr/bin/uname -s -m` as `Linux aarch64`; no amd64 command was executed.
- Repeating the fixture produced identical JSON and legend SVG bytes but different primary SVG bytes
  solely at the observed minute-bearing metadata text. This is negative evidence against the prior
  byte-determinism claim; no amd64 render or cross-platform byte probe was performed here.
- GitHub API confirmed the three action commit URLs and verified signatures for checkout, setup-bun,
  and upload-artifact. Bun release API reported version 1.3.14 and the four archive digests above.
  Independently downloading `bun-linux-x64.zip` reproduced archive SHA-256 `951e...848f` and binary
  SHA-256 `9fd3...d74`; the Linux binary could not be executed on the arm64 macOS evidence host.
- npm registry metadata for `saxes@6.0.0` and `xmlchars@2.2.0` returned the integrity values recorded
  in Decision 2. Fresh downloads reproduced tarball SHA-256 values `1cdf...96db` and `bdf9...6da8`;
  the seven runtime-file hashes in Decision 3 were computed from those archives. No vendored files
  are present yet, so integrity execution remains implementation evidence, not a shipped fact.

A pin update must run the same registry/API commands, inspect image config and entrypoint, execute the
fixture natively on both supported OCI targets, rerun the SVG safety corpus, and update recorded
evidence in a reviewed PR. A published manifest alone is not evidence that both platform commands
work.

## Risks / Trade-offs

- **Large image and Chromium attack surface** → Pin one digest, run unprivileged with no network,
  capabilities, or host secrets, and validate generated SVG. Residual: writable ephemeral container
  storage and browser code still execute.
- **Upstream tag/release mutability** → Anchor execution to OCI digest and upstream commit, record API
  evidence, and fail if interface probes differ. Residual: a deleted registry blob blocks clean CI.
- **Renderer timestamp bytes** → Make provenance/hashes exact and byte reproducibility explicitly
  unsupported. Residual: two valid artifacts from the same model can differ.
- **Crash leaves lock/staging** → Unique live ownership prevents cross-run deletion; no automatic
  abandoned-stage collection exists. Operators recover exact retained entries deliberately.
  Residual: availability yields to ownership certainty.
- **Strict SVG policy rejects a future safe renderer construct** → Pin updates run the corpus and may
  revise policy through review. Residual: false rejection is preferred to publishing active content.
- **Model truth can drift from code** → Verify model-internal lineage only; architecture review remains
  responsible for factual accuracy.

## Implementation sequence

Authorized downstream work is dependency-ordered: pin/evidence, exact vendored parser, and fixture;
source template; verifier and adversarial JSON/SVG corpus; descriptor-rooted renderer/cleaner;
separate optional recipes; conditional installer/removal; scrubbed render workflow; governed native
amd64 plus arm64 attestation jobs and set verifier; installer-driven repository dogfood; architecture
refresh and gates; then user how-to plus `README.md`/`index.html` and docs lint. Existing task wording
that places recipes in `justfile.opsx`, permits stage collection, claims action-token isolation, or
records markdown-only native evidence is superseded by these contracts and must be remapped by the
apply orchestrator without editing `tasks.md` in this settlement.

## Migration Plan

1. Ship the pin, vendored parser, fixture, verifier, renderer, separate optional recipes, workflow
   template, and explicit installer activation/removal support.
2. Existing installations remain unchanged. Opted-in reruns refresh kit files and preserve the team
   model; ordinary reruns neither activate nor deactivate.
3. Teams edit the one file while retaining hierarchical identifiers, safe view keys, canonical views,
   and one cross-level relationship lineage, then run `just structurizr-render`.
4. Accept the pin only after both governed native jobs and the attestation-set check pass; dogfood this
   repository through the installer and publish only a verified render bundle.
5. Removal is `just structurizr-clean` followed by `--remove-structurizr`; kit-owned files/imports are
   removed, the team model is retained for explicit operator disposition, and Mermaid continues.

There is no stored-data migration. Manifest schema starts at 1 and unsupported readers fail closed.

## Open Questions

None. Version 1 intentionally defers includes, Windows/emulation, output rewriting, and byte-stable
SVG rather than leaving them ambiguous.

## Architecture impact

Refresh arc42 section 1 (optional model-based quality goal), section 2 (Docker/Bun, vendored parser,
and native-platform constraints), section 3 (Structurizr registry/image and scrubbed GitHub render
boundary), section 4 (optional rendering strategy), section 5 (conditional package,
model/renderer/verifier/parser/descriptor-lock building blocks), section 6 (local and CI render,
timeout, recovery, and attestation flows), section 7 (explicit installation/removal and canonical plus
two-native-job CI topology), section 8 (single-source, passive-artifact, fail-safe-default, and live
ownership concepts), section 10 (lineage, safety, portability, credential-scrubbing, and provenance
scenarios), section 11 (browser, registry, parser supply chain, timestamp, stale-lock, CI-governance,
and model-drift risks), and section 12 (new terms). Section 9 indexes a future accepted ADR only if an
authorized ADR owner creates one. This change departs from the last-archived baseline by adding an
optional Docker-backed deterministic-engine boundary; it does not change the baseline's Mermaid or
role-authorization boundaries.
