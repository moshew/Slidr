# Thirty-three existing designs in all application languages

The first 33 Hebrew/English-only entries in the published authored catalog selected
on 2026-10-19: `recipe`, `howto`, `live`, `blogpost`, `schedule`, `barmitzvah`,
`batmitzvah`, `reunion`, `course`, `backtoschool`, `openday`, `summercamp`, `quiz`,
`lesson`, `graduation`, `parents`, `tutoring`, `kindergarten`, `certificate`,
`volunteer`, `donation`, `blooddrive`, `neighbors`, `cleanup`, `adoption`, `swap`,
`fooddrive`, `vote`, `streetparty`, `league`, `openhouse`, `menu`, `cafe`.

The fourteen locale files contain editable copy in text-element order. Arabic
uses the Hebrew composition and its event details; the other languages use English.
`source.json` guards the English source against changes. `fit.json` holds measured
font-size adjustments. The font catalog supplies the matching families and weights
for each script. Existing slides, photographs and catalog metadata stay intact.

An explicit `{ "paragraphs": [["first line"], ["second line"], ["last line", "."]] }`
preserves the individually styled runs in the editorial headline, including its red
period. Other copy uses strings or the localizer's existing `runs` representation.

From the repository root, with a complete copy of the published media library:

```powershell
node desktop/scripts/localize-culture-designs.mjs --catalog <source-index.json> --fonts <library>/fonts/catalog.json --locales desktop/scripts/design-locales/next-33 --out <review>/index.json
node desktop/scripts/review-culture-designs.mjs --catalog <review>/index.json --fonts <library>/fonts/catalog.json --sizes <library>/images/designs/sizes.json --media <library> --locales desktop/scripts/design-locales/next-33 --out <review> --title "33 designs in every language"
```

Measure with `--measure-only --fit`, regenerate, then capture. Inspect both full-size
and actual gallery-size images; `--languages` and `--ids` allow focused repeats.
The source languages are captured too, but are never rewritten by the localizer.

Review evidence is kept locally in `test-results/remaining-localization/`: 528 full
slides at 1920 × 1080, 528 actual gallery thumbnails at 264 × 149, comparison boards,
measurements and a browsable `gallery.html`. Recheck after any copy or fit change.

Publish from a complete library after the review. A publication dry run must show
only `elements/designs/index.json` changed, with no added or removed media files.
Compare the deployed bytes with the reviewed catalog. The design acceptance test
requires all 33 designs to be available in every `CONTENT_LANGUAGES` entry.

This expansion takes the authored catalog above Pages' 25 MiB static asset limit.
The publisher stages that JSON in smaller physical parts and streams it through a
Function at its existing URL (`build/mediaChunks.ts`). The 3,277 logical library
files and the original JSON bytes are preserved; released clients need no update.

The 2026-10-19 review measured 7,472 text boxes and corrected overflow, headline/badge
collisions, clipped names, awkward stamp labels and script-specific line spacing.
It includes 528 full captures and 528 actual thumbnail captures. All 462 added
variants have matching font families and schema-valid editable content. All 2,658
pre-existing variants, every picture and all catalog metadata are unchanged.

Validation: six catalog integration tests, fifteen font/catalog unit tests and
seventeen publisher/streaming tests pass; root and desktop type checks, scoped
ESLint and formatting pass. Preview verification checks exact decoded bytes with
and without HTTP compression, manifest hashes, CORS and conditional requests.
Publication and production verification evidence are saved beside the review.

Published on 2026-10-19 at `https://slidr-media.pages.dev/` (deployment
`https://abc0a797.slidr-media.pages.dev/`). Both addresses return the reviewed
27,395,340-byte catalog byte for byte, with the manifest's matching SHA-256.
The publication changed only the authored catalog among the 3,277 logical files.
