# ADR-015 — Compose arrangement and slide operations

Status: Adopted. This is the current English summary of the decision. The original implementation log remains available in Git history.

## Decision and current interpretation

Alignment, distribution, grouping, ordering, duplicate, copy/paste, and slide management compute batches of existing model commands through `packages/model/src/compose`. The UI and Deck API use the same composition logic, so one operation is one undo step. Alignment is physical on the slide even in a Hebrew UI. The Layers panel can select hidden or locked objects that the Stage cannot pick directly. The Filmstrip remains independent of shell layout.
