#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

corpus="$work/corpus"
mkdir -p "$corpus/data/best-practices"
cat > "$corpus/data/best-practices/SEC01-BP01.md" <<'MD'
---
id: SEC01-BP01
pillar: security
pillar_question: SEC01
title: Fixture best practice
risk_level: HIGH
source_url: https://docs.aws.amazon.com/wellarchitected/latest/framework/SEC01-BP01.html
scraped_at: '2026-07-17'
source: Amazon Web Services — docs.aws.amazon.com
licence: © Amazon Web Services. Reproduced under AWS documentation terms — see NOTICE.
content_hash: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
extraction_warnings: []
sections_present:
  statement: true
---
# SEC01-BP01 — Fixture best practice

## Statement

Fixture statement.
MD
cat > "$corpus/data/_meta.json" <<'JSON'
{
  "generated_at": "2026-07-17T00:00:00.000Z",
  "bp_count": 1,
  "content_hash": "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  "best_practices": {
    "SEC01-BP01": "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  }
}
JSON
cat > "$corpus/data/aws-well-architected.json" <<'JSON'
{"best_practices": [{"id": "SEC01-BP01"}]}
JSON

decisions="$work/decisions"
mkdir -p "$decisions"
cat > "$decisions/0001-record-runtime-boundary.md" <<'MD'
# Record runtime boundary

Status: accepted

Rationale: the boundary keeps the fixture realistic.
MD
cat > "$decisions/0002-record-gate-boundary.md" <<'MD'
# Record gate boundary

Status: accepted

## Decision Outcome

The gate boundary keeps the fixture realistic.
MD

