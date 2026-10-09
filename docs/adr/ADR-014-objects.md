# ADR-014 — Use existing commands for object controls

Status: Adopted. This is the current English summary of the decision. The original implementation log remains available in Git history.

## Decision and current interpretation

Insertion and editing of images, shapes, lines, SVG, effects, and slide backgrounds use the existing element, slide, theme, and asset commands. Controls appear only when the renderer supports the effect for that element. Continuous sliders and color gestures share a transaction ID so one gesture is one undo step. Pure helpers own fill, shape, effect, and background transforms. Stage-specific crop, line, and group behavior is in [ADR-016](ADR-016-stage-crop-lines-groups.md).
