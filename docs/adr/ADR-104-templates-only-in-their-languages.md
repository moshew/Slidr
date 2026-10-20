# ADR-104 — A language offers only the templates written in it, in the app and in the studio

Status: Implemented in the 2026-10-16 working tree; **not committed** at the time of this record. It does for templates what [ADR-103](ADR-103-elements-only-in-the-ui-language.md) did for Elements, and reverses for them the rejected alternative of [ADR-101](ADR-101-ready-made-content-in-the-ui-language.md).

## Request

"In the studio and in the app, for a given language, show only the templates written in it."

## Context

- A built-in template is written in a language when its sample is (`templates/catalog.json`, `samples[<template>][<lang>]`). Every sample is written in Hebrew and English; on 2026-10-16 Shidur and Atlas were written in all sixteen languages, the other 23 in those two.
- The app offered every template in every language: one whose sample is not written in the UI language showed the English sample (ADR-098, ADR-101).
- The studio's library showed every template too, with a switch to show only those written in the language shown.

## Decision

- **The app offers a built-in template only when its sample is written in the UI language** (`offeredIn`, `useTemplatesIn` in `desktop/src/templates/written.ts`): the Templates panel, the welcome screen (its row, its count and its showroom), and the template gallery of Actions. It follows the UI language, live.
  - A personal template is offered in every language: it has no sample, and is shown in the app's own words for each role. So is a built-in template the catalog has no sample of.
  - The languages come from the catalog of the samples, which is large and read when the app is idle (`readSamplesAhead`). Hebrew and English do not wait for it. In another language the built-in templates come once it is read; until then only the personal ones are shown.
  - The slides of a template the language was switched away from, spread over the Stage, are closed.
- **The studio's library shows only the templates whose sample is written in the language shown**, with how many of all they are (`library/Templates.tsx`). The switch is gone. A template's detail offers its sample only in the languages it is written in. The note of the section says that only what is written in the language is shown (`onlyWritten` in `sections.ts`), not that the rest is shown in English.
- **Unchanged**: applying a template, the default template of new decks, a deck already on a template, and the palettes and font pairs that Actions takes from the templates (fonts and colours have no language). `builtInSampleDeck` still draws the English sample for a deck in a language its template is not written in, for a deck that has such a template.

## Consequences

- In the fourteen languages other than Hebrew and English, the galleries hold Shidur and Atlas and the user's own templates, and grow as the studio writes samples in more languages (ADR-102).
- The name and tagline of a template are the app's messages, translated apart from the sample: Atlas's tagline is still English in a German interface.

## Verification

- Typecheck of the desktop app and of the studio; ESLint and Prettier on the changed files.
- Unit test `written.test.ts`: every template in Hebrew and English without the languages; in another language only those written in it, and none until the languages are known; a personal template, and one without a sample, everywhere.
- Browser test `templates-panel.spec.ts`, "a language offers the templates written in it": in Hebrew every template, the same as the catalog lists; the slides of a template not written in German, open as the UI is switched to German, close; the panel, Actions and the welcome screen then list exactly the templates the catalog writes in German, and the welcome screen counts them; back in Hebrew, all of them. The screenshots `test-results/templates/language-*-de.png` were looked at.
- The studio, driven in a browser on its dev server: 25 templates in Hebrew, 2 in German and in Japanese, with the note; the detail of Shidur in German shows its German sample, with only its languages to pick.
