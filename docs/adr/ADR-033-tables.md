# ADR-033 — Edit tables with existing commands and an in-cell editor

Status: Adopted. This is the current English summary of the decision. The original implementation log remains available in Git history.

## Decision and current interpretation

Table edits are pure transforms that produce an `element.update`, while text in a cell uses `text.set` with a cell address. The Stage switches between object selection and cell selection. `TextEditor` mounts inside the renderer's cell slot, preserving cell padding and borders. Row height follows measured text and updates in the same undo step. The table direction controls start/end alignment of cell text even when that text has its own language direction.
