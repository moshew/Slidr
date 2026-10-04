# Reference decks

Three designed decks with invented companies and content. They set the visual bar for Slidr's
built-in templates, and the first three templates under `packages/templates/src/builtin/` are each
derived from one of them. Open `index.html`: it opens with all ten built-in templates side by
side, a row for each kind of slide, and goes on to every slide of every deck here, next to the same
slide rebuilt from its template.

| File | Deck | Template |
|---|---|---|
| `zerem.html` | Technology: an architecture review of an event-streaming platform | `zerem` |
| `shvil.html` | Marketing: the spring campaign of a hiking-trails app | `shvil` |
| `tzuk.html` | Business: a quarterly investor update of a robotics company | `tzuk` |
| `tzuk.en.html` | The business deck in English, mirrored to left-to-right | `tzuk` |

The other seven templates (`lavan`, `layla`, `zohar`, `migdal`, `gan`, `nof`, `defus`) have no deck
here: each was drawn as a template from the start (ADR-063), and its sample deck lives in its own
file under `packages/templates/src/builtin/`. Their pictures sit in `images/` with the others.

Every file opens in a browser by double-click, with no network: the fonts are embedded and the
pictures sit in `images/`. Nothing here is a real brand, logo or third-party image; the
photographs were generated for these decks.

## How a deck file is built

One HTML file per deck, with no scripts and no external URLs. Its `<head>` holds four blocks:

- `<style data-part="theme">`: the theme as CSS variables (`--color-*`, `--font-heading`,
  `--font-body`, `--radius`, `--shadow`) and the body text style. In the app these come from the
  deck's theme; a test keeps them equal to the template's.
- `<style data-part="fonts">`: `@font-face` rules with the font files embedded, written by
  `scripts/build.mjs` from the font stacks of the theme block. Only fonts of the built-in library.
- `<style data-part="page">`: the page around the slides (stacking, scaling to the window). Not
  part of any slide.
- `<style data-part="deck">`: what the slides share. It goes with every slide that is handed to
  the conversion engine.

The `<body>` holds one `<section class="slide" id="sNN" data-archetype="…">` per slide, each inside
a `<div class="frame">` that belongs to the page. A slide with the `deck` stylesheet in front of it
is exactly the HTML an agent hands to `slide_create_from_html`, so the decks double as input for
the conversion engine (`apps/desktop/src/templates/referenceDecks.browser.test.ts`).

## How the slides are written

The conventions of the conversion engine (ADR-017) and of the design guidelines (SPEC 9.1):

- 1920×1080, sizes in px. Text stays inside the safe area (x 96..1824, y 80..1000), footers
  included, and is never smaller than 24px.
- Colours and fonts come from the theme variables; a tint is
  `color-mix(in srgb, var(--color-primary) 20%, transparent)`.
- `data-archetype` on the slide, `data-role` on its content, `data-asset` on pictures (the sha256
  of the file, written by the build script), `data-chart` with the chart as JSON around a chart
  drawn in SVG.

And what writing the first deck taught, each of them measured (ADR-039):

- **Five text styles.** Every text is set in one of the theme's five styles: its size, line
  height and font. Colour and weight may differ. Text in the heading font is never smaller than
  the `heading` style; larger sizes are fine. A layout's placeholder can only name a style, so
  anything else is lost in the template, and text in the heading font at a size between two
  styles also stayed HTML in the conversion.
- **Every text block has a width.** A block that shrinks to its text lands on a fraction of a
  pixel and fails the conversion's pixel comparison by a hair.
- **A block with its own direction is placed with physical sides.** `inset-inline-start` on an
  element with `dir="ltr"` resolves by that element's direction, so in a right-to-left deck a
  left-to-right number is placed with `right:` and `left:`.
- **A table that reads right-to-left stays HTML.** Text aligned to the start of a right-to-left
  table fails the conversion's pixel comparison by a fraction of a percent, whatever its borders,
  fills and fonts; the same table with `dir="ltr"`, or with its text aligned to the end, converts.
  The decks keep their tables as they should read, and the tables are faithful as HTML.
- **A box may hold its own text** (a chip, a numbered circle): it becomes a shape and a text.
  A ring drawn as a thick border in another colour does not convert; a circle under a smaller
  circle does.
- **In inline SVG a class wins over an attribute**, so a variation of a shared class goes in
  `style`.
- **Mixed-direction copy:** a Latin word followed by a number reads in the wrong order in a
  Hebrew sentence (put the number first), and a line can break between a Hebrew prefix and the
  Latin word it is attached to (rephrase).
- **A background picture** has `background-size: cover`, `background-position: center` and
  `background-repeat: no-repeat`.
- **A full-image slide has no background colour of its own** (`style="background:none"` on the
  slide). The picture then becomes the slide's background and the scrim its overlay. With a
  colour on the slide, the colour is the background, the picture lands in the overlay, and the
  lint no longer sees that the slide has a picture.
- No pseudo-elements, no clipping containers, no transforms, no Unicode arrows (the Latin
  subsets of the fonts do not hold them; draw them in SVG).

## Scripts

Run from the repository root.

- `node docs/reference-decks/scripts/build.mjs [deck …]` embeds the fonts, writes the asset ids
  and rebuilds `index.html`.
- `node docs/reference-decks/scripts/shots.mjs [deck …]` takes a picture of every slide and a
  contact sheet per deck into `apps/desktop/test-results/templates/reference/` (not in git).
- `pnpm test:browser` runs the decks through the conversion engine and the lint and writes
  `apps/desktop/test-results/templates/reference-report.json`;
  `node docs/reference-decks/scripts/report.mjs` prints it. The same run writes
  `rebuilt-report.json` beside it: the sample deck of every template as the renderer draws it,
  which is what `index.html` is built from.
- `node docs/reference-decks/scripts/picture.mjs <name> "<what it shows>" [--grid CxR]` generates
  a picture through Codex CLI, cuts it and stores it as WebP in `images/`; with `--from <file>` it
  cuts a picture that already exists. Every generation uses a paid quota.

## Revising a template

A template is one file. To change one, or to draw a new one:

1. Put a test file beside `apps/desktop/src/templates/acceptance.ts`, named
   `<id>.draft.browser.test.ts`, that calls `acceptDraft('<id>', <id>Template(), <id>Samples)`.
   It is not committed.
2. `pnpm exec vitest run --config vitest.browser.config.ts apps/desktop/src/templates/<id>.draft.browser.test.ts`
   tries the template alone: the role contract, the lint on every layout in Hebrew and in English
   (no error, and no "no visual" or "too empty" warning either), and every sample deck of the
   library moved to it and back.
3. Each run leaves pictures under `apps/desktop/test-results/design/templates/` (not in git): a
   contact sheet of the sample in each language, every slide at full size, each library deck on
   the template, and `<id>.findings.json` with every finding, warnings and notes included.
4. `pnpm test:browser` and the build script then refresh `index.html`.
