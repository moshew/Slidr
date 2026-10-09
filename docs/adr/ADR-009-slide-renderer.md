# ADR-009 — Render one logical slide across editor and output

Status: Adopted. This is the current English summary of the decision. The original implementation log remains available in Git history.

## Decision and current interpretation

`SlideRenderer` paints a logical 1920×1080 DOM slide. Callers scale its wrapper for the Stage or thumbnails. Object roots expose stable element IDs; presentation decorations have separate IDs. Content styles travel with the slide rather than depending on the editor's stylesheet, so capture and HTML export use the same renderer. Theme tokens are CSS variables on the slide root, and unchanged model objects retain identity to limit rerenders. Packaged SVG visibility fixes are recorded in the main SPEC.
