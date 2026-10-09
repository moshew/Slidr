# ADR-030 — Use one presenter for app preview and export

Status: Adopted. This is the current English summary of the decision. The original implementation log remains available in Git history.

## Decision and current interpretation

Presentation mode mounts in its own React root and renders slides once in present mode. It uses `createPlayer` and `bindControls` from the shared runtime; fullscreen targets the Tauri window or browser element as appropriate. Presentation keys do not reach the editor. The runtime also implements blank-screen and slide-number navigation, so exported HTML behaves the same way. `animation_set` accepts only names the runtime can play. See [ADR-031](ADR-031-animations-panel.md) and [ADR-032](ADR-032-export-dialog-and-fonts.md) for the editor and export controls.
