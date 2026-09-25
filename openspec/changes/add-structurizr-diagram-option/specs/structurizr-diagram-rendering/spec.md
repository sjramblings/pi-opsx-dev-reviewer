# Structurizr diagram rendering—spec delta

<!-- cspell:ignore binfmt CLOEXEC CREAT EEXIST fstat mkdirat openat realpath renameat WRONLY xmlchars -->
<!-- vale Vale.Spelling = NO -->
<!-- vale Vale.Terms = NO -->

## ADDED Requirements

### Requirement: Structurizr rendering is explicit opt-in with one exact source file

The project installer SHALL activate Structurizr only when `--with-structurizr` accompanies a
project install. Structurizr recipes MUST exist only in `justfile.structurizr`, imported by one
installer-owned comment-delimited block in the host `justfile`/`Justfile`; `justfile.opsx` MUST contain
no Structurizr recipe or import. The three ignore rules MUST likewise occupy one installer-owned
block.

The complete consumer inventory SHALL be only `justfile.structurizr`; the six runtime files
`tools/structurizr-source.ts`, `tools/structurizr-fs.ts`, `tools/structurizr-docker.ts`,
`tools/structurizr-verify.ts`, `tools/structurizr-render.ts`, and `tools/structurizr-probe.ts`;
`tools/structurizr/pin.json` and `pin-evidence.md`; the exact vendored parser files named by the design;
`.github/workflows/structurizr.yml`; and one team-owned source model at
`docs/architecture/structurizr/workspace.dsl`. No test, fixture, template, attestation workflow, or
generated output SHALL be copied to a consumer.

The model SHALL be seeded non-destructively from `templates/structurizr/workspace.dsl`. An explicit
opt-in rerun MUST refresh each kit-owned inventory file by same-directory temporary write plus atomic
rename, normalize each managed block to one exact copy, preserve the model byte-for-byte, and treat
source/target files with the same device/inode as successful no-ops. An ordinary rerun into an opted-in repository MUST neither refresh nor remove the
option.

`just structurizr-render [model]` SHALL accept an omitted model argument or the exact
repository-relative POSIX string `docs/architecture/structurizr/workspace.dsl` and SHALL reject every
absolute path, alternate spelling, `.`/`..` traversal, and other file with `CONFIG MODEL_PATH`. The
renderer MUST establish the repository realpath/descriptor, traverse every model component with
descriptor-relative `fstatat`/`openat` no-follow operations, and `fstat` a single regular file no
larger than 5 MiB. The opened file's real path MUST equal the established real repository root joined
to the exact model path before it is mounted.

The model MUST be strict UTF-8 and use hierarchical identifiers. It MUST define unique canonical view
keys `context`, `container`, and `component`. Every view key MUST match
`[A-Za-z0-9][A-Za-z0-9_-]{0,63}`, MUST NOT end with ASCII-case-insensitive `-key`, and MUST be
unique both byte-for-byte and after ASCII lowercase across all view collections.

#### Scenario: Ordinary installation remains Mermaid-only

- **WHEN** an operator runs `./install.sh --here <repo>` without `--with-structurizr` in a repository that has never opted in
- **THEN** no Structurizr model, workflow, pin, tool, recipe file, import, or ignore entry is installed and the existing Mermaid path behaves unchanged

#### Scenario: Opt-in has a closed idempotent inventory

- **WHEN** an operator runs `./install.sh --here <repo> --with-structurizr` twice and edits the model between runs
- **THEN** the first run installs exactly the closed inventory and managed blocks and the second refreshes kit-owned files once while preserving the edited model byte-for-byte

#### Scenario: Repository dogfood uses the installer

- **WHEN** this repository runs `./install.sh --here "$PWD" --with-structurizr` with its team model already present
- **THEN** same-inode copies succeed without clobbering and the model SHA-256 is identical before and after activation

#### Scenario: Explicit removal preserves team source

- **WHEN** output has been safely cleaned and an operator runs `./install.sh --here <repo> --remove-structurizr` twice
- **THEN** both runs avoid Docker/Bun, remove the managed import/ignore blocks and all kit-owned inventory, retain the team model, and report its path

#### Scenario: Removal refuses live generated state

- **WHEN** the final output, lock, or any staging path exists during `--remove-structurizr`
- **THEN** removal fails without changing installed inventory and instructs the operator to run safe clean/recovery first

#### Scenario: Arbitrary and linked model paths are refused

- **WHEN** the caller supplies an absolute home-directory model, an alternate repository file, a traversing path, or the exact model path resolves through a symlink
- **THEN** rendering exits non-zero with `CONFIG MODEL_PATH` before Docker receives a mount and no outside file is read

#### Scenario: Non-regular or oversized model is refused

- **WHEN** the exact model path is a directory, FIFO, socket, device, symlink, or regular file larger than 5 MiB
- **THEN** rendering exits non-zero with `CONFIG MODEL_PATH` before validation or output publication

#### Scenario: View keys are safe filenames

- **WHEN** exported views contain exact or ASCII-case-folded duplicate keys, a key ending in `-key`, or a key with a slash, dot traversal, whitespace, non-ASCII character, leading hyphen, or more than 64 characters
- **THEN** verification exits non-zero with `CONSISTENCY VIEW_KEY` and no SVG is published under that key

### Requirement: Version 1 prohibits includes and executable source expansion

The renderer SHALL treat the exact model file as the entire version 1 source closure. After leading
spaces/tabs on each DSL line, the only permitted `!` directives SHALL be the exact case-sensitive
forms `!identifiers hierarchical`, `!impliedRelationships true`, and
`!impliedRelationships false`. Every other leading `!` directive, including `!include`, `!docs`,
`!adrs`, `!script`, and `!plugin`, MUST fail with `CONFIG SOURCE_DIRECTIVE`. A lexical scan outside
quoted strings and line comments MUST fail with `CONFIG WORKSPACE_EXTENDS` when a declaration's first
two tokens are `workspace` and `extends`; descriptive text containing `extends` MUST NOT match. The
container MUST mount the model file only, not the model directory.

The manifest source identity SHALL therefore be the SHA-256 of that one file after CRLF and CR are
converted to LF. The bytes supplied to Structurizr MUST NOT be rewritten. CI path filters MUST cover
the exact model path and SHALL NOT imply support for include globs.

