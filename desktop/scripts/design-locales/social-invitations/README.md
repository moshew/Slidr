# Social posts, invitations and a workshop in all sixteen languages

Fifteen existing designs that were published only in Hebrew and English:
`possibility`, `momentum`, `thumbnail`, `podcast`, `poll`, `travel`, `tip`, `bts`,
`didyouknow`, `wedding`, `birthday`, `savedate`, `anniversary`, `expecting`, `workshop`.

The fourteen language files supply the editable text in element order. `source.json`
records the English copy and prevents regeneration against a changed source. Arabic
uses the Hebrew composition, including its names, venues, prices and date order;
the other languages use English. Sample events take place in 2027.

An explicit `{ "runs": [...] }` entry preserves differently styled source runs.
Where the source has one run, it can also introduce an age unit beside the large
numeral: `{ "text": "歳", "scale": 0.35 }` inherits the source marks and scales its
size. Family and weight selection still use the library's script counterparts.

From the repository root, using a complete copy of the published library:

```powershell
node desktop/scripts/localize-culture-designs.mjs --catalog <source-index.json> --fonts <library>/fonts/catalog.json --locales desktop/scripts/design-locales/social-invitations --out <review>/index.json
node desktop/scripts/review-culture-designs.mjs --catalog <review>/index.json --fonts <library>/fonts/catalog.json --sizes <library>/images/designs/sizes.json --media <library> --locales desktop/scripts/design-locales/social-invitations --out <review> --title "Social and invitations"
```

The existing culture commands retain their default paths. The review supports
`--measure-only --fit` for measured adjustments and `--languages` / `--ids` for
focused repeats. Regenerate after changing translations or `fit.json`, and inspect
the full-size captures and the actual 264 × 149 gallery captures before publishing.
`--boards-only` rebuilds the comparison boards from existing captures.

Publish the reviewed catalog through `media-publish.mjs` from a complete library.
Check the publication report: only `elements/designs/index.json` should change,
with no added or removed library files. Preserve all base slides and every other
design. Verify the deployed catalog against the reviewed bytes after publication.

The 2026-10-19 review includes 240 full-size captures, 240 actual gallery-size
captures and 60 comparison boards in `artifacts/social-invitations-16-languages/`.
It checked 2,000 text boxes and the fonts of 2,217 text runs. Corrections include
heading spacing in Arabic and Hindi, unbroken choice badges, shorter RSVP labels,
age units beside the large numeral, and isolated number ranges in Arabic.
All base slides, image elements, catalog metadata and other designs are preserved.
The font and catalog unit tests pass (15 tests), as do scoped ESLint and formatting.
Published on 2026-10-19 and verified byte-for-byte against both production and the
deployment URL; the evidence is in the review artifact's `publication.json`.
