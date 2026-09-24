# Review log—add-structurizr-diagram-option

Durable record of every reviewer verdict for this change. The orchestrator appends each
verdict block verbatim before the developer ticks the task by running the concrete
two-argument `just record-verdict` command rendered by the active `/opsx-loop` from its
explicit change-name and parent-session arguments. The session argument must be the exact
absolute `File:` path copied from pi's built-in `/session` command in the same persisted
top-level session. Session discovery fails closed: if the rendered prompt is unavailable or
`/session` reports `In-memory`, stop and re-enter through `/opsx-loop`; never guess a path
or select the newest session.
At archive time, `/opsx-retro` reads this file and ratchets recurring finding classes into
lint rules, `openspec/config.yaml` rules, or `AGENTS.md` lines. This is what stops review
findings from evaporating after a single task.

---

## Planning provenance

The source review is `openspec/changes/add-architecture-diagrams/review-log.md`,
“Task 6.1—First review”. Its `[P1][CONFIRMED]` finding blocked the old task because it contradicted
that change's Mermaid-only scope and lacked contracts for the DSL model and ownership boundary,
immutable renderer, generated output and ignore policy, CI trigger/failure/artifact semantics, and
normative one-model consistency across context, container, and component views. The old task was
removed without being marked complete; this change owns its replacement contract.

## Pre-code review gate

A cross-family `spec-reviewer` MUST review this change's proposal, design, and spec before task 1.1
starts. The orchestrator MUST append that actual result verbatim below. Any P0 or P1 finding blocks
apply until the planning artifacts are corrected and re-reviewed. This initial ledger records no
verdict for the current change.

<!-- Appended per task, newest last. Example:

## Task 1.2—implement CSV export

VERDICT: PASS
FINDINGS: none
EVIDENCE CHECK: tsc clean + 12/12 tests exercise the changed branch—yes
-->

## Pre-code spec review—First review

SPEC VERDICT: BLOCK

FINDINGS (most severe first):
- [P1] Included source is omitted from provenance and determinism identity — design.md:Decisions 1, 3, 4; specs/structurizr-diagram-rendering/spec.md:Generated output
  gap: Local includes are allowed, but `manifest.json` hashes only `workspace.dsl`. Editing an included DSL file changes the rendered workspace/SVGs while retaining the same recorded model hash.
  decision needed: Define a canonical, symlink-safe transitive source closure (paths, ordering, normalization, hash) for rendering, manifest lineage, and CI triggers; or prohibit includes.

- [P1] Arbitrary model/view paths can violate the stated mount and output boundary — design.md:Decisions 1, 4, 5; specs/structurizr-diagram-rendering/spec.md:Generated output; tasks.md:4.1, 5.1
  gap: `just structurizr-render [model]` has no allowed-path contract. A caller can select a model under a home/credential directory, which the renderer then bind-mounts despite the “no home/credentials” claim. Additional view keys have no safe filename grammar or resolved-path containment rule, and output entry symlinks are not explicitly rejected.
  decision needed: State accepted model roots, include/symlink policy, view-key-to-filename grammar, and a regular-file-only staging/final-tree invariant before any mount or publish.

- [P1] SVG validation is not a safe artifact-publication contract — design.md:Decision 3; specs/structurizr-diagram-rendering/spec.md:One exported model; tasks.md:3.1
  gap: “parseable SVG with no external URL” permits inline scripts, event handlers, `foreignObject`, CSS/data URI payloads, and ambiguous relative/CSS URL forms. An untrusted PR model can produce an artifact later opened by a maintainer.
  decision needed: Define whether artifacts are trusted-only or specify the exact active-content/URL rejection policy and parser semantics. This must remain compatible with the no-rewrite decision.

- [P1] Fail-closed publication/cleaning is undefined under concurrency and conflicts with unsafe-existing-root handling — design.md:Decision 4; specs/structurizr-diagram-rendering/spec.md:Generated output; tasks.md:4.1
  gap: Two renders or a clean concurrent with a render can delete another run’s final/staging output; no lock, staging naming/ownership, collision behavior, or cleanup ownership is defined. Also, “reject symlinks” conflicts with “final output is absent after every error” when an attacker has made the final root a symlink.
  decision needed: Specify concurrency behavior, lock scope, exact staging naming/ownership and cleanup rules, plus whether an unsafe existing final-root symlink is retained, safely unlinked, or causes another defined result.

