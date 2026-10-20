# Fifty existing designs in every application language

The first 50 Hebrew/English-only designs in the authored catalog on 2026-10-19:
`salon`, `gym`, `clinic`, `cabin`, `florist`, `carwash`, `photographer`, `icecream`,
`problem`, `solution`, `whynow`, `marketsize`, `ourproduct`, `howitworks`, `bizmodel`,
`traction`, `competition`, `gotomarket`, `theask`, `keyfigures`, `linechart`,
`datatable`, `quarter`, `goals`, `budget`, `survey`, `status`, `risks`, `forecast`,
`impact`, `schoolsout`, `schoolcalendar`, `sciencefair`, `bookweek`, `fieldtrip`,
`experiment`, `afterschool`, `teacherthanks`, `bookreport`, `garden`, `petition`,
`library`, `donorwall`, `repaircafe`, `supportgroup`, `choir`, `recycling`,
`volunteerhours`, `forsale`, `newproject`.

The fourteen locale files add 700 editable slide variants. Arabic uses the Hebrew
composition and its prices and event details; other languages use English.
`source.json` guards the English source and `fit.json` records measured font-size
adjustments. `frames.json` shortens the salon's editable price rules to leave a clear
gap between each translated service name and its price. Text uses the source family's script counterpart and matching weight
from the media font catalog. Existing variants, pictures and catalog metadata are
preserved.

Copy was prepared with machine translation and editorial corrections for context,
short labels, weekday abbreviations, names, financial amounts, musical terms and
garden/recycling terminology. Financial abbreviations retain the original amounts
and currency signs. Native-speaker linguistic review remains useful for refinement.

From the repository root, using a complete copy of the media library:

```powershell
node desktop/scripts/localize-culture-designs.mjs --catalog <source-index.json> --fonts <library>/fonts/catalog.json --locales desktop/scripts/design-locales/next-50 --out <review>/index.json
node desktop/scripts/review-culture-designs.mjs --catalog <review>/index.json --fonts <library>/fonts/catalog.json --sizes <library>/images/designs/sizes.json --media <library> --locales desktop/scripts/design-locales/next-50 --out <review> --title "50 designs in every application language"
```

Measure with `--measure-only --fit`, regenerate, then capture. Inspect full-size
renders and actual gallery thumbnails. Repeat after copy or fit changes. The review
server disables file watching so concurrent workspace edits cannot reload a capture.

Review artifacts are kept locally under `test-results/next-50-localization/`:
1920 × 1080 full renders, 264 × 149 gallery thumbnails, contact sheets, comparison
boards, measurements and `gallery.html`. The acceptance test in `designs.test.ts`
requires these 50 designs in all 16 `CONTENT_LANGUAGES` entries.

Publish from the complete library after visual review. A dry run must show only
`elements/designs/index.json` changed, without added or removed logical media files.
Verify deployed bytes and manifest hash against the reviewed catalog. The streaming
publisher uses native stream piping and retains the copy with `waitUntil`; this
avoids the intermittently truncated large-catalog response observed during review.

The final review contains 800 full-size renders and 800 actual gallery thumbnails.
It measured 14,560 text boxes, with no remaining overflow in the added variants.
All 3,120 existing variants and 848 picture-element instances are unchanged.
The localizer validates the 700 additions against the slide schema and font catalog;
`design-fonts.mjs --check` proposes no changes.

Scoped validation passes 45 tests, root/desktop TypeScript checks, ESLint and formatting.
Two pre-existing catalog tests are excluded from that focused run: the published
authored catalog has 286 designs while a test expects 296, and the managed
`invitations` group has one design while a test requires every group to have four.
These assertions are left intact. See the local validation and publication reports.

Published on 2026-10-19 at `https://slidr-media.pages.dev/` (deployment
`https://2f3f9331.slidr-media.pages.dev/`). Both addresses return the reviewed
34,729,156-byte catalog byte for byte with and without HTTP compression; the
manifest SHA-256 and conditional requests match. Only the authored catalog changed
among the 3,277 logical library files. No application rebuild is needed.
