#!/usr/bin/env bash
# Bootstrap the pi developer + reviewer subagent setup.
#
#   ./install.sh            Global (pi-wide) pieces: subagent, agent files, prompt templates.
#   ./install.sh --here [P] Project pieces into repo P (default: current dir): extensions,
#                           tools, dev-reviewer schema, AGENTS.md + learnings/ scaffold, and a
#                           justfile.opsx import. Non-destructive: never clobbers your data.
#   ./install.sh --all [P]  Both.
#   ./install.sh --guards P Worktree-only state: .pi/extensions/ + shared memory/.
#
# Idempotent: safe to re-run.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# cp fails when source and target are the same file. Treat that as a successful no-op so
# a repository can run its own installer against itself (Decision 1: dogfood activation).
safe_cp() {
  local src dst
  dst="${!#}"
  for src in "$@"; do
    [ "$src" = "$dst" ] && continue
    if [ -d "$dst" ]; then
      local base; base="$(basename "$src")"
      [ "$src" -ef "$dst/$base" ] && continue
      cp "$src" "$dst/$base"
    else
      [ -e "$dst" ] && [ "$src" -ef "$dst" ] && continue
      cp "$src" "$dst"
    fi
  done
}

require_pi() {
  echo "→ Checking pi…"
  command -v pi >/dev/null 2>&1 || { echo "✗ pi not on PATH — install pi first (https://pi.dev)"; exit 1; }
  echo "  pi $(pi --version 2>/dev/null)"
}

# Local installs must never contain the global-only canary. Validate only path identities;
# do not inspect or remove a stale canary because any entry could reach operator-owned data.
prepare_local_extensions_dir() {
  local TARGET="$1"
  local PI_DIR="$TARGET/.pi"
  local EXTENSIONS_DIR="$PI_DIR/extensions"
  local CANARY_PATH="$EXTENSIONS_DIR/worktree-canary"

  if [ -L "$PI_DIR" ]; then
    echo "✗ local .pi path is a symlink; refusing install: $PI_DIR" >&2
    return 1
  elif [ -e "$PI_DIR" ] && [ ! -d "$PI_DIR" ]; then
    echo "✗ local .pi path is not a directory; refusing install: $PI_DIR" >&2
    return 1
  elif [ ! -e "$PI_DIR" ]; then
    mkdir "$PI_DIR"
  fi

  # Revalidate after creation so a replaced parent is refused before the child is created.
  if [ -L "$PI_DIR" ] || [ ! -d "$PI_DIR" ]; then
    echo "✗ local .pi path changed type during install; refusing: $PI_DIR" >&2
    return 1
  fi
  if [ -L "$EXTENSIONS_DIR" ]; then
    echo "✗ local .pi/extensions path is a symlink; refusing install: $EXTENSIONS_DIR" >&2
    return 1
  elif [ -e "$EXTENSIONS_DIR" ] && [ ! -d "$EXTENSIONS_DIR" ]; then
    echo "✗ local .pi/extensions path is not a directory; refusing install: $EXTENSIONS_DIR" >&2
    return 1
  elif [ ! -e "$EXTENSIONS_DIR" ]; then
    mkdir "$EXTENSIONS_DIR"
  fi

  if [ -L "$EXTENSIONS_DIR" ] || [ ! -d "$EXTENSIONS_DIR" ]; then
    echo "✗ local .pi/extensions path changed type during install; refusing: $EXTENSIONS_DIR" >&2
    return 1
  fi
  if [ -e "$CANARY_PATH" ] || [ -L "$CANARY_PATH" ]; then
    echo "✗ local worktree-canary already exists; inspect and remove it manually, then rerun: $CANARY_PATH" >&2
    return 1
  fi

  # Later copying is existing provisioning behavior; this task adds no cleanup mutation.
  # Validation alone cannot make that copy descriptor-safe against a concurrent path swap.
}