- [P1] Renderer/tool validity is asserted but not contractually reproducible — design.md:Constraints and resolved assumptions; Decision 2; tasks.md:1.1, 4.1
  gap: No evidence artifact, upstream URL/commit attestation, registry-inspection transcript, or exact consolidated-image command/export interface is supplied. The claimed image/index/platform/application/library facts are therefore unverified in the repository, while implementation depends on their exact JSON/SVG behavior. “Bounded” Docker/image probes also have no timeout/cancellation value.
  decision needed: Record verifiable provenance for the current image/tag/index/manifests and define the exact supported container commands, expected boundary response schemas, and probe timeout/termination behavior. Otherwise a nonexistent or incompatible pin blocks all opt-ins after code is written.

- [P1] Platform support is ambiguous between Docker target and host OS/architecture — design.md:Goals; Decision 2; specs/structurizr-diagram-rendering/spec.md:Rendering uses an immutable distribution; tasks.md:1.1
  two readings: “linux/arm64 local host” excludes an ARM macOS machine using Docker Desktop; or it means the Linux OCI target platform and should support that machine. The task’s “current host” language supports either reading.
  decision needed: State the supported host OS/CPU matrix, how Docker’s effective target platform is discovered/forced, and whether emulation is allowed or rejected.

- [P1] CI is not fully immutable/deterministic because Bun itself is mutable — design.md:Decision 5; specs/structurizr-diagram-rendering/spec.md:CI renders; tasks.md:6.1
  gap: The setup action commit is pinned, but it is given no Bun version/checksum and the repository has no stated Bun runtime pin. The verifier/renderer can therefore run under a later Bun release despite a fixed image and action SHA.
  decision needed: Pin the Bun runtime version and provenance/checksum (and state local compatibility), or narrow the determinism claim to renderer bytes independent of the host-side verifier.

- [P1] “No secrets” is internally ambiguous and cannot be proven by the proposed static test — design.md:Decision 5; specs/structurizr-diagram-rendering/spec.md:CI renders; tasks.md:6.1
  two readings: no repository/environment secrets are configured, while GitHub’s implicit token remains available to actions; or literally no token/secret reaches the job, which conflicts with authenticated checkout/artifact upload behavior. A text scan rejecting “secret” does not establish the container’s effective environment.
  decision needed: Define the allowed GitHub token/action boundary and require an explicit empty/scrubbed container environment, with only named non-secret variables allowed.

- [P1] Required architecture and entry-document artifacts have no implementation task — design.md:Architecture impact; tasks.md:8.1, 10.1; openspec/schemas/dev-reviewer/schema.yaml:architecture, docs
  gap: The design requires refreshing arc42 sections 1–12, but no task changes `docs/architecture/**` or runs its required render/gate. Task 10 explicitly lists `README.md` and `docs/structurizr.md` but omits root `index.html`, despite the schema requiring both user-facing entry documents to match shipped functionality.
  decision needed: Add dependency-ordered tasks/probes for the architecture-writer refresh, `just architecture-html`, `just arch-lint`, and root `index.html` update/verification.

- [P2] Error-prefix precedence is not deterministic — design.md:Contract and failure taxonomy; tasks.md:1.1, 4.1
  gap: Combined failures (malformed pin plus unavailable Docker, unsafe output plus render failure, invalid model path plus unsupported platform) can legitimately receive multiple stated classes, but no precedence rule exists.
  decision needed: Define the first-failure/precedence rule and freeze it in tests.

Evidence-check limitations: This was read-only. Available tools could inspect repository artifacts but could not access Docker, an OCI registry, GitHub Action repositories, or execute the claimed probes; image/action digest existence, platform manifests, version output, and upstream-tag provenance could not be independently validated.

VERDICT: BLOCK

## Pre-code spec review—Second review

SPEC VERDICT: BLOCK

FINDINGS (most severe first):
- [P1][CONFIRMED] Default installation contradicts the required absence of Structurizr recipes — `tasks.md:5.1,7.1`; `install.sh:install_project`; `spec.md:Structurizr rendering is explicit opt-in`
  gap: Task 5.1 adds recipes to shared `justfile.opsx`, which the current installer copies unconditionally; this violates “without the flag … no Structurizr … recipe.”
  decision needed: Define the conditional packaging/import layout and exact opted-in file inventory, including how repository dogfood activates through the installer without overwriting its team model.

- [P1][CONFIRMED] Lock acquisition follows an unchecked, potentially linked output ancestor — `design.md:Decision 4`; `spec.md:Render and clean use one ownership lock`
  gap: The design acquires `build/architecture/.structurizr-lock` before checking/creating ancestors without following symlinks. Creating that lock necessarily traverses `build/architecture`; a symlink there defeats the claimed boundary.
  decision needed: Specify a symlink-safe pre-lock ancestor/lock-parent procedure and its race/precedence semantics.

