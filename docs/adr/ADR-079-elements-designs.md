# ADR-079 — Offer complete editable designs in Elements

Status: Implemented in the 2026-10-09 working tree; **not committed** at the time of this record. This extends the Elements browser in [ADR-075](ADR-075-elements-and-presets.md).

## Context

The committed Elements browser inserts individual objects. A user may also want a complete slide composition as a starting point without choosing a deck template or asking the agent to construct the slide.

## Decision in the working tree

- A new Designs collection contains ten named compositions: possibility, momentum, wedding, webinar, conference, workshop, product, sale, testimonial, and thumbnail. `designs.ts` creates ordinary editable text, shapes, SVG artwork, and images; there is no new slide or element type. The visual assets are original, bundled WebP files. They are imported into the document when a slide is chosen, so the saved deck works offline.
- The collection renders each design with `ScaledSlide` using a standalone preview deck in the current deck language. Choosing a design creates a fresh slide after the current one, selects it, and batches its `asset.add` and `slide.add` commands as one undo step.
- The Shapes collection gains richer SVG previews, group-specific colors, responsive group layout, and direction-aware line/card art. These previews do not change the underlying insertion commands or saved object schema.
- The new labels and hint text have Hebrew and English entries. The design copy itself is authored in both languages. A preview is presentation data, while the inserted slide becomes ordinary deck content.

## Verification boundary

`designs.test.ts` checks ten schema-valid slides in both languages, an image element in each, and a one-step undo. The Elements E2E spec checks gallery previews and insertion. All twenty slide variants were rendered and inspected at full size, with additional checks at thumbnail size. The app's design prompt now requires publication-ready composition, original copy, bundled assets, and visual review in each supported direction and language.
