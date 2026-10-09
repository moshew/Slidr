# ADR-040 — Edit and save templates through the deck model

Status: Adopted. This is the current English summary of the decision. The original implementation log remains available in Git history.

## Decision and current interpretation

The app's Templates panel applies built-ins and personal templates. Editing a template changes the open deck's theme and layouts through existing commands, so the Stage previews the change and undo works normally. Rust stores personal template JSON and assets in app data without interpreting template structure. Assets are copied into the workspace before commands refer to them. A default template is a per-machine preference; a new deck otherwise starts blank. The built-in library has since grown to 17 templates ([ADR-076](ADR-076-template-layouts.md)).
