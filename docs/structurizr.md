# Structurizr diagrams (optional)

<!-- vale Vale.Spelling = NO -->

Mermaid is this kit's default architecture-diagram path and needs no setup. Structurizr is an
optional extra for teams that want C4 context, container, and component views derived from **one**
model instead of a diagram per file.

It never replaces Mermaid. `just arch-lint` still requires a Mermaid diagram in the context and
scope, building block view, and deployment view sections, and a generated SVG can never satisfy
that requirement.

## Prerequisites

- A **native** Docker engine on `linux/amd64` or `linux/arm64`. Emulation is refused: no QEMU, no
  binfmt, no Docker Desktop Rosetta-for-Linux. Requesting a target your engine does not natively
  provide fails with `DEPENDENCY PLATFORM`.
- **Bun 1.3.14** exactly. Any other version fails with `DEPENDENCY BUN_VERSION`.

The renderer is pinned to
`structurizr/structurizr:2026.06.28-playwright@sha256:9bdc861e8c94f77f5f73bde70bdee410a65b82cbe8d341d3919a9ebd0cb17f8c`.
The retired `structurizr/cli` and `structurizr/lite` distributions are rejected, as are `latest` and
any tag-only reference.

## Install, render, remove

```bash
# Enable. This is the only activation path.
./install.sh --here /path/to/repo --with-structurizr

# Render to build/architecture/structurizr/
just structurizr-render

# Remove generated output owned by this run
just structurizr-clean

# Disable. Run structurizr-clean first; your model is kept.
./install.sh --here /path/to/repo --remove-structurizr
```

An ordinary `./install.sh --here <repo>` installs **none** of this and performs no Docker or Bun
probe. An ordinary rerun into an already opted-in repository neither refreshes nor removes the
option: activation and removal are always explicit.

## The model is yours

`docs/architecture/structurizr/workspace.dsl` is team-owned source. The installer seeds it from a
template only when it is absent and **never** replaces it; an opt-in rerun preserves your edits
byte-for-byte. Removal keeps the file and tells you it was kept.

Everything else in the inventory is kit-owned and refreshed on every opt-in rerun, so do not edit
`justfile.structurizr`, the `tools/structurizr-*.ts` engines, the pin file, or the vendored XML
parser directory in place.

Version 1 accepts exactly one file of at most 5 MiB. No include closure exists, because source
expansion is prohibited:

- The only permitted directives are `!identifiers hierarchical`, `!impliedRelationships true`, and
  `!impliedRelationships false`. Anything else, including `!include`, `!docs`, `!adrs`, `!script`,
  and `!plugin`, fails with `CONFIG SOURCE_DIRECTIVE`.
- `workspace extends` fails with `CONFIG WORKSPACE_EXTENDS`. The word "extends" inside a quoted
  string or a comment is fine.
- `just structurizr-render` takes no model argument, or exactly
  `docs/architecture/structurizr/workspace.dsl`. Any other spelling fails with
  `CONFIG MODEL_PATH`.

Keep hierarchical identifiers, the exact canonical view keys `context`, `container`, and
`component`, and at least one relationship that reaches a component directly, so the three views
share a verifiable lineage.

## Reading the output

Output lands in `build/architecture/structurizr/`, which is git-ignored by three exact rules and
must never be committed:

| File | What it is |
| --- | --- |
| `workspace.json` | The exported model the views were checked against. |
| `<key>.svg` | One primary view per exported view key. |
| `<key>-key.svg` | The renderer's legend for that view, when it emits one. |
| `manifest.json` | Provenance: source path and hash, image reference, native platform, application and library versions, Bun version, view keys, and every published file's byte size and SHA-256. |

**Generated SVG bytes are not a stable API.** The renderer writes wall-clock metadata, so two runs
of an unchanged model can produce different primary SVG bytes and different hashes. That is
expected and accepted; the gate never compares two renders. What is stable is the manifest
serialization and the recorded provenance. Use the manifest to answer "which model, which image,
which platform produced these bytes", not "have the bytes changed".