#### Scenario: A local include is prohibited

- **WHEN** the exact model contains `!include child.dsl`, regardless of whether `child.dsl` is regular, linked, inside, or outside the model directory
- **THEN** rendering exits non-zero with `CONFIG SOURCE_DIRECTIVE` before Docker starts and no source-closure manifest is produced

#### Scenario: Script plugin and extension mechanisms are prohibited

- **WHEN** the model uses `!script`, `!plugin`, any other non-allowlisted leading `!` directive, or `workspace extends`
- **THEN** rendering exits non-zero with the corresponding `CONFIG SOURCE_DIRECTIVE` or `CONFIG WORKSPACE_EXTENDS` error

#### Scenario: The allowed hierarchical directive remains valid

- **WHEN** the one-file model contains `!identifiers hierarchical`, no prohibited source expansion, and the required views
- **THEN** source preflight accepts it and hashes exactly one LF-normalized source file

### Requirement: Rendering uses a verifiable immutable consolidated distribution

The renderer MUST invoke only
`structurizr/structurizr:2026.06.28-playwright@sha256:9bdc861e8c94f77f5f73bde70bdee410a65b82cbe8d341d3919a9ebd0cb17f8c`.
Pin schema version 1 SHALL record upstream tag `v2026.06.28`, upstream commit
`9ff16634c3b8574584262ae8545510bbb1d1b4bd`, application version `2026.06.28`, library version
`6.2.2`, linux/amd64 manifest
`sha256:99119a0586c11e99db513915f1a5580088c6a07bcaded7d7d27f65fd2ee3c29e`, and linux/arm64 manifest
`sha256:b669b5dbf931f4e0bf900586f6b1b98a66b35192d123c17824da2ed1f850268e`.
The pin MUST conform to the closed Decision 2 schema with no additional fields: top-level
`schemaVersion`, `image`, `upstream`, `interface`, `xmlParser`, `bun`, and `timeoutsSeconds`; exact
image repository/tag/reference/index/entrypoint/platform/environment fields; exact platform probe and
application command arrays; exact `saxes`/`xmlchars` provenance, seven-file hash map, and parser configuration; exact Bun
action/release/archive fields; and all twelve specified numeric timeout fields. Missing, mistyped, or
additional fields MUST fail with `CONFIG PIN`.

The pin evidence SHALL cite:

- `https://github.com/structurizr/structurizr/releases/tag/v2026.06.28`;
- `https://github.com/structurizr/structurizr/commit/9ff16634c3b8574584262ae8545510bbb1d1b4bd`; and
- `https://hub.docker.com/v2/repositories/structurizr/structurizr/tags/2026.06.28-playwright`.

A pin probe MUST inspect the OCI index, selected manifest, repo digest, image entrypoint, image-config
environment names, and `version` output. It MUST reject `latest`, a tag-only reference, a digest or
interface mismatch, an unexpected image-config environment name, and `structurizr/cli` or
`structurizr/lite`. A pin update MUST be a reviewed PR with fresh upstream tag/commit, OCI index and both-manifest
evidence, exact parser provenance/integrity, native fixture execution on both targets, and SVG
safety-corpus evidence. It MUST pass the three stable governed checks `structurizr-pin / native-amd64`,
`structurizr-pin / native-arm64`, and `structurizr-pin / verify-attestation-set`.

#### Scenario: The recorded index and application interface resolve

- **WHEN** the pin probe runs against the full image reference
- **THEN** the index digest and both target manifest digests match the pin and `version` emits application `2026.06.28` and libraries `6.2.2`

#### Scenario: Mutable or retired tooling is refused

- **WHEN** configuration uses `latest`, a tag-only reference, a different digest, a changed entrypoint/interface, or `structurizr/cli` or `structurizr/lite`
- **THEN** rendering exits non-zero with `CONFIG PIN` or `DEPENDENCY IMAGE` before accepting output

#### Scenario: Published manifest is not mistaken for executed support

- **WHEN** a pin-update PR records registry manifests but omits native command and fixture evidence for either target
- **THEN** the pin update fails its evidence gate even though the OCI index resolves

### Requirement: Pin support is attested by governed native amd64 and arm64 jobs

`.github/workflows/structurizr-pin-attestation.yml` SHALL run on pin-impacting pull requests and manual
dispatch with stable jobs `structurizr-pin / native-amd64` on `ubuntu-24.04`,
`structurizr-pin / native-arm64` on `ubuntu-24.04-arm`, and dependent
`structurizr-pin / verify-attestation-set`. Repository rules MUST require all three for pin-impacting
merges. Missing ruleset evidence or any skipped/failed job SHALL block shipment.

Each native job MUST use one checked-out commit/pin and the scrubbed environment, execute platform
probe, version, validate, JSON export, SVG export, lineage, parser integrity, and safety corpus, and
upload `structurizr-pin-<amd64|arm64>-<gitCommit>`. Each artifact MUST contain only
`attestation.json`; `source/workspace.dsl`; verified `output/workspace.json` and SVG/legend files; and
all fourteen exact `raw/` files listed in Decision 9. The bounded Docker server raw file MUST expose
only `OSType`, `Architecture`, `OperatingSystem`, and `KernelVersion`; artifacts MUST contain no
credential, environment dump, Docker config, or unrestricted engine dump.

`attestation.json` MUST satisfy the exact closed Decision 9 schema. It MUST bind SHA-256 of exact pin
bytes, immutable image/index/selected-manifest, upstream commit, application/libraries/parser, exact
fixture bytes, Git commit, governed runner label/architecture, server/requested/container platform,
all five command timeout/zero-exit pairs, six true checks, and every non-attestation artifact file's
positive size/hash. The amd64 and arm64 enum columns MUST match their respective jobs exactly.

The set job MUST verify both artifacts, equal pin hash/commit/index, platform distinction, all file
hashes, and exact schemas. It MUST upload
`structurizr-pin-attestation-set-<gitCommit>` containing only `attestation-set.json` and the two native
`attestation.json` files under exact platform directories. The set JSON MUST use the closed Decision
9 schema and amd64-then-arm64 order. An OCI listing, markdown statement, emulated run, mismatched pin
or commit, missing/extra file/field, or unavailable required check MUST NOT satisfy this requirement.

