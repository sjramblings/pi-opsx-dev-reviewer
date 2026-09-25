# Tasks—add-structurizr-diagram-option

> Implement every task in dependency order. The option is not shippable until the real native-platform
> dogfood, arc42 refresh, entry-document updates, and all named gates pass. Version 1 has no deferred
> includes, alternate model paths, emulation, or byte-identical SVG backlog.

## 1. Immutable toolchain and executable fixture

- [x] 1.1 Add the one-file one-person-to-component fixture, closed-schema pin, and checked provenance
      evidence. Freeze every Decision 2 and Decision 6 literal: the full consolidated image reference,
      index and two manifest digests, upstream tag/commit and URLs, entrypoint and image-environment
      allowlist, four exact command arrays, all timeout values, Bun 1.3.14 action/release/executable and
      four archive hashes. Reject missing, mistyped, additional, mutable, CLI, or Lite fields before
      Docker is queried.
      files: `tools/fixtures/structurizr/workspace.dsl`, `tools/structurizr/pin.json`,
      `tools/structurizr/pin-evidence.md`, `tools/structurizr-pin.test.ts`
      probe: `bun test tools/structurizr-pin.test.ts` validates the closed schema and every pinned value,
      proves the fixture has no include/extension/script/plugin and relates one person directly to one
      component, checks all three evidence URLs, and freezes `CONFIG PIN` for malformed, extra-field,
      `latest`, tag-only, `structurizr/cli`, and `structurizr/lite` mutations.
      out-of-scope: rendering repository output, automatic pin updates, retired distributions, or a
      third OCI target.
      spec: `structurizr-diagram-rendering`

- [ ] 1.2 Implement the bounded live pin/interface probe and record raw native evidence for both
      `linux/amd64` and `linux/arm64`. Inspect the OCI index and selected manifest, repo digest,
      entrypoint, closed image-config environment, and exact `version`, `validate`, JSON export, and
      light/non-animated SVG export vectors. Derive the target from Docker server OS/architecture,
      require host/engine native agreement, pass exact `--platform` on every image operation, and reject
      Windows, conflicting `DOCKER_DEFAULT_PLATFORM`, QEMU, Rosetta OCI translation, and all emulation.
      Apply the 60-second inspect, 900-second pull, 60-second version/validate, 120-second JSON, and
      300-second SVG wall-clock limits, including TERM, 10-second grace, KILL, and separately bounded
      30-second exact-name removal. Evidence is incomplete unless both native targets execute the
      fixture; a published manifest alone does not pass.
      files: `tools/structurizr-probe.ts`, `tools/structurizr-probe.test.ts`,
      `tools/structurizr/pin-evidence.md`
      probe: `bun test tools/structurizr-probe.test.ts && bun tools/structurizr-probe.ts --live --fixture tools/fixtures/structurizr/workspace.dsl --require-native "$EXPECTED_NATIVE_PLATFORM"` passes once on a native `linux/amd64` engine and once on a native `linux/arm64` engine, records both raw outputs, and the tests prove malformed Docker/registry/version/export shapes, unavailable Docker/image, target conflict, emulation, and each simulated hang fail non-zero with the specified primary code and timeout cleanup sequence.
      out-of-scope: emulated platform evidence, cross-platform byte comparison, Windows/WSL support,
      or treating registry metadata as command-execution evidence.
      spec: `structurizr-diagram-rendering`

## 2. Exact source boundary

- [x] 2.1 Add the non-clobber source template as one self-contained model with hierarchical identifiers,
      a person directly related to a component, and exact canonical keys `context`, `container`, and
      `component`. It contains no includes, workspace extension, docs/ADRs, script, plugin, remote
      theme, or other source expansion.
      files: `templates/structurizr/workspace.dsl`, `tools/structurizr-template.test.ts`
      probe: `bun test tools/structurizr-template.test.ts && bun tools/structurizr-probe.ts --live --fixture templates/structurizr/workspace.dsl --require-native "$EXPECTED_NATIVE_PLATFORM"` asserts the one regular file has the required direct relationship and canonical views, scans out prohibited expansion, and passes all four pinned commands on a supported native engine.
      out-of-scope: installer rerun behavior, repository-specific names, multiple files, cloud/server
      operation, plugins, or editable CI layout.
      spec: `structurizr-diagram-rendering`

