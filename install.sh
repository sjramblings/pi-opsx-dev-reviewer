#!/usr/bin/env bash
# Bootstrap the pi developer + reviewer subagent setup.
#
#   ./install.sh            Global (pi-wide) pieces: subagent, agent files, prompt templates.
#   ./install.sh --here [P] Project pieces into repo P (default: current dir): extensions,
#                           tools, dev-reviewer schema, AGENTS.md + learnings/ scaffold, and a
#                           justfile.opsx import. Non-destructive: never clobbers your data.
#   ./install.sh --all [P]  Both.
#
# Idempotent: safe to re-run.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

require_pi() {
  echo "→ Checking pi…"
  command -v pi >/dev/null 2>&1 || { echo "✗ pi not on PATH — install pi first (https://pi.dev)"; exit 1; }
  echo "  pi $(pi --version 2>/dev/null)"
}

install_global() {
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

  # 3. Model sanity check ──────────────────────────────────────────────────────
  echo "→ Verify the agent models resolve on this machine (edit the 'model:' line if not):"
  for m in "gpt-5.5 (architect/developer/architecture-writer)" "gpt-5.4 (reviewer/tech-writer)"; do echo "      openai-codex/$m"; done
  echo "      anthropic/claude-opus-4-8 (spec-reviewer — needs an Anthropic key; repoint if you have none)"
  echo "    List what is available with:  pi --list-models"
  echo
  echo "✓ pi-side (global) setup complete."
}

install_project() {
  local TARGET="${1:-$PWD}"
  [ -d "$TARGET" ] || { echo "✗ --here target is not a directory: $TARGET" >&2; exit 1; }
  TARGET="$(cd "$TARGET" && pwd)"
  echo "→ Installing project-scoped harness into $TARGET"

  # 1. Extensions (all structural guards) → <repo>/.pi/extensions/
  mkdir -p "$TARGET/.pi/extensions"
  cp -r "$HERE"/extensions/* "$TARGET/.pi/extensions/"
  echo "  · extensions → .pi/extensions/ ($(ls -1 "$HERE"/extensions | wc -l | tr -d ' ') guards)"

  # 2. Tools (retrieval + audit + trust + goals engines) → <repo>/tools/
  mkdir -p "$TARGET/tools"
  cp "$HERE"/tools/select-learnings.ts "$HERE"/tools/audit-learnings.ts \
     "$HERE"/tools/trust.ts "$HERE"/tools/verify-goals.ts "$HERE"/tools/session-cost.ts \
     "$HERE"/tools/assess-tool-events.ts "$HERE"/tools/waf-grounding.ts \
     "$HERE"/tools/arch-lint.ts "$HERE"/tools/pylib.ts \
     "$HERE"/tools/architecture-html.ts "$HERE"/tools/architecture.template.html \
     "$HERE"/tools/evolution-timeline.ts "$HERE"/tools/evolution-timeline.template.html "$TARGET/tools/"
  mkdir -p "$TARGET/tools/lib"
  cp "$HERE"/tools/lib/theme.ts "$HERE"/tools/lib/theme.css \
     "$HERE"/tools/lib/mermaid.min.js "$HERE"/tools/lib/mermaid.pin.json "$TARGET/tools/lib/"
  echo "  · tools → tools/ (select-learnings, audit-learnings, trust, verify-goals, session-cost, assess-tool-events, waf-grounding, arch-lint, pylib, architecture-html, evolution-timeline + templates + shared theme)"

  # 3. OpenSpec dev-reviewer schema + config. A repo has exactly ONE schema; if this repo
  #    already uses a different one, the dev-reviewer apply flow is mutually exclusive with
  #    it — so install neither the schema nor the config (guards + learning loop still work).
  cfg="$TARGET/openspec/config.yaml"
  if [ ! -f "$cfg" ]; then
    mkdir -p "$TARGET/openspec/schemas"
    cp -r "$HERE"/openspec/schemas/dev-reviewer "$TARGET/openspec/schemas/"
    echo "schema: dev-reviewer" > "$cfg"
    echo "  · openspec: wrote config.yaml (schema: dev-reviewer) + copied schema"
  elif grep -q "schema: dev-reviewer" "$cfg"; then
    mkdir -p "$TARGET/openspec/schemas"
    cp -r "$HERE"/openspec/schemas/dev-reviewer "$TARGET/openspec/schemas/"
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
  cp "$HERE"/justfile.opsx "$TARGET/justfile.opsx"
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

MODE="global"; TGT=""
while [ $# -gt 0 ]; do
  case "$1" in
    --here|--project) MODE="project"; shift; [ $# -gt 0 ] && case "$1" in --*) ;; *) TGT="$1"; shift;; esac ;;
    --all) MODE="all"; shift; [ $# -gt 0 ] && case "$1" in --*) ;; *) TGT="$1"; shift;; esac ;;
    -h|--help) grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown arg: $1 (try --help)" >&2; exit 1 ;;
  esac
done

case "$MODE" in
  global)  install_global ;;
  project) install_project "$TGT" ;;
  all)     install_global; echo; install_project "$TGT" ;;
esac
