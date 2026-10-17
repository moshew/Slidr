# ADR-076 — Built-in templates own their simple layouts

Status: Implemented by `b4a7211`, `62de1ae`, and `10f782f` on 2026-10-07–08.

## Context

The built-in library gained the webinar-oriented `shidur` design and the AI-introduction `bina` design. Simple title and text slides previously looked generic when a template had no explicit version of those layouts. A generic slide ignored the selected template's title placement, framing, footer, and colors.

## Decision

- The built-in list now contains 17 templates. `shidur` and `bina` each have their own theme, layouts, and sample slides. `bina` also has artwork and images in `docs/reference-decks/`.
- `withStandardLayouts` adds missing `title` and `text` layouts to a template using its existing content layouts as the source for title position and style, background, frame, and footer decorations. A template that already defines either layout keeps its own implementation.
- The generated sample slides use the same layouts, and the library inserts them in layout order. This rule applies to older personal templates as well as built-ins; it adds no new deck schema field.

## Consequences and checks

Template authors can draw special simple layouts explicitly; otherwise the fallback must use the template's own design. Tests in `packages/templates/src/standardLayouts.test.ts` and `master.test.ts` cover the derived layouts, and desktop template tests cover selection and previews. This record does not imply a new test run.

## Addition: three templates by subject (2026-10-13)

The user asked for a template for each of three subjects. The library grows from eighteen to twenty-one.

- `kod` (hi-tech): dark graphite and electric lime in the language of a code editor: a tab bar and window dots, a tick gutter, braces around a section number, a diff for the comparison, a commit graph for the timeline and a commit log for the process, a terminal for the closing. Noto Sans Hebrew with Space Grotesk. A monospaced Latin heading face was tried and dropped: the spaces and commas of a heading come from the Latin face, and in a Hebrew line they stood a full cell wide.
- `luach` (product management): a working board with sticky notes in three tints, pins, tape and marker strokes; lanes for the roadmap, a dotted route for the release process. Assistant with DM Sans.
- `magen` (defence-tech): dark olive-slate and signal amber: a range-ring scope with a sweep, viewfinder brackets, hexagonal cells, segmented status bars and contour lines. Noto Sans Hebrew with Montserrat. Its sample is about detection and protection, with an invented company; nothing in it aims at a person.
- Each draws fourteen layouts and a sample deck of fifteen slides in Hebrew and in English, with six generated pictures (three calls of Codex CLI each, nine in all). None seats a picture on its opening slide, so none has a cover photograph in `covers.ts`.
- **Where a template is written now.** The catalog of the media library is what the app reads, and until now nothing wrote a template into it. `apps/desktop/scripts/export-templates.mjs` does: it loads `Slidr-media/archive/templates-source/<id>.ts` (the three stand beside the sources of the eighteen), adds the standard text layout and its sample, holds the result to the role contract, and writes the catalog, `templates/index.json` and `templates/<id>/template.json`.
- **How it was built and checked.** Three agents drew the three at the same time, each against the acceptance tests of a draft (`acceptDraft`): the contract, every layout in both languages with no error and no L07 or L16, every background variant, and its sample deck moved to each of the eighteen templates and theirs to it. Each builder looked at its slides at full size; the lead looked at both contact sheets of each and at single slides. This record does not say what the tests of the whole library reported afterwards.

## Addition: the templates of the authoring folder (2026-10-15)

On the same day a session in the cloud authored five technology templates in `packages/templates/src/authoring/`: Kod, Anan, Magen, Shvav and Mutzar. Two of them took the ids of templates above, with other designs. The user kept the library's: `kod` and `magen` are the ones of this record, and the authoring folder's Kod and Magen were removed, with their pictures and the pages they were rendered from. Anan (cloud architecture), Shvav (hardware) and Mutzar (a product launch) were merged into the library by `merge-into-library.mjs`, with fifteen ready-made slides of the same folder, and published: the library has twenty-four templates.

- **What was checked.** All three were drawn from the merged library, not from the authoring folder, in Hebrew and in English on sheets of 470 pixels a slide, and looked at; the design check reported nothing for any of them, and the same for the fifteen slides. The unit tests ran against the merged library: 2,988 pass; `look.test.ts` fails because `gan` and `bina` share a font pair, as it did before the merge, and two tests of `designRules.test.ts` fail on files neither change touched.
- **Not done.** The acceptance tests of the app (`acceptDraft`, a deck moving to and from every template) were not run against the merged library, and the three were not applied in the running app.

## Addition: Kod in every language (2026-10-16)

The user asked for Kod to be translated into every language of the app without changing the template, and not by sound from the Hebrew: its name is the word for code in each language ("Code", "Código", "Код", "コード", "代码"…), not "Kod".

- **The name.** `name.kod` is "Code" in `src/templates/messages.ts` and the word for code in each of `src/i18n/locales/*.json` (Turkish already had "Kod", its own word). The theme keeps `name: 'Kod'`, which shows only where a message is missing.
- **The sample.** `archive/templates-source/kod/<lang>.ts` hold the words of the fourteen other languages (`kod/copy.ts` lists them), written from the English deck for that language's engineers: the terms they keep in English (deploy, build, merge, rollback, pipeline, canary), the names of people in their letters, their own way with numbers, dates, halves of the year and percent signs. `kod.ts` builds them on the English slides (`sampleIn`); the Hebrew and English decks, the theme and the layouts are unchanged, and the catalog's `kod` entry and its `he` and `en` samples are byte for byte as before.
- **What a script needed.** Hindi display titles and the quote are set with more leading (`LEADING`), and its night-shift title is one line. Korean gives its quote, the timeline, the cards, the team and the text slide's lead in lines (`Wrapped`), because the renderer breaks Hangul between any two syllables; Japanese and Chinese give the quote in lines too. Arabic widens the number columns of its table (`incidents.cols`) so that "النصف الأول 2026" stays one line: a header in Latin letters reads left to right and stood off its column, and a date after "Makaf" was pulled into its run, so the cover's line opens with the date.
- **How it was checked.** Every slide of the fourteen languages was rendered at full size and on sheets of 470 pixels, three times, with the review page's overflow measurement and the design check; four reviewers read every full-size slide of their languages against the English one, and what they found was fixed (words alone on a line, a unit cut from its number, a small kana or a long-vowel mark opening a line, Turkish suffixes, Russian prepositions at a line's end) and rendered again. The design check reports nothing beyond what the Hebrew and English decks have. `acceptTemplate` for Kod (every layout without error in each of its sixteen languages, every background variant) passes, 19 tests, against the staged library. The catalog was published: 21.6 MB of the 25 MB a file of Pages may be.
- **Open.** A Korean paragraph that is not given in lines still breaks inside words; `word-break: keep-all` for Korean in the renderer would fix it for every deck. The names of the other templates are still Hebrew words in Latin letters.

See also [ADR-039](ADR-039-reference-decks-and-templates.md), [ADR-040](ADR-040-templates-in-the-app.md), and [ADR-063](ADR-063-design-check-and-templates.md).
