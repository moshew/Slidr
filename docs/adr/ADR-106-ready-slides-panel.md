# ADR-106 — The designs move out of Elements into a Ready slides panel

Status: Implemented in the 2026-10-18 working tree; **not committed** at the time of this record. It moves the Designs collection of [ADR-079](ADR-079-elements-designs.md) out of the Elements panel of [ADR-075](ADR-075-elements-and-presets.md), and keeps the languages of [ADR-103](ADR-103-elements-only-in-the-ui-language.md).

## Request

"Would it make sense to move Designs out of Elements, for example into a separate tab, perhaps with a different name?", then "Do it."

## Context

- Every collection of Elements puts a piece on the open slide. A design adds a whole slide after it (`insertDesign`): another action under the same roof.
- The designs had grown to some 290 compositions in about twenty groups, with a search and groups of their own. The search of Elements' first screen did not look in them.
- Many of them (invitations, posts, thumbnails) are a finished piece in one slide: a place to start, not something added to a slide.

## Decision

- **A panel of its own**, `designs` in the `tools` slot at order −1.5: after Templates (the look of the whole deck) and before Elements (what goes on the open slide). Its icon is `GalleryVerticalEnd`.
- **The name is "Ready slides"**: it says what a click does. "Designs" collided with "Design check" and did not say that a slide is added. The caption in the Activity Bar is "Slides" (`elements:designs.caption`); the tooltip and the title bar carry the full name. Every translated language has both.
- **`DesignsPanel`** (`DesignsCollection.tsx`) holds the collection as it was. The title bar of the shell names the panel; while one group is open in full, a header under it names the group and leads back (`backTo` with the panel's name), as the header of Elements did.
- **Elements** loses the `designs` collection and its tile. Card sets stay: they go on the open slide.
- A language with no design drawn in it shows a line saying so (`designs.none`), in place of the collection that ADR-103 left out of Elements' first screen.

## Not changed

- What a design is and how it is added; the strings of the designs and their groups; the action `insert.elements` of row A.

## Verification

- `tsc --noEmit` for the desktop app.
- `e2e/elements-panel.spec.ts` and `e2e/media-clips.spec.ts` updated to open the designs in their panel; the language test checks the German designs there.
- Renders of the panel in Hebrew, English, Russian and Turkish: the caption fits the bar, and a group opened in full has its header and back button.
