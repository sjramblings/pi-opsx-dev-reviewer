#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

corpus="$work/corpus"
mkdir -p "$corpus/data/best-practices"

write_bp() {
    local id="$1"
    local risk="$2"
    local title="$3"
    local hash="$4"
    local url="https://docs.aws.amazon.com/wellarchitected/latest/framework/${id}.html"
    cat > "$corpus/data/best-practices/$id.md" <<MD
---
id: $id
pillar: security
pillar_question: ${id%-BP*}
title: $title
risk_level: $risk
source_url: >-
  $url
scraped_at: '2026-07-17'
source: Amazon Web Services — docs.aws.amazon.com
licence: © Amazon Web Services. Reproduced under AWS documentation terms — see NOTICE.
content_hash: '$hash'
extraction_warnings: []
sections_present:
  statement: true
---
# $id — $title

## Statement

Fixture statement.
MD
}

write_bp SEC01-BP02 HIGH 'Secure account root user and properties' 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
write_bp REL01-BP02 HIGH 'Manage service quotas across accounts and regions' 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
write_bp COST01-BP01 LOW 'Develop cost optimization function' 'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc'

cat > "$corpus/data/_meta.json" <<'JSON'
{
  "generated_at": "2026-07-17T00:00:00.000Z",
  "framework_source": "https://docs.aws.amazon.com/wellarchitected/latest/framework/",
  "bp_count": 3,
  "pillar_count": 6,
  "content_hash": "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
  "best_practices": {
    "SEC01-BP02": "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "REL01-BP02": "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    "COST01-BP01": "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
  }
}
JSON
cat > "$corpus/data/aws-well-architected.json" <<'JSON'
{
  "pillars": [],
  "best_practices": [
    {"id": "SEC01-BP02"},
    {"id": "REL01-BP02"},
    {"id": "COST01-BP01"}
  ]
}
JSON

cd "$root"

echo '== default discovery ignores repo-local stale skills corpus and uses HOME skill corpus =='
shadow_repo="$work/shadow-repo"
stale_corpus="$shadow_repo/skills/pi-skill-wellarchitected/references/aws-well-architected-corpus"
stale_review_corpus="$shadow_repo/skills/aws-well-architected-review/references/aws-well-architected-corpus"
home_for_discovery="$work/home-skill-corpus"
home_skill_corpus="$home_for_discovery/.pi/agent/skills/aws-well-architected-review/references/aws-well-architected-corpus"
mkdir -p "$stale_corpus/data/best-practices" "$(dirname "$stale_review_corpus")" "$(dirname "$home_skill_corpus")"
cp -R "$corpus" "$home_skill_corpus"
cat > "$stale_corpus/data/best-practices/OPS01-BP01.md" <<'MD'
---
id: OPS01-BP01
pillar: operational-excellence
pillar_question: OPS01
title: Evaluate external customer needs
risk_level: HIGH
source_url: >-
  https://docs.aws.amazon.com/wellarchitected/latest/framework/OPS01-BP01.html
scraped_at: '2026-07-17'
source: Amazon Web Services — docs.aws.amazon.com
licence: © Amazon Web Services. Reproduced under AWS documentation terms — see NOTICE.
content_hash: 'sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
extraction_warnings: []
sections_present:
  statement: true
---
# OPS01-BP01 — Evaluate external customer needs

## Statement

Stale fixture statement.
MD
cat > "$stale_corpus/data/_meta.json" <<'JSON'
{
  "generated_at": "2026-07-16T00:00:00.000Z",
  "framework_source": "https://docs.aws.amazon.com/wellarchitected/latest/framework/",
  "bp_count": 1,
  "pillar_count": 6,
  "content_hash": "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
  "best_practices": {
    "OPS01-BP01": "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
  }
}
JSON
cat > "$stale_corpus/data/aws-well-architected.json" <<'JSON'
{"pillars": [], "best_practices": [{"id": "OPS01-BP01"}]}
JSON
cp -R "$stale_corpus" "$stale_review_corpus"
default_discovery_output=$(cd "$shadow_repo" && HOME="$home_for_discovery" bun "$root/tools/waf-grounding.ts" resolve --format json SEC01-BP02)
printf '%s\n' "$default_discovery_output"
grep -q 'SEC01-BP02' <<< "$default_discovery_output"
grep -q "$home_skill_corpus" <<< "$default_discovery_output"
for shadow in "$stale_corpus" "$stale_review_corpus"; do
    if grep -q "$shadow" <<< "$default_discovery_output"; then
        echo 'repo-local skills corpus overrode the HOME skill corpus during default discovery' >&2
        exit 1
    fi