install_global() {
  local CANARY_SOURCE CANARY_DIR CANARY_DEST
  CANARY_SOURCE="$HERE/extensions/worktree-canary/index.ts"
  [ -f "$CANARY_SOURCE" ] || {
    echo "✗ global canary source is missing or not a regular file: $CANARY_SOURCE" >&2
    exit 1
  }

  require_pi

  # 1. Subagent extension (idempotent) + conflict guard ────────────────────────
  echo "→ Ensuring @mjakl/pi-subagent is installed…"
  installed="$(pi list 2>/dev/null || true)"
  if echo "$installed" | grep -qi "subagent" && ! echo "$installed" | grep -qi "mjakl/pi-subagent"; then
    echo "  ⚠ Another subagent extension is installed — it will collide on the 'subagent' tool name:"
    echo "$installed" | grep -i "subagent" | sed 's/^/      /'
    echo "    Remove it first:  pi remove <that-source>   then re-run this script."
    exit 1
  fi
  pi install npm:@mjakl/pi-subagent

  # 2. Agent files → the active global agents dir ──────────────────────────────
  AGENTS_DIR="${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/agents"
  mkdir -p "$AGENTS_DIR"
  for a in solution-architect developer reviewer tech-writer spec-reviewer architecture-writer evolution-narrator; do
    cp "$HERE/agents/$a.md" "$AGENTS_DIR/$a.md"
  done
  echo "→ Installed architect/developer/reviewer/tech-writer/spec-reviewer/architecture-writer/evolution-narrator agents to $AGENTS_DIR"

  # 2b. Prompt templates → the active global prompts dir ───────────────────────
  PROMPTS_DIR="${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/prompts"
  mkdir -p "$PROMPTS_DIR"
  for p in opsx-loop opsx-review opsx-retro opsx-compost opsx-advise; do
    cp "$HERE/prompts/$p.md" "$PROMPTS_DIR/$p.md"
  done
  echo "→ Installed /opsx-loop, /opsx-review, /opsx-retro, /opsx-compost, /opsx-advise prompt templates to $PROMPTS_DIR"

  # 2c. Global fail-closed canary → the active global extensions dir ───────────
  CANARY_DIR="${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/extensions/worktree-canary"
  CANARY_DEST="$CANARY_DIR/index.ts"
  mkdir -p "$CANARY_DIR"
  cp "$CANARY_SOURCE" "$CANARY_DEST"
  if ! cmp -s "$CANARY_SOURCE" "$CANARY_DEST"; then
    echo "✗ installed global canary does not match its source: $CANARY_DEST" >&2
    exit 1
  fi
  echo "→ Installed global worktree canary to $CANARY_DEST"

  # 3. Model sanity check ──────────────────────────────────────────────────────
  # Read the pins from the agent files rather than restating them here: a hardcoded list
  # silently goes stale the moment an agent is repointed, which is exactly what happened
  # (this block still advertised gpt-5.5/gpt-5.4 long after the agents moved to gpt-5.6).
  echo "→ Verify the agent models resolve on this machine (edit the 'model:' line if not):"
  AGENT_LIST="solution-architect developer reviewer tech-writer spec-reviewer architecture-writer evolution-narrator"
  for a in $AGENT_LIST; do
    m="$(sed -n 's/^model:[[:space:]]*//p' "$HERE/agents/$a.md" 2>/dev/null | head -1)"
    printf '      %-20s %s\n' "$a" "${m:-(no model pin)}"
  done

  # Cross-family review is the whole point of the reviewer role. Check it rather than suggest it.
  PROVIDERS="$(for a in $AGENT_LIST; do
    sed -n 's/^model:[[:space:]]*//p' "$HERE/agents/$a.md" 2>/dev/null | head -1 | cut -d/ -f1
  done | sort -u | grep -v '^$' || true)"
  PROVIDER_COUNT="$(printf '%s\n' "$PROVIDERS" | grep -c . || true)"
  if [ "$PROVIDER_COUNT" -le 1 ]; then
    echo
    echo "    ⚠ Every agent is pinned to a single provider ($(printf '%s' "$PROVIDERS" | tr '\n' ' '))."
    echo "      The reviewer then shares a training corpus with the developer it reviews, so a PASS is"
    echo "      correlated blindness rather than independent confirmation — the de-bias premise the"
    echo "      reviewer role is built on does not hold. Repoint reviewer/spec-reviewer at another"
    echo "      provider (e.g. anthropic/claude-opus-4-8) if you have its key configured."
  fi
  echo "    List what is available with:  pi --list-models"
  echo
  echo "✓ pi-side (global) setup complete."
}

