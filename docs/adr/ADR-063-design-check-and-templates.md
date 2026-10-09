# ADR-063 — Expose design findings and expand templates

Status: Adopted. This is the current English summary of the decision. The original implementation log remains available in Git history.

## Decision and current interpretation

The user design-check panel shares measured lint findings with the status bar, offers object navigation, deterministic fixes, and AI fixes. Agent-returned rules remain a selected subset, while extra user-facing rules cover more design checks. Master layout elements provide slide numbers and deck footers without new schema fields. Seven templates expanded the built-in library from three to ten at this milestone; later additions bring the catalog to 17 ([ADR-076](ADR-076-template-layouts.md)). Each template is tested against its own layouts, including mirrored direction.
