workspace "Your System" "Replace this description with what your system is for." {

    !identifiers hierarchical

    model {
        user = person "User" "Replace with the person who depends on this system."

        system = softwareSystem "Your System" "Replace with the system this repository builds." {
            application = container "Application" "Replace with a deployable unit." "your runtime" {
                entrypoint = component "Entry Point" "Replace with a component inside that unit."
            }
        }

        # Keep at least one relationship that reaches a component directly, so the
        # context, container, and component views share a lineage the gate can verify.
        user -> system.application.entrypoint "Uses"
    }

    views {
        systemContext system "context" {
            include *
            autolayout lr
        }

        container system "container" {
            include *
            autolayout lr
        }

        component system.application "component" {
            include *
            autolayout lr
        }
    }
}