install_guards() {
  local TARGET="${1:-}"
  local TOP WORKTREE_LIST FIRST_LINE PRIMARY PRIMARY_TOP PRIMARY_MEMORY TARGET_MEMORY
  local EXTENSION_SOURCE EXTENSION_COUNT
  [ -n "$TARGET" ] || { echo "✗ --guards requires a target directory" >&2; exit 1; }
  [ -d "$TARGET" ] || { echo "✗ --guards target is not a directory: $TARGET" >&2; exit 1; }
  TARGET="$(cd "$TARGET" && pwd -P)"

  if ! TOP="$(git -C "$TARGET" rev-parse --show-toplevel 2>/dev/null)"; then
    echo "✗ --guards target is not a git worktree: $TARGET" >&2
    exit 1
  fi
  TOP="$(cd "$TOP" && pwd -P)"
  [ "$TARGET" = "$TOP" ] || { echo "✗ --guards target must be a worktree root: $TARGET" >&2; exit 1; }

  if ! WORKTREE_LIST="$(git -C "$TARGET" worktree list --porcelain 2>&1)"; then
    echo "✗ could not locate the primary checkout for $TARGET: $WORKTREE_LIST" >&2
    exit 1
  fi
  FIRST_LINE="${WORKTREE_LIST%%$'\n'*}"
  case "$FIRST_LINE" in
    "worktree "*) PRIMARY="${FIRST_LINE#worktree }" ;;
    *) echo "✗ git returned an invalid worktree list for $TARGET" >&2; exit 1 ;;
  esac
  [ -d "$PRIMARY" ] || { echo "✗ primary checkout is not a directory: $PRIMARY" >&2; exit 1; }
  PRIMARY="$(cd "$PRIMARY" && pwd -P)"
  if ! PRIMARY_TOP="$(git -C "$PRIMARY" rev-parse --show-toplevel 2>/dev/null)"; then
    echo "✗ primary worktree entry is not a checkout: $PRIMARY" >&2
    exit 1
  fi
  PRIMARY_TOP="$(cd "$PRIMARY_TOP" && pwd -P)"
  [ "$PRIMARY" = "$PRIMARY_TOP" ] || { echo "✗ invalid primary checkout root: $PRIMARY" >&2; exit 1; }
  [ "$TARGET" != "$PRIMARY" ] || {
    echo "✗ --guards target is the primary checkout; refusing to replace its memory: $TARGET" >&2
    exit 1
  }

  prepare_local_extensions_dir "$TARGET"

  if [ -L "$PRIMARY/memory" ] && [ ! -e "$PRIMARY/memory" ]; then
    echo "✗ primary memory symlink is broken: $PRIMARY/memory" >&2
    exit 1
  elif [ -e "$PRIMARY/memory" ] && [ ! -d "$PRIMARY/memory" ]; then
    echo "✗ primary memory path is not a directory: $PRIMARY/memory" >&2
    exit 1
  fi
  mkdir -p "$PRIMARY/memory"
  PRIMARY_MEMORY="$(cd "$PRIMARY/memory" && pwd -P)"

  if [ -L "$TARGET/memory" ]; then
    if ! TARGET_MEMORY="$(cd "$TARGET/memory" 2>/dev/null && pwd -P)"; then
      echo "✗ target memory symlink is broken; refusing to overwrite it: $TARGET/memory" >&2
      exit 1
    fi
    [ "$TARGET_MEMORY" = "$PRIMARY_MEMORY" ] || {
      echo "✗ target memory symlink points elsewhere; refusing to overwrite it: $TARGET/memory" >&2
      exit 1
    }
  elif [ -e "$TARGET/memory" ]; then
    echo "✗ target memory path already exists; refusing to overwrite it: $TARGET/memory" >&2
    exit 1
  else
    ln -s "$PRIMARY_MEMORY" "$TARGET/memory"
  fi

  EXTENSION_COUNT=0
  for EXTENSION_SOURCE in "$HERE"/extensions/*; do
    if [ "$(basename "$EXTENSION_SOURCE")" = "worktree-canary" ]; then
      continue
    fi
    cp -r "$EXTENSION_SOURCE" "$TARGET/.pi/extensions/"
    EXTENSION_COUNT=$((EXTENSION_COUNT + 1))
  done
  echo "  · extensions → .pi/extensions/ ($EXTENSION_COUNT local guards; global canary excluded)"
  echo "  · memory → $PRIMARY_MEMORY (shared)"
}

# --- optional Structurizr path -------------------------------------------------------
# Activation is explicit and removal is data-preserving. An ordinary install touches none
# of this and performs no Docker or Bun probe.

STRUCTURIZR_BLOCK_START="# >>> structurizr (managed by install.sh) >>>"
STRUCTURIZR_BLOCK_END="# <<< structurizr (managed by install.sh) <<<"

# The closed kit-owned inventory. The team-owned model is deliberately not in this list.
structurizr_kit_files() {
  cat <<'LIST'
justfile.structurizr
tools/structurizr-source.ts
tools/structurizr-fs.ts
tools/structurizr-docker.ts
tools/structurizr-verify.ts
tools/structurizr-render.ts
tools/structurizr-probe.ts
tools/structurizr-pin.ts
tools/structurizr/pin.json
tools/structurizr/pin-evidence.md
tools/vendor/structurizr-xml/NOTICE.md
tools/vendor/structurizr-xml/node_modules/saxes/saxes.js
tools/vendor/structurizr-xml/node_modules/saxes/package.json
tools/vendor/structurizr-xml/node_modules/xmlchars/package.json
tools/vendor/structurizr-xml/node_modules/xmlchars/LICENSE
tools/vendor/structurizr-xml/node_modules/xmlchars/xml/1.0/ed5.js
tools/vendor/structurizr-xml/node_modules/xmlchars/xml/1.1/ed2.js
tools/vendor/structurizr-xml/node_modules/xmlchars/xmlns/1.0/ed3.js
LIST
}

# Refresh one kit-owned file by same-directory temporary write plus atomic rename.
structurizr_refresh_file() {
  local src="$1" dst="$2"
  [ -e "$dst" ] && [ "$src" -ef "$dst" ] && return 0
  mkdir -p "$(dirname "$dst")"
  local tmp="$dst.install-tmp.$$"
  cp "$src" "$tmp"
  mv -f "$tmp" "$dst"
}

# Rewrite a managed block exactly once, preserving everything outside it.
structurizr_write_block() {
  local file="$1" body="$2"
  mkdir -p "$(dirname "$file")"
  [ -f "$file" ] || : > "$file"
  local tmp="$file.install-tmp.$$"
  awk -v s="$STRUCTURIZR_BLOCK_START" -v e="$STRUCTURIZR_BLOCK_END" '
    $0 == s { skip = 1 } skip == 0 { print } $0 == e { skip = 0 }
  ' "$file" > "$tmp"
  { printf '%s\n' "$STRUCTURIZR_BLOCK_START"
    printf '%s\n' "$body"
    printf '%s\n' "$STRUCTURIZR_BLOCK_END"
  } >> "$tmp"
  mv -f "$tmp" "$file"
}

structurizr_remove_block() {
  local file="$1"
  [ -f "$file" ] || return 0
  local tmp="$file.install-tmp.$$"
  awk -v s="$STRUCTURIZR_BLOCK_START" -v e="$STRUCTURIZR_BLOCK_END" '
    $0 == s { skip = 1 } skip == 0 { print } $0 == e { skip = 0 }
  ' "$file" > "$tmp"
  mv -f "$tmp" "$file"
}

install_structurizr() {
  local TARGET="$1"
  echo "→ Enabling the optional Structurizr path in $TARGET"

  local rel
  for rel in $(structurizr_kit_files); do
    structurizr_refresh_file "$HERE/$rel" "$TARGET/$rel"
  done
  # The consumer workflow ships from the template, not from a same-named repo path.
  structurizr_refresh_file "$HERE/templates/structurizr/structurizr.yml" \
    "$TARGET/.github/workflows/structurizr.yml"
  echo "  · kit-owned Structurizr inventory refreshed"

  # The model is team-owned: seed only when absent, never replace.
  local model="$TARGET/docs/architecture/structurizr/workspace.dsl"
  if [ -f "$model" ]; then
    echo "  · model kept (already present, byte-for-byte)"
  else
    mkdir -p "$(dirname "$model")"
    cp "$HERE/templates/structurizr/workspace.dsl" "$model"
    echo "  · seeded docs/architecture/structurizr/workspace.dsl"
  fi

  local hostjf=""
  for cand in justfile Justfile; do [ -f "$TARGET/$cand" ] && { hostjf="$cand"; break; }; done
  [ -n "$hostjf" ] || hostjf="justfile"
  structurizr_write_block "$TARGET/$hostjf" 'import "justfile.structurizr"'
  echo "  · $hostjf imports justfile.structurizr"

  structurizr_write_block "$TARGET/.gitignore" '/build/architecture/structurizr/
/build/architecture/.structurizr-lock
/build/architecture/.structurizr-stage-*/'
  echo "  · three exact ignore rules written"

  cat <<'EOF'

