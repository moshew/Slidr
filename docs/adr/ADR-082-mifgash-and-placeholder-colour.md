# ADR-082 — The Mifgash template, and a colour a placeholder gives its text

Status: Implemented in the 2026-10-09 working tree; **not committed** at the time of this record. This extends the template engine in [ADR-023](ADR-023-template-engine.md) and the built-in catalog in [ADR-076](ADR-076-template-layouts.md), and closes the question left open in [ADR-054](ADR-054-ai-finish-templates-outline-chat.md) of whether a placeholder needs a colour of its own.

## Context

The user asked for a template after an agenda slide of a webinar deck: a royal blue ground with white titles, and white cards with dark text and a hot pink numbered tile on the edge of each. Text took its colour from its text style alone, and every style of a theme has to read on the theme's ground, so a layout could not seat dark text on a white card of a dark slide. The first version of the template drew its cards in a lighter blue for that reason; the user approved the model change that white cards need.

## Decision in the working tree

- **The model.** `Placeholder.color` is the colour a layout gives the text of a placeholder, in place of its text style's. `TextElement.color` is the colour of a text box's text where a run sets none. Both are optional; a deck without them is unchanged, and no migration is needed. A mark on a run still wins.
- **Where it comes from.** `slideFromLayout` copies the placeholder's colour to the text box it makes. Nothing else sets it: the text tools colour runs, as before.
- **It follows the seat**, as the vertical alignment does (`followPatch`). Text that moves to another placeholder, on a change of layout or of template, takes that placeholder's colour or gives its own up. Text the new layout has no seat for stays where it is and loses the colour, since the card that was under it is gone. Text that already stands on a seat of the new layout takes that seat's colour and counts as filling it (`arrivalsOf`); a slide moved from cards to a text layout and back is the slide it was.
- **Drawing and editing.** The renderer, the text editor and the hint of an empty placeholder draw the box's colour as the default of its paragraphs. The text toolbar shows it as the text's colour, and "update the style to match" does not write it into the theme's text style. The contrast fix of Design Check reads it when it decides which runs to recolour.
- **What stays.** A theme still offers only grounds that all five of its text styles read on: a ground is under every text of a slide, a card under the text its layout seats on it.
- **Mifgash** is the eighteenth built-in template: sixteen layouts in both directions, a sample deck in Hebrew and English, and seven pictures in a blue duotone under `docs/reference-decks/images`. Its cards are the theme's text colour with the ground's colour as their text, so the pair reads in any palette. The card of a chart stays the lighter blue, because a chart takes its text colours from the theme. The leaning band of a video call is drawn as SVG: a layout of a built-in template cannot carry a picture file.

## Consequences and checks

Text dragged off a card by hand keeps the card's colour until the user recolours it or moves the slide to another layout. A placeholder colour is not yet measured when the agent drafts a template from HTML (`draft.ts`), and the agent's layout listing does not name it.

Unit tests cover the copy on a new slide (`compose.test.ts`), the seat rules (`relayout.test.ts`, `changeLayout.test.ts`), the drawing (`SlideRenderer.test.tsx`) and the toolbar (`format.test.ts`). On 2026-10-09 the template passed its acceptance run in the browser: every layout in both languages through the real lint, every background variant, and its sample deck moved to and from each of the other seventeen templates. The same run of `builtInTemplates.browser.test.ts` failed for `shidur` alone (text that outgrows its frames when other decks move to it), which this change does not touch. The whole E2E suite and the packaged build were not run.
