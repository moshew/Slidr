# Reference decks

Three designed decks with invented companies and content. They set the visual bar for Slidr's
built-in templates, and each template under `packages/templates/src/builtin/` is derived from one
of them. Open `index.html` to see every slide of every deck in one grid, next to the same slide
rebuilt from its template.

| File | Deck | Template |
|---|---|---|
| `zerem.html` | Technology: an architecture review of an event-streaming platform | `zerem` |
| `shvil.html` | Marketing: the spring campaign of a hiking-trails app | `shvil` |
| `tzuk.html` | Business: a quarterly investor update of a robotics company | `tzuk` |
| `tzuk.en.html` | The business deck in English, mirrored to left-to-right | `tzuk` |

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
- **Table cells are aligned to the top**, with padding, not centred vertically.
- **A background picture** has `background-size: cover`, `background-position: center` and
  `background-repeat: no-repeat`.
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
  `node docs/reference-decks/scripts/report.mjs` prints it.
