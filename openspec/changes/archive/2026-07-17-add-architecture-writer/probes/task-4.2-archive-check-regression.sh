#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
work="$tmp/repo"

run_archive_check() {
    local output_file=$1
    set +e
    just -f justfile.opsx archive-check demo >"$output_file" 2>&1
    local status=$?
    set -e
    printf '%s' "$status"
}

mkdir -p "$work"
cd "$work"
git init -q -b main
git config user.email opsx-probe@example.invalid
git config user.name "opsx probe"
cp "$repo_root/justfile.opsx" justfile.opsx
mkdir -p openspec/changes/demo
printf 'VERDICT: PASS\n' > openspec/changes/demo/review-log.md
git add justfile.opsx openspec/changes/demo/review-log.md
git commit -q -m initial
initial_commit=$(git rev-parse HEAD)

git switch -q -c feature-extension
mkdir -p extensions/demo
printf 'export const touched = true;\n' > extensions/demo/index.ts
git add extensions/demo/index.ts
git commit -q -m 'touch extension'
ext_output="$tmp/extension.out"
ext_status=$(run_archive_check "$ext_output")
printf '%s\n' '--- committed extension change ---'
printf 'exit: %s\n' "$ext_status"
cat "$ext_output"
if [ "$ext_status" -eq 0 ]; then
    echo 'probe failure: committed extension change passed without docs/architecture refresh' >&2
    exit 1
fi
grep -q 'architecture refresh: FAIL' "$ext_output"
grep -q 'extensions/demo/index.ts' "$ext_output"

git switch -q main
git switch -q -c feature-docs-only
mkdir -p docs
printf '# Docs-only note\n' > docs/note.md
git add docs/note.md
git commit -q -m 'docs only'
docs_output="$tmp/docs-only.out"
docs_status=$(run_archive_check "$docs_output")
printf '%s\n' '--- committed docs-only change ---'
printf 'exit: %s\n' "$docs_status"
cat "$docs_output"
if [ "$docs_status" -ne 0 ]; then
    echo 'probe failure: docs-only change did not pass archive-check' >&2
    exit 1
fi
grep -q 'architecture refresh: skipped — only non-architecturally significant docs paths changed' "$docs_output"

override_output="$tmp/override.out"
set +e
ARCHIVE_CHECK_BASE=main just -f justfile.opsx archive-check demo >"$override_output" 2>&1
override_status=$?
set -e
printf '%s\n' '--- ARCHIVE_CHECK_BASE override on docs-only change ---'
printf 'exit: %s\n' "$override_status"
cat "$override_output"
if [ "$override_status" -ne 0 ]; then
    echo 'probe failure: ARCHIVE_CHECK_BASE override did not pass docs-only archive-check' >&2
    exit 1
fi
grep -q 'ARCHIVE_CHECK_BASE=main' "$override_output"

git switch -q main
mkdir -p extensions/stale-origin
printf 'export const baseline = true;\n' > extensions/stale-origin/index.ts
git add extensions/stale-origin/index.ts
git commit -q -m 'local main extension ahead of stale origin'
git update-ref refs/remotes/origin/main "$initial_commit"
git switch -q -c feature-docs-only-with-stale-origin
mkdir -p docs
printf '# Docs-only note with stale origin\n' > docs/stale-origin-note.md
git add docs/stale-origin-note.md
git commit -q -m 'docs only with stale origin'
stale_origin_output="$tmp/docs-only-stale-origin.out"
stale_origin_status=$(run_archive_check "$stale_origin_output")
printf '%s\n' '--- docs-only change with stale origin/main behind local main ---'
printf 'exit: %s\n' "$stale_origin_status"
cat "$stale_origin_output"
if [ "$stale_origin_status" -ne 0 ]; then
    echo 'probe failure: docs-only change with stale origin/main did not pass archive-check' >&2
    exit 1
fi
grep -q 'refs/heads/main' "$stale_origin_output"
grep -q 'architecture refresh: skipped — only non-architecturally significant docs paths changed' "$stale_origin_output"

git switch -q main
mkdir -p docs
printf '# Main worktree docs-only note\n' > docs/main-worktree-note.md
main_worktree_output="$tmp/main-worktree-docs-only.out"
main_worktree_status=$(run_archive_check "$main_worktree_output")
printf '%s\n' '--- main branch working-tree docs-only change ---'
printf 'exit: %s\n' "$main_worktree_status"
cat "$main_worktree_output"
if [ "$main_worktree_status" -ne 0 ]; then
    echo 'probe failure: main branch working-tree docs-only change did not pass archive-check' >&2
    exit 1
fi
grep -q 'same commit; working tree and untracked paths only' "$main_worktree_output"
grep -q 'architecture refresh: skipped — only non-architecturally significant docs paths changed' "$main_worktree_output"
rm -rf docs

git switch -q main
mkdir -p extensions/demo
printf 'export const renamed = true;\n' > extensions/demo/index.ts
git add extensions/demo/index.ts
git commit -q -m 'baseline extension for rename'
git switch -q -c feature-rename-extension-to-docs
mkdir -p docs
git mv extensions/demo/index.ts docs/note.md
git commit -q -m 'rename extension to docs'
rename_output="$tmp/rename-extension-to-docs.out"
rename_status=$(run_archive_check "$rename_output")
printf '%s\n' '--- rename extension path to docs path ---'
printf 'exit: %s\n' "$rename_status"
cat "$rename_output"
if [ "$rename_status" -eq 0 ]; then
    echo 'probe failure: rename from extensions to docs passed without docs/architecture refresh' >&2
    exit 1
fi
grep -q 'architecture refresh: FAIL' "$rename_output"
grep -q 'extensions/demo/index.ts' "$rename_output"

git switch -q main
git switch -q -c feature-worktree-rename-extension-to-docs
mkdir -p docs
git mv extensions/demo/index.ts docs/worktree-note.md
worktree_rename_output="$tmp/worktree-rename-extension-to-docs.out"
worktree_rename_status=$(run_archive_check "$worktree_rename_output")
printf '%s\n' '--- working-tree rename extension path to docs path ---'
printf 'exit: %s\n' "$worktree_rename_status"
cat "$worktree_rename_output"
if [ "$worktree_rename_status" -eq 0 ]; then
    echo 'probe failure: working-tree rename from extensions to docs passed without docs/architecture refresh' >&2
    exit 1
fi
grep -q 'architecture refresh: FAIL' "$worktree_rename_output"
grep -q 'extensions/demo/index.ts' "$worktree_rename_output"