- [x] 2.2 Implement the source preflight for only
      `docs/architecture/structurizr/workspace.dsl`. Accept an omitted argument or that exact POSIX
      string; discover the Git root; `lstat` every ancestor; open without following links; and `fstat`
      one regular file at most 5 MiB whose real path is the exact real-root join. Enforce strict UTF-8,
      hash LF-normalized bytes without rewriting mounted bytes, allow only the three exact leading `!`
      directives, and lexically reject `workspace extends` outside strings/comments. Mount only the
      opened model file, never its parent.
      files: `tools/structurizr-source.ts`, `tools/structurizr-source.test.ts`
      probe: `bun test tools/structurizr-source.test.ts` proves the exact regular model succeeds and
      absolute/alternate/traversing spellings, every ancestor/final symlink, directory/FIFO/socket,
      oversized/invalid-UTF-8 input, include/docs/ADR/script/plugin/unknown directives, and true
      workspace extension fail before Docker with `CONFIG MODEL_PATH`, `CONFIG SOURCE_DIRECTIVE`, or
      `CONFIG WORKSPACE_EXTENDS`; quoted/commented “extends” remains accepted and original CRLF bytes
      remain unchanged while the source hash uses LF.
      out-of-scope: include closure discovery, alternate model arguments, model rewriting, or broad
      repository-directory mounts.
      spec: `structurizr-diagram-rendering`

## 3. Bounded consistency, SVG safety, and provenance

- [x] 3.1 Implement the strict-UTF-8, 25-MiB workspace JSON verifier against the pinned 6.2.2 shape.
      Require object/array boundary types and non-empty string IDs/keys, flatten source and implied
      relationships, resolve every view reference, and prove one shared element plus one direct-or-linked
      source relationship across the canonical system-context/container/component views. Validate every
      exported key against the exact grammar, case-folded uniqueness, 64-character bound, and `-key`
      exclusion; map each key only to one single-link regular `<key>.svg` and at most its matching
      `<key>-key.svg`.
      files: `tools/structurizr-verify.ts`, `tools/structurizr-verify.test.ts`,
      `tools/fixtures/structurizr/expected/`
      probe: `bun test tools/structurizr-verify.test.ts --test-name-pattern 'JSON|lineage|view key|filename'` proves the fixture shares the person and relationship lineage through all three canonical views, reconciles an additional view, and rejects invalid UTF-8/JSON/shape/size, unknown IDs, unrelated views, duplicate/case-colliding/unsafe/`-key` keys, missing/unmatched/duplicate files, symlinks, hard links, and special files with the frozen `CONSISTENCY JSON`, `CONSISTENCY LINEAGE`, or `CONSISTENCY VIEW_KEY` code.
      out-of-scope: labels as identity, architecture truth against code, multiple workspace exports,
      visual comparison, or PNG.
      spec: `structurizr-diagram-rendering`

- [x] 3.2 Add strict passive-SVG verification without sanitizing or rewriting. Parse each non-empty
      strict-UTF-8 single-link regular SVG at most 25 MiB with a namespace-aware non-recovering XML
      parser, DTD/external entities disabled, and enforce the exact root namespace, processing-instruction,
      100,000-element, depth-256, 256-attributes-per-element, and 250-MiB aggregate limits. Implement
      every prohibited element, event/`xml:base`, URL-bearing attribute, CSS token/escape/comment,
      presentation-IRI, foreign-namespace, and ASCII-control rule from the spec while permitting only
      the observed passive style/marker/local-fragment/empty-image forms.
      files: `tools/structurizr-verify.ts`, `tools/structurizr-verify.test.ts`,
      `tools/fixtures/structurizr/svg-safety/`
      probe: `bun test tools/structurizr-verify.test.ts --test-name-pattern 'SVG safety'` accepts pinned
      passive examples byte-for-byte and independently rejects mixed-case active elements/events,
      foreign content, every external/protocol-relative/absolute/relative/file/data/blob URL location,
      non-empty `xml:base`, CSS case/whitespace obfuscation, comments/backslashes/at-rules, invalid IRIs,
      doctype/entities/extra processing instructions, foreign namespaces, controls, oversized aggregate,
      excessive elements/depth/attributes, and linked/special files with `CONSISTENCY SVG_SAFETY` naming
      the file and rule; a test resolver proves no external entity/resource access occurs.
      out-of-scope: sanitizer output, SVG semantic rewriting, browser execution, pixel comparison, or
      weakening rejection to “parseable XML”.
      spec: `structurizr-diagram-rendering`

