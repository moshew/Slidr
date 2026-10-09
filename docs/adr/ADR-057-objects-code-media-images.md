# ADR-057 — Extend editable objects without a new deck schema

Status: Adopted. This is the current English summary of the decision. The original implementation log remains available in Git history.

## Decision and current interpretation

HTML objects gain a live code editor and a user-confirmed conversion into ordinary elements. Images gain non-destructive masks, adjustments, presets, and optional local background removal; media objects gain insertion and playback controls. Small SVG imports become sanitized editable markup, while large SVGs remain image assets. Style paste, numeric fields, and media-to-Stage dragging use existing model commands. Background removal depends on a locally available model and may be disabled when it is absent. Later SVG visibility fixes and smart-frame media are covered in the main SPEC and [ADR-074](ADR-074-packaged-media-library.md).
