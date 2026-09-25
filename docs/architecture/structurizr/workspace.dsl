workspace "pi-opsx-dev-reviewer" "A portable pi harness that holds spec-driven change work to empirical gates." {

    !identifiers hierarchical

    model {
        maintainer = person "Maintainer" "Owns the repository and reviews every change."

        kit = softwareSystem "Dev reviewer kit" "Guards, gates, and agent roles installed into a repository." {
            enforcers = container "Enforcers" "pi extensions that fail closed on unsafe agent actions." "TypeScript" {
                forceDelegate = component "force-delegate" "Blocks main-agent writes and non-read-only shell."
                architectScope = component "architect-scope" "Holds each scoped agent to its path policy."
            }

            gates = container "Gates" "Deterministic checks a change must pass before archive." "TypeScript" {
                archLint = component "arch-lint" "Fails on a missing diagram, unstated cost, or stale render."
                structurizrRender = component "structurizr-render" "Optional pinned C4 render, verified and provenance-stamped."
            }

            docs = container "Architecture tree" "The arc42 sections and their derived HTML." "Markdown"
        }

        renderer = softwareSystem "Structurizr image" "The pinned consolidated renderer, run in a fresh no-network container."

        maintainer -> kit.enforcers.forceDelegate "Relies on the guard to stop unsafe writes"
        maintainer -> kit.gates.archLint "Runs before archiving a change"
        kit.gates.structurizrRender -> renderer "Runs the pinned command vectors in"
        kit.gates.archLint -> kit.docs "Verifies"
    }

    views {
        systemContext kit "context" {
            include *
            autolayout lr
        }

        container kit "container" {
            include *
            autolayout lr
        }

        component kit.gates "component" {
            include *
            autolayout lr
        }
    }
}
