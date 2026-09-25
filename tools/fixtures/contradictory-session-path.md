# opsx-loop contradictory session path contract

The loop protocol requires the absolute path for a persisted session.
It also permits a relative session path.

That absolute path rule belongs to the loop protocol, while the `record-verdict` recorder itself
accepts any readable relative transcript path.
