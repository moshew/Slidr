# ADR-081 — Center the document identity and complete keyboard navigation

Status: Implemented in the 2026-10-09 working tree; **not committed** at the time of this record. This refines the editor shell in [ADR-008](ADR-008-design-system-and-shell.md) and the [design refresh](../design-refresh/SPEC.md).

## Context

The committed refresh put File and document actions in the title bar and kept the product logo at its leading edge. The Filmstrip also supported multi-slide selection but lacked a select-all shortcut when its list had focus.

## Decision in the working tree

- The title bar centers the Slidr logo/name together with the open document name and unsaved dot. The document name has automatic text direction and truncates within the available center space. Empty drag regions on either side keep the native window movable; document controls remain outside those regions.
- The navigation bar uses the same plain icon treatment for Animations and Transitions as for other areas. The compact creation row and shorter contextual toolbar are specified in [ADR-078](ADR-078-stage-editing-refinements.md).
- Ctrl+A in the focused Filmstrip list selects every slide and keeps the current slide as the anchor. It does not replace the same shortcut in an active text editor or other focused control.
- File and Welcome invoke HTML import as an action rather than opening a dedicated navigation panel, as specified in [ADR-077](ADR-077-import-conversation.md). Persisted shell state maps the old import panel ID to AI.

## Verification boundary

The working tree includes shell and select-all E2E changes. Review title-bar balance at narrow widths and in both UI directions, native drag regions, focus isolation for Ctrl+A, and the File/Welcome import path before commit. No fresh application test run is claimed by this record.