#### Scenario: Both native jobs attest one exact pin

- **WHEN** the amd64 and arm64 jobs execute the fixture and corpus successfully for one commit
- **THEN** the set verifier accepts two closed attestations with the same pin SHA-256/index and distinct pinned native manifest/platform values

#### Scenario: One native target cannot be replaced by metadata or emulation

- **WHEN** arm64 is skipped, emulated on amd64, or represented only by registry/index output
- **THEN** `structurizr-pin / native-arm64` or the set check fails and the pin is not accepted

#### Scenario: Raw evidence is complete and scrubbed

- **WHEN** an attestation artifact is validated
- **THEN** its exact source/output/raw inventory hashes match `attestation.json` and no unapproved engine field, environment, config, or credential file exists

### Requirement: Host support is based on the native Docker Engine target without emulation

Supported clients SHALL have `uname -s` Linux or Darwin. The authoritative OCI target SHALL be the
Docker server result from bounded `docker info --format '{{json .}}'`: `OSType` MUST be `linux` and
normalized `Architecture` MUST be `amd64` or `arm64`. Darwin additionally MUST report
`OperatingSystem` as `Docker Desktop`; Intel Desktop reporting amd64 and Apple Silicon Desktop
reporting arm64 are accepted regardless of whether the Bun client process itself is translated.

Every index, pull, create, inspect, and run operation MUST pass that exact platform. A fresh
no-network container MUST override entrypoint with pinned `/usr/bin/uname`, run `-s -m`, and return
exactly `Linux x86_64` for amd64 or `Linux aarch64` for arm64. Container inspect MUST agree on selected
platform and manifest. `DOCKER_DEFAULT_PLATFORM` MUST be absent or equal to the server target.
Cross-target requests are prohibited; Docker Desktop Rosetta-for-Linux, binfmt/QEMU, and any other
cross-architecture path are therefore never selected.

Windows containers, non-Desktop Darwin engines, a conflicting default, wrong image/container
platform, or in-container mismatch MUST fail with `DEPENDENCY PLATFORM`. Canonical render CI SHALL
use `ubuntu-24.04`, `runner.arch=X64`, server `linux/amd64`, and `Linux x86_64`. Native pin evidence
SHALL additionally use `ubuntu-24.04-arm`, `runner.arch=ARM64`, server `linux/arm64`, and
`Linux aarch64`.

#### Scenario: Apple Silicon uses the native arm64 image

- **WHEN** an Apple Silicon macOS host exposes a Docker Desktop server reporting `linux/arm64`
- **THEN** rendering selects the recorded linux/arm64 manifest and does not classify macOS itself as an unsupported OCI OS

#### Scenario: Canonical CI uses native amd64

- **WHEN** the workflow runs on `ubuntu-24.04` and Docker reports `linux/amd64`
- **THEN** every pull and container command passes `--platform linux/amd64` and uses the recorded amd64 manifest

#### Scenario: Translated macOS client does not force container emulation

- **WHEN** Bun runs under Rosetta on Apple Silicon but Docker Desktop, selected manifest, inspect, and the in-container probe all report native arm64
- **THEN** rendering accepts `linux/arm64` because client-process architecture is not the OCI authority

#### Scenario: Emulated or conflicting target is refused

- **WHEN** an arm64 engine is forced to `linux/amd64`, Docker reports Windows containers, container inspect disagrees, or in-container `uname` is not `Linux aarch64`
- **THEN** rendering exits non-zero with `DEPENDENCY PLATFORM` before model validation or publication

### Requirement: The renderer command boundary and termination are exact and bounded

The renderer SHALL execute each of these argument vectors in a fresh container:

```text
version
validate -w /workspace/workspace.dsl
export -w /workspace/workspace.dsl -f json -o /output
export -w /workspace/workspace.dsl -f svg -o /output -mode light -animation false
```

`validate` success SHALL be exit 0. JSON export success SHALL be exit 0 plus exactly one regular
`workspace.json` before SVG export. SVG export success SHALL be exit 0 plus exactly one
`<view-key>.svg` for every exported view and MAY include only matching `<view-key>-key.svg` legend
files. Unexpected, duplicate, linked, missing, or non-regular files MUST fail.

Each generated container name SHALL match `structurizr-[0-9a-f]{32}` and run with the native platform,
`--network=none`, `--cap-drop=ALL`, `--security-opt=no-new-privileges`, host UID:GID, a read-only mount
of only the exact model file, and a writable mount of only the owned staging `payload/` directory.
The owner marker, staging parent, repository root, model directory, Docker socket, home, and
credentials MUST NOT be mounted.

Wall-clock timeouts SHALL be Bun version 10 seconds; Docker info 60; OCI index inspect 60; pull 900;
local image/config inspect 60; in-container platform probe 60; version 60; validation 60; JSON export
120; SVG export 300; and force-remove 30. On an operation timeout the wrapper MUST signal that Docker
CLI process group with `SIGTERM`, wait 10 seconds, send `SIGKILL` if still alive, and attempt
`docker rm -f` for only an allocated generated container name.

#### Scenario: Exact fixture interface succeeds

- **WHEN** a valid one-file fixture is passed through the four exact command vectors
- **THEN** validation exits 0, JSON export creates `workspace.json`, and light non-animated SVG export creates the expected view and optional legend files

#### Scenario: An unexpected renderer file is rejected

- **WHEN** JSON export succeeds but does not leave exactly one regular `workspace.json`, or SVG export succeeds with a missing, extra, duplicate, linked, special, unsafe-key, or unmatched legend file
- **THEN** rendering exits with exact primary `RENDER JSON_OUTPUT` or `RENDER SVG_OUTPUT` respectively and publishes none of those files

#### Scenario: A hung export is terminated

- **WHEN** SVG export exceeds 300 seconds
- **THEN** its process group receives the specified TERM/grace/KILL sequence, only its exact container name is force-removed, the primary error is `RENDER SVG_TIMEOUT`, and no final output is published

#### Scenario: Renderer unavailability fails closed

