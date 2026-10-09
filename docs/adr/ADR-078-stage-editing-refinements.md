# ADR-078 — Keep editing controls attached to the object being edited

Status: Implemented in the current working tree on 2026-10-09; **not committed** at the time of this record. This updates the interaction details in [ADR-013](ADR-013-text-formatting.md) and [ADR-016](ADR-016-stage-crop-lines-groups.md).

## Context

An image edge, an image corner, and a text box that is currently being typed in require different drag behavior. Generic resize controls hid those distinctions. The working tree also simplifies the creation and alignment controls and removes a redundant selection label from the contextual toolbar.

## Decision in the working tree

- For a regular image whose picture covers its frame, an edge handle moves the frame edge while keeping the picture in place. It crops or reveals more of the picture. If the edge passes the picture, the picture grows to keep the frame covered. A corner sizes the whole image; an image in a `smartFrame`, an SVG, and video keep their existing resize behavior. `cropStretch` and `coversFrame` calculate the image view in `stage/crop.ts`.
- The Stage shows the picture outside the frame, dimmed, during such an edge drag. Corner dots and edge bars have larger, distinct targets; the active handle remains highlighted. This is a view and interaction change, not a new image schema field.
- A text box can be moved, resized, or rotated by its frame while its text editor remains open. The caret regains focus after the drag; Alt-drag of a box being typed in moves it instead of duplicating unfinished text.
- Paragraph alignment opens an icon menu in both normal and compact layouts. The compact text menu also contains paragraph direction. The creation row uses compact icon buttons, and the contextual row no longer repeats a selection label.

## Limits and verification

The interaction changes are covered by modified `stage/crop.test.ts`, `stage/overlays.test.ts`, `editor-shell.spec.ts`, `text-format.spec.ts`, and related E2E files in the working tree. This record does not claim they have passed. Behavior for a picture that does not cover its frame and for modified keys should be checked against those tests before commit.
