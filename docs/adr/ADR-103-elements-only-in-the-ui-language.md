# ADR-103 — Elements offers only what is in the language of the interface

Status: Implemented in the 2026-10-16 working tree; **not committed** at the time of this record. It reverses, for Elements, the rejected alternative of [ADR-101](ADR-101-ready-made-content-in-the-ui-language.md) ("Hiding a piece not written in the UI language").

## Request

"When the language is switched, show only the elements in that language, apart from fonts, icons and the like, which do not depend on a language."

## Context

- After ADR-101 the panels drew their pieces in the UI language, and a piece not written in it in English (ADR-098). Every piece was still offered: an English interface had the Hebrew letters among the frames, a Hebrew one the English letters, and a German one the Hebrew and English magnets, the English card sets and every design in English.
- What of Elements is written in a language: the designs (Hebrew and English each, a few in more), the card sets (Hebrew and English words), the magnets among the frames (captions and labels in Hebrew and English), and the frames of the Hebrew and of the Latin letters. Shapes, graphics, emoji, icons, tables, and the other frames have no language.

## Decision

- **Elements offers a piece only in the languages it is in, and a piece with no language in all of them.** It follows the UI language (`useLanguage`), live, whatever the open deck is in.
  - Designs: those drawn in the language (`designIn`, `designsIn` in `designs.ts`). A group with none is not shown, nor is the collection when it has none at all.
  - Card sets: in Hebrew and English only (`cardSetsIn` in `cardSets.ts`). Elsewhere the collection is not shown.
  - Frames (`frameIn`, `framesIn` in `frames.ts`): the Hebrew letters in Hebrew; the Latin letters in the languages written in the Latin alphabet (by `LANGUAGE_SCRIPT`: `latin`, and Vietnamese); a frame with words beside its picture, a magnet, in Hebrew and English. A group with none is not shown. The search of the collection and of the first screen looks only in what is offered.
  - The first screen of Elements leaves out a collection with nothing in the language (`offered` in `ElementsPanel.tsx`). Without the media library a collection is still offered and says that it could not be loaded.
- **A collection or a group that is open when the language is switched**, and has nothing in the new one, goes back to the level above it.
- **Unchanged**: the Templates panel (each template is offered in every language, as ADR-101 has it; [ADR-104](ADR-104-templates-only-in-their-languages.md) changed that next), the fonts, and what is already on a slide.

## Consequences

- In Hebrew and English every design and card set is offered; Hebrew has no Latin letters among the frames, and English no Hebrew letters.
- In the other fourteen languages Elements has no card sets and no magnets, and only the designs drawn in the language: three in German on 2026-10-16 (the studio's designs in every language). The galleries grow as pieces are written in more languages (ADR-102).
- The name of a managed design comes from `managed.json`, which names it in Hebrew and English only: a German interface shows a German design under its English name.

## Verification

- Typecheck of the desktop app; ESLint and Prettier on the changed files.
- Unit tests: `frames.test.ts` (the groups each language is offered, and the frames shown first in every language), `designs.test.ts` (in Hebrew and English every design, elsewhere only those drawn in the language), `cardSets.test.ts` (`cardSetsIn`). The one failure in these files was there before: the `invitations` group has one design and the gallery wants four.
- Browser test `elements-panel.spec.ts`, "a switch of the language leaves only what is in the new one": Hebrew frames without the Latin letters; the Hebrew letters, open in full, closed by the switch to English, and English frames without them; in German no magnets, no card sets on the first screen, and only designs whose drawn slide is `lang="de"`; back in Hebrew, all of it again. The English frames test opens the English letters in place of the Hebrew ones. The screenshots in `test-results/elements/language-*.png` were looked at. The designs test that wants 19 groups fails before and after this change: `managed.json` adds two groups.
