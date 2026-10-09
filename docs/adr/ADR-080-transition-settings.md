# ADR-080 — Keep transition settings beside the selected effect

Status: Implemented in the 2026-10-09 working tree; **not committed** at the time of this record. This refines the animation UI in [ADR-031](ADR-031-animations-panel.md) without changing the runtime contract.

## Context

The transition gallery groups effects in rows of three. When all effect tiles appeared before the controls, a user who chose a tile near the top had to look below the entire gallery to find its direction, duration, advance, and Apply to All settings.

## Decision in the working tree

- `TransitionEditor` places the settings block immediately after the row containing the selected effect. A small pointer in the block follows the selected tile's column and the layout direction.
- Selecting an effect scrolls its settings into the nearest visible area. The scroll is smooth unless reduced motion is requested. Unknown transition names still show their warning and controls after the gallery.
- The existing transition model, `slide.update` writes, gesture transaction, preview, and runtime playback remain the behavior source. This is a control-placement change only.

## Verification boundary

The working tree updates transition E2E coverage. Confirm selection and settings visibility in a short or narrow panel, Hebrew and English ordering, keyboard focus, reduced motion, one-step undo for the duration gesture, and unchanged playback/export before commit. No fresh application test run is claimed by this record.