done
echo '== discovered HOME lookup is invoked when it matches the discovered corpus =='
home_lookup="$home_for_discovery/.pi/agent/skills/aws-well-architected-review/scripts/wa_lookup.py"
home_lookup_marker="$work/home-lookup-invocations.txt"
mkdir -p "$(dirname "$home_lookup")"
cat > "$home_lookup" <<PY
#!/usr/bin/env python3
import pathlib
import sys
pathlib.Path(r"$home_lookup_marker").write_text(" ".join(sys.argv[1:]), encoding="utf-8")
if len(sys.argv) >= 3 and sys.argv[1] == "bp" and sys.argv[2].upper() == "SEC01-BP02":
    print("SEC01-BP02 | security | risk=HIGH")
    raise SystemExit(0)
print("home fake lookup cannot resolve", file=sys.stderr)
raise SystemExit(7)
PY
chmod +x "$home_lookup"
discovered_lookup_output=$(cd "$shadow_repo" && HOME="$home_for_discovery" bun "$root/tools/waf-grounding.ts" resolve --format json SEC01-BP02)
printf '%s\n' "$discovered_lookup_output"
grep -q 'SEC01-BP02' <<< "$discovered_lookup_output"
grep -q 'bp SEC01-BP02' "$home_lookup_marker"

echo '== mixed HOME installs prefer the discovered lookup adjacent corpus over an earlier corpus =='
mixed_home="$work/mixed-home-installs"
orphan_first_corpus="$mixed_home/.pi/agent/skills/pi-skill-wellarchitected/references/aws-well-architected-corpus"
matched_review_corpus="$mixed_home/.pi/agent/skills/aws-well-architected-review/references/aws-well-architected-corpus"
matched_review_lookup="$mixed_home/.pi/agent/skills/aws-well-architected-review/scripts/wa_lookup.py"
matched_review_marker="$work/matched-review-lookup-invocations.txt"
mkdir -p "$(dirname "$orphan_first_corpus")" "$(dirname "$matched_review_corpus")" "$(dirname "$matched_review_lookup")"
cp -R "$stale_corpus" "$orphan_first_corpus"
cp -R "$corpus" "$matched_review_corpus"
cat > "$matched_review_lookup" <<PY
#!/usr/bin/env python3
import pathlib
import sys
pathlib.Path(r"$matched_review_marker").write_text(" ".join(sys.argv[1:]), encoding="utf-8")
if len(sys.argv) >= 3 and sys.argv[1] == "bp" and sys.argv[2].upper() == "SEC01-BP02":
    print("SEC01-BP02 | security | risk=HIGH")
    raise SystemExit(0)
print("matched review fake lookup cannot resolve", file=sys.stderr)
raise SystemExit(7)
PY
chmod +x "$matched_review_lookup"
mixed_discovery_output=$(HOME="$mixed_home" bun "$root/tools/waf-grounding.ts" resolve --format json SEC01-BP02)
printf '%s\n' "$mixed_discovery_output"
grep -q 'SEC01-BP02' <<< "$mixed_discovery_output"
grep -q 'bp SEC01-BP02' "$matched_review_marker"
grep -q "$matched_review_corpus" <<< "$mixed_discovery_output"
if grep -q "$orphan_first_corpus" <<< "$mixed_discovery_output"; then
    echo 'default discovery selected the earlier orphan corpus instead of the lookup-adjacent corpus' >&2
    exit 1
fi

mkdir -p "$shadow_repo/skills/aws-well-architected-review/scripts"
printf '%s\n' '#!/usr/bin/env python3' 'raise SystemExit(0)' > "$shadow_repo/skills/aws-well-architected-review/scripts/wa_lookup.py"
chmod +x "$shadow_repo/skills/aws-well-architected-review/scripts/wa_lookup.py"
echo '== explicit repo-local lookup does not shadow HOME corpus and fails as a mismatch =='
set +e
explicit_lookup_default_output=$(cd "$shadow_repo" && HOME="$home_for_discovery" bun "$root/tools/waf-grounding.ts" --lookup "$shadow_repo/skills/aws-well-architected-review/scripts/wa_lookup.py" resolve --format json SEC01-BP02 2>&1)
explicit_lookup_default_status=$?
set -e
printf '%s\n' "$explicit_lookup_default_output"
if [ "$explicit_lookup_default_status" -eq 0 ]; then
    echo 'expected repo-local lookup with different selected corpus to fail, but it exited 0' >&2
    exit 1
