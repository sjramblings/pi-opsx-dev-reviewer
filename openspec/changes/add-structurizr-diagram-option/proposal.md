# Add an optional Structurizr diagram path

<!-- vale Vale.Spelling = NO -->

## Why

Mermaid remains the zero-setup architecture-diagram default, but a diagram-per-file approach becomes
hard to keep consistent when teams need many C4 views. Teams need an explicit opt-in that derives
context, container, and component SVGs from one model without exposing repository secrets or unsafe
active SVG content.

## What Changes

- Add an opt-in Structurizr DSL model and non-clobbering model template at
  `docs/architecture/structurizr/workspace.dsl`; version 1 is intentionally single-file and prohibits
  includes, extension, scripts, and plugins.
- Package every Structurizr recipe and runtime in a separate `justfile.structurizr` import that the
  project installer adds only for `--with-structurizr`; ordinary installs contain no Structurizr
  inventory, and explicit removal preserves the team-owned model.
- Render and verify only that repository-contained regular file with the supported consolidated
  Structurizr image, pinned by release tag, upstream commit, multi-platform OCI digest, exact command
  interface, and governed native `amd64` plus `arm64` attestations; do not use retired Structurizr CLI
  or Lite distributions.
- Produce provenance-complete, ignored SVG/JSON/manifest output under
  `build/architecture/structurizr/`, using a descriptor-rooted no-follow lock, unique nonce-bound
  staging that is never garbage-collected without a live owner, strict regular-file boundaries,
  fail-closed consistency checks, and a no-rewrite safe-SVG acceptance policy.
- Verify SVG with vendored `saxes` 6.0.0 plus `xmlchars` 2.2.0 whose archives and installed files are
  hash-pinned, using a closed namespace-aware configuration that rejects DTD/entity expansion.
- Support native Docker Engine targets `linux/amd64` and `linux/arm64` from Linux and macOS Docker
  Desktop, prohibit cross-target requests, verify the selected architecture inside the container,
  and make native `linux/amd64` the canonical render CI target. Pin Bun 1.3.14 while explicitly not
  claiming byte-identical SVGs, which contain renderer-generated wall-clock metadata.
- Add a least-privilege CI workflow. GitHub-managed credentials are used by pinned checkout/upload
  actions, while the enforceable security claim is that the scrubbed render/verifier subprocess and
  every render container receive only named non-secret variables. Publish only verified output for
  14 days.
- Keep existing Mermaid authoring, rendering, and lint requirements unchanged when the option is
  absent or enabled. Require the shipped option to be reflected in the arc42 architecture tree,
  `README.md`, root `index.html`, and a Structurizr how-to before the change is complete.

## Capabilities

### New Capabilities

- `structurizr-diagram-rendering`: Opt-in model ownership, immutable tooling, native-platform policy,
  cross-view consistency and SVG safety verification, concurrent generated-output lifecycle,
  provenance manifest, CI trust boundaries, and documentation completion semantics.

### Modified Capabilities

<!-- none -->

## Impact

Adds an optional Docker-backed build dependency, exact Bun 1.3.14 and vendored XML-verifier pins, a
separately imported recipe/runtime inventory, installer and workflow templates, governed two-target
pin-attestation jobs, dogfood model/workflow files, and user and architecture documentation. The
default install and current Mermaid architecture path gain no renderer recipe, file, dependency, or
behavioral change. Generated SVG bytes are intentionally not a stable API; the stable contract is
their validated model lineage, safety, and manifest-recorded provenance.
