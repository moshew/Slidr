# ADR-006 — Edit bidirectional text directly on the scaled slide

Status: Adopted. This is the current English summary of the decision. The original implementation log remains available in Git history.

## Decision and current interpretation

TipTap runs inside the selected text box on the slide, even when the Stage is scaled with CSS transforms. The original spike tested Hebrew, English, mixed punctuation, and several zoom levels; it found no need for a separate editor overlay or CSS zoom. The renderer supplies the text slot and the Stage owns focus and selection; see [ADR-009](ADR-009-slide-renderer.md), [ADR-012](ADR-012-stage-and-text-editing.md), and [ADR-013](ADR-013-text-formatting.md).