fi
grep -q 'configuration-mismatch' <<< "$explicit_lookup_default_output"
grep -q "$home_skill_corpus" <<< "$explicit_lookup_default_output"
grep -q "$stale_review_corpus" <<< "$explicit_lookup_default_output"
if grep -q '"best_practices"' <<< "$explicit_lookup_default_output"; then
    echo 'mismatched repo-local lookup emitted claim metadata' >&2
    exit 1
fi
echo '== explicit --corpus-dir may still use repo-local corpus when its adjacent lookup exists =='
stale_lookup="$shadow_repo/skills/pi-skill-wellarchitected/scripts/wa_lookup.py"
mkdir -p "$(dirname "$stale_lookup")"
cat > "$stale_lookup" <<'PY'
#!/usr/bin/env python3
import sys
if len(sys.argv) >= 3 and sys.argv[1] == "bp" and sys.argv[2].upper() == "OPS01-BP01":
    print("OPS01-BP01 | operational-excellence | risk=HIGH")
    raise SystemExit(0)
print("stale fake lookup cannot resolve", file=sys.stderr)
raise SystemExit(7)
PY
chmod +x "$stale_lookup"
explicit_repo_local_output=$(cd "$shadow_repo" && HOME="$home_for_discovery" bun "$root/tools/waf-grounding.ts" --corpus-dir "$stale_corpus" scope)
printf '%s\n' "$explicit_repo_local_output"
grep -q 'OPS01-BP01' <<< "$explicit_repo_local_output"
grep -q 'Assessed best practices: 1' <<< "$explicit_repo_local_output"
if grep -q 'SEC01-BP02' <<< "$explicit_repo_local_output"; then
    echo 'explicit repo-local corpus was not used for scope selection' >&2
    exit 1
fi

echo '== unresolvable identifier exits non-zero and names the identifier =='
set +e
unresolvable_output=$(ARCH_WAF_CORPUS_DIR="$corpus" bun tools/waf-grounding.ts resolve SEC99-BP99 2>&1)
unresolvable_status=$?
set -e
printf '%s\n' "$unresolvable_output"
if [ "$unresolvable_status" -eq 0 ]; then
    echo 'expected unresolvable identifier to fail, but it exited 0' >&2
    exit 1
fi
grep -q 'unresolvable identifier' <<< "$unresolvable_output"
grep -q 'SEC99-BP99' <<< "$unresolvable_output"

missing_lookup="$work/missing-wa-lookup.py"
echo '== explicit missing lookup path exits non-zero and names the path =='
set +e
missing_lookup_cli_output=$(bun tools/waf-grounding.ts --lookup "$missing_lookup" resolve SEC01-BP02 2>&1)
missing_lookup_cli_status=$?
missing_lookup_arch_waf_output=$(ARCH_WAF_CORPUS_DIR="$corpus" ARCH_WAF_LOOKUP="$missing_lookup" bun tools/waf-grounding.ts resolve SEC01-BP02 2>&1)
missing_lookup_arch_waf_status=$?
missing_lookup_arch_lint_output=$(ARCH_WAF_CORPUS_DIR="$corpus" ARCH_LINT_WA_LOOKUP="$missing_lookup" bun tools/waf-grounding.ts resolve SEC01-BP02 2>&1)
missing_lookup_arch_lint_status=$?
set -e
printf '%s\n' "$missing_lookup_cli_output"
printf '%s\n' "$missing_lookup_arch_waf_output"
printf '%s\n' "$missing_lookup_arch_lint_output"
for status in "$missing_lookup_cli_status" "$missing_lookup_arch_waf_status" "$missing_lookup_arch_lint_status"; do
    if [ "$status" -eq 0 ]; then
        echo 'expected missing explicit lookup path to fail, but it exited 0' >&2
        exit 1
    fi
done
for output in "$missing_lookup_cli_output" "$missing_lookup_arch_waf_output" "$missing_lookup_arch_lint_output"; do
    grep -q 'lookup-misconfigured' <<< "$output"
    grep -q "$missing_lookup" <<< "$output"
done

