# ADR-098 — Ready-made content in every language of the app

Status: Implemented in the 2026-10-16 working tree; **not committed** and **not published** at the time of this record. The author copy of the media library (`../Slidr-media`) was not changed: the new template, the two designs and the regenerated font catalog were merged into a scratch copy, staged, and tested from there.

## Request

For the support of more languages: one template in every language, two designed slides in every language, and for now no event frames (magnets) beyond Hebrew and English. The instructions, both those of a session in this repository and those of the management studio, are to keep Hebrew and English as the default and make another language only when a request chooses it.

"Every language" is the sixteen of the interface that another session was adding at the same time (`apps/desktop/src/i18n`): Hebrew, English, Arabic, German, Spanish, French, Italian, Brazilian Portuguese, Russian, Turkish, Vietnamese, Indonesian, Hindi, Japanese, Korean and Simplified Chinese.

## Context

- Template samples and designs were stored as `{ he, en }`, and two readers rebuilt them so, dropping any other key (`builtin/index.ts`, `designs/registry.ts`). The app picked the variant as Hebrew for a Hebrew deck and English for anything else.
- A deck can already be in any language: the agent sets `meta.lang` when it writes, translates or imports a deck, and the Welcome screen now makes decks in the interface's language.
- The fonts of the library shipped their Latin and Hebrew subsets only. Russian and Arabic text fell back to the system's faces.
- Drawings of the authored templates hold words in Hebrew and English (`READABLE` in Anan and Mutzar), which no third language can take.

## Decision

- **One registry of content languages**, `packages/model/src/languages.ts`: the codes, their direction, their names, the script tag their letters need, and `Localized<T>` (`he` and `en` required, the others optional). `apps/desktop/src/templates/contentLanguages.test.ts` holds it to the interface's languages.
- **A deck gets a piece in its own language when the piece is written in it, else the English one, drawn left to right as it was written** (`writtenIn`, `pieceLanguage`, `inLanguage`). This is the rule the other session had given the template samples; the designs follow it too. Hebrew and English stay required in every piece.
- **Samples and designs keep every language.** `builtInSamples`, the design catalog (`designCatalog.ts`, `designs.ts`), the authoring registry and kit (`DesignEntry.more`), `check.ts`, the review page and the tests read whatever languages a piece has. The contract tests run each design in each of its languages (the subject point mirrored for a right-to-left one) and each template sample in each of its languages (`acceptance.ts`).
- **Event frames stay in Hebrew and English.** Nothing of `frames.ts` changed.
- **Fonts.** `scripts/gen-builtin-fonts.mjs` ships the Cyrillic, Arabic, Vietnamese and Devanagari subsets of the families that have them, tags each family with the scripts it ships, copies the files into the library, and takes `SLIDR_MEDIA_DIR`. Rubik is the only family with Arabic, Poppins the only one with Devanagari; seven have Cyrillic. No family has Japanese, Korean or Chinese: those are set in the system's faces (on Windows Yu Gothic, Malgun Gothic, Microsoft YaHei). The theme's font pair stays `{ he, latin }`: a template that is to read in Arabic names Rubik in it.
- **Atlas**, a new template (`packages/templates/src/authoring/atlas.ts`, its copy in `atlas/<lang>.ts`): a sheet of a modern atlas, with its sample deck written in all sixteen languages. No drawing holds a word; the globe and the numbered pins are drawn upright in a left-to-right deck, the globe of the opening on the other side of its box. Its fonts are Rubik with Montserrat for titles and Rubik with Inter for text. The sample sets its Hindi titles, quote and opening subtitle with more leading than the theme's (`LEADING`): Devanagari's vowel signs meet across lines as tight as Latin display type.
- **Two designs**, `m-nightmarket` (food) and `m-paneltrain` (tourism), in `designs/world.ts`, drawn once for left-to-right languages and mirrored for Hebrew and Arabic, their pictures turned with them. Each run names a family with its letters. Their pictures were made with the Codex CLI.
- **The instructions.** `AGENTS.md` says to write a design in Hebrew and English, and in another language only when the request names it, and to render and inspect it in each. The management studio gives each request a choice of languages: Hebrew and English always, and the default; any of the other fourteen when ticked (`management/README.md`).
- The design guidelines of the app's agent say "Hebrew or Arabic" where they said "Hebrew" (`packages/prompts/src/design.ts`). A longer line about the fonts of other scripts was left out: it took the prompts past their budgets.

## Considered and rejected

- **Falling back by direction** (Hebrew for an Arabic deck). An Arabic reader is likelier to read English than Hebrew, and the other session had already chosen English.
- **A third family in the theme's font pair** for other scripts. A schema change, and a catalog that older apps would fail to read.
- **Bundling Noto Sans CJK.** Tens of megabytes in the library for faces Windows already has.
- **Language keys beside a design's own fields.** The code of Indonesian is `id`.

## Verification

- Unit tests (against the staged library): the model, the templates package (Atlas's sample in every language builds, every layout is shown, a round trip through every other template returns the deck), the designs' contract in every language, the fonts the agent may name, the prompts. 882 passed. One failed, as it does against the published library: the managed `invitations` group has one design, and the gallery wants four.
- Browser tests: Atlas's acceptance in all sixteen languages, every background variant, and the model's sample decks switched to it.
- Every slide of Atlas and both designs were rendered in all sixteen languages, at full size and as thumbnails, with the review page's overflow measurement and the design check, and looked at. What that showed was fixed: titles that broke badly, a table header that wrapped, Devanagari lines that met, a scrim too light under the text of the night market, station labels that collided.
- The management studio: 24 unit tests, and one variant rendered in Hebrew, English, Arabic, German and Japanese.

## Open for the user

- **Publishing.** Atlas, the two designs and the font catalog reach the app only when they are merged into `../Slidr-media` and published (`pnpm media:publish`). The fonts must be regenerated there first.
- **The interface's translations** of the new template's name and tagline: Hebrew and English are written; the other languages show the English until the translation files have them.
- **Japanese, Korean, Chinese and Hindi** take the system's faces in Atlas, so an exported deck shows the faces of the machine it is opened on.