- [x] 3.3 Emit and read the exact schema-version 1 provenance manifest. Serialize keys in schema order,
      canonical views as `component`, `container`, `context`, views and non-manifest files by lexical
      path, positive byte sizes and actual SHA-256 values, LF, and one terminal newline. Record exact
      normalized source, immutable image/native platform/application/libraries, and Bun `1.3.14`; reject
      unsupported schemas and file-set/size/hash drift. Exclude timestamps, absolute paths, hostnames,
      PIDs, nonces, and run IDs. Determinism applies to serialization and recorded provenance only:
      explicitly accept independently safe primary SVGs whose renderer wall-clock text and hashes differ,
      and never add a two-render byte-equality assertion.
      files: `tools/structurizr-verify.ts`, `tools/structurizr-verify.test.ts`
      probe: `bun test tools/structurizr-verify.test.ts --test-name-pattern 'manifest|renderer metadata'` compares exact expected manifest text for controlled bytes, verifies every published non-manifest file once, rejects schema/file/size/hash tampering and volatile fields, and proves two safe fixtures differing only in renderer wall-clock SVG text both pass with different recorded hashes and no byte normalization.
      out-of-scope: byte-identical SVG guarantees, timestamps, signatures, historical manifests, or
      post-render metadata removal.
      spec: `structurizr-diagram-rendering`

## 4. Owned lifecycle and bounded renderer

- [x] 4.1 Implement the shared exclusive lock and nonce-owned filesystem lifecycle. Render and clean use
      only `build/architecture/.structurizr-lock`; lock JSON and owner JSON bind an open-file identity to
      one cryptographically random 32-lowercase-hex nonce. Create one matching sibling staging directory
      and outside-payload owner marker, mount only `payload/`, and allow removal only with matching
      inode/nonce ownership. Recursively require expected directories or single-link regular files.
      Lock contention is immediate and non-mutating. A safe old final root is removed before work;
      ordinary failure leaves final absent. An unsafe final/stage symlink, hard link, special file,
      invalid owner, or replaced marker is retained untouched with `IO UNSAFE_OUTPUT`. Safe publication
      is same-filesystem atomic rename; clean has the same lock, safely collects only owned abandoned
      stages, and is idempotent.
      files: `tools/structurizr-fs.ts`, `tools/structurizr-fs.test.ts`
      probe: `bun test tools/structurizr-fs.test.ts` launches competing render/clean processes to prove
      `IO LOCK_BUSY` creates no contender stage and preserves owner/final state; proves different runs
      receive different nonces; replaced lock/owner objects are not unlinked; crash locks require manual
      removal; unsafe roots/stages are retained; safe stale output is removed; ordinary failure leaves
      final absent; atomic publish succeeds; and two cleans preserve an outside sentinel.
      out-of-scope: waiting locks, PID-based stale-lock reclamation, unlinking unsafe objects, cross-device
      publish, or cleaning arbitrary build paths.
      spec: `structurizr-diagram-rendering`

- [x] 4.2 Implement the Docker boundary in fresh exact-name containers using the selected native
      platform and exact pinned vectors. Pull/create/run with `--network=none`, `--cap-drop=ALL`,
      `--security-opt=no-new-privileges`, host UID:GID, read-only exact-file model mount, and writable
      current `payload/` mount only. Never mount the owner/stage parent, repository/model directory,
      Docker socket, home, or credentials. Validate inspect/version/export response shapes and permit
      only pinned image-config environment names, explicit `HOME=/tmp` and `TMPDIR=/tmp`, and generated
      `HOSTNAME`; never use unvalued `--env`. Each operation uses its exact wall-clock timeout and process
      group TERM/grace/KILL/exact-container removal behavior.
      files: `tools/structurizr-docker.ts`, `tools/structurizr-docker.test.ts`
      probe: `bun test tools/structurizr-docker.test.ts` captures every Docker argv/mount/environment and
      exact `structurizr-[0-9a-f]{32}` name for the four commands, verifies one regular `workspace.json`
      exists before SVG export and only key-derived regular SVG/legend output follows, rejects malformed
      inspect/version/output and unexpected image environment/files, and uses a hung fake Docker process
      to assert every timeout's TERM/10-second-grace/KILL/30-second exact-name removal sequence without
      affecting another container.
      out-of-scope: networked renderers, read-only container root, persistent containers, broad mounts,
      unbounded Docker calls, alternate distributions, or fallback.
      spec: `structurizr-diagram-rendering`

