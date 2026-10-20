# Holidays, greetings and family celebrations

Twenty-five existing designs, originally published only in Hebrew and English:
the twenty designs of `holidays`, plus `newborn`, `engagement`, `housewarming`,
`bachelorette` and `retirement`.

The fourteen language files translate the editable text in element order.
`source.json` records the English text; generation rejects changed source copy.
Arabic follows the Hebrew composition and its sample details. Other languages
follow English. An explicit `runs` array preserves the two-colour Hanukkah and
Sukkot headings. The bachelorette headline keeps the name above the smaller
event description in every language. Phone numbers in Arabic use LTR isolates.

Families and weights use the source face or its script counterpart from the
library font catalog. Additional leading gives Arabic, Vietnamese, Devanagari
and East Asian letters room. `fit.json` records adjustments from rendered text
measurements; inspect the actual captures after regeneration.

`art.json` keeps the ten Christmas tree ornaments outside each translated line.
Their SVG frames and circles follow measured paragraph ink, retaining the source
colours and separate editable objects. Regenerate these positions after changing
the Christmas text, fonts or fit: the review's `--paragraphs` option writes those
measurements to `paragraphs.json`. The generator checks each adjusted SVG's id
against its source before applying it.

From the repository root, with a complete, freshly pulled library:

```powershell
node desktop/scripts/localize-culture-designs.mjs --catalog <source-index.json> --fonts <library>/fonts/catalog.json --locales desktop/scripts/design-locales/holidays-celebrations --out <review>/index.json
node desktop/scripts/review-culture-designs.mjs --catalog <review>/index.json --fonts <library>/fonts/catalog.json --sizes <library>/images/designs/sizes.json --media <library> --locales desktop/scripts/design-locales/holidays-celebrations --out <review> --title "Holidays and celebrations"
```

Wait for generation to finish before starting the renderer. `--measure-only --fit`
records measured size corrections. Regenerate before rendering those corrections;
`--languages` and `--ids` select focused repeats. `--boards-only` rebuilds boards
from saved full-size and actual gallery captures.

Review artifacts are in `artifacts/25-designs-16-languages/`. Publishing uses a
complete library copy with only `elements/designs/index.json` changed. All existing
variants, pictures, metadata and other designs must remain identical. A dry run
must report no added or removed files. Verify the published catalog against the
reviewed bytes after deployment.

The 2026-10-19 review contains 400 full-size captures (1920 × 1080), 400 actual
gallery captures (264 × 149), comparison boards and an offline gallery. It measured
3,552 text boxes. Visual corrections include unbroken family labels, shorter toast
and iftar badges, script-appropriate tracking, clear headline margins and Christmas
ornaments aligned to each translation. The capture tool waits for every expected
picture and for painted frames before saving images.

All 350 added variants pass schema and font checks. The five relevant design
integration tests pass against the candidate catalog; the fifteen font/catalog
unit tests pass. The broader suite still expects 296 authored designs, whereas the
unchanged production source has 286, and expects four entries in a managed group
that production supplies with one. These existing catalog assumptions were not
changed by this localization work. The publication and verification reports live
beside the gallery.

Published on 2026-10-19 at `https://slidr-media.pages.dev/`, deployment
`https://bb58858c.slidr-media.pages.dev/`. Both catalogs were verified byte for byte
against the reviewed file. The library retained all 3,277 files; only the authored
design catalog changed. Evidence: `artifacts/25-designs-16-languages/publication.json`.