## Safety policy

Every SVG is parsed with a vendored, hash-pinned, namespace-aware parser with DTDs and entity
expansion disabled, then accepted or rejected as it stands. Nothing is ever sanitized or rewritten.
A file is rejected for a script or other active element, an event handler, foreign content, a
non-empty `xml:base`, any external, protocol-relative, absolute, relative, `file:`, `data:`, or
`blob:` reference, CSS comments, escapes, or at-rules, a doctype or entity, an unexpected
processing instruction, an ASCII control character, or for exceeding the element, depth, attribute,
or size limits.

If a future renderer version emits a new but harmless construct, the gate will fail until the
policy is widened deliberately. That is the intended direction of failure.

## Error precedence

Exactly one primary `<CLASS> <CODE>:` line is emitted, chosen by this fixed order, so the reported
failure never depends on discovery order:

1. `CONFIG INVOCATION`
2. `IO LOCK_BUSY`
3. `IO UNSAFE_OUTPUT`, `IO PATH`
4. `CONFIG PIN`, `CONFIG MODEL_PATH`, `CONFIG SOURCE_DIRECTIVE`, `CONFIG WORKSPACE_EXTENDS`
5. `DEPENDENCY DOCKER`, `DEPENDENCY PLATFORM`, `DEPENDENCY IMAGE`, `DEPENDENCY BUN_VERSION`
6. `VALIDATION DSL`, `VALIDATION TIMEOUT`
7. `RENDER JSON`, `RENDER SVG`, `RENDER TIMEOUT`
8. `CONSISTENCY JSON`, `CONSISTENCY LINEAGE`, `CONSISTENCY VIEW_KEY`, `CONSISTENCY SVG_SAFETY`
9. `IO PUBLISH`, `IO CLEANUP`

No fallback exists. A failed render publishes nothing and leaves the final output absent rather
than stale.

## When a run is interrupted

Locks and staging directories are never reclaimed automatically, and a process ID never authorizes
deletion. If a run is killed, `IO LOCK_BUSY` or `IO UNSAFE_OUTPUT` will persist until you recover
it by hand: stop all Structurizr commands, confirm no owning process or container is alive, note
the exact `build/architecture/.structurizr-lock` and `.structurizr-stage-*` names, remove those
exact entries without following links, then rerun `just structurizr-clean`.

## Credential boundary

The render subprocess and every container receive only named non-secret variables. Containers get
the pinned image-config names plus `HOME=/tmp` and `TMPDIR=/tmp`; no unvalued `--env` is ever used,
and the Docker socket, repository root, model parent, home directory, and credential directories
are never mounted.

In CI the workflow declares only `contents: read`, pins checkout, setup-bun, and upload-artifact to
commits, gives checkout `persist-credentials: false`, and starts the renderer with `env -i` and
exactly `PATH`, a fresh empty `HOME`, `TMPDIR`, `CI=true`,
`DOCKER_DEFAULT_PLATFORM=linux/amd64`, and `BUN_CONFIG_NO_TELEMETRY=1`. Verified output uploads as
`structurizr-c4-<sha>` for **14 days**, only after a successful render, and is never committed.

The enforceable claim is that no credential reaches the renderer subprocess or container. It is not
a claim that GitHub service tokens are absent elsewhere in the runner job.

## Updating the pin

Pin changes are reviewed, never automatic. A pin update must:

1. Rerun the registry and API checks and record the index and both platform manifest digests.
2. Inspect the image config and entrypoint.
3. Execute the one-file fixture **natively on both** `linux/amd64` and `linux/arm64`. A published
   manifest is not evidence that both platform commands work.
4. Rerun the SVG safety corpus on both targets.
5. Reproduce the vendored parser hashes if the parser moved.
6. Update `tools/structurizr/pin-evidence.md` and open a reviewed pull request.
