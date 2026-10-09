# ADR-013 — Apply formatting to the actual text target

Status: Adopted. This is the current English summary of the decision. The original implementation log remains available in Git history.

## Decision and current interpretation

Formatting commands operate on either the current TipTap selection or the complete selected text element, using matching pure transforms for both paths. With only a caret, character formatting becomes stored marks for future typing. The toolbar reports effective values or a mixed state. Clipboard markup is parsed into the model's constrained `RichText`, and each formatting gesture forms an undo step. The current working tree adds alignment and direction menus ([ADR-078](ADR-078-stage-editing-refinements.md)).
