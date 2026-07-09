# pi-opsx-dev-reviewer

A portable kit that gives **pi** (pi.dev) a two-agent workflow — a **developer**
subagent that implements and a separate **read-only reviewer** subagent that
grades — and (optionally) **forces** OpenSpec's `/opsx:apply` to run through them
instead of the single main agent editing files itself.

Copy this folder to any machine that has `pi`, run `./install.sh`, done.

**Full visual reference:** open [`index.html`](index.html) for a single-page guide to every
protection, agent, extension, and recipe, with usage — self-contained, opens straight from disk.

## Contents

- [What's in the box](#whats-in-the-box)
- [How it works](#how-it-works)
- [Install (global, per machine)](#install-global-per-machine)
- [Use it — ad hoc (no OpenSpec)](#use-it--ad-hoc-no-openspec)
- [Use it — force `/opsx:apply` (per OpenSpec project)](#use-it--force-opsxapply-per-openspec-project)
- [Verify](#verify)
- [Recommended environment](#recommended-environment)
- [Docs gate](#docs-gate)
- [Caveats (verified vs. adjust-per-machine)](#caveats-verified-vs-adjust-per-machine)
- [License](#license)

## What's in the box

```
pi-opsx-dev-reviewer/
├── install.sh                        # idempotent bootstrap (pi-side pieces)
├── agents/
│   ├── solution-architect.md         # settles design/contracts — edits design artifacts ONLY
│   ├── developer.md                  # implementer — full tools, strong model
│   ├── reviewer.md                   # adversarial code reviewer — READ-ONLY, different model
│   ├── spec-reviewer.md              # adversarial SPEC red-team — cross-family, before code
│   └── tech-writer.md                # documentation specialist — edits docs ONLY
├── prompts/                          # /opsx-loop, /opsx-review, /opsx-retro templates
├── templates/                        # AGENTS.md + review-log.md starters for consuming repos
├── openspec/
│   ├── apply-policy.config.yaml      # the delegation hint to merge into a project's config.yaml
│   └── schemas/dev-reviewer/         # custom schema: delegation apply + review-report + docs artifacts
├── docs/decisions/                   # MADR architecture decision records
├── justfile                          # `docs-lint` (graceful-skip) + `docs-lint-setup`
├── .markdownlint-cli2.jsonc · .vale.ini · styles/ · .lycheeignore · cspell.json   # docs gate config
├── HARDENING_PLAN.md · SHAKEDOWN.md · docs/operating-risks.html   # risk map + hardening build
└── extensions/
    ├── force-delegate/index.ts       # ENFORCER — read-only main agent (write/edit blocked, bash allowlisted)
    ├── architect-scope/index.ts      # fail-closed path-gate: architect writes design artifacts only
    ├── harness-selftest/index.ts     # session-start canary — loud HALT if force-delegate did not load
    ├── developer-guard/index.ts      # damage-control on write-capable subagents (blocks catastrophic bash)
    └── branch-guard/index.ts         # PR-flow enforcer — blocks commit/push/force-push to main/master
```

## How it works

- **Subagents = process isolation.** pi has no built-in roles; the community
  extension [`@mjakl/pi-subagent`](https://github.com/mjakl/pi-subagent) adds a
  `subagent` tool that spawns a **separate `pi` process** per call, with its own
  model, its own system prompt, and its own tool allowlist. Two markdown files in
  `~/.pi/agent/agents/` define the two roles.
- **Read-only is real, not prompted.** `reviewer.md` sets `tools: read,find,ls,grep`
  — dropping `edit`/`write`/`bash` means the reviewer *physically cannot* change files.
- **Independent judgment = different model family.** developer runs on Claude,
  reviewer on GPT-5.5. Keep them cross-family.
- **Forcing apply is a pi-layer trick, not an OpenSpec feature.** OpenSpec's apply
  is single-agent by default and has no native delegation. The `force-delegate`
  extension blocks the main agent's `write`/`edit`/`bash` tool calls, so the only
  way it can change code is to call `subagent → developer`. The extension no-ops
  inside subagents (it checks `PI_SUBAGENT_DEPTH > 0`), so the developer keeps full
  tools and does the actual work.

## Install (global, per machine)

```bash
./install.sh
```

It: verifies `pi`, installs `@mjakl/pi-subagent` (warning + stopping if another
subagent extension would collide), and copies the two agent files into
`${PI_CODING_AGENT_DIR:-~/.pi/agent}/agents/`.

**Roles map onto the change lifecycle:** `solution-architect` settles the design
(contracts, enums, boundaries) and records the rationale in `design.md`/`specs/`
→ `developer` implements code/tests against those settled contracts → `reviewer`
adversarially verifies. The architect edits design artifacts ONLY (never production
code); if design reveals code must change, it flags that in its handoff.

**Models:** the agent files pin, on the `openai-codex` provider, `gpt-5.5`
(solution-architect and developer — the heavy reasoning/production roles) and `gpt-5.4`
(reviewer and tech-writer). This is an all-OpenAI configuration for a machine where
`openai-codex` (ChatGPT Plus/Pro `/login`, officially endorsed by OpenAI) is the
available provider. List what your machine can reach with `pi --list-models`, then edit
the `model:` line in any agent file to repoint.

**Cross-family caveat:** the reviewer's value comes from *not* sharing the developer's
blind spots (see [`docs/decisions/0001-cross-family-reviewer.md`](docs/decisions/0001-cross-family-reviewer.md)).
An all-OpenAI setup gives the reviewer a different *model* (`gpt-5.4` vs the developer's
`gpt-5.5`) but the same family, so correlated blind spots survive — fine for smoke-testing
the mechanism, weaker for real review. To restore true cross-family coverage, point the
reviewer at a non-OpenAI provider you have configured, e.g. `anthropic/claude-opus-4-8`.
(Anthropic via a Claude Pro/Max OAuth login bills as per-token "extra usage", not against
your plan — pi warns via `warnings.anthropicExtraUsage`; use Bedrock to stay on plan/credits.)

## Use it — ad hoc (no OpenSpec)

In any pi session or headless:

```bash
pi -p "Implement <X> with the developer agent, then have the reviewer agent
        check the diff and give me its verdict."
```

## Use it — force `/opsx:apply` (per OpenSpec project)

1. **Hint** (best-effort): append the block in `openspec/apply-policy.config.yaml`
   to the end of your repo's `openspec/config.yaml` `context: |` block. This tells
   the agent *how* to delegate. (Note: in the default `spec-driven` schema, `context`
   is injected at artifact creation and `rules` are per-artifact — neither is
   guaranteed to reach the apply step, which is exactly why step 2 exists.)
2. **Force** (the enforcers): copy the extensions into the project so they load for
   that repo's sessions:
   ```bash
   mkdir -p <repo>/.pi/extensions
   cp -r extensions/force-delegate  <repo>/.pi/extensions/
   cp -r extensions/architect-scope <repo>/.pi/extensions/
   cp -r extensions/harness-selftest  <repo>/.pi/extensions/
   cp -r extensions/developer-guard   <repo>/.pi/extensions/
   cp -r extensions/branch-guard      <repo>/.pi/extensions/
   ```
   The `harness-selftest` canary prints a loud `HARNESS UNGUARDED` banner at startup if
   `force-delegate` failed to load, so a silent enforcer failure can never pass unnoticed.
   `developer-guard` blocks catastrophic bash (recursive-force `rm`, force-push, `sudo`,
   `dd`/`mkfs` to devices, curl-pipe-shell, fork bombs) for the write-capable subagents,
   which `force-delegate` deliberately leaves unguarded. `branch-guard` enforces PR flow —
   it blocks committing on `main`/`master`, pushing to them, and force-pushing to them, for
   every agent, so the developer subagent (which keeps full bash) can never land code on a
   protected branch without a reviewed pull request. Edit its `PROTECTED` set per project.
   Now the main agent can only run read-only bash and must delegate every mutation;
   the `solution-architect` subagent is path-gated to design artifacts. `/opsx:apply`
   must delegate.
3. Run `/opsx:apply <change>` and watch it fan out developer → reviewer per task.

**Clobber-proof alternative to the extension:** use the bundled `dev-reviewer` OpenSpec
schema (`openspec/schemas/dev-reviewer/`), which bakes the delegation protocol into the
`apply` template and adds `review-report` and `docs` artifacts. Copy it under
`<repo>/openspec/schemas/`, then select it (`--schema dev-reviewer` or in
`openspec/config.yaml`). `openspec update` won't overwrite a project schema (it *does*
regenerate — and would clobber — the generated `.pi/prompts/opsx-apply.md`, so never
hand-edit that file).

## Verify

- Read-only reviewer proof:
  `pi -p --tools read,find,ls,grep "edit any file here"` → it refuses to write.
- End-to-end delegation:
  `pi -p "delegate to the reviewer agent: list md files here"` → returns the
  reviewer's `VERDICT: PASS …`.
- Force proof (in a repo with the extension): remove the delegate fallback so a blocked
  write has nowhere to go, then confirm the main agent cannot write:
  ```bash
  pi -p -a --exclude-tools subagent "use the write tool to create /tmp/x with PROOF"
  ```
  → the agent reports the write was blocked and `/tmp/x` is never created. (Without
  `--exclude-tools subagent` the main agent is still blocked, but it delegates and the
  developer subagent does the write — so the file appearing is delegation working, not the
  guard failing. Measure the block, not the side effect.)

## Recommended environment

Two optional settings sharpen the loop without changing its behaviour:

- **LSP back-pressure for the developer.** Give the developer's pi session an
  LSP/diagnostics extension (e.g. `pi-lens` or `@narumitw/pi-lsp`) so type errors and
  lint findings reach the agent as tool feedback. A defect the developer's own tools
  catch never has to reach the cross-family reviewer — the cheapest review is the one
  you don't pay a second model for.
- **Prompt-cache hygiene.** The agent files and prompt templates are byte-stable across
  iterations, so pi's prompt cache reads them at a fraction of the write cost. For long
  apply sessions set `PI_CACHE_RETENTION=long` (1-hour Anthropic / 24-hour OpenAI TTL)
  so the cache survives the gaps between delegations.

## Docs gate

Documentation is held to the same standard as code: a role writes it, a gate checks it.
The `tech-writer` agent drafts docs structured by Diátaxis and styled to pass
`just docs-lint` (markdownlint + Vale + lychee + cspell).

Two enforcement layers, with an honest boundary between them:

- **Presence** — the `dev-reviewer` OpenSpec schema declares `review-report` and `docs`
  artifacts that `requires: tasks`, so the apply prompt drives the agent to produce them.
  OpenSpec itself does NOT enforce their presence: tested on 1.4.1, both
  `openspec validate <change> --strict` and `openspec archive <change>` succeed on a
  change with tasks complete but no `review-log.md` and no docs delta. To make presence a
  real gate, run `just archive-check <change>` before archiving — a tool-independent check
  that hard-fails (never skips) when the review ledger is missing or empty.
- **Quality** — `just docs-lint` runs whatever tools are installed and **skips any that
  aren't** (printing a per-tool notice), so on a fresh clone it can pass without checking
  anything. Run `just docs-lint-setup` once to install the full set; treat a run that
  skipped tools as "not fully checked", not "passed".

## Caveats (verified vs. adjust-per-machine)

- **pi extension load-breakers (learned the hard way — see [`SHAKEDOWN.md`](SHAKEDOWN.md)):**
  pi 0.79.9 loads `.ts` extensions with a fragile tokenizer that fails the whole file with
  `Unterminated string constant` and then **silently disables it**. Three constructs
  trigger it: regex literals (use `new RegExp("...")` instead), raw backticks, and
  apostrophes (even inside comments and double-quoted strings). `bun build`, `jiti`, and
  unit tests all miss this — only loading through `pi` catches it. Run `just check-extensions`
  (a mechanical guard) before shipping any extension change.
- **Extension package name**: neither extension imports a runtime package name, so loading
  is package-name-independent. If your editor type-checks, the local package may be
  `@earendil-works/pi-coding-agent` *or* `@mariozechner/pi-coding-agent`.
- **Models** are the one thing to adjust per machine (provider availability).
- **Subagent extension is third-party** (`@mjakl/pi-subagent`) — pin/inspect before
  trusting it in sensitive repos.
- **`--exclude-tools edit,write,bash`** on the pi CLI is a lighter, extension-free
  hard-force, but it also blocks the main agent from ticking `tasks.md` checkboxes;
  the extension route avoids that by letting the developer subagent do the ticking.

## License

MIT. See [`LICENSE`](LICENSE).
