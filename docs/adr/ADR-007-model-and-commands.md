# ADR-007 — Keep one model schema and command path

Status: Adopted. This is the current English summary of the decision. The original implementation log remains available in Git history.

## Decision and current interpretation

`packages/model` owns the Zod deck schema and command definitions. UI and agent writes go through the same `CommandBus`; the deck store has no direct write path. Immer patches implement undo/redo, and a transaction ID groups one user gesture or agent turn into one history step. The original catalog had 19 commands; later decisions added `asset.remove` and `element.replace`, so that historical count is no longer current. Changes to the schema or command catalog must be reflected in SPEC and the relevant later ADR.
