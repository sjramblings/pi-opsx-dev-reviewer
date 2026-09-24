# Structurizr pin evidence

<!-- vale Vale.Spelling = NO -->

This file records evidence actually observed for `tools/structurizr/pin.json`. It is deliberately
limited to what was executed or fetched. A published manifest alone is not evidence that both
platform commands work.

## Reviewable evidence URLs

| URL | Checked |
| --- | --- |
| <https://github.com/structurizr/structurizr/releases/tag/v2026.06.28> | HTTP 200 |
| <https://github.com/structurizr/structurizr/commit/9ff16634c3b8574584262ae8545510bbb1d1b4bd> | HTTP 200 |
| <https://github.com/oven-sh/bun/releases/tag/bun-v1.3.14> | HTTP 200 |

`bun test tools/structurizr-pin.test.ts` asserts these three exact URLs are recorded, and
re-checks them live when `STRUCTURIZR_LIVE_URLS=1`.

## Registry evidence

Fetched from the Docker Hub registry API on 2026-08-02:

- Tag `2026.06.28-playwright` exists in `structurizr/structurizr` and is the newest release tag.
- `docker-content-digest` for that tag is
  `sha256:9bdc861e8c94f77f5f73bde70bdee410a65b82cbe8d341d3919a9ebd0cb17f8c`, matching the pinned
  `image.indexDigest`.
- The OCI index lists exactly the two pinned native targets:
  - `linux/amd64` -> `sha256:99119a0586c11e99db513915f1a5580088c6a07bcaded7d7d27f65fd2ee3c29e`
  - `linux/arm64` -> `sha256:b669b5dbf931f4e0bf900586f6b1b98a66b35192d123c17824da2ed1f850268e`

## Dependency digest evidence

Reproduced by independent download on 2026-08-02:

- `saxes@6.0.0` tarball SHA-256 `1cdf52fbbe1ccbd175c365d2b8e63f46e590e74aff23fa6a44a6ec51522e96db`.
- `xmlchars@2.2.0` tarball SHA-256 `bdf900298963e4bd95b76aa95e96d29f05687e6ae662d617061778267b576da8`.

The GitHub release API for `bun-v1.3.14` reported asset digests matching all four recorded archive
hashes (`darwin-aarch64`, `darwin-x64`, `linux-aarch64`, `linux-x64`).

The seven vendored parser file hashes in `xmlParser.files` were reproduced from those tarballs; see
the parser-integrity section below.

## Native `linux/arm64` command evidence

Executed on this host: Darwin arm64, Docker Engine 29.3.1, server `linux/aarch64`. No emulation.

- `docker image inspect` of the pinned reference reported `linux/arm64`, entrypoint
  `["/usr/local/structurizr.sh"]` (matching `image.entrypoint`), and exactly the six pinned
  environment names: `JAVA_HOME`, `LANG`, `LC_ALL`, `PATH`, `PLAYWRIGHT_BROWSERS_PATH`, `PORT`.
- Platform probe `/usr/bin/uname -s -m` printed `Linux aarch64`.
- `version` reported application `2026.06.28` and libraries `6.2.2`, matching
  `upstream.applicationVersion` and `upstream.librariesVersion`. Java 25.0.2.
- `validate -w /workspace/workspace.dsl` succeeded for `tools/fixtures/structurizr/workspace.dsl`.
- JSON export emitted exactly one `workspace.json`. Its model contains one person (`Reader`) and one
  component (`Pin Probe`), a **direct** person-to-component relationship, and exactly the canonical
  view keys `context`, `container`, and `component`.
- SVG export emitted exactly one `<view-key>.svg` per exported view plus its matching legend:
  `context.svg`, `context-key.svg`, `container.svg`, `container-key.svg`, `component.svg`,
  `component-key.svg`. No unexpected, duplicate, or non-regular output appeared.

All command runs used `--network=none`, `--cap-drop=ALL`, `--security-opt=no-new-privileges`, a
read-only single-file model mount, and host `UID:GID`.

`bun tools/structurizr-probe.ts --live --fixture tools/fixtures/structurizr/workspace.dsl
--require-native linux/arm64` exited 0 against this engine and reported
`native linux/arm64 interface verified`.

### Emulation refusal, observed live

Both guards were exercised against the same real engine and exited 1:

- Requesting `--require-native linux/amd64` on this native arm64 engine printed
  `DEPENDENCY PLATFORM: required platform linux/amd64 is not the native engine target linux/arm64;
  emulation is not supported`.
- `DOCKER_DEFAULT_PLATFORM=linux/amd64` printed
  `DEPENDENCY PLATFORM: DOCKER_DEFAULT_PLATFORM=linux/amd64 conflicts with the native target
  linux/arm64`.

No cross-target image operation was issued, so no binfmt/QEMU or Rosetta-for-Linux path was eligible.

## Parser integrity, reproduced

All seven files under `tools/vendor/structurizr-xml/node_modules/` were extracted from the two
pinned tarballs and hashed. Every hash matches `xmlParser.files` in the pin exactly, so those
values are now reproduced facts rather than design-carried ones.

## Repository dogfood, native `linux/arm64`

`./install.sh --here "$PWD" --with-structurizr` activated the option in this repository. The
pre-existing team model was hash-checked before and after the rerun and was **not** replaced
(`278b399dc65835014b769185bc9b50b43878bb09ced97f8e879bbbb6ff1689bf` both times).

`bun tools/structurizr-dogfood.test.ts --require-native linux/arm64` exited 0 and reported:

```text
dogfood: rendered context, container, component on native linux/arm64
dogfood: manifest, lineage, view keys, and SVG safety independently rechecked
dogfood: post-success invalid model -> VALIDATION DSL: validate exited 1: ; nothing published
dogfood: PASS (no byte comparison made; SVG hashes are not a stable API)
```

The published set was exactly `workspace.json`, `manifest.json`, and one `<key>.svg` plus
`<key>-key.svg` for each of `context`, `container`, and `component`. The generated root is
git-ignored and untracked. The same command with `--require-native linux/amd64` exited 1 with
`DEPENDENCY PLATFORM: ... emulation is not supported`.

## Not yet evidenced

- **Native `linux/amd64` execution has not been performed.** The evidence host is arm64 only, and the
  design prohibits QEMU and Rosetta OCI translation, so no legal amd64 command evidence can be
  produced here. **Task 1.2 stays open** until a native `linux/amd64` engine runs the same fixture.
  This is the sole reason the task is unticked; the probe implementation itself is complete and
  passes offline and on native arm64.
- The canonical CI dogfood on `ubuntu-24.04` has not run, for the same reason. **Task 9.1
  stays open** until it does.
- The recorded evidence host runs Bun 1.3.9, not the pinned 1.3.14. The pin's Bun record is verified
  by digest only, not by local execution.

A pin update must rerun the registry and API checks, inspect image config and entrypoint, execute the
fixture natively on both supported OCI targets, rerun the SVG safety corpus, and update this file in a
reviewed pull request.
