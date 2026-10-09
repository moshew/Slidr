# ADR-034 — Edit text inside HTML objects without rewriting markup structure

Status: Adopted. This is the current English summary of the decision. The original implementation log remains available in Git history.

## Decision and current interpretation

The renderer exposes the HTML object's shadow content and a mapping back to its original markup. In-place editing changes text nodes only; it blocks or rejects structural edits. Updated text is copied into the original markup, never serialized from the sanitized rendered DOM. Typing uses `element.update` and the deck's undo history. Other markup changes, including undo or an agent write, cause the renderer to rebuild the content.