fake_lookup="$work/failing-wa-lookup.py"
cat > "$fake_lookup" <<'PY'
#!/usr/bin/env python3
import sys
print("fake lookup intentionally cannot resolve this ID", file=sys.stderr)
raise SystemExit(7)
PY
chmod +x "$fake_lookup"
echo '== explicit lookup outside a skill install fails configuration instead of bypassing lookup =='
set +e
mismatched_lookup_output=$(bun tools/waf-grounding.ts --corpus-dir "$corpus" --lookup "$fake_lookup" resolve --format json SEC01-BP02 2>&1)
mismatched_lookup_status=$?
set -e
printf '%s\n' "$mismatched_lookup_output"
if [ "$mismatched_lookup_status" -eq 0 ]; then
    echo 'expected lookup outside a skill install to fail, but it exited 0' >&2
    exit 1
fi
grep -q 'lookup-misconfigured' <<< "$mismatched_lookup_output"
if grep -q '"best_practices"' <<< "$mismatched_lookup_output"; then
    echo 'misconfigured lookup emitted claim metadata' >&2
    exit 1
fi

echo '== consistent successful lookup is invoked for identifier resolution =='
fake_skill="$work/fake-skill"
fake_skill_corpus="$fake_skill/references/aws-well-architected-corpus"
fake_skill_lookup="$fake_skill/scripts/wa_lookup.py"
fake_lookup_marker="$work/fake-lookup-invocations.txt"
mkdir -p "$fake_skill/scripts" "$(dirname "$fake_skill_corpus")"
cp -R "$corpus" "$fake_skill_corpus"
cat > "$fake_skill_lookup" <<PY
#!/usr/bin/env python3
import pathlib
import sys
pathlib.Path(r"$fake_lookup_marker").write_text(" ".join(sys.argv[1:]), encoding="utf-8")
if len(sys.argv) >= 3 and sys.argv[1] == "bp" and sys.argv[2].upper() == "SEC01-BP02":
    print("SEC01-BP02 | security | risk=HIGH")
    raise SystemExit(0)
print("fake lookup cannot resolve", file=sys.stderr)
raise SystemExit(7)
PY
chmod +x "$fake_skill_lookup"
consistent_lookup_output=$(bun tools/waf-grounding.ts --corpus-dir "$fake_skill_corpus" --lookup "$fake_skill_lookup" resolve --format json SEC01-BP02)
printf '%s\n' "$consistent_lookup_output"
grep -q 'SEC01-BP02' <<< "$consistent_lookup_output"
grep -q 'bp SEC01-BP02' "$fake_lookup_marker"

: > "$fake_lookup_marker"
echo '== explicit skill corpus auto-discovers adjacent successful lookup =='
adjacent_lookup_output=$(bun tools/waf-grounding.ts --corpus-dir "$fake_skill_corpus" resolve --format json SEC01-BP02)
printf '%s\n' "$adjacent_lookup_output"
grep -q 'SEC01-BP02' <<< "$adjacent_lookup_output"
grep -q 'bp SEC01-BP02' "$fake_lookup_marker"

echo '== explicit skill corpus without adjacent lookup fails configuration =='
no_lookup_skill="$work/no-lookup-skill"
no_lookup_skill_corpus="$no_lookup_skill/references/aws-well-architected-corpus"
mkdir -p "$(dirname "$no_lookup_skill_corpus")"
cp -R "$corpus" "$no_lookup_skill_corpus"
set +e
no_lookup_output=$(bun tools/waf-grounding.ts --corpus-dir "$no_lookup_skill_corpus" resolve --format json SEC01-BP02 2>&1)
no_lookup_status=$?
set -e
printf '%s\n' "$no_lookup_output"
if [ "$no_lookup_status" -eq 0 ]; then
    echo 'expected explicit skill corpus without adjacent lookup to fail, but it exited 0' >&2
    exit 1
fi
grep -q 'lookup-misconfigured' <<< "$no_lookup_output"
grep -q 'wa_lookup.py' <<< "$no_lookup_output"
if grep -q '"best_practices"' <<< "$no_lookup_output"; then
    echo 'explicit skill corpus without adjacent lookup emitted claim metadata' >&2
    exit 1
fi