✓ Structurizr path enabled
  Prerequisites: a native linux/amd64 or linux/arm64 Docker engine, and bun 1.3.14.
  Render:  just structurizr-render
  Clean:   just structurizr-clean
  Mermaid remains the default; this never satisfies a Mermaid gate.
EOF
}

remove_structurizr() {
  local TARGET="$1"
  echo "→ Removing the optional Structurizr path from $TARGET"

  # Refuse while generated state could still be live.
  local parent="$TARGET/build/architecture"
  if [ -e "$parent/.structurizr-lock" ]; then
    echo "✗ a Structurizr lock still exists; run 'just structurizr-clean' first" >&2; exit 1
  fi
  if [ -e "$parent/structurizr" ]; then
    echo "✗ generated output still exists; run 'just structurizr-clean' first" >&2; exit 1
  fi
  if ls -d "$parent"/.structurizr-stage-* >/dev/null 2>&1; then
    echo "✗ a Structurizr stage still exists; run 'just structurizr-clean' first" >&2; exit 1
  fi

  local rel
  for rel in $(structurizr_kit_files); do
    rm -f "$TARGET/$rel"
  done
  rm -f "$TARGET/.github/workflows/structurizr.yml"
  rm -rf "$TARGET/tools/vendor/structurizr-xml"
  rmdir "$TARGET/tools/structurizr" 2>/dev/null || true

  local hostjf=""
  for cand in justfile Justfile; do [ -f "$TARGET/$cand" ] && { hostjf="$cand"; break; }; done
  [ -n "$hostjf" ] && structurizr_remove_block "$TARGET/$hostjf"
  structurizr_remove_block "$TARGET/.gitignore"

  local model="$TARGET/docs/architecture/structurizr/workspace.dsl"
  if [ -f "$model" ]; then
    echo "  · retained team-owned model: docs/architecture/structurizr/workspace.dsl"
  fi
  echo "✓ Structurizr path removed (idempotent; no Docker or Bun call was made)"
}

