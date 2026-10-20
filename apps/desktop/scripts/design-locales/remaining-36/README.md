# Complete language coverage for ready-made slides

The final 36 bilingual designs on 2026-10-20: four authored designs (`fieldkit`,
`careers`, `swarm`, `cubesat`) and 32 managed designs, listed in `source.json`.
The fourteen locale files add 504 editable slides. All 336 designs in the two
catalogs now have all sixteen `CONTENT_LANGUAGES`.

Arabic follows the Hebrew composition; the other added languages follow English.
Font families use each source face's script counterpart, with supported weights.
Original variants, images, artwork, frames, and catalog metadata are preserved.
Event frames and presentation templates are outside this collection.

Copy was initially machine translated, then edited for context, display-line
grammar, idiomatic product headlines, technical terminology, product names,
certification identifiers and SI units. Native-speaker review can further refine
the wording. Styled runs keep their emphasis; text inside nested groups is also
translated. `fit.json` records adjustments measured in the actual renderer.
Explicit line heights give the scripts room and keep title glyphs clear of rules.

Regenerate each catalog separately, using the matching subset of `source.json`
and locale entries, or combine the catalogs temporarily for review and split the
result back into the original catalogs by design ID. Never replace a production
catalog with the temporary combined review catalog.

```powershell
node apps/desktop/scripts/localize-culture-designs.mjs --catalog <combined-original.json> --fonts <library>/fonts/catalog.json --locales apps/desktop/scripts/design-locales/remaining-36 --out <review>/index.json
node apps/desktop/scripts/review-culture-designs.mjs --catalog <review>/index.json --fonts <library>/fonts/catalog.json --sizes <combined-picture-sizes.json> --media <library> --locales apps/desktop/scripts/design-locales/remaining-36 --out <review>
```

Review artifacts are under `test-results/final-design-localization/`: 576 full
1920 × 1080 renders, 576 gallery thumbnails at 264 × 149, language contact sheets,
comparison boards, text measurements, preservation checks and publication reports.
Review covers all 36 designs in every language, with full-size checks of complex
scripts, styled text, technical labels and the two nested-group compositions.
The review tool measures 6,692 text boxes across these variants.
The final added variants have no measured text overflow beyond the two-pixel
rounding allowance. Repeated renders after corrections are retained in the review.

The preservation check requires all 4,872 existing variants to remain unchanged
and exactly 504 additions. The language-coverage test covers the entire catalog;
font and editable-copy tests also inspect nested elements. The complete catalog
schema check has a 30-second allowance for its 5,376 slide variants.

Two pre-existing assertions remain unrelated to localization: an authored-design
count of 296 where the catalog contains 286, and a four-design minimum for the
managed `invitations` group, which contains one design. Scoped validation excludes
only those two assertions; the unfiltered run records them separately.

Publication must change only `elements/designs/index.json` and
`elements/designs/managed.json`, with no added or removed logical media files.
Verify the deployed catalog hashes against the reviewed files. The application
loads these catalogs from its media library; no application rebuild is needed.

Published on 2026-10-20 to `https://slidr-media.pages.dev/` (deployment
`https://db838549.slidr-media.pages.dev/`). Both addresses returned the reviewed
catalogs byte for byte, with identity and compressed requests and matching
manifest hashes. Only the two design catalogs changed among 3,277 logical media
files. All 30 scoped tests pass; desktop TypeScript, ESLint, formatting and the
font checker pass. Regeneration reproduces the reviewed catalog exactly.