- [P1][HIGH] Abandoned-stage ownership is not defined sufficiently to authorize deletion — `design.md:Decision 4`; `spec.md:Generated output has a fail-closed regular-file lifecycle`; `tasks.md:4.1`
  gap: “Valid owner file/schema” is undefined: owner JSON fields, schema version, required nonce-to-directory-suffix binding, and the authority to delete a crash-left tree are unsettled. Different implementations can delete a merely well-formed attacker-created stage or retain it.
  decision needed: State the exact owner-marker schema and matching/collection rule, including the result for any mismatch or unverifiable abandoned stage.

- [P1][HIGH] Native-platform rejection has no authoritative host/translation detection contract — `design.md:Decision 2`; `spec.md:Host support is based on the native Docker Engine target`; `tasks.md:1.2`
  gap: Docker Server architecture is declared authoritative while host/engine mismatch, QEMU, and Rosetta translation must be rejected. No host CPU/translation probe or decision resolves an Apple Silicon machine running a translated host process versus a native arm64 Docker Desktop engine.
  decision needed: Define the exact host and Docker signals used, accepted macOS Docker Desktop cases, and how an unverifiable translation state is handled.

- [P1][HIGH] GitHub credential confinement is stronger than the enforceable workflow boundary — `design.md:Decision 7`; `spec.md:CI confines credentials`; `tasks.md:6.1`
  gap: The scrubbed `env -i` render process/container is testable, but “checkout alone receives the implicit token” is not established by workflow text: GitHub action/context credentials can be available to other actions at job scope. Static shims cannot prove an Actions service-token boundary.
  decision needed: Limit the guarantee to the scrubbed render boundary, or state an enforceable action-level credential-isolation mechanism and its probe.

- [P1][CONFIRMED] Timeout taxonomy remains incomplete despite the claimed fixed precedence — `design.md:Decisions 2,8`; `spec.md:Renderer command boundary and termination`; `tasks.md:1.2,4.2,4.3`
  gap: 60-second Docker info/index/config, 900-second pull, and 60-second `version` timeouts have no unique primary code in Decision 8. “Classified by stage” permits multiple readings (`DEPENDENCY DOCKER`, `DEPENDENCY IMAGE`, `VALIDATION TIMEOUT`, or `RENDER TIMEOUT`).
  decision needed: Assign one primary code to every bounded operation, including pull/inspect/version and force-remove failure, then bind unexpected JSON/SVG filesystem-output detection to one exact code.

- [P1][HIGH] The required secure XML parser is neither selected nor deliverable as a pinned dependency — `design.md:Decision 3`; `spec.md:Published SVG is passive`; `tasks.md:3.2`
  gap: The repository has no package manifest/parser dependency, while the task requires a namespace-aware, non-recovering XML parser with DTD/entity disabling. A hand-written parser and an arbitrary future library are materially different security contracts; the corpus cannot prove parser properties exhaustively.
  decision needed: Specify the parser provenance/version and required configuration, or explicitly define the approved parser implementation boundary.

- [P1][HIGH] Both-native-target evidence is mandatory but lacks a governed execution/attestation path — `design.md:Renderer provenance and independent evidence`; `tasks.md:1.2,9.1`; `spec.md:Rendering uses a verifiable immutable consolidated distribution`
  gap: Task 1.2 requires native amd64 and arm64 execution before progress, but only amd64 CI is specified. “Raw outputs” have no required files, schema, hashes, or designated arm64 runner; markdown claims can satisfy “recorded evidence” without reproducible evidence.
  decision needed: Define where arm64 executes and the exact immutable evidence artifacts/validation gate required before the pin is accepted.

- [P2][HIGH] Original source-closure, exact-model, safe-key, no-rewrite SVG policy, nondeterministic provenance, Mermaid preservation, and architecture/README/index completion gaps are now explicitly covered — `spec.md` corresponding requirements; `tasks.md:2.2,3.1-3.3,8.1,10.1,11.1`.
  remaining limit: this is contractual coverage only; no Docker, OCI, GitHub Action, Bun archive, or live renderer evidence was independently executable in this read-only review.

Evidence limits:
- The claimed OCI/action/Bun evidence, including the dated `2026.06.28` image and Bun `1.3.14`, is asserted in `design.md` but is not yet present as on-disk pin evidence or independently verifiable here.
- Native amd64 execution remains correctly required before shipment, but is presently only a planned task.

VERDICT: BLOCK