- [x] 4.3 Compose source, filesystem, Docker, verifier, manifest, render, and clean behind the frozen
      error taxonomy. Stop at the first failure in this exact precedence: `CONFIG INVOCATION`; `IO
      LOCK_BUSY`; `IO UNSAFE_OUTPUT`, `IO PATH`; `CONFIG PIN`, `CONFIG MODEL_PATH`, `CONFIG
      SOURCE_DIRECTIVE`, `CONFIG WORKSPACE_EXTENDS`; `DEPENDENCY DOCKER`, `DEPENDENCY PLATFORM`,
      `DEPENDENCY IMAGE`, `DEPENDENCY BUN_VERSION`; `VALIDATION DSL`, `VALIDATION TIMEOUT`; `RENDER
      JSON`, `RENDER SVG`, `RENDER TIMEOUT`; `CONSISTENCY JSON`, `CONSISTENCY LINEAGE`, `CONSISTENCY
      VIEW_KEY`, `CONSISTENCY SVG_SAFETY`; `IO PUBLISH`, `IO CLEANUP`. Emit one primary `<CLASS>
      <CODE>:` line; cleanup errors remain secondary; never publish partial output or fall back.
      files: `tools/structurizr-render.ts`, `tools/structurizr-render.test.ts`
      probe: `bun test tools/structurizr-render.test.ts` exercises every primary code and combined-fault
      pair, including malformed pin plus absent Docker, lock plus malformed pin/unsafe output, unsafe root
      plus bad render, invalid model path plus unsupported platform, and SVG safety plus cleanup failure;
      each stops before later probes, preserves the mandated unsafe/lock exceptions, leaves no ordinary
      stale success or owned stage, and emits no `PARTIAL`.
      out-of-scope: changing precedence based on incidental discovery order, retrying validation/render,
      Mermaid fallback, servers, or committed output.
      spec: `structurizr-diagram-rendering`

## 5. Public recipes and ignore boundary

- [x] 5.1 Add thin `just structurizr-render [model]` and `just structurizr-clean` wrappers and only the
      three exact root ignore rules for final output, lock, and nonce stages. The default model is the
      canonical path; an explicit argument is passed unchanged to source validation. Keep all behavior in
      typed tools and keep existing Mermaid recipes/gates unchanged.
      files: `justfile.opsx`, `.gitignore`, `tools/structurizr-recipes.test.ts`
      probe: `bun test tools/structurizr-recipes.test.ts && git check-ignore build/architecture/structurizr/manifest.json build/architecture/.structurizr-lock build/architecture/.structurizr-stage-0123456789abcdef0123456789abcdef/payload/workspace.json && test -z "$(git ls-files build/architecture/structurizr)"` proves exact wrapper argv/defaults, rejects an arbitrary model through `CONFIG MODEL_PATH`, finds each exact ignore and no broad `/build/` ignore, and proves two cleans preserve an outside sentinel.
      out-of-scope: Just-implemented safety logic, broad build ignores, arbitrary fixture arguments through
      the public recipe, existing recipe changes, or allowing Structurizr to satisfy Mermaid gates.
      spec: `structurizr-diagram-rendering`

## 6. Least-privilege opt-in workflow