install_project() {
  local TARGET="${1:-$PWD}"
  [ -d "$TARGET" ] || { echo "✗ --here target is not a directory: $TARGET" >&2; exit 1; }
  TARGET="$(cd "$TARGET" && pwd)"
  echo "→ Installing project-scoped harness into $TARGET"

  prepare_local_extensions_dir "$TARGET"

  # The tracked root marker is kit-owned. Preserve any unrelated file already using its name.
  [ -f "$HERE/.harness-marker" ] || {
    echo "✗ harness source marker is missing or not a regular file: $HERE/.harness-marker" >&2
    exit 1
  }
  if [ -e "$TARGET/.harness-marker" ] || [ -L "$TARGET/.harness-marker" ]; then
    if [ -f "$TARGET/.harness-marker" ] && [ ! -L "$TARGET/.harness-marker" ] \
       && cmp -s "$HERE/.harness-marker" "$TARGET/.harness-marker"; then
      echo "  · .harness-marker kept (already installed)"
    else
      echo "✗ .harness-marker already exists with different content or type; refusing to overwrite it" >&2
      exit 1
    fi
  else
    cp "$HERE/.harness-marker" "$TARGET/.harness-marker"
    echo "  · installed .harness-marker"
  fi

  # 1. Extensions (project-local structural guards) → <repo>/.pi/extensions/.
  # worktree-canary is intentionally global so a bare worktree cannot omit it.
  EXTENSION_COUNT=0
  for EXTENSION_SOURCE in "$HERE"/extensions/*; do
    if [ "$(basename "$EXTENSION_SOURCE")" = "worktree-canary" ]; then
      continue
    fi
    cp -r "$EXTENSION_SOURCE" "$TARGET/.pi/extensions/"
    EXTENSION_COUNT=$((EXTENSION_COUNT + 1))
  done
  echo "  · extensions → .pi/extensions/ ($EXTENSION_COUNT local guards; global canary excluded)"

  # 2. Tools (retrieval + audit + trust + goals engines) → <repo>/tools/
  mkdir -p "$TARGET/tools"
  safe_cp "$HERE"/tools/select-learnings.ts "$HERE"/tools/audit-learnings.ts \
     "$HERE"/tools/trust.ts "$HERE"/tools/verify-goals.ts "$HERE"/tools/session-cost.ts \
     "$HERE"/tools/assess-tool-events.ts "$HERE"/tools/waf-grounding.ts \
     "$HERE"/tools/arch-lint.ts "$HERE"/tools/check-doc-contracts.ts "$HERE"/tools/pylib.ts \
     "$HERE"/tools/architecture-html.ts "$HERE"/tools/architecture.template.html \
     "$HERE"/tools/evolution-timeline.ts "$HERE"/tools/evolution-timeline.template.html \
     "$HERE"/tools/diff-gate.ts "$HERE"/tools/claim-scan.ts "$TARGET/tools/"
  mkdir -p "$TARGET/tools/lib"
  safe_cp "$HERE"/tools/lib/theme.ts "$HERE"/tools/lib/theme.css \
     "$HERE"/tools/lib/mermaid.min.js "$HERE"/tools/lib/mermaid.pin.json \
     "$HERE"/tools/lib/ledger-lock.ts "$TARGET/tools/lib/"
  echo "  · tools → tools/ (select-learnings, audit-learnings, trust, verify-goals, session-cost, assess-tool-events, waf-grounding, arch-lint, check-doc-contracts, pylib, architecture-html, evolution-timeline, diff-gate, claim-scan + templates + shared theme + ledger lock)"

  # 3. OpenSpec dev-reviewer schema + config. A repo has exactly ONE schema; if this repo
  #    already uses a different one, the dev-reviewer apply flow is mutually exclusive with
  #    it — so install neither the schema nor the config (guards + learning loop still work).
  cfg="$TARGET/openspec/config.yaml"
  if [ ! -f "$cfg" ]; then
    mkdir -p "$TARGET/openspec/schemas"
    [ "$HERE/openspec/schemas/dev-reviewer" -ef "$TARGET/openspec/schemas/dev-reviewer" ] \
      || cp -r "$HERE"/openspec/schemas/dev-reviewer "$TARGET/openspec/schemas/"
    echo "schema: dev-reviewer" > "$cfg"
    echo "  · openspec: wrote config.yaml (schema: dev-reviewer) + copied schema"
  elif grep -q "schema: dev-reviewer" "$cfg"; then
    mkdir -p "$TARGET/openspec/schemas"
    [ "$HERE/openspec/schemas/dev-reviewer" -ef "$TARGET/openspec/schemas/dev-reviewer" ] \
      || cp -r "$HERE"/openspec/schemas/dev-reviewer "$TARGET/openspec/schemas/"
    echo "  · openspec: already on dev-reviewer (schema refreshed)"
  else
    existing="$(grep -E '^schema:' "$cfg" | head -1 | sed 's/^schema:[[:space:]]*//')"
    echo "  · openspec: repo is on schema '${existing:-unknown}' — dev-reviewer is mutually"
    echo "    exclusive with it, so schema + config were NOT installed. Guards, learning loop,"
    echo "    and recipes work regardless; migrate to dev-reviewer separately for /opsx-loop."
  fi

  # 4. AGENTS.md + learnings/ store — data files, so NEVER clobber (cp -n)
  cp -n "$HERE"/templates/AGENTS.md "$TARGET/AGENTS.md" 2>/dev/null && echo "  · scaffolded AGENTS.md" || echo "  · AGENTS.md kept (already present)"
  mkdir -p "$TARGET/learnings"
  cp -n "$HERE"/learnings/_TEMPLATE.md "$TARGET/learnings/_TEMPLATE.md" 2>/dev/null || true
  cp -n "$HERE"/learnings/README.md   "$TARGET/learnings/README.md"   2>/dev/null || true
  echo "  · learnings/ store scaffolded (_TEMPLATE.md, README.md; existing entries kept)"

  # 4b. Standing-goals store — same non-clobber rules (finished-work invariants).
  mkdir -p "$TARGET/goals"
  cp -n "$HERE"/goals/_TEMPLATE.md "$TARGET/goals/_TEMPLATE.md" 2>/dev/null || true
  cp -n "$HERE"/goals/README.md    "$TARGET/goals/README.md"    2>/dev/null || true
  echo "  · goals/ store scaffolded (re-verified invariants; existing goals kept)"

  # 5. Justfile recipes: ship justfile.opsx (which has NO default recipe) + import — never
  #    overwrite the host justfile. Detect Justfile/justfile (case varies) so we append once.
  safe_cp "$HERE"/justfile.opsx "$TARGET/justfile.opsx"
  hostjf=""
  for cand in justfile Justfile; do [ -f "$TARGET/$cand" ] && { hostjf="$cand"; break; }; done
  if [ -z "$hostjf" ]; then
    printf 'import "justfile.opsx"\n' > "$TARGET/justfile"
    echo "  · created justfile importing justfile.opsx"
  elif grep -q "justfile.opsx" "$TARGET/$hostjf"; then
    echo "  · $hostjf already imports justfile.opsx"
  else
    printf '\nimport "justfile.opsx"\n' >> "$TARGET/$hostjf"
    echo "  · appended import to your $hostjf"
  fi

  # 6. Verify the guards are load-clean in place, then print next steps
  if ( cd "$TARGET" && command -v just >/dev/null 2>&1 && just check-extensions ); then :; else
    echo "  ⚠ could not confirm check-extensions (install just, or run it manually in the repo)"
  fi
  cat <<EOF

✓ Project harness installed into $TARGET
  Next:
    • Trust this project in pi so it loads .pi/extensions/ (pi prompts on first run there).
    • Scaffold a change, then:  just next <change>   shows what to run next.
    • Drive it:  /opsx-loop <change>  →  /opsx-retro <change>  →  just archive-check <change>.
EOF
}