- **WHEN** Docker is absent, pull exceeds 900 seconds, the pinned image is unavailable, or version output differs
- **THEN** rendering exits with `DEPENDENCY DOCKER`, `DEPENDENCY IMAGE_PULL_TIMEOUT`, `DEPENDENCY IMAGE`, or `DEPENDENCY VERSION_OUTPUT` respectively and never falls back

#### Scenario: Force-remove cannot replace an earlier timeout

- **WHEN** SVG export times out and its exact-container `docker rm -f` then exceeds 30 seconds
- **THEN** `RENDER SVG_TIMEOUT` remains primary, `IO FORCE_REMOVE_TIMEOUT` is secondary, and publication is prohibited

#### Scenario: Routine force-remove failure is primary only without an earlier error

- **WHEN** a command and its output succeed but exact-container force-remove fails or times out before publication
- **THEN** the primary is `IO FORCE_REMOVE` or `IO FORCE_REMOVE_TIMEOUT` respectively and no final output is published

### Requirement: One exported model proves cross-level identity and relationship consistency

Before accepting output, the verifier MUST parse one strict UTF-8 `workspace.json` no larger than
25 MiB. The top level, `model`, and `views` MUST be objects; recognized view collections MUST be
arrays; view, element-reference, and relationship-reference entries MUST be objects with required
non-empty string IDs/keys. The verifier MUST flatten source and implied model relationships and MUST
establish that canonical system-context, container, and component views resolve every referenced
element and relationship against that model.

At least one element ID MUST occur in all three canonical views. At least one source relationship ID
MUST be represented in all three directly or through `linkedRelationshipId`. Every exported view,
including non-canonical views, MUST have one verified primary SVG and manifest view entry.

#### Scenario: One fixture produces three connected C4 levels

- **WHEN** the executable fixture relates one person directly to a component and is validated, JSON-exported, SVG-rendered, and verified
- **THEN** `context`, `container`, and `component` pass with the same person ID and one direct-or-linked relationship lineage across all three views

#### Scenario: A view cannot invent an identity

- **WHEN** an exported view references an element or relationship ID absent from the exported model
- **THEN** verification exits non-zero with `CONSISTENCY JSON`, names the view and unknown ID, and publishes no final output

#### Scenario: Three unrelated views are rejected

- **WHEN** canonical SVGs exist but their JSON views share no element ID or no direct-or-linked source relationship lineage
- **THEN** verification exits non-zero with `CONSISTENCY LINEAGE` rather than accepting file count or labels as consistency

#### Scenario: Every additional view is reconciled

- **WHEN** the one model defines valid views in addition to the canonical three
- **THEN** every safe unique key appears in sorted manifest views and has exactly one accepted primary SVG from the same run

#### Scenario: Malformed workspace JSON is rejected

- **WHEN** `workspace.json` is invalid UTF-8/JSON, oversized, has a wrong object/array type, or has a missing/non-string required ID or key
- **THEN** verification exits non-zero with `CONSISTENCY JSON` and no final output is published

### Requirement: Published SVG is passive and self-contained without rewriting

Every primary and legend SVG MUST be a non-empty strict UTF-8 single-link regular file no larger than
25 MiB. All SVGs together MUST be no larger than 250 MiB. The only approved XML implementation SHALL
be vendored CommonJS `saxes` 6.0.0 plus `xmlchars` 2.2.0 from the exact registry URLs, npm integrity,
tarball SHA-256, seven runtime paths, and seven runtime SHA-256 values in Decisions 2 and 3. The
verifier MUST hash the closed vendor inventory before parsing; missing, extra, changed, package-manager
resolved, handwritten, DOM, or fallback parser code MUST fail with `DEPENDENCY XML_PARSER`.

The parser MUST be constructed with exactly `xmlns: true`, `fragment: false`, `position: true`,
`defaultXMLVersion: "1.0"`, and `forceXMLVersion: true`; it MUST NOT receive
`additionalNamespaces` or `resolvePrefix`, mutate `parser.ENTITIES`, recover after error, or invoke a
filesystem/network resolver. A doctype event MUST reject immediately. Streaming checks MUST enforce
at most 100,000 elements, depth 256, and 256 attributes per element. The root MUST be
`{http://www.w3.org/2000/svg}svg`; foreign-namespace elements, `<!DOCTYPE`, and processing
instructions other than an optional leading XML declaration MUST be rejected.

The verifier MUST apply these exact ASCII-case-insensitive checks and MUST NOT rewrite output:

- Reject elements `script`, `foreignObject`, `animate`, `animateColor`, `animateMotion`,
  `animateTransform`, `animation`, `set`, `discard`, `a`, `audio`, `video`, `iframe`, `object`,
  `embed`, `canvas`, `base`, `cursor`, `feImage`, `font-face-uri`, `handler`, `listener`, and `link`.
- Reject any attribute whose local name starts with `on` and every non-empty `xml:base` attribute.
- For `href`, `xlink:href`, `src`, `data`, `poster`, `action`, `formaction`, and `cite`, allow only
  empty or `#[A-Za-z_][A-Za-z0-9_.:-]{0,127}`. Reject external, protocol-relative, absolute,
  relative, `file:`, `data:`, `blob:`, and every other scheme value.
- In `style` element text and `style` attribute values, reject `/*`, backslash, every `@` token,
  `url` or `expression` followed by optional ASCII whitespace and `(`, and `-moz-binding` or
  `behavior` followed by optional whitespace and `:`.
- In `marker-start`, `marker-mid`, `marker-end`, `fill`, `stroke`, `clip-path`, `mask`, `filter`,
  `cursor`, and `color-profile`, allow ordinary non-IRI values or exactly
  `url(#[A-Za-z_][A-Za-z0-9_.:-]{0,127})`; reject every
  other `url(` form.
- Reject attribute-value ASCII controls other than tab, LF, and CR. An `image` element is permitted
  only when its URL-bearing attributes are empty or valid same-document fragments.

Any violation MUST fail with `CONSISTENCY SVG_SAFETY`, name the file and rule, and prevent publication.

#### Scenario: Pinned passive SVG is accepted unchanged

- **WHEN** SVG contains the observed passive `style`, `marker`, local `marker-end="url(#id)"`, and empty `image` constructs and satisfies every bound
- **THEN** safety verification accepts the original bytes without normalization, sanitization, or rewriting