write_common_sections() {
    local tree="$1"
    mkdir -p "$tree"
    cat > "$tree/README.md" <<'MD'
# Architecture

Generated from commit fixture, generated on 2026-07-17, using corpus tag fixture and content hash fixture.
MD
    cat > "$tree/01-introduction-and-goals.md" <<'MD'
# Introduction and Goals

Stakeholders: operators and maintainers.
Concerns: operability, security evidence, and traceable decisions.
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

- Decision ADR 0001 defines the runtime boundary.
  Trade-off: the fixture accepts a smaller scope to make the check deterministic.
MD
    cat > "$tree/05-building-block-view.md" <<'MD'
# Building Block View

Container view: the fixture has one harness container.
MD
    cat > "$tree/06-runtime-view.md" <<'MD'
# Runtime View

Runtime view: just invokes the lint gate.
MD
    cat > "$tree/07-deployment-view.md" <<'MD'
# Deployment View

Deployment view: local execution only.
MD
    cat > "$tree/08-crosscutting-concepts.md" <<'MD'
# Crosscutting Concepts

- Pattern: command recipe gate. Catalogue: fixture pattern catalogue. Instantiated at justfile:37.
  Consequence: the fixture accepts local shell coupling for a reproducible lint gate.
MD
    cat > "$tree/09-architecture-decisions.md" <<'MD'
# Architecture Decisions

- ADR 0001 Record runtime boundary. Status: accepted. Link: ../../decisions/0001-record-runtime-boundary.md
MD
    cat > "$tree/10-quality-requirements.md" <<'MD'
# Quality Requirements

- SEC01-BP01
  Status: met
  Risk: HIGH
  Source: fixture corpus
  Evidence: LICENSE:1 and justfile:37
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

run_arch_lint() {
    local tree="$1"
    local decisions_dir="${2:-$decisions}"
    ARCH_LINT_DIR="$tree" ARCH_LINT_DECISIONS_DIR="$decisions_dir" ARCH_LINT_CORPUS_DIR="$corpus" \
        just -f "$root/justfile.opsx" arch-lint
}

run_arch_lint_without_bp_source() {
    local tree="$1"
    local decisions_dir="${2:-$decisions}"
    local isolated_home="$work/no-waf-home"
    mkdir -p "$isolated_home"
    HOME="$isolated_home" ARCH_LINT_DIR="$tree" ARCH_LINT_DECISIONS_DIR="$decisions_dir" \
        just -f "$root/justfile.opsx" arch-lint
}

pass_tree="$work/pass-architecture"
write_common_sections "$pass_tree"

echo '== spec-compliant ADR index and met evidence using extensionless LICENSE:1 should pass =='
pass_output=$(run_arch_lint "$pass_tree" 2>&1)
printf '%s\n' "$pass_output"
grep -q 'evidence-for-met: ok' <<< "$pass_output"
grep -q '42010 audit checklist: ok' <<< "$pass_output"
grep -q 'arch-lint: clean (all checks ran)' <<< "$pass_output"

placeholder_42010_tree="$work/placeholder-42010-architecture"
write_common_sections "$placeholder_42010_tree"
cat > "$placeholder_42010_tree/01-introduction-and-goals.md" <<'MD'
# Introduction and Goals

Stakeholders: TBD
Concerns: TBD
MD

echo '== placeholder stakeholders and concerns should fail 42010 audit =='
set +e
placeholder_42010_output=$(run_arch_lint "$placeholder_42010_tree" 2>&1)
placeholder_42010_status=$?
set -e
printf '%s\n' "$placeholder_42010_output"
if [ "$placeholder_42010_status" -eq 0 ]; then
    echo 'expected placeholder 42010 fixture to fail, but arch-lint exited 0' >&2
    exit 1
fi
grep -q '42010 audit checklist: FAIL' <<< "$placeholder_42010_output"
grep -q '01-introduction-and-goals.md: missing stakeholders' <<< "$placeholder_42010_output"
grep -q '01-introduction-and-goals.md: missing concerns' <<< "$placeholder_42010_output"

not_applicable_views_tree="$work/not-applicable-views-architecture"
write_common_sections "$not_applicable_views_tree"
cat > "$not_applicable_views_tree/03-context-and-scope.md" <<'MD'
# Context and Scope

Not applicable: no context view is presented in this fixture.
MD
cat > "$not_applicable_views_tree/05-building-block-view.md" <<'MD'
# Building Block View

Not applicable: no building block view is presented in this fixture.
MD
cat > "$not_applicable_views_tree/06-runtime-view.md" <<'MD'
# Runtime View

Not applicable: no runtime view is presented in this fixture.
MD
cat > "$not_applicable_views_tree/07-deployment-view.md" <<'MD'
# Deployment View

Not applicable: no deployment view is presented in this fixture.
MD

echo '== view files with only headings and Not applicable reasons should fail 42010 presented views =='
set +e
not_applicable_views_output=$(run_arch_lint "$not_applicable_views_tree" 2>&1)
not_applicable_views_status=$?
set -e
printf '%s\n' "$not_applicable_views_output"
if [ "$not_applicable_views_status" -eq 0 ]; then
    echo 'expected Not applicable view fixture to fail, but arch-lint exited 0' >&2
    exit 1
fi
grep -q '42010 audit checklist: FAIL' <<< "$not_applicable_views_output"
grep -q 'architecture tree: missing presented views' <<< "$not_applicable_views_output"

sixth_line_cost_tree="$work/sixth-line-cost-architecture"
write_common_sections "$sixth_line_cost_tree"
cat > "$sixth_line_cost_tree/08-crosscutting-concepts.md" <<'MD'
# Crosscutting Concepts

- Pattern: outbox publication.
  Detail: first non-cost detail.
  Detail: second non-cost detail.
  Detail: third non-cost detail.
  Detail: fourth non-cost detail.
  Consequence: the fixture accepts delayed message publication for deterministic recovery.
MD

echo '== stated cost on sixth non-empty claim line should pass =='
sixth_line_cost_output=$(run_arch_lint "$sixth_line_cost_tree" 2>&1)
printf '%s\n' "$sixth_line_cost_output"
grep -q 'stated-cost: ok' <<< "$sixth_line_cost_output"
grep -q 'arch-lint: clean (all checks ran)' <<< "$sixth_line_cost_output"

section8_continuation_tree="$work/section8-continuation-architecture"
write_common_sections "$section8_continuation_tree"
cat > "$section8_continuation_tree/08-crosscutting-concepts.md" <<'MD'
# Crosscutting Concepts

- Pattern: CQRS.
  This pattern batches writes through a queue.
  Consequence: eventual consistency on reads.
MD

echo '== section 8 continuation with pattern and later consequence should pass =='
section8_continuation_output=$(run_arch_lint "$section8_continuation_tree" 2>&1)
printf '%s\n' "$section8_continuation_output"
grep -q 'stated-cost: ok' <<< "$section8_continuation_output"
grep -q 'arch-lint: clean (all checks ran)' <<< "$section8_continuation_output"

section8_pattern_catalogue_tree="$work/section8-pattern-catalogue-architecture"
write_common_sections "$section8_pattern_catalogue_tree"
cat > "$section8_pattern_catalogue_tree/08-crosscutting-concepts.md" <<'MD'
# Crosscutting Concepts

## Pattern Catalogue

- Pattern: outbox publication.
  Consequence: publication is delayed until the local transaction commits.
MD

echo '== section 8 Pattern Catalogue heading with costed entry should pass =='
section8_pattern_catalogue_output=$(run_arch_lint "$section8_pattern_catalogue_tree" 2>&1)
printf '%s\n' "$section8_pattern_catalogue_output"
grep -q 'stated-cost: ok' <<< "$section8_pattern_catalogue_output"
grep -q 'arch-lint: clean (all checks ran)' <<< "$section8_pattern_catalogue_output"

section8_table_header_tree="$work/section8-table-header-architecture"
write_common_sections "$section8_table_header_tree"
cat > "$section8_table_header_tree/08-crosscutting-concepts.md" <<'MD'
# Crosscutting Concepts

| Pattern | Consequence |
| --- | --- |
| Outbox pattern | publication is delayed until the local transaction commits. |
MD

echo '== section 8 Pattern table header with costed data row should pass =='
section8_table_header_output=$(run_arch_lint "$section8_table_header_tree" 2>&1)
printf '%s\n' "$section8_table_header_output"
grep -q 'stated-cost: ok' <<< "$section8_table_header_output"
grep -q 'arch-lint: clean (all checks ran)' <<< "$section8_table_header_output"

section8_table_data_costless_tree="$work/section8-table-data-costless-architecture"
write_common_sections "$section8_table_data_costless_tree"
cat > "$section8_table_data_costless_tree/08-crosscutting-concepts.md" <<'MD'
# Crosscutting Concepts

| Pattern | Consequence |
| --- | --- |
| Outbox pattern | N/A |
MD

echo '== section 8 Pattern table costless data row should fail =='
set +e
section8_table_data_costless_output=$(run_arch_lint "$section8_table_data_costless_tree" 2>&1)
section8_table_data_costless_status=$?
set -e
printf '%s\n' "$section8_table_data_costless_output"
if [ "$section8_table_data_costless_status" -eq 0 ]; then
    echo 'expected costless table data fixture to fail, but arch-lint exited 0' >&2
    exit 1
fi
grep -q 'stated-cost: FAIL' <<< "$section8_table_data_costless_output"
grep -q 'Outbox pattern' <<< "$section8_table_data_costless_output"

section8_bare_label_payload_tree="$work/section8-bare-label-payload-architecture"
write_common_sections "$section8_bare_label_payload_tree"
cat > "$section8_bare_label_payload_tree/08-crosscutting-concepts.md" <<'MD'
# Crosscutting Concepts

- Pattern: CQRS.
  Consequences:
  - eventual consistency on reads.
MD

echo '== section 8 bare Consequences label followed by bullet payload should pass =='
section8_bare_label_payload_output=$(run_arch_lint "$section8_bare_label_payload_tree" 2>&1)
printf '%s\n' "$section8_bare_label_payload_output"
grep -q 'stated-cost: ok' <<< "$section8_bare_label_payload_output"
grep -q 'arch-lint: clean (all checks ran)' <<< "$section8_bare_label_payload_output"

section8_after_consequence_tree="$work/section8-after-consequence-architecture"
write_common_sections "$section8_after_consequence_tree"
cat > "$section8_after_consequence_tree/08-crosscutting-concepts.md" <<'MD'
# Crosscutting Concepts

- Pattern: CQRS.
  Consequence: eventual consistency on reads.
  This pattern batches writes through a queue.
MD

echo '== section 8 continuation with consequence then pattern prose should pass =='
section8_after_consequence_output=$(run_arch_lint "$section8_after_consequence_tree" 2>&1)
printf '%s\n' "$section8_after_consequence_output"
grep -q 'stated-cost: ok' <<< "$section8_after_consequence_output"
grep -q 'arch-lint: clean (all checks ran)' <<< "$section8_after_consequence_output"

partial_tree="$work/partial-architecture"
write_common_sections "$partial_tree"

echo '== missing best-practice source should report PARTIAL and not clean =='
partial_output=$(run_arch_lint_without_bp_source "$partial_tree" 2>&1)
printf '%s\n' "$partial_output"
grep -q 'best-practice identifier resolution: SKIP' <<< "$partial_output"
grep -q 'arch-lint: PARTIAL — 1 check(s) skipped' <<< "$partial_output"
if grep -q 'arch-lint: clean' <<< "$partial_output"; then
    echo 'partial fixture reported clean' >&2
    exit 1
fi

absent_tree="$work/absent-architecture"
echo '== absent architecture tree should report not-found, not clean =='
set +e
absent_output=$(run_arch_lint "$absent_tree" 2>&1)
absent_status=$?
set -e
printf '%s\n' "$absent_output"
if [ "$absent_status" -eq 0 ]; then
    echo 'expected absent tree fixture to fail, but arch-lint exited 0' >&2
    exit 1
fi
grep -q 'arch-lint: not-found' <<< "$absent_output"
if grep -q 'arch-lint: clean' <<< "$absent_output"; then
    echo 'absent tree fixture reported clean' >&2
    exit 1
fi

horizontal_rule_tree="$work/horizontal-rule-only-section-architecture"
write_common_sections "$horizontal_rule_tree"
cat > "$horizontal_rule_tree/12-glossary.md" <<'MD'
# Glossary

---
MD

echo '== section with only horizontal rule should fail completeness =='
set +e
horizontal_rule_output=$(run_arch_lint "$horizontal_rule_tree" 2>&1)
horizontal_rule_status=$?
set -e
printf '%s\n' "$horizontal_rule_output"
if [ "$horizontal_rule_status" -eq 0 ]; then
    echo 'expected horizontal-rule-only section fixture to fail, but arch-lint exited 0' >&2
    exit 1
fi
grep -q 'section completeness: FAIL' <<< "$horizontal_rule_output"
grep -q '12-glossary.md: no content and no declared non-applicability' <<< "$horizontal_rule_output"

bare_list_marker_tree="$work/bare-list-marker-section-architecture"
write_common_sections "$bare_list_marker_tree"
cat > "$bare_list_marker_tree/12-glossary.md" <<'MD'
# Glossary

-
MD

echo '== section with only bare list marker should fail completeness =='
set +e
bare_list_marker_output=$(run_arch_lint "$bare_list_marker_tree" 2>&1)
bare_list_marker_status=$?
set -e
printf '%s\n' "$bare_list_marker_output"
if [ "$bare_list_marker_status" -eq 0 ]; then
    echo 'expected bare-list-marker-only section fixture to fail, but arch-lint exited 0' >&2
    exit 1
fi
grep -q 'section completeness: FAIL' <<< "$bare_list_marker_output"
grep -q '12-glossary.md: no content and no declared non-applicability' <<< "$bare_list_marker_output"

bare_table_marker_tree="$work/bare-table-marker-section-architecture"
write_common_sections "$bare_table_marker_tree"
cat > "$bare_table_marker_tree/12-glossary.md" <<'MD'
# Glossary

| --- |
MD

echo '== section with only bare table marker should fail completeness =='
set +e
bare_table_marker_output=$(run_arch_lint "$bare_table_marker_tree" 2>&1)
bare_table_marker_status=$?
set -e
printf '%s\n' "$bare_table_marker_output"
if [ "$bare_table_marker_status" -eq 0 ]; then
    echo 'expected bare-table-marker-only section fixture to fail, but arch-lint exited 0' >&2
    exit 1
fi
grep -q 'section completeness: FAIL' <<< "$bare_table_marker_output"
grep -q '12-glossary.md: no content and no declared non-applicability' <<< "$bare_table_marker_output"

header_only_table_tree="$work/header-only-table-section-architecture"
write_common_sections "$header_only_table_tree"
cat > "$header_only_table_tree/12-glossary.md" <<'MD'
# Glossary

| Term | Meaning |
| --- | --- |
MD

echo '== section with only a table header should fail completeness =='
set +e
header_only_table_output=$(run_arch_lint "$header_only_table_tree" 2>&1)
header_only_table_status=$?
set -e
printf '%s\n' "$header_only_table_output"
if [ "$header_only_table_status" -eq 0 ]; then
    echo 'expected header-only-table section fixture to fail, but arch-lint exited 0' >&2
    exit 1
fi
grep -q 'section completeness: FAIL' <<< "$header_only_table_output"
grep -q '12-glossary.md: no content and no declared non-applicability' <<< "$header_only_table_output"

header_only_view_tree="$work/header-only-view-architecture"
write_common_sections "$header_only_view_tree"
cat > "$header_only_view_tree/03-context-and-scope.md" <<'MD'
# Context and Scope

| View | Description |
| --- | --- |
MD
cat > "$header_only_view_tree/05-building-block-view.md" <<'MD'
# Building Block View

Not applicable: no building block view is presented in this fixture.
MD
cat > "$header_only_view_tree/06-runtime-view.md" <<'MD'
# Runtime View

Not applicable: no runtime view is presented in this fixture.
MD
cat > "$header_only_view_tree/07-deployment-view.md" <<'MD'
# Deployment View

Not applicable: no deployment view is presented in this fixture.
MD

echo '== view section with only a table header should fail presented views =='
set +e
header_only_view_output=$(run_arch_lint "$header_only_view_tree" 2>&1)
header_only_view_status=$?
set -e
printf '%s\n' "$header_only_view_output"
if [ "$header_only_view_status" -eq 0 ]; then
    echo 'expected header-only view fixture to fail, but arch-lint exited 0' >&2
    exit 1
fi
grep -q 'section completeness: FAIL' <<< "$header_only_view_output"
grep -q '03-context-and-scope.md: no content and no declared non-applicability' <<< "$header_only_view_output"
grep -q '42010 audit checklist: FAIL' <<< "$header_only_view_output"
grep -q 'architecture tree: missing presented views' <<< "$header_only_view_output"

heading_only_tree="$work/heading-only-section-architecture"
write_common_sections "$heading_only_tree"
cat > "$heading_only_tree/12-glossary.md" <<'MD'
# Glossary

## Terms
MD

echo '== section with only a subheading should fail completeness =='
set +e
heading_only_output=$(run_arch_lint "$heading_only_tree" 2>&1)
heading_only_status=$?
set -e
printf '%s\n' "$heading_only_output"
if [ "$heading_only_status" -eq 0 ]; then
    echo 'expected heading-only section fixture to fail, but arch-lint exited 0' >&2
    exit 1
fi
grep -q 'section completeness: FAIL' <<< "$heading_only_output"
grep -q '12-glossary.md: no content and no declared non-applicability' <<< "$heading_only_output"

colon_not_applicable_tree="$work/colon-not-applicable-architecture"
write_common_sections "$colon_not_applicable_tree"
cat > "$colon_not_applicable_tree/12-glossary.md" <<'MD'
# Glossary

Not applicable: no domain glossary terms.
MD

echo '== colon-form Not applicable reason should pass completeness =='
colon_not_applicable_output=$(run_arch_lint "$colon_not_applicable_tree" 2>&1)
printf '%s\n' "$colon_not_applicable_output"
grep -q 'section completeness: ok' <<< "$colon_not_applicable_output"
grep -q 'arch-lint: clean (all checks ran)' <<< "$colon_not_applicable_output"

bare_not_applicable_tree="$work/bare-not-applicable-architecture"
write_common_sections "$bare_not_applicable_tree"
cat > "$bare_not_applicable_tree/12-glossary.md" <<'MD'
# Glossary

Not applicable
MD

echo '== bare Not applicable without reason should fail completeness =='
set +e
bare_not_applicable_output=$(run_arch_lint "$bare_not_applicable_tree" 2>&1)
bare_not_applicable_status=$?
set -e
printf '%s\n' "$bare_not_applicable_output"
if [ "$bare_not_applicable_status" -eq 0 ]; then
    echo 'expected bare Not applicable fixture to fail, but arch-lint exited 0' >&2
    exit 1
fi
grep -q 'section completeness: FAIL' <<< "$bare_not_applicable_output"
grep -q '12-glossary.md: Not applicable declaration needs a one-line reason' <<< "$bare_not_applicable_output"

costless_tree="$work/costless-pattern-architecture"
write_common_sections "$costless_tree"
cat > "$costless_tree/08-crosscutting-concepts.md" <<'MD'
# Crosscutting Concepts

- Pattern: CQRS. Catalogue: fixture pattern catalogue. Instantiated at justfile:37.
  The fixture names the pattern only.
MD

echo '== costless pattern fixture should fail =='
set +e
costless_output=$(run_arch_lint "$costless_tree" 2>&1)
costless_status=$?
set -e
printf '%s\n' "$costless_output"
if [ "$costless_status" -eq 0 ]; then
    echo 'expected costless pattern fixture to fail, but arch-lint exited 0' >&2
    exit 1
fi
grep -q 'stated-cost: FAIL' <<< "$costless_output"
grep -q '08-crosscutting-concepts.md' <<< "$costless_output"
grep -q 'Pattern: CQRS' <<< "$costless_output"

negated_tree="$work/negated-cost-architecture"
write_common_sections "$negated_tree"
cat > "$negated_tree/08-crosscutting-concepts.md" <<'MD'
# Crosscutting Concepts

- Pattern: CQRS. Catalogue: fixture pattern catalogue. Instantiated at justfile:37.
  No trade-offs identified yet.
  No cost recorded.
MD

echo '== negated cost fixture should fail =='
set +e
negated_output=$(run_arch_lint "$negated_tree" 2>&1)
negated_status=$?
set -e
printf '%s\n' "$negated_output"
if [ "$negated_status" -eq 0 ]; then
    echo 'expected negated cost fixture to fail, but arch-lint exited 0' >&2
    exit 1
fi
grep -q 'stated-cost: FAIL' <<< "$negated_output"
grep -q '08-crosscutting-concepts.md' <<< "$negated_output"
grep -q 'Pattern: CQRS' <<< "$negated_output"

placeholder_cost_tree="$work/placeholder-cost-architecture"
write_common_sections "$placeholder_cost_tree"
cat > "$placeholder_cost_tree/08-crosscutting-concepts.md" <<'MD'
# Crosscutting Concepts

- Pattern: CQRS. Catalogue: fixture pattern catalogue. Instantiated at justfile:37.
  Consequence: N/A.
  Trade-off: TBD.
  Cost: unknown.
MD

echo '== placeholder cost fixture should fail =='
set +e
placeholder_cost_output=$(run_arch_lint "$placeholder_cost_tree" 2>&1)
placeholder_cost_status=$?
set -e
printf '%s\n' "$placeholder_cost_output"
if [ "$placeholder_cost_status" -eq 0 ]; then
    echo 'expected placeholder cost fixture to fail, but arch-lint exited 0' >&2
    exit 1
fi
grep -q 'stated-cost: FAIL' <<< "$placeholder_cost_output"
grep -q '08-crosscutting-concepts.md' <<< "$placeholder_cost_output"
grep -q 'Pattern: CQRS' <<< "$placeholder_cost_output"

indented_costless_tree="$work/indented-costless-pattern-architecture"
write_common_sections "$indented_costless_tree"
cat > "$indented_costless_tree/08-crosscutting-concepts.md" <<'MD'
# Crosscutting Concepts

  - Pattern: CQRS. Catalogue: fixture pattern catalogue. Instantiated at justfile:37.
    The fixture names the indented pattern only.
MD

echo '== indented section 8 pattern without consequence should fail =='
set +e
indented_costless_output=$(run_arch_lint "$indented_costless_tree" 2>&1)
indented_costless_status=$?
set -e
printf '%s\n' "$indented_costless_output"
if [ "$indented_costless_status" -eq 0 ]; then
    echo 'expected indented costless pattern fixture to fail, but arch-lint exited 0' >&2
    exit 1
fi
grep -q 'stated-cost: FAIL' <<< "$indented_costless_output"
grep -q '08-crosscutting-concepts.md' <<< "$indented_costless_output"
grep -q 'Pattern: CQRS' <<< "$indented_costless_output"

prose_pattern_tree="$work/prose-pattern-architecture"
write_common_sections "$prose_pattern_tree"
cat > "$prose_pattern_tree/08-crosscutting-concepts.md" <<'MD'
# Crosscutting Concepts

We rely on the CQRS pattern for writes.
MD

echo '== prose pattern claim without consequence should fail =='
set +e
prose_pattern_output=$(run_arch_lint "$prose_pattern_tree" 2>&1)
prose_pattern_status=$?
set -e
printf '%s\n' "$prose_pattern_output"
if [ "$prose_pattern_status" -eq 0 ]; then
    echo 'expected prose pattern fixture to fail, but arch-lint exited 0' >&2
    exit 1
fi
grep -q 'stated-cost: FAIL' <<< "$prose_pattern_output"
grep -q '08-crosscutting-concepts.md' <<< "$prose_pattern_output"
grep -q 'We rely on the CQRS pattern for writes' <<< "$prose_pattern_output"

unknown_id_tree="$work/unresolvable-identifier-architecture"
write_common_sections "$unknown_id_tree"
cat > "$unknown_id_tree/10-quality-requirements.md" <<'MD'
# Quality Requirements

- SEC99-BP99 status: met. Evidence: justfile:37. Risk: HIGH. Source: fixture corpus.
MD

echo '== unresolvable identifier fixture should fail and name the id =='
set +e
unknown_id_output=$(run_arch_lint "$unknown_id_tree" 2>&1)
unknown_id_status=$?
set -e
printf '%s\n' "$unknown_id_output"
if [ "$unknown_id_status" -eq 0 ]; then
    echo 'expected unresolvable identifier fixture to fail, but arch-lint exited 0' >&2
    exit 1
fi
grep -q 'best-practice identifier resolution: FAIL' <<< "$unknown_id_output"
grep -q 'SEC99-BP99' <<< "$unknown_id_output"

localhost_evidence_tree="$work/localhost-evidence-architecture"
write_common_sections "$localhost_evidence_tree"
cat > "$localhost_evidence_tree/10-quality-requirements.md" <<'MD'
# Quality Requirements

- SEC01-BP01
  Status: met
  Risk: HIGH
  Source: fixture corpus
  Evidence: localhost:3000
MD

echo '== localhost port string should not satisfy met evidence =='
set +e
localhost_evidence_output=$(run_arch_lint "$localhost_evidence_tree" 2>&1)
localhost_evidence_status=$?
set -e
printf '%s\n' "$localhost_evidence_output"
if [ "$localhost_evidence_status" -eq 0 ]; then
    echo 'expected localhost evidence fixture to fail, but arch-lint exited 0' >&2
    exit 1
fi
grep -q 'evidence-for-met: FAIL' <<< "$localhost_evidence_output"
grep -q 'recorded as met without file:line evidence' <<< "$localhost_evidence_output"
grep -q 'SEC01-BP01' <<< "$localhost_evidence_output"

directory_evidence_tree="$work/directory-evidence-architecture"
write_common_sections "$directory_evidence_tree"
cat > "$directory_evidence_tree/10-quality-requirements.md" <<'MD'
# Quality Requirements

- SEC01-BP01
  Status: met
  Risk: HIGH
  Source: fixture corpus
  Evidence: docs:1
MD

echo '== existing directory path should not satisfy met evidence =='
set +e
directory_evidence_output=$(run_arch_lint "$directory_evidence_tree" 2>&1)
directory_evidence_status=$?
set -e
printf '%s\n' "$directory_evidence_output"
if [ "$directory_evidence_status" -eq 0 ]; then
    echo 'expected directory-like evidence fixture to fail, but arch-lint exited 0' >&2
    exit 1
fi
grep -q 'evidence-for-met: FAIL' <<< "$directory_evidence_output"
grep -q 'recorded as met without file:line evidence' <<< "$directory_evidence_output"
grep -q 'SEC01-BP01' <<< "$directory_evidence_output"

status_before_id_tree="$work/status-before-id-architecture"
write_common_sections "$status_before_id_tree"
cat > "$status_before_id_tree/10-quality-requirements.md" <<'MD'
# Quality Requirements

- Status: met
  SEC01-BP01
  Risk: HIGH
  Source: fixture corpus
MD

echo '== status before identifier without evidence should fail met evidence =='
set +e
status_before_id_output=$(run_arch_lint "$status_before_id_tree" 2>&1)
status_before_id_status=$?
set -e
printf '%s\n' "$status_before_id_output"
if [ "$status_before_id_status" -eq 0 ]; then
    echo 'expected status-before-id fixture to fail, but arch-lint exited 0' >&2
    exit 1
fi
grep -q 'evidence-for-met: FAIL' <<< "$status_before_id_output"
grep -q 'recorded as met without file:line evidence' <<< "$status_before_id_output"
grep -q 'SEC01-BP01' <<< "$status_before_id_output"

uncosted_adr_tree="$work/uncosted-section4-architecture"
write_common_sections "$uncosted_adr_tree"
cat > "$uncosted_adr_tree/04-solution-strategy.md" <<'MD'
# Solution Strategy

- Decision ADR 0001 defines the runtime boundary.
  The fixture references the decision but records no cost.
MD

echo '== uncosted ADR reference outside section 9 should fail stated-cost =='
set +e
uncosted_adr_output=$(run_arch_lint "$uncosted_adr_tree" 2>&1)
uncosted_adr_status=$?
set -e
printf '%s\n' "$uncosted_adr_output"
if [ "$uncosted_adr_status" -eq 0 ]; then
    echo 'expected uncosted ADR fixture to fail, but arch-lint exited 0' >&2
    exit 1
fi
grep -q 'stated-cost: FAIL' <<< "$uncosted_adr_output"
grep -q '04-solution-strategy.md' <<< "$uncosted_adr_output"
grep -q 'ADR 0001' <<< "$uncosted_adr_output"

sibling_borrowed_cost_tree="$work/sibling-borrowed-cost-architecture"
write_common_sections "$sibling_borrowed_cost_tree"
cat > "$sibling_borrowed_cost_tree/04-solution-strategy.md" <<'MD'
# Solution Strategy

- Decision ADR 0001 defines the runtime boundary.
- Operational note. Consequence: slower local setup for this unrelated note.
MD

echo '== ADR claim must not borrow consequence from sibling bullet =='
set +e
sibling_borrowed_cost_output=$(run_arch_lint "$sibling_borrowed_cost_tree" 2>&1)
sibling_borrowed_cost_status=$?
set -e
printf '%s\n' "$sibling_borrowed_cost_output"
if [ "$sibling_borrowed_cost_status" -eq 0 ]; then
    echo 'expected sibling-borrowed consequence fixture to fail, but arch-lint exited 0' >&2
    exit 1
fi
grep -q 'stated-cost: FAIL' <<< "$sibling_borrowed_cost_output"
grep -q '04-solution-strategy.md' <<< "$sibling_borrowed_cost_output"
grep -q 'ADR 0001' <<< "$sibling_borrowed_cost_output"

borrowed_rationale_tree="$work/borrowed-rationale-architecture"
write_common_sections "$borrowed_rationale_tree"
borrowed_decisions="$work/borrowed-decisions"
mkdir -p "$borrowed_decisions"
cat > "$borrowed_decisions/0001-record-runtime-boundary.md" <<'MD'
# Record runtime boundary

Status: accepted
MD
cat > "$borrowed_decisions/0002-record-gate-boundary.md" <<'MD'
# Record gate boundary

Status: accepted

Rationale: the second ADR rationale must not validate the first ADR.
MD
cat > "$borrowed_rationale_tree/09-architecture-decisions.md" <<'MD'
# Architecture Decisions

- ADR 0001 Record runtime boundary. Status: accepted. Link: ../../decisions/0001-record-runtime-boundary.md
- ADR 0002 Record gate boundary. Status: accepted. Link: ../../decisions/0002-record-gate-boundary.md
MD

echo '== linked ADR rationale must not be borrowed from another ADR =='
set +e
borrowed_rationale_output=$(run_arch_lint "$borrowed_rationale_tree" "$borrowed_decisions" 2>&1)
borrowed_rationale_status=$?
set -e
printf '%s\n' "$borrowed_rationale_output"
if [ "$borrowed_rationale_status" -eq 0 ]; then
    echo 'expected borrowed rationale fixture to fail, but arch-lint exited 0' >&2
    exit 1
fi
grep -q '42010 audit checklist: FAIL' <<< "$borrowed_rationale_output"
grep -q 'linked ADR 0001 lacks rationale' <<< "$borrowed_rationale_output"

borrowed_rationale_failures=$(grep -c 'linked ADR 0001 lacks rationale' <<< "$borrowed_rationale_output")
if [ "$borrowed_rationale_failures" -ne 1 ]; then
    echo "expected exactly one rationale failure, saw $borrowed_rationale_failures" >&2
    exit 1
fi

placeholder_rationale_tree="$work/placeholder-rationale-architecture"
write_common_sections "$placeholder_rationale_tree"
placeholder_decisions="$work/placeholder-decisions"
mkdir -p "$placeholder_decisions"
cat > "$placeholder_decisions/0001-record-runtime-boundary.md" <<'MD'
# Record runtime boundary

Status: accepted

Rationale: TBD
MD

cat > "$placeholder_rationale_tree/09-architecture-decisions.md" <<'MD'
# Architecture Decisions

- ADR 0001 Record runtime boundary. Status: accepted. Link: ../../decisions/0001-record-runtime-boundary.md
MD

echo '== placeholder ADR rationale should fail 42010 audit =='
set +e
placeholder_rationale_output=$(run_arch_lint "$placeholder_rationale_tree" "$placeholder_decisions" 2>&1)
placeholder_rationale_status=$?
set -e
printf '%s\n' "$placeholder_rationale_output"
if [ "$placeholder_rationale_status" -eq 0 ]; then
    echo 'expected placeholder rationale fixture to fail, but arch-lint exited 0' >&2
    exit 1
fi
grep -q '42010 audit checklist: FAIL' <<< "$placeholder_rationale_output"
grep -q 'linked ADR 0001 lacks rationale' <<< "$placeholder_rationale_output"

echo 'probe: ok'
