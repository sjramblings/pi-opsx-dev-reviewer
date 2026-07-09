# pi-opsx-dev-reviewer — task recipes. The recipes live in justfile.opsx (shared verbatim
# with installed repos); this file owns default and imports them.

default:
    @just --list

import "justfile.opsx"