- [x] 6.1 Add the workflow template and policy/runtime tests. Use pull request, push-to-`main`, and manual
      triggers with exact-model (no includes glob), tools/pin, recipes, installer/template/workflow, and
      Bun-pin filters; native `ubuntu-24.04` `linux/amd64`; and only `contents: read`. Pin checkout,
      setup-bun, and upload actions to the specified commits; checkout alone receives the implicit token
      with `persist-credentials: false`, and upload alone may receive its managed runtime token after one
      successful verified render. Start Bun via an empty environment containing exactly `PATH`, empty
      temporary `HOME`, `TMPDIR`, `CI=true`, `DOCKER_DEFAULT_PLATFORM=linux/amd64`, and
      `BUN_CONFIG_NO_TELEMETRY=1`; reject additions and forward no GitHub value to Docker. Verify Bun
      1.3.14 release/download URL, linux-x64 archive and executable hashes, and version before rendering.
      Upload `structurizr-c4-${{ github.sha }}` only on success with missing-file error and 14-day
      retention; never use secrets/OIDC/packages/`pull_request_target`, commit/push, emulation, or a
      two-render byte comparison.
      files: `templates/structurizr/structurizr.yml`, `tools/structurizr-workflow.test.ts`
      probe: `bun test tools/structurizr-workflow.test.ts` parses the workflow and runs its render command
      against environment/Docker capture shims to prove exact events/filters/runner/actions/permissions,
      Bun provenance checks, native-engine check before platform export, six-name host environment,
      closed container environment, action-only credential boundaries, single-render success-gated upload,
      artifact name/retention, and rejection fixtures for an include glob, extra/secret variable, mutable
      action, write permission, emulation, network, repeat-byte gate, commit, and push.
      out-of-scope: activating the repository workflow, secret-bearing environments, caches, write
      permissions, alternate runners, or publication after failure.
      spec: `structurizr-diagram-rendering`

## 7. Explicit installer opt-in

- [x] 7.1 Make `./install.sh --here [repo] --with-structurizr` the sole activation path. Without the flag,
      install no Structurizr model, workflow, pin, tool, recipe, or ignore rule and perform no Docker/Bun
      probe or warning. With it, refresh every kit-owned file and exact ignore rule while seeding the
      canonical model only when absent; a rerun must preserve an edited model byte-for-byte.
      files: `install.sh`, `tools/install-structurizr.test.ts`
      probe: `bun test tools/install-structurizr.test.ts` runs ordinary, first opt-in, and second opt-in
      installs in temporary Git repositories; asserts total default absence and unchanged Mermaid
      behavior, exact opted-in inventory, edited-model hash preservation, deliberate kit-file refresh,
      one copy of each ignore rule, and no Docker/Bun invocation during ordinary installation.
      out-of-scope: implicit activation, global installation, installer ownership of an existing model,
      ordinary-install dependency checks, or changing unrelated installed guards/schemas/learnings.
      spec: `structurizr-diagram-rendering`

## 8. Ownership guidance and Mermaid non-regression

- [x] 8.1 Teach the architecture-writer and installed AGENTS template that the canonical model is
      team-owned source updated only when already opted in, retaining hierarchical identifiers, canonical
      keys, cross-level lineage, and maintainer review. When absent, never invoke or warn about
      Structurizr. Preserve Mermaid as the default and independent required contract in arc42 sections 3,
      5, and 7; generated SVG can never satisfy a missing Mermaid fence.
      files: `agents/architecture-writer.md`, `templates/AGENTS.md`,
      `tools/structurizr-guidance.test.ts`
      probe: `bun test tools/structurizr-guidance.test.ts && just architecture-html && just arch-lint`
      proves existing-model-only ownership, canonical invariants, and absence behavior; compares ordinary
      Mermaid render/lint results before and after option installation; and runs a fixture with valid
      Structurizr output but a missing required Mermaid fence where `arch-lint` still fails only the
      existing Mermaid presence contract.
      out-of-scope: replacing Mermaid, auto-creating a model outside installer opt-in, embedding generated
      SVG into architecture HTML, ADR authorship, or changing section-presence rules.
      spec: `structurizr-diagram-rendering`

## 9. Repository dogfood on canonical native CI

