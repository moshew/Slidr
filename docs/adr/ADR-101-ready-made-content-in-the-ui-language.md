# ADR-101 — Ready-made content in the language of the interface

Status: Implemented in the 2026-10-16 working tree; **not committed** at the time of this record.

## Request

"When the language is changed, I want only the elements and templates in that language to appear and be available. Now, when switching to English, the Hebrew templates and elements stay."

## Context

- The panels drew their ready-made content in the language of the open deck (`deck.meta.lang`, ADR-098): the covers and sample slides of the Templates panel, the template gallery of the AI chat's Actions, and in Elements the designs, the frames (event magnets with their captions) and the card sets. What a click added was in that language too.
- A deck is made in the UI language and keeps it. The deck open when the language is switched in Settings stays Hebrew, so after switching to English every one of these stayed Hebrew, under names that the UI already gave in English.

## Decision

- **The panels offer their ready-made content in the UI language, whatever the open deck is in** (`useLanguage` in `i18n/index.ts`). It is shown in that language and goes onto the slide in it: a design is the English slide in a Hebrew deck when the UI is English. A language a piece was not written in still gets the English one (ADR-098).
- **Templates**: the covers, and the slides spread from a cover, are made for an empty deck in the UI language and its direction (`useLike` in `PreviewGrid.tsx`), as on the welcome screen. Applying a template changes the look of the deck, not its language or direction.
- **Elements**: `insertDesign`, `insertFrame`, `framePicture` and `insertCardSet` take the language, or the reading, the panel showed. A new card set reads in the UI language (`readingIn`: Hebrew or English words, and its cards from the side the language reads from).
- **A card set on a slide keeps the reading it was made in.** Row B adds and removes cards in it (`readingOfSet`): Hebrew when a word of it is Hebrew, from the right when its first card is right of its second. What a set cannot tell (no words, or one card a row) comes from the UI language. Before, row B used the deck's reading, which would put Hebrew cards into an English set and turn its order.
- **Unchanged**: the open deck's language and direction, and what follows them: shapes, lines, the single card, tables and charts, which are parts of the deck and not pieces in a language. Stickers and emoji have no language.

## Considered and rejected

- **Switching the open deck to the new language.** Its own text would be laid out in the other direction.
- **Hiding a piece not written in the UI language** (only Atlas and two designs in German). The galleries of fourteen languages would be nearly empty; a deck in such a language gets the English piece, as ADR-098 decided. *The user then asked for it in Elements: [ADR-103](ADR-103-elements-only-in-the-ui-language.md), and for the templates: [ADR-104](ADR-104-templates-only-in-their-languages.md).*

## Verification

- Typecheck of the desktop app; ESLint on the changed files.
- Unit tests: `designs.test.ts` (a design is added in the language given, not the deck's), `cardSets.test.ts` (`readingIn`, and `readingOfSet` reads back every set in all four readings, with one card too). The two failures in these folders were there before: the `invitations` group has one design and the gallery wants four, and the translation files lack Atlas's name and tagline (ADR-098).
- Against the dev server, with a temporary Playwright test since removed: the app opened in Hebrew, the UI switched to English in Settings, the deck still Hebrew. The template covers, the slides of a template, the designs and the event magnets were seen in English; a card set went on in English from the left, and a card added from row B was English and came last; a design went on as the English slide. A card set added in an English UI and in a Hebrew one has the same design finding (the slide is not filled), and no direction finding.
