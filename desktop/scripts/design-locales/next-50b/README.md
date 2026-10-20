# Fifty more existing designs in every application language

The first 50 Hebrew/English-only designs in catalog order on 2026-10-20:
`sold`, `mortgage`, `forrent`, `optician`, `tailor`, `printshop`, `vet`, `reserve`,
`combo`, `happyhour`, `kidsmenu`, `catering`, `coffee`, `bakery`, `cookingclass`,
`dailyspecial`, `flightdeal`, `cityguide`, `trekprofile`, `naturepark`, `climate`,
`dive`, `beachflags`, `grouptour`, `skitrip`, `finalscore`, `nutrition`, `bracket`,
`jersey`, `sleep`, `heartday`, `challenge`, `mindfulness`, `posture`, `cv`,
`journal`, `portfolio`, `moodboard`, `bingo`, `books`, `roots`, `memorial`,
`uavspec`, `conops`, `readiness`, `expobooth`, `layered`, `rescue`,
`gridresilience`, `dualuse`.

The fourteen locale files add 700 editable variants, covering all sixteen
`CONTENT_LANGUAGES`. Arabic uses the Hebrew composition; the other added languages
use English. Existing variants, illustrations, photographs and catalog metadata
are preserved. Event frames and presentation templates are outside this collection.

`source.json` guards the English copy before regeneration. `fit.json` records
adjustments measured with the application's renderer. Font families and weights
follow each source family's script counterpart in the media font catalog.
`frames.json` aligns the optician chart's five numbered rows and red rule with the
actual translated paragraph positions; these remain separate, editable elements.
The same file leaves room for font metrics around rotated airport codes and two
Arabic veterinary labels, keeping their centers unchanged. Arabic telephone numbers
and time ranges use directional isolates inside mixed text. Per-paragraph
`lineHeights` retain the large numeral's display leading in the Arabic happy-hour
composition while the surrounding Arabic paragraphs keep their own spacing.

Initial machine translations were edited for sentence context, financial payments,
exercise, personal goals, electricity, carry-on baggage, garment alterations,
proper names, dates, units, technical abbreviations and compact labels. Translated
display lines keep their typography and styled numeric runs. Native-speaker review
can further refine the copy.

From the repository root, with the complete media library:

```powershell
node desktop/scripts/localize-culture-designs.mjs --catalog <source-index.json> --fonts <library>/fonts/catalog.json --locales desktop/scripts/design-locales/next-50b --out <review>/index.json
node desktop/scripts/review-culture-designs.mjs --catalog <review>/index.json --fonts <library>/fonts/catalog.json --sizes <library>/images/designs/sizes.json --media <library> --locales desktop/scripts/design-locales/next-50b --out <review> --title "50 additional designs in every application language"
```

Measure with `--measure-only --fit`, regenerate, then capture and inspect. After
corrections, `--changed-from <previously-rendered-index.json>` retains measurements
and captures of identical slide models, redraws changed variants, and rebuilds the
comparison boards. Missing image captures are always regenerated.

Review artifacts are local to `test-results/next-50b-localization/`: 1920 × 1080
full renders, 264 × 149 gallery thumbnails, contact sheets, comparison boards,
measurements, validation and publication reports, and `gallery.html`.

The review contains 800 full renders and 800 thumbnails. All 12,688 text boxes were
measured, with visual inspection of the language contact sheets and full-size
checks of typography, RTL, mixed runs, small labels and overlapping decorations.
One font-range measurement is verified separately against actual pixels: the
large Reem Kufi numeral's line box exceeds the happy-hour text frame, while all
visible text pixels lie inside it. The local validation report records the pixel
bounds and capture hash, and checks every other added text box without an exception.

The acceptance test in `designs.test.ts` requires all 50 designs in every application
language. Publish the reviewed catalog from the complete media library only after
the dry run shows exactly `elements/designs/index.json` changed, with no added or
removed logical media files. Verify deployed bytes against the reviewed catalog.

Published on 2026-10-20 to `https://slidr-media.pages.dev/` (deployment
`https://88298e73.slidr-media.pages.dev/`). Both addresses returned the reviewed
41,956,597-byte catalog byte for byte, with identity and compressed requests. The
manifest hash and conditional requests match. Only the authored design catalog
changed among the 3,277 logical media files. No application rebuild is needed.

Validation preserves all 3,820 existing variants and all 1,056 selected picture
instances, and adds exactly 700 variants. Scoped validation passes 29 tests,
root/desktop TypeScript checks, ESLint and formatting; the font checker proposes
no changes. Two pre-existing assertions are unchanged: the authored catalog has
286 designs while its test expects 296, and the managed `invitations` group has one
design while a test requires four. Full-suite output records those failures;
the focused run excludes just those assertions.
