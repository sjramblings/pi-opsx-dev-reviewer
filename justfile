# pi-opsx-dev-reviewer — task recipes. The recipes live in justfile.opsx (shared verbatim
# with installed repos); this file owns default and imports them.

default:
    @just --list

import "justfile.opsx"
# >>> structurizr (managed by install.sh) >>>
import "justfile.structurizr"
# <<< structurizr (managed by install.sh) <<<

# Kit-only: print the last verified pi version (docs/pi-compatibility.md) next to the installed
# pi, and fail if any verified-against claim elsewhere in the repo disagrees with it.
pi-compat:
    @bun tools/pi-compat.ts
