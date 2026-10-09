# ADR-073 — Compose imported cards from ordinary groups and shapes

Status: Implemented in the committed baseline by 2026-10-09. This is the current English summary of the decision. The original implementation log remains available in Git history.

## Decision and current interpretation

A card is a group whose first child is its background shape, followed by text, icons, chips, or other content. Optional shape `accent` and `padding` fields provide a colored edge and internal spacing. HTML conversion now emits nested groups, multi-paragraph text boxes, and shapes with text when fidelity permits, rather than a flat element list. Group text can enter editing on a single click. These changes are in the committed history by 2026-10-09; the old branch note that they were not merged is obsolete. The original example-suite results remain historical measurements, and some text-heavy cards still fall back to HTML.
