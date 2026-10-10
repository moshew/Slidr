# ADR-088: Text backgrounds resize along either axis

## Request

The pool-party sign should become longer when a side is dragged, and taller when its top or
bottom is dragged. Its opposite dimension must stay put. Resizing a magnet should lengthen its
text backgrounds with the frame, while keeping text editable and retaining the size of stickers.

## Decision

- An SVG may carry `stretch`: its authored viewBox, artwork scale, and flexible bands along each
  axis. This extends the existing SVG element; selection, colour editing, saving and export use
  the same element and markup.
- The renderer stretches only these bands. Fixed sections keep their scale, and multiple bands
  can protect an ornament in the middle. The pool sign preserves its screws, corners and wave.
  At sizes below the space needed for the fixed sections, all artwork shrinks uniformly.
- The drawing is stored once and rendered through masked SVG sections. Hard shared mask edges
  prevent hairline seams at fractional zoom. Everything needed survives an offline HTML export.
- Side handles on a stretchable SVG change one axis. Its label group maps the editable text
  boxes through the same bands without changing the font size. Corner handles on the SVG retain
  the usual proportional resize.
- All 125 labels in the 100 event magnets receive flexible bands. When a magnet grows, the
  ends of a label follow their positions along the picture. Rotated labels use their local axes;
  widening a magnet does not lengthen its vertical surfboard. Stickers keep their existing sizing.
- A saved label with matching catalogue artwork gains the metadata on its first resize, within
  that resize's undo step. User text, formatting and element IDs stay intact. Altered SVG markup
  is left as authored. Opening a deck does not rewrite its contents.

## Verification

- 105 targeted model, renderer, frame and stage tests pass, covering serialization, reversible
  mapping, independent axes, fixed details, vertical labels, groups and multiple selection.
- Browser tests cover Hebrew and English pool signs, SVG and group edge dragging, resizing the
  whole magnet, saved-label upgrades and exact undo; existing frame resizing is also checked.
- All 100 magnets rendered in Hebrew and English at full slide size and thumbnail size, plus
  wider and taller variants. Contact sheets were visually inspected. The review found and fixed
  fractional-zoom seams and the vertical surfboard growing along the wrong axis. The final
  measurements report no overflowing text or unintended changes to the opposite frame dimension.
- Pool and birthday magnets export to HTML and render offline with no external requests or page
  errors. Review files are under `apps/desktop/test-results/text-backgrounds/`.
- Desktop TypeScript and ESLint checks pass.
