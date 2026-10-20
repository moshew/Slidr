# Culture and leisure slides

Translations of the fifteen existing `culture` designs into every content language. Each
language file lists the text elements of each English slide in reading order; `\n` is an
intentional paragraph break. Figures, artist names, wine varieties and prices retain the
sample's meaning. Event dates refer to future sample events in 2026–2027.

`source.json` records the English copy the translations were written against. The generator
refuses changed or missing source text rather than pairing translations with the wrong box.
Arabic uses the Hebrew composition and paragraph styling; all other languages use English.
Fonts come from each source family's counterpart in the media library's font catalog.

From the repository root:

```powershell
node desktop/scripts/localize-culture-designs.mjs --catalog <index.json> --fonts <fonts/catalog.json> --out <index.json>
node desktop/scripts/review-culture-designs.mjs --catalog <index.json> --fonts <fonts/catalog.json> --sizes <images/designs/sizes.json> --out test-results/culture-localization
```

The review writes full-size and gallery-size renders for every design in all sixteen
languages, a contact sheet per language, and text measurements. Its `--fit` mode writes
measured size adjustments to `fit.json`; regenerate and render again after changing them.
Inspect the PNGs as well as the measurements. Copy the resulting catalog into the author's
media library only after the review; publishing the library is a separate operation.

Use `--languages ar,vi` or `--ids concert,trivia` for a focused repeat after a correction.
`--boards-only` rebuilds the contact sheets and comparison boards from the saved captures.
Vietnamese and Hindi use more leading for stacked accents and vowel marks; other non-Latin
scripts retain at least 1.2 leading. The Arabic telephone number is isolated left to right.

The 2026-10-19 review covers `trek`, `dinner`, `concert`, `book`, `yoga`, `film`,
`exhibition`, `theatre`, `standup`, `festival`, `winetasting`, `market`, `museum`,
`trivia` and `race`: 240 full-size captures and 240 actual gallery-size captures.
The saved review is in `artifacts/culture-slides-16-languages/`, including an offline gallery.
It corrected accent collisions in condensed headlines, wrapped badge words, undersized
ticket labels and the direction of the Arabic telephone number. All base slides, other
designs and image elements are preserved. Generation validates slide schemas and font
coverage; the review also measured 2,848 text boxes. TypeScript and scoped ESLint checks pass.