#### Scenario: Script events and foreign content are rejected

- **WHEN** SVG contains a script, any mixed-case event attribute, `foreignObject`, prohibited embedding element, or animation/set element
- **THEN** verification exits non-zero with `CONSISTENCY SVG_SAFETY` and the original unsafe file is not published

#### Scenario: External relative and data resources are rejected

- **WHEN** any URL-bearing attribute contains an HTTP(S), protocol-relative, absolute, relative, file, data, blob, or other scheme URL or any non-empty `xml:base` is present
- **THEN** verification exits non-zero with `CONSISTENCY SVG_SAFETY` even if the URL would be unreachable in the network-disabled render container

#### Scenario: CSS resource obfuscation is rejected

- **WHEN** a style element or attribute contains `url(` or `expression(` with case/whitespace variation, `@import`, another at-rule, `-moz-binding`, `behavior:`, a CSS comment, or a backslash escape
- **THEN** verification exits non-zero with `CONSISTENCY SVG_SAFETY` rather than attempting to decode or sanitize the CSS

#### Scenario: XML entity and resource exhaustion inputs are rejected

- **WHEN** SVG contains an external/parameter/local-file/HTTP entity, nested expansion, undefined entity, doctype, foreign namespace, too many elements/attributes, excessive depth, oversized file, or excessive aggregate bytes
- **THEN** bounded parsing stops with `CONSISTENCY SVG_SAFETY`, filesystem/network tripwires observe no resolver call, and no final output is published

#### Scenario: Parser strictness is security-tested

- **WHEN** the corpus exercises malformed/truncated XML, duplicate attributes, namespace shadowing, extra roots, DTDs, processing instructions, XXE, and every SVG/CSS/URL policy rule
- **THEN** each rejection is terminal under the one pinned parser/configuration and no recovery or alternative parse occurs

#### Scenario: Vendored parser integrity fails before untrusted parsing

- **WHEN** any approved vendor file is absent, added, or differs by one byte
- **THEN** verification exits with `DEPENDENCY XML_PARSER` before parsing model-produced XML

### Requirement: Render and clean use one ownership lock and unique staging

After valid syntax, render and clean MUST establish the Git repository realpath, open it with
`O_DIRECTORY|O_NOFOLLOW`, and retain its `(device,inode)`. They MUST traverse/create `build` and
`architecture` only with descriptor-relative no-follow POSIX operations. Unsupported safe operations,
linked/non-directory ancestors, identity change, or realpath mismatch MUST return `IO PATH` before
lock acquisition; no path-based fallback is permitted.

The command MUST atomically call `openat` on retained `build/architecture` for
`.structurizr-lock` with `O_WRONLY|O_CREAT|O_EXCL|O_NOFOLLOW|O_CLOEXEC` mode 0600. `EEXIST` for any
object MUST return `IO LOCK_BUSY`; no preliminary existence check, wait, or PID reclamation is
allowed. Lock bytes MUST be one LF-terminated, closed-schema JSON object with ordered fields
`schemaVersion:1`, `kind:"structurizr-lock"`, `command:"render|clean"`, positive safe-integer `pid`,
and fresh `[0-9a-f]{32}` `nonce`. The descriptor MUST remain open and its bytes, nonce, link count,
identity, parent identity, and root identity MUST match before destructive phases and descriptor-
relative unlink.

A render holding that live lock MUST `mkdirat` exactly
`.structurizr-stage-<same-nonce>` mode 0700 and exclusively create mode-0600
`.structurizr-owner.json` outside `payload/`. Owner JSON MUST be one LF-terminated closed object with
ordered fields `schemaVersion:1`, `kind:"structurizr-stage"`, matching `nonce`, matching exact
`stageName`, and `lock:{device,inode}` as canonical unsigned base-10 strings matching the live lock
`fstat`. Directory suffix, both JSON nonces, stage name, and live lock identity MUST all agree. Only
the current process holding that live descriptor and nonce may remove the stage; PID, name, or valid
JSON alone grants no authority.

Only `payload/` may be mounted. Before publication, every payload/final entry MUST be reopened from
retained descriptors and be an expected directory or single-link regular file. Symlinks, hard links,
sockets, devices, FIFOs, unexpected entries, and changed ancestor identities MUST be rejected. Final
publication MUST re-traverse from the retained root and use same-parent `renameat`; the owner marker
MUST remain outside payload and final output.

#### Scenario: Concurrent command fails deterministically

- **WHEN** render or clean starts while another command owns the lock
- **THEN** the contender exits immediately with `IO LOCK_BUSY`, does not create staging, and leaves the owner's staging and any existing final output untouched

#### Scenario: Each run owns a unique staging directory

- **WHEN** separate non-overlapping renders run before and after lock release
- **THEN** each uses a different 32-hex nonce and each render may remove only staging whose owner file matches its own lock nonce

#### Scenario: Linked lock ancestor is refused before lock creation

- **WHEN** repository `build` or `build/architecture` is replaced by or traverses a symlink
- **THEN** descriptor-rooted preflight returns `IO PATH` without creating a lock or touching the link target

#### Scenario: Lock creation is one atomic no-follow operation

- **WHEN** the safe lock parent exists and two commands attempt acquisition
- **THEN** exactly one `openat` succeeds and the other's `EEXIST` is `IO LOCK_BUSY` without a check-then-create window

#### Scenario: Replaced lock or owner marker is not unlinked

- **WHEN** a root/parent/lock identity changes or the owner marker has an extra field, wrong suffix/nonce, wrong decimal lock identity, link, or replacement bytes
- **THEN** the process retains the replacement, reports the applicable `IO PATH`, `IO UNSAFE_OUTPUT`, or cleanup diagnostic, and never infers ownership from filename or PID

#### Scenario: Crash recovery is deliberate

- **WHEN** a crashed command leaves a lock file
- **THEN** later render and clean return `IO LOCK_BUSY` until an operator confirms no owner process exists and removes that exact stale lock

### Requirement: Generated output has a fail-closed regular-file lifecycle

