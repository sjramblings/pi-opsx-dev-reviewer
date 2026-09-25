workspace "Pin Fixture" "One self-contained model that relates one person directly to one component." {

    !identifiers hierarchical

    model {
        reader = person "Reader" "Opens a rendered architecture view."

        kit = softwareSystem "Documentation Kit" "The kit whose renderer pin is under test." {
            renderer = container "Renderer" "Runs the pinned consolidated image." "bun" {
                probe = component "Pin Probe" "Executes the pinned command vectors."
            }
        }

        reader -> kit.renderer.probe "Runs the pinned fixture through"
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

        component kit.renderer "component" {
            include *
            autolayout lr
        }
    }
}