echo '== explicit corpus and lookup from different installs fail as configuration mismatch =='
set +e
explicit_mismatch_output=$(bun tools/waf-grounding.ts --corpus-dir "$corpus" --lookup "$fake_skill_lookup" resolve --format json SEC01-BP02 2>&1)
explicit_mismatch_status=$?
set -e
printf '%s\n' "$explicit_mismatch_output"
if [ "$explicit_mismatch_status" -eq 0 ]; then
    echo 'expected explicit corpus and lookup from different installs to fail, but it exited 0' >&2
    exit 1
fi
grep -q 'configuration-mismatch' <<< "$explicit_mismatch_output"
grep -q "$corpus" <<< "$explicit_mismatch_output"
grep -q "$fake_skill_corpus" <<< "$explicit_mismatch_output"
if grep -q '"best_practices"' <<< "$explicit_mismatch_output"; then
    echo 'mismatched explicit corpus and lookup emitted claim metadata' >&2
    exit 1
fi

echo '== consistent lookup nonzero fails identifier resolution =='
set +e
consistent_lookup_fail_output=$(bun tools/waf-grounding.ts --corpus-dir "$fake_skill_corpus" --lookup "$fake_skill_lookup" resolve --format json REL01-BP02 2>&1)
consistent_lookup_fail_status=$?
set -e
printf '%s\n' "$consistent_lookup_fail_output"
if [ "$consistent_lookup_fail_status" -eq 0 ]; then
    echo 'expected nonzero lookup helper to fail resolution, but it exited 0' >&2
    exit 1
fi
grep -q 'unresolvable identifier' <<< "$consistent_lookup_fail_output"
grep -q 'lookup helper exited 7' <<< "$consistent_lookup_fail_output"

echo '== explicit skill corpus auto-discovers adjacent failing lookup and fails identifier resolution =='
set +e
adjacent_lookup_fail_output=$(bun tools/waf-grounding.ts --corpus-dir "$fake_skill_corpus" resolve --format json REL01-BP02 2>&1)
adjacent_lookup_fail_status=$?
set -e
printf '%s\n' "$adjacent_lookup_fail_output"
if [ "$adjacent_lookup_fail_status" -eq 0 ]; then
    echo 'expected auto-discovered nonzero lookup helper to fail resolution, but it exited 0' >&2
    exit 1
fi
grep -q 'unresolvable identifier' <<< "$adjacent_lookup_fail_output"
grep -q 'lookup helper exited 7' <<< "$adjacent_lookup_fail_output"