MODE="global"; TGT=""; WITH_STRUCTURIZR=0; REMOVE_STRUCTURIZR=0
while [ $# -gt 0 ]; do
  case "$1" in
    --here|--project) MODE="project"; shift; [ $# -gt 0 ] && case "$1" in --*) ;; *) TGT="$1"; shift;; esac ;;
    --all) MODE="all"; shift; [ $# -gt 0 ] && case "$1" in --*) ;; *) TGT="$1"; shift;; esac ;;
    --guards)
      [ "$MODE" = "global" ] || { echo "✗ --guards cannot be combined with another install mode" >&2; exit 1; }
      MODE="guards"; shift
      [ $# -gt 0 ] || { echo "✗ --guards requires a target directory" >&2; exit 1; }
      case "$1" in --*) echo "✗ --guards requires a target directory" >&2; exit 1 ;; esac
      TGT="$1"; shift
      [ $# -eq 0 ] || { echo "unknown arg: $1 (try --help)" >&2; exit 1; }
      ;;
    --with-structurizr) WITH_STRUCTURIZR=1; shift ;;
    --remove-structurizr) REMOVE_STRUCTURIZR=1; shift ;;
    -h|--help) grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown arg: $1 (try --help)" >&2; exit 1 ;;
  esac
done

if [ "$WITH_STRUCTURIZR" -eq 1 ] && [ "$REMOVE_STRUCTURIZR" -eq 1 ]; then
  echo "✗ --with-structurizr and --remove-structurizr are mutually exclusive" >&2; exit 1
fi
if { [ "$WITH_STRUCTURIZR" -eq 1 ] || [ "$REMOVE_STRUCTURIZR" -eq 1 ]; } \
   && [ "$MODE" != "project" ] && [ "$MODE" != "all" ]; then
  echo "✗ the Structurizr flags require --here <repo>" >&2; exit 1
fi

case "$MODE" in
  global)  install_global ;;
  project) install_project "$TGT" ;;
  all)     install_global; echo; install_project "$TGT" ;;
  guards)  install_guards "$TGT" ;;
esac

if [ "$WITH_STRUCTURIZR" -eq 1 ] || [ "$REMOVE_STRUCTURIZR" -eq 1 ]; then
  RESOLVED="${TGT:-$PWD}"
  RESOLVED="$(cd "$RESOLVED" && pwd)"
  echo
  if [ "$WITH_STRUCTURIZR" -eq 1 ]; then install_structurizr "$RESOLVED"; else remove_structurizr "$RESOLVED"; fi
fi
