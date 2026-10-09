# ADR-031 — Build animation UI from runtime timeline groups

Status: Adopted; the preset catalog and settings placement are refined by [ADR-075](ADR-075-elements-and-presets.md) and [ADR-080](ADR-080-transition-settings.md). This is the current English summary of the decision. The original implementation log remains available in Git history.

## Decision and current interpretation

The animation panel reads grouping and timing from the runtime, so its preview matches presentation playback. Trigger groups distinguish slide entry from successive clicks. Selecting a row selects the Stage element; the transition editor is shared between the panel and contextual control. Updates use existing timeline and slide commands. [ADR-075](ADR-075-elements-and-presets.md) expands the available entrance, emphasis, exit, and transition presets without changing the timeline model.