echo '== unsynced corpus reports sync-required and emits no claims =='
unsynced="$work/unsynced-corpus"
mkdir -p "$unsynced/data/best-practices"
cp "$corpus/data/best-practices/SEC01-BP02.md" "$unsynced/data/best-practices/SEC01-BP02.md"
cat > "$unsynced/data/_meta.json" <<'JSON'
{
  "generated_at": "2026-07-17T00:00:00.000Z",
  "bp_count": 2,
  "content_hash": "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
  "best_practices": {
    "SEC01-BP02": "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  }
}
JSON
cat > "$unsynced/data/aws-well-architected.json" <<'JSON'
{"best_practices": [{"id": "SEC01-BP02"}]}
JSON
set +e
unsynced_stdout=$(ARCH_WAF_CORPUS_DIR="$unsynced" bun tools/waf-grounding.ts scope 2> "$work/unsynced.err")
unsynced_status=$?
set -e
cat "$work/unsynced.err"
printf '%s\n' "$unsynced_stdout"
if [ "$unsynced_status" -eq 0 ]; then
    echo 'expected unsynced corpus to fail, but it exited 0' >&2
    exit 1
fi
grep -q 'sync-required' "$work/unsynced.err"
if grep -q '|' <<< "$unsynced_stdout" || grep -q 'SEC01-BP02' <<< "$unsynced_stdout"; then
    echo 'unsynced corpus emitted claim rows' >&2
    exit 1
fi

echo '== HIGH-risk default assesses HIGH set and records the scope =='
default_output=$(ARCH_WAF_CORPUS_DIR="$corpus" bun tools/waf-grounding.ts scope)
printf '%s\n' "$default_output"
grep -q 'Well-Architected scope: HIGH-risk default' <<< "$default_output"
grep -q 'Full sweep: false' <<< "$default_output"
grep -q 'Assessed best practices: 2' <<< "$default_output"
grep -q 'SEC01-BP02' <<< "$default_output"
grep -q 'REL01-BP02' <<< "$default_output"
if grep -q 'COST01-BP01' <<< "$default_output"; then
    echo 'default HIGH-risk scope included a LOW-risk best practice' >&2
    exit 1
fi

echo '== corpus tag is derived from corpus metadata, not ARCH_WAF_CORPUS_TAG =='
spoofed_tag_output=$(ARCH_WAF_CORPUS_DIR="$corpus" ARCH_WAF_CORPUS_TAG=bogus bun tools/waf-grounding.ts scope --format json)
printf '%s\n' "$spoofed_tag_output"
grep -q '"tag": "generated-at:2026-07-17T00:00:00.000Z"' <<< "$spoofed_tag_output"
if grep -q 'bogus' <<< "$spoofed_tag_output"; then
    echo 'ARCH_WAF_CORPUS_TAG overrode derived corpus provenance' >&2
    exit 1
fi

echo '== full-sweep flag assesses every risk level =='
full_output=$(ARCH_WAF_CORPUS_DIR="$corpus" bun tools/waf-grounding.ts scope --full-sweep)
printf '%s\n' "$full_output"
grep -q 'Well-Architected scope: FULL-SWEEP' <<< "$full_output"
grep -q 'Full sweep: true' <<< "$full_output"
grep -q 'Assessed best practices: 3' <<< "$full_output"
grep -q 'COST01-BP01' <<< "$full_output"

write_architecture_fixture() {
    local tree="$1"
    local decisions="$2"
    mkdir -p "$tree" "$decisions"
    cat > "$decisions/0001-record-waf-grounding.md" <<'MD'
# Record WAF grounding

Status: accepted

Rationale: the fixture needs an ADR with rationale so arch-lint can isolate corpus behaviour.
MD
    cat > "$tree/README.md" <<'MD'
# Architecture

Generated from commit fixture, generated on 2026-07-17, using corpus tag fixture and content hash fixture.
MD
    cat > "$tree/01-introduction-and-goals.md" <<'MD'
# Introduction and Goals

Stakeholders: operators and maintainers.
Concerns: security evidence and traceable Well-Architected grounding.
MD
    cat > "$tree/02-constraints.md" <<'MD'
# Constraints

The fixture keeps constraints short.
MD
    cat > "$tree/03-context-and-scope.md" <<'MD'
# Context and Scope

Context view: the system is scoped to this fixture.
MD
    cat > "$tree/04-solution-strategy.md" <<'MD'
# Solution Strategy

- Decision ADR 0001 defines corpus grounding for the architecture gate.
  Trade-off: the fixture accepts temporary files to make corpus behaviour deterministic.
MD
    cat > "$tree/05-building-block-view.md" <<'MD'
# Building Block View

Container view: the fixture has one architecture lint container.
MD
    cat > "$tree/06-runtime-view.md" <<'MD'
# Runtime View

Runtime view: just invokes arch-lint.
MD
    cat > "$tree/07-deployment-view.md" <<'MD'
# Deployment View

Deployment view: local execution only.
MD
    cat > "$tree/08-crosscutting-concepts.md" <<'MD'
# Crosscutting Concepts

- Pattern: local corpus lookup gate. Catalogue: fixture pattern catalogue. Instantiated at justfile.opsx:36.
  Consequence: the fixture accepts local path coupling for a reproducible lint gate.
MD
    cat > "$tree/09-architecture-decisions.md" <<'MD'
# Architecture Decisions

- ADR 0001 Record WAF grounding. Status: accepted. Link: ../../decisions/0001-record-waf-grounding.md
MD
    cat > "$tree/10-quality-requirements.md" <<'MD'
# Quality Requirements

- SEC01-BP02
  Status: met
  Risk: HIGH
  Source: fixture corpus
  Evidence: LICENSE:1
MD
    cat > "$tree/11-risks-and-technical-debt.md" <<'MD'
# Risks and Technical Debt

No decision debt in this fixture.
MD
    cat > "$tree/12-glossary.md" <<'MD'
# Glossary

ADR: architecture decision record.
MD
}

echo '== project install ships tools/waf-grounding.ts =='
installed_repo="$work/installed-repo"
mkdir -p "$installed_repo"
install_output=$(./install.sh --here "$installed_repo" 2>&1)
printf '%s\n' "$install_output"
test -f "$installed_repo/tools/waf-grounding.ts"
grep -q 'waf-grounding' <<< "$install_output"
installed_scope_output=$(cd "$installed_repo" && ARCH_WAF_CORPUS_DIR="$corpus" just waf-grounding scope)
printf '%s\n' "$installed_scope_output"
grep -q 'Well-Architected scope: HIGH-risk default' <<< "$installed_scope_output"

echo '== arch-lint with absent corpus source returns PARTIAL rather than FAIL =='
arch_tree="$work/arch-lint-architecture"
arch_decisions="$work/arch-lint-decisions"
write_architecture_fixture "$arch_tree" "$arch_decisions"
isolated_home="$work/no-corpus-home"
mkdir -p "$isolated_home"
absent_output=$(HOME="$isolated_home" ARCH_LINT_DIR="$arch_tree" ARCH_LINT_DECISIONS_DIR="$arch_decisions" just -f "$root/justfile.opsx" arch-lint 2>&1)
printf '%s\n' "$absent_output"
grep -q 'best-practice identifier resolution: SKIP' <<< "$absent_output"
grep -q 'no corpus source available' <<< "$absent_output"
grep -q 'arch-lint: PARTIAL' <<< "$absent_output"
if grep -q 'arch-lint: FAIL' <<< "$absent_output"; then
    echo 'absent corpus source made arch-lint fail instead of returning PARTIAL' >&2
    exit 1
fi

missing_corpus="$work/does-not-exist"
echo '== explicit missing corpus path is source-missing and arch-lint PARTIAL =='
set +e
missing_scope_output=$(ARCH_WAF_CORPUS_DIR="$missing_corpus" bun tools/waf-grounding.ts scope 2>&1)
missing_scope_status=$?
set -e
printf '%s\n' "$missing_scope_output"
if [ "$missing_scope_status" -ne 3 ]; then
    echo "expected explicit missing corpus path to exit 3, got $missing_scope_status" >&2
    exit 1
fi
grep -q 'source-missing' <<< "$missing_scope_output"
missing_arch_output=$(HOME="$isolated_home" ARCH_LINT_DIR="$arch_tree" ARCH_LINT_DECISIONS_DIR="$arch_decisions" ARCH_LINT_CORPUS_DIR="$missing_corpus" just -f "$root/justfile.opsx" arch-lint 2>&1)
printf '%s\n' "$missing_arch_output"
grep -q 'source-missing' <<< "$missing_arch_output"
grep -q 'arch-lint: PARTIAL' <<< "$missing_arch_output"
if grep -q 'arch-lint: FAIL' <<< "$missing_arch_output"; then
    echo 'explicit missing corpus path made arch-lint fail instead of returning PARTIAL' >&2
    exit 1
fi

ids_file="$work/bp-ids.txt"
printf '%s\n' 'SEC01-BP02' > "$ids_file"
echo '== ARCH_LINT_BP_IDS_FILE does not bypass synced corpus lookup =='
bypass_output=$(HOME="$isolated_home" ARCH_LINT_DIR="$arch_tree" ARCH_LINT_DECISIONS_DIR="$arch_decisions" ARCH_LINT_BP_IDS_FILE="$ids_file" just -f "$root/justfile.opsx" arch-lint 2>&1)
printf '%s\n' "$bypass_output"
grep -q 'best-practice identifier resolution: SKIP' <<< "$bypass_output"
grep -q 'no corpus source available' <<< "$bypass_output"
grep -q 'arch-lint: PARTIAL' <<< "$bypass_output"
if grep -q 'arch-lint: clean' <<< "$bypass_output"; then
    echo 'ARCH_LINT_BP_IDS_FILE bypass produced a clean arch-lint result without a corpus' >&2
    exit 1
fi

echo '== arch-lint with configured unsynced corpus fails sync-required =='
set +e
configured_unsynced_output=$(HOME="$isolated_home" ARCH_LINT_DIR="$arch_tree" ARCH_LINT_DECISIONS_DIR="$arch_decisions" ARCH_LINT_CORPUS_DIR="$unsynced" just -f "$root/justfile.opsx" arch-lint 2>&1)
configured_unsynced_status=$?
set -e
printf '%s\n' "$configured_unsynced_output"
if [ "$configured_unsynced_status" -eq 0 ]; then
    echo 'configured unsynced corpus returned success instead of failing closed' >&2
    exit 1
fi
grep -q 'sync-required' <<< "$configured_unsynced_output"
grep -q 'arch-lint: FAIL' <<< "$configured_unsynced_output"