- [ ] 9.1 Opt this repository in with the team model and immutable workflow, then execute one real
      clean render on canonical native `linux/amd64` `ubuntu-24.04` with no emulation. Verify the exact
      commands, passive original SVG, lineage, regular single-link file set, schema-version 1 manifest,
      Bun/image/platform provenance, ignored/untracked generated root, and upload-ready bundle. After a
      successful render, inject an invalid model and prove the fixed primary error, owned-stage cleanup,
      and absent final root. Do not compare two render byte streams or claim stable SVG hashes.
      files: `docs/architecture/structurizr/workspace.dsl`, `.github/workflows/structurizr.yml`,
      `tools/structurizr-dogfood.test.ts`, `tools/structurizr/pin-evidence.md`
      probe: `DOCKER_DEFAULT_PLATFORM=linux/amd64 bun tools/structurizr-dogfood.test.ts --require-native linux/amd64 && test -z "$(git ls-files build/architecture/structurizr)"` on `ubuntu-24.04` refuses non-native engines, performs the real pinned render once, independently rechecks every manifest size/hash and safety/lineage invariant, records the native amd64 transcript beside the required native arm64 evidence, then proves the post-success invalid-model run publishes nothing and leaves no owned stage.
      out-of-scope: committed generated bytes, byte-identical rerender claims, arm64-versus-amd64 byte
      comparison, PNG, historical backfill, architecture-HTML embedding, or Mermaid weakening.
      spec: `structurizr-diagram-rendering`

## 10. Architecture completion gate

- [x] 10.1 After implementation and dogfood pass, delegate the shipped-evidence refresh to the
      architecture-writer for arc42 sections 1–8 and 10–12. Describe the optional source/image/verifier,
      native platform, lock/staging, passive artifact, CI credential/environment, provenance, quality,
      and risk boundaries. Section 9 may only index an ADR authored by an authorized owner; otherwise it
      remains an index and records no invented decision.
      files: `docs/architecture/01-introduction-and-goals.md`,
      `docs/architecture/02-constraints.md`, `docs/architecture/03-context-and-scope.md`,
      `docs/architecture/04-solution-strategy.md`, `docs/architecture/05-building-block-view.md`,
      `docs/architecture/06-runtime-view.md`, `docs/architecture/07-deployment-view.md`,
      `docs/architecture/08-crosscutting-concepts.md`, `docs/architecture/09-architecture-decisions.md`,
      `docs/architecture/10-quality-requirements.md`,
      `docs/architecture/11-risks-and-technical-debt.md`, `docs/architecture/12-glossary.md`,
      `docs/architecture/README.md`, `docs/architecture/index.html`
      probe: `just architecture-html && just arch-lint` exits zero after the architecture-writer refresh,
      and `bun tools/check-doc-contracts.ts` confirms the refreshed tree names the evidenced optional
      boundary without weakening Mermaid or inventing an ADR.
      out-of-scope: production code changes, ADR creation/editing/restatement, embedding generated
      Structurizr SVG, or replacing the arc42 tree.
      spec: `structurizr-diagram-rendering`

## 11. User documentation completion gate

- [x] 11.1 After architecture is current, delegate user documentation to the tech-writer. Update the
      Structurizr how-to, `README.md`, and root `index.html` with Mermaid-first behavior, explicit opt-in
      and non-clobber ownership, exact one-file/no-include boundary, native Docker and Bun 1.3.14
      prerequisites/provenance, render/clean/removal commands, ignored regular output and manifest
      interpretation, strict passive-SVG/no-rewrite policy, fixed error precedence, credential boundary,
      14-day CI artifact, no fallback/emulation, no byte-identical SVG promise, and the reviewed pin-update
      checklist requiring native fixture/corpus evidence on both targets.
      files: `docs/structurizr.md`, `README.md`, `index.html`
      probe: `just docs-lint | tee /tmp/structurizr-docs-lint.log && grep -F 'docs-lint: clean (all tools ran)' /tmp/structurizr-docs-lint.log && ! grep -F 'PARTIAL' /tmp/structurizr-docs-lint.log && bun tools/check-doc-contracts.ts` passes with no skipped required tool and verifies all three entry/how-to documents contain executable install/render/clean/removal guidance, the exact image and Bun pins, all error classes in precedence order, both native targets, and the Mermaid/no-byte-identity limitations.
      out-of-scope: production or architecture-tree edits, Structurizr cloud/server/plugin/theme guidance,
      PNG/layout tutorials, committed renders, ADR creation, or claims that Structurizr replaces Mermaid.
      spec: `structurizr-diagram-rendering`
