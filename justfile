# pi-opsx-dev-reviewer — task recipes. The recipes live in justfile.opsx (shared verbatim
# with installed repos); this file owns default and imports them.

default:
    @just --list

import "justfile.opsx"
# >>> structurizr (managed by install.sh) >>>
import "justfile.structurizr"
# <<< structurizr (managed by install.sh) <<<
