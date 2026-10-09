# ADR-020 — Use the same playback runtime everywhere

Status: Adopted. This is the current English summary of the decision. The original implementation log remains available in Git history.

## Decision and current interpretation

`@slidr/runtime` is a small TypeScript package without React or model dependencies. It controls transitions and animations through Web Animations and restores renderer output when cleared. The player owns slide wrappers and timeline state; `bindControls` separately handles keyboard, clicks, touch, links, and fullscreen. The editor preview, presentation mode, and standalone HTML export use the same runtime. Preset names were expanded in [ADR-075](ADR-075-elements-and-presets.md).
