# ADR-016 — Edit cropped images and grouped elements in Stage coordinates

Status: Adopted; Stage handling is refined by [ADR-078](ADR-078-stage-editing-refinements.md) in the current working tree. This is the current English summary of the decision. The original implementation log remains available in Git history.

## Decision and current interpretation

Group-local and slide coordinates are converted with matrices, including nested, rotated, and reflected groups. A crop gesture changes the image frame and visible source together; each gesture is one undo step, and group bounds update in the same batch. Group navigation is transient Stage state, while `editingElementId` identifies the object being edited. The current working tree refines edge-handle crop behavior and text-frame drags in [ADR-078](ADR-078-stage-editing-refinements.md).
