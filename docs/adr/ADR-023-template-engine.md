# ADR-023 — Treat templates as pure model compositions

Status: Adopted. This is the current English summary of the decision. The original implementation log remains available in Git history.

## Decision and current interpretation

`packages/templates` validates a template's theme, layouts, and sample slides, then computes existing model commands to create slides or apply a template. Layouts are mirrored into the deck direction when needed. Elements that still match a placeholder follow it; manually moved elements retain their frame. A template change preserves unmatched content. The app adapter handles Markdown and asset files. [ADR-076](ADR-076-template-layouts.md) adds template-specific fallback title and text layouts.