The only final output root SHALL be `build/architecture/structurizr/`. Before mutating it, a
lock-owning command MUST re-traverse from the retained repository descriptor, compare every recorded
ancestor identity without following symlinks, and recursively inspect any existing root. A final-root symlink, non-directory, hard-linked file, special file, or
other unsafe entry MUST produce `IO UNSAFE_OUTPUT` and MUST be retained untouched; the command MUST
NOT claim that the path is absent.

A wholly safe prior generated root SHALL be removed before validation. Ordinary failure thereafter
MUST remove only current owned staging and leave the final root absent. Success MUST re-open and
verify the complete payload tree, atomically rename `payload/` to the absent final root on the same
filesystem, and then remove its outside owner marker and empty staging parent. `structurizr-clean` MUST take the same rooted lock and checks and remove a safe final root. Neither
clean nor a later render MAY automatically collect any abandoned staging directory, even when its
name and owner JSON are valid. A non-current stage MUST be retained and return `IO UNSAFE_OUTPUT`.
Clean MUST be idempotent only when no lock conflict, abandoned stage, or unsafe object exists.

The exact repository-root ignore entries SHALL be:

```gitignore
/build/architecture/structurizr/
/build/architecture/.structurizr-lock
/build/architecture/.structurizr-stage-*/
```

Generated files MUST NOT be committed.

#### Scenario: Stale files cannot survive a successful render

- **WHEN** a safe prior output contains an expected old bundle plus an extra ordinary file and a new render succeeds
- **THEN** the prior root is removed, publication contains only the new expected file set, and the stale file is absent

#### Scenario: Ordinary failure cannot expose stale success

- **WHEN** validation, rendering, consistency, or SVG safety fails after a safe earlier success
- **THEN** the command exits non-zero, removes only its owned staging, and leaves the final root absent

#### Scenario: Unsafe existing final symlink is retained

- **WHEN** the final root or an entry beneath it is a symlink or other unsafe object
- **THEN** the command exits with `IO UNSAFE_OUTPUT`, does not follow or unlink the unsafe object, and makes no false final-absence claim

#### Scenario: Clean is contained and idempotent

- **WHEN** `just structurizr-clean` runs twice with safe generated output and ordinary files outside the exact final/staging paths
- **THEN** both runs succeed, safe generated output is absent, and no outside file changes

#### Scenario: Clean never infers abandoned-stage authority

- **WHEN** any non-current stage exists, whether its owner is valid, malformed, mismatched, linked, hard-linked, or special
- **THEN** clean retains it, exits with `IO UNSAFE_OUTPUT`, and removes no stage or outside target

#### Scenario: Crash recovery is deliberate and exact

- **WHEN** a crash leaves a lock or stage
- **THEN** automation retains it until an operator stops commands/containers, confirms no live owner, records and removes only those exact repository entries without following links, and reruns clean

### Requirement: Manifest records exact provenance without claiming byte-identical SVG

The published root SHALL contain only accepted primary/legend SVG files, `workspace.json`, and
schema-version 1 `manifest.json`. The manifest MUST contain:

- source path `docs/architecture/structurizr/workspace.dsl` and its LF-normalized SHA-256;
- full immutable image reference, selected native platform, application `2026.06.28`, and libraries
  `6.2.2`;
- verifier Bun version `1.3.14`;
- canonical views exactly `component`, `container`, `context` in that order;
- all view keys in lexicographic order; and
- every non-manifest published file's relative path, positive byte size, and SHA-256, sorted by path.

Manifest object keys SHALL use the design's schema order, JSON SHALL use LF and one terminal newline,
and timestamp, absolute path, PID, nonce, run ID, and host metadata MUST be absent. Readers MUST reject
unsupported schema versions and file-set, size, or hash mismatch.

Repeated success SHALL replace rather than append to the final root and SHALL re-establish the same
lineage and safety properties. Neither local nor CI rendering SHALL claim byte-identical SVGs or run a
byte-equality gate, because primary SVG contains renderer-generated wall-clock metadata. The renderer
MUST NOT rewrite that metadata or any SVG semantics.

#### Scenario: Manifest proves the uploaded bytes

- **WHEN** a render succeeds
- **THEN** every published non-manifest file appears exactly once with its actual size/hash and the manifest records exact source, renderer, platform, and verifier identities

#### Scenario: Volatile process data is absent from manifest

- **WHEN** manifest JSON is inspected
- **THEN** it contains no timestamp, absolute path, PID, nonce, run ID, host name, or unrecognized schema field

#### Scenario: A later valid render may have different SVG hashes

- **WHEN** unchanged source is rendered twice and the pinned renderer changes its visible wall-clock metadata
- **THEN** both runs may succeed with different primary SVG and manifest hashes if each independently passes lineage, safety, and provenance checks

#### Scenario: Manifest tampering is rejected

- **WHEN** a reader finds an unsupported schema version, missing/extra file, wrong byte count, or wrong SHA-256
- **THEN** it rejects the bundle rather than reporting partial provenance

### Requirement: Bun runtime and provenance are exact while SVG determinism is narrowed

CI SHALL use `oven-sh/setup-bun@735343b667d3e6f658f44d0eca948eb6282f2b76` with
`bun-version: 1.3.14`. It MUST verify release URL
`https://github.com/oven-sh/bun/releases/tag/bun-v1.3.14`, expected download URL for
`bun-linux-x64.zip`, archive SHA-256
`951ee2aee855f08595aeec6225226a298d3fea83a3dcd6465c09cbccdf7e848f`, `bun --version` output
`1.3.14`, and installed executable SHA-256
`9fd36f87e4b90b07632b987a2e4ec81ca15a62c81bf983190cea6d715be2ad74` before verification.

The pin SHALL also record release archive SHA-256 values: Darwin arm64
`d8b96221828ad6f97ac7ac0ab7e95872341af763001e8803e8267652c2652620`, Darwin x64
`4183df3374623e5bab315c547cfa0974533cd457d86b73b639f7a87974cd6633`, Linux arm64
`a27ffb63a8310375836e0d6f668ae17fa8d8d18b88c37c821c65331973a19a3b`, and Linux x64
`951ee2aee855f08595aeec6225226a298d3fea83a3dcd6465c09cbccdf7e848f`. Local rendering SHALL require
`bun --version` to be exactly `1.3.14`; archive checksum verification remains the local installer's or
operator's responsibility.

#### Scenario: Canonical CI verifies Bun bytes

- **WHEN** setup-bun completes on canonical linux/amd64 CI
- **THEN** URL, version, and executable SHA-256 checks match the pinned release before the verifier runs

#### Scenario: Wrong Bun version fails locally and in CI

- **WHEN** `bun --version` is absent or differs from `1.3.14`
- **THEN** rendering exits non-zero with `DEPENDENCY BUN_VERSION` before model verification or publication

#### Scenario: Bun pin does not imply stable renderer bytes

- **WHEN** exact Bun verifies two valid renderer outputs with differing wall-clock SVG metadata
- **THEN** Bun applies the same safety/lineage rules but does not normalize or reject the outputs solely for byte inequality

### Requirement: CI scrubs verifier/render boundaries and publishes only verified artifacts

An opted-in workflow SHALL run on pull requests, pushes to `main`, and manual dispatch. Its path
filters MUST cover the exact model, `tools/structurizr/**`, Structurizr recipes and pin, installer and
Structurizr templates, workflow, and Bun pin. It MUST use native `ubuntu-24.04` linux/amd64 and
`permissions: contents: read`.

Checkout MUST use `actions/checkout@08c6903cd8c0fde910a37f88322edcfb5dd907a8` with
`persist-credentials: false`. Upload MUST use
`actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02` only after successful render.
GitHub-managed credentials SHALL be used by those pinned checkout/upload actions only; workflow text
MUST NOT reference `github.token`, `secrets`, OIDC, packages, `pull_request_target`, or
repository/environment secrets. This requirement MUST NOT be represented as proof that GitHub's
service credentials are physically unavailable elsewhere in the runner job.

The enforceable boundary is the Bun verifier/renderer subprocess. It MUST start via `env -i` with
exactly named non-secret `PATH`, temporary empty `HOME`, `TMPDIR`, `CI=true`,
`DOCKER_DEFAULT_PLATFORM=linux/amd64`, and `BUN_CONFIG_NO_TELEMETRY=1`, inspect its environment before
model read, and fail on a seventh name. Every Docker client operation MUST descend from that scrubbed
process. Containers may receive only pinned image-config names `PATH`, `LANG`, `LC_ALL`, `JAVA_HOME`,
`PLAYWRIGHT_BROWSERS_PATH`, `PORT`, explicit `HOME`/`TMPDIR`, and Docker-generated `HOSTNAME`. No
`GITHUB_*`, `ACTIONS_*`, token, cookie, credential path, host home, or Docker config SHALL reach or be
mounted into those subprocess/container boundaries.

The host MAY access GitHub and the public registry for actions, Bun, and the pinned image. Render
containers MUST have no network. Only successful verified output SHALL upload as
`structurizr-c4-${{ github.sha }}` with `if-no-files-found: error` and requested retention 14 days. CI
MUST NOT commit or push output and SHALL perform one verified render rather than a byte-repeat gate.

#### Scenario: Credential guarantee starts at the scrubbed subprocess

- **WHEN** a pull request workflow checks out source and starts the exact `env -i` render command
- **THEN** checkout has only contents-read permission with no persisted credential and capture shims prove the verifier/renderer and Docker receive no GitHub token or repository/environment secret

#### Scenario: Workflow tests do not overclaim GitHub internals

- **WHEN** static policy tests inspect checkout, setup, upload, and run steps
- **THEN** they prove pinned-action use, forbidden references, and captured subprocess/container inputs but make no claim that workflow YAML proves service-token absence elsewhere in the job

#### Scenario: Renderer container receives a closed environment

- **WHEN** any job, repository, or action environment contains an extra or secret-bearing variable
- **THEN** the render wrapper starts from the named empty-environment allowlist, forwards none of it, and the container has only the specified image/runtime names

#### Scenario: Invalid model blocks artifact service access

- **WHEN** model, render, lineage, output safety, or manifest verification fails
- **THEN** the job fails before upload, no artifact action succeeds, and no repository content is written

#### Scenario: Successful CI retains one verified bundle

- **WHEN** native-platform, pin, Bun, validation, render, consistency, safety, and publication checks all pass
- **THEN** the pinned upload action uses GitHub's managed runtime service and requests 14-day retention for `structurizr-c4-${{ github.sha }}`, while the prior scrubbed boundary remains credential-free

### Requirement: Error selection follows one frozen precedence

Every failure SHALL emit a line beginning `<CLASS> <CODE>:` and exit non-zero. The primary MUST be
the first observed check in this exact sequential order, with alternatives on a line evaluated left
to right:

1. `CONFIG INVOCATION`;
2. repository/lock-parent `IO PATH`;
3. `IO LOCK_BUSY`;
4. final/non-current-stage `IO UNSAFE_OUTPUT`;
5. `CONFIG PIN`, `CONFIG MODEL_PATH`, `CONFIG SOURCE_DIRECTIVE`,
   `CONFIG WORKSPACE_EXTENDS`;
6. `DEPENDENCY BUN_TIMEOUT`, `DEPENDENCY BUN_VERSION`, `DEPENDENCY XML_PARSER`;
7. `DEPENDENCY DOCKER_TIMEOUT`, `DEPENDENCY DOCKER`, `DEPENDENCY PLATFORM`;
8. `DEPENDENCY OCI_INDEX_TIMEOUT`, `DEPENDENCY IMAGE`;
9. `DEPENDENCY IMAGE_PULL_TIMEOUT`, `DEPENDENCY IMAGE`;
10. `DEPENDENCY IMAGE_INSPECT_TIMEOUT`, `DEPENDENCY IMAGE`;
11. `DEPENDENCY PLATFORM_PROBE_TIMEOUT`, `DEPENDENCY PLATFORM`;
12. `DEPENDENCY VERSION_TIMEOUT`, `DEPENDENCY VERSION_OUTPUT`, `DEPENDENCY IMAGE`;
13. `VALIDATION DSL_TIMEOUT`, `VALIDATION DSL`;
14. `RENDER JSON_TIMEOUT`, `RENDER JSON`, `RENDER JSON_OUTPUT`;
15. `RENDER SVG_TIMEOUT`, `RENDER SVG`, `RENDER SVG_OUTPUT`;
16. `CONSISTENCY JSON`, `CONSISTENCY LINEAGE`, `CONSISTENCY VIEW_KEY`,
    `CONSISTENCY SVG_SAFETY`;
17. `IO PUBLISH`;
18. `IO FORCE_REMOVE_TIMEOUT`, `IO FORCE_REMOVE`, `IO CLEANUP` if no prior primary exists.

Malformed Docker info, index/config, platform-probe, and version output MUST map respectively to
`DEPENDENCY DOCKER`, `DEPENDENCY IMAGE`, `DEPENDENCY PLATFORM`, and
`DEPENDENCY VERSION_OUTPUT`. Successful commands with unexpected JSON/SVG filesystem inventories
MUST map respectively to `RENDER JSON_OUTPUT` and `RENDER SVG_OUTPUT`; a later content-policy failure
uses its consistency code and a post-verification mutation uses `IO PUBLISH`.

Checks MUST stop at the first failure. A force-remove or owned cleanup failure after any prior error
MUST be appended as the exact secondary IO code and MUST NOT replace the primary or permit
publication. The TERM grace expiry remains part of the selected operation timeout. There SHALL be no
`PARTIAL` success.

#### Scenario: Malformed pin precedes unavailable Docker

- **WHEN** the configured pin is malformed and Docker is unavailable with no lock/path defect
- **THEN** the sole primary prefix is `CONFIG PIN:` because static configuration precedes dependency probing

#### Scenario: Unsafe output precedes render failure

- **WHEN** the final root is a symlink and the model would also fail rendering
- **THEN** the sole primary prefix is `IO UNSAFE_OUTPUT:` and the renderer is not invoked

#### Scenario: Invalid model path precedes unsupported platform

- **WHEN** the model argument is outside the exact path and Docker reports an unsupported platform
- **THEN** the sole primary prefix is `CONFIG MODEL_PATH:` and no platform/image operation runs

#### Scenario: Unsafe lock parent precedes lock contention

- **WHEN** invocation is valid but the lock parent resolves through a symlink and a lock-looking object exists at the linked target
- **THEN** the command returns `IO PATH:` without following the link or attempting lock acquisition

#### Scenario: Lock contention precedes post-lock checks

- **WHEN** invocation and rooted lock parent are valid but the lock exists alongside malformed configuration and unsafe output
- **THEN** atomic open returns `IO LOCK_BUSY:` without inspecting or mutating later-stage state

#### Scenario: Cleanup failure remains secondary

- **WHEN** SVG safety is the first failure and owned staging cleanup subsequently fails
- **THEN** `CONSISTENCY SVG_SAFETY:` remains primary, exact `IO CLEANUP:` is secondary, and no output is published

#### Scenario: Every bounded dependency timeout is unambiguous

- **WHEN** Bun version, Docker info, OCI index, pull, image inspect, platform probe, or version exceeds its bound
- **THEN** the primary is respectively `DEPENDENCY BUN_TIMEOUT`, `DEPENDENCY DOCKER_TIMEOUT`, `DEPENDENCY OCI_INDEX_TIMEOUT`, `DEPENDENCY IMAGE_PULL_TIMEOUT`, `DEPENDENCY IMAGE_INSPECT_TIMEOUT`, `DEPENDENCY PLATFORM_PROBE_TIMEOUT`, or `DEPENDENCY VERSION_TIMEOUT`

#### Scenario: Export timeouts are phase-specific

- **WHEN** validate, JSON export, or SVG export exceeds its bound
- **THEN** the primary is respectively `VALIDATION DSL_TIMEOUT`, `RENDER JSON_TIMEOUT`, or `RENDER SVG_TIMEOUT`

### Requirement: Architecture and entry documentation are completion gates

After implementation, the architecture-writer MUST refresh arc42 sections 1–8 and 10–12 from shipped
evidence and SHALL update section 9 only to index an ADR created by an authorized ADR owner.
`just architecture-html` and `just arch-lint` MUST pass after that refresh.

The tech-writer MUST add or update a Structurizr how-to, repository `README.md`, and root `index.html`
to describe opt-in installation, exact model boundary, native Docker/Bun prerequisites, render/clean,
artifact safety/provenance, limitations, and Mermaid-first behavior. `just docs-lint` MUST pass without
skipping a required tool in the completion environment. A code-complete renderer without these
artifacts SHALL be incomplete.

#### Scenario: Architecture reflects the shipped optional boundary

- **WHEN** renderer, verifier, installer, and workflow implementation is complete
- **THEN** the named arc42 sections describe the evidenced model/image/CI/runtime boundaries and both architecture gates pass

#### Scenario: Both user entry documents expose the option

- **WHEN** the change is presented as complete
- **THEN** `README.md`, root `index.html`, and the Structurizr how-to consistently document how to enable, operate, and safely interpret the option

#### Scenario: Missing entry or architecture artifact blocks completion

- **WHEN** renderer tests pass but any required arc42 refresh, architecture gate, `README.md`, `index.html`, how-to, or full docs-lint gate is absent or failing
- **THEN** the change remains incomplete and MUST NOT be archived as shipped

### Requirement: Mermaid remains the default and independently required

The optional Structurizr path SHALL NOT modify existing Mermaid authoring, HTML rendering,
syntax-validation, or required-section presence contracts. Structurizr output MUST NOT satisfy a
missing Mermaid fence. Structurizr failure MUST affect only an explicitly invoked render or an
enabled Structurizr workflow.

#### Scenario: Structurizr is not enabled

- **WHEN** a repository uses the ordinary installer and architecture workflow
- **THEN** Mermaid remains the only diagram dependency and no Structurizr command or CI job runs

#### Scenario: Structurizr is enabled alongside Mermaid

- **WHEN** an opted-in repository has valid Structurizr SVGs but a required Mermaid block is missing
- **THEN** `arch-lint` still fails the existing Mermaid presence contract

#### Scenario: Optional renderer failure does not create a default dependency

- **WHEN** Structurizr is not enabled and Docker, Bun, or the pinned image is unavailable
- **THEN** existing Mermaid rendering and gates continue without a Structurizr warning, partial state, or failure
