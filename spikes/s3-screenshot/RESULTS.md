# WG0-S3 — slide to PNG: `html-to-image` (A) versus CDP `Page.captureScreenshot` (B)

Browser half of the spike. Method B here is the CDP call made through Playwright's CDP session in
installed Edge (same engine and same protocol call as WebView2). The Tauri / WebView2 side is
measured separately and is not covered here.

## Recommendation

**Make B (`Page.captureScreenshot`) the default for every use — agent screenshots, PNG export and
import pixel comparison. A (`html-to-image`) is not faster and leaves out or misdraws content Slidr
must support (sandboxed iframes, text with fractional font sizes, a video showing its poster, SVG
styled from outside the slide); keep it at most as a fallback where no native capture exists.**

Both methods meet the 500 ms budget on all four slides. The choice is decided by fidelity, not speed.

Conditions for B, each measured below:

1. Capture a dedicated render of the slide, not the editor stage. A clip of the stage includes the
   selection overlay, and at an arbitrary zoom the output came out 959x540 instead of 960x540.
2. Pass `optimizeForSpeed: true`. Same pixels, 1.3x to 3.5x faster, PNG 15-50% larger.
3. Keep `fromSurface: true`. Use `captureBeyondViewport: true` if the slide does not fit the viewport.
4. On a real high-DPI display, `clip.scale = targetWidth / (clipWidth x devicePixelRatio)`.
5. Text at exactly 100% is drawn with LCD (coloured sub-pixel) anti-aliasing, which the editor does not
   show. Start the capture surface with `--disable-lcd-text`, or render the slide at 50% and use
   `clip.scale: 2`; both gave the same pixels as the editor view.
6. A capture taken right after the content changed took 1.1-1.3 s (up to 2.1 s) when the page was a
   background tab or its window was minimised, against about 0.1 s in a window that is merely behind
   another one. Captures of unchanged content were fast in every state.

## How to run

```
cd spikes/s3-screenshot
pnpm install          # once; standalone install, own pnpm-workspace.yaml
pnpm spike            # everything, headless Edge, about 13 minutes
```

- Output: `out/headless/tables.md` (all tables), `out/headless/results.json` (raw numbers),
  `out/headless/img/` (captures and diff images), `out/headless/features/` (per-feature
  A | B | diff strips), `out/headless/misc/` (everything else).
- `pnpm spike:headed` runs the same in a visible Edge window (adds the minimised-window state).
- `node src/run.mjs --only=images,timing,aopts,bopts,inactive,background` runs chosen sections;
  `--warm=N` and `--cold=N` change the sample counts.
- No network at run time. Fonts come from `@fontsource/*`; test images and the test video are generated
  once by Edge into `assets/` (`--regen` to rebuild them).
- Inspection helpers: `src/tools/zoom.mjs` (enlarged side-by-side crops), `src/tools/delta.mjs`
  (histogram of channel differences), `src/tools/probe.mjs` (phase timings of A).

Environment of the numbers below: Edge 154.0.4258.48 headless (new headless, GPU compositing and GPU
rasterisation enabled, NVIDIA RTX 4060 Ti), Windows 11 26200, i7-14700F, Node 24.15, html-to-image
1.11.13, playwright-core 1.63.0, pixelmatch 7.2.0. Device pixel ratio 1 unless stated.

## Test slides

| slide | content | DOM elements |
|---|---|---|
| `baseline` | Heebo + Inter, gradient background, JPEG with `object-fit: cover` + radius + `filter`, card with soft shadow, mixed Hebrew / English | 18 |
| `css` | 18 CSS features, one per area | 96 |
| `embedded` | Shadow DOM (open, adopted sheets, closed), sandboxed and same-origin `iframe srcdoc`, canvas, video, blob image | 46 |
| `heavy` | 100 objects: 56 text boxes, 34 shapes, 10 images | 202 |
| `text` (extra, fidelity only) | paragraphs with integer and fractional font sizes, justify, line-clamp, bidi | 33 |

Each slide is a 1920x1080 container. "50% view" = shown with `transform: scale(0.5)` in a 1600x900
window, as the editor does. "100% view" = shown 1:1 in a 1920x1080 viewport.

## Timing

Milliseconds. Cold = first capture in a fresh browser context, median of 3 contexts. Warm = the 20
captures that follow, pooled over the 3 contexts (60 samples). A is timed inside the page around
`htmlToImage.toBlob()` (DOM to PNG Blob). B is timed in Node around `cdp.send('Page.captureScreenshot')`
and so includes the base64 PNG coming back over the CDP connection. A is captured from the 50% view
with `{ width: 1920, height: 1080, pixelRatio: 0.5 | 1, cacheBust: false }`.

| slide | method | size | cold | warm median | warm p95 | PNG size |
|---|---|---|---|---|---|---|
| baseline | A default | 960x540 | 159 | 55 | 81 | 649 KB |
| baseline | A default | 1920x1080 | 201 | 110 | 140 | 2431 KB |
| baseline | A `fontEmbedCSS` cached | 960x540 | 114 | 50 | 70 | 649 KB |
| baseline | A `fontEmbedCSS` cached | 1920x1080 | 142 | 105 | 137 | 2431 KB |
| baseline | B 50% view | 960x540 | 112 | 95 | 113 | 401 KB |
| baseline | B 50% view | 1920x1080 | 289 | 262 | 286 | 1395 KB |
| baseline | B 100% view | 960x540 | 112 | 92 | 101 | 401 KB |
| baseline | B 100% view | 1920x1080 | 260 | 246 | 264 | 1388 KB |
| baseline | B 100% view, `optimizeForSpeed` | 960x540 | 51 | 47 | 62 | 568 KB |
| baseline | B 100% view, `optimizeForSpeed` | 1920x1080 | 82 | 71 | 89 | 2049 KB |
| css | A default | 960x540 | 226 | 134 | 159 | 206 KB |
| css | A default | 1920x1080 | 235 | 154 | 181 | 639 KB |
| css | A `fontEmbedCSS` cached | 960x540 | 162 | 130 | 163 | 206 KB |
| css | A `fontEmbedCSS` cached | 1920x1080 | 195 | 147 | 172 | 639 KB |
| css | B 50% view | 960x540 | 70 | 65 | 81 | 155 KB |
| css | B 50% view | 1920x1080 | 134 | 105 | 130 | 469 KB |
| css | B 100% view | 960x540 | 68 | 61 | 68 | 155 KB |
| css | B 100% view | 1920x1080 | 104 | 92 | 108 | 470 KB |
| css | B 100% view, `optimizeForSpeed` | 960x540 | 54 | 46 | 49 | 190 KB |
| css | B 100% view, `optimizeForSpeed` | 1920x1080 | 53 | 47 | 60 | 572 KB |
| embedded | A default | 960x540 | 270 | 136 | 183 | 297 KB |
| embedded | A default | 1920x1080 | 318 | 197 | 213 | 932 KB |
| embedded | A `fontEmbedCSS` cached | 960x540 | 253 | 137 | 189 | 297 KB |
| embedded | A `fontEmbedCSS` cached | 1920x1080 | 277 | 212 | 301 | 932 KB |
| embedded | B 50% view | 960x540 | 74 | 58 | 65 | 212 KB |
| embedded | B 50% view | 1920x1080 | 139 | 117 | 142 | 651 KB |
| embedded | B 100% view | 960x540 | 74 | 60 | 67 | 213 KB |
| embedded | B 100% view | 1920x1080 | 138 | 152 | 180 | 646 KB |
| embedded | B 100% view, `optimizeForSpeed` | 960x540 | 56 | 47 | 55 | 273 KB |
| embedded | B 100% view, `optimizeForSpeed` | 1920x1080 | 56 | 50 | 65 | 843 KB |
| heavy | A default | 960x540 | 377 | 169 | 185 | 511 KB |
| heavy | A default | 1920x1080 | 452 | 286 | 324 | 1584 KB |
| heavy | A `fontEmbedCSS` cached | 960x540 | 346 | 171 | 208 | 511 KB |
| heavy | A `fontEmbedCSS` cached | 1920x1080 | 433 | 297 | 396 | 1584 KB |
| heavy | B 50% view | 960x540 | 98 | 90 | 107 | 388 KB |
| heavy | B 50% view | 1920x1080 | 205 | 177 | 212 | 1155 KB |
| heavy | B 100% view | 960x540 | 92 | 90 | 114 | 379 KB |
| heavy | B 100% view | 1920x1080 | 210 | 196 | 235 | 1125 KB |
| heavy | B 100% view, `optimizeForSpeed` | 960x540 | 59 | 46 | 50 | 439 KB |
| heavy | B 100% view, `optimizeForSpeed` | 1920x1080 | 68 | 60 | 75 | 1313 KB |

Reading the table:

- Everything is under 500 ms. The largest warm p95 is 396 ms (A, heavy, 1920); the largest cold is 452 ms (A, heavy, 1920).
- B's cost is mostly PNG encoding and it grows with image entropy, not with DOM size. With
  `optimizeForSpeed` it is 46-47 ms at 960 and 47-71 ms at 1920 on every slide.
- A's cost grows with the DOM: cloning and inlining computed styles took 22 ms for 18 elements and
  133 ms for 202 elements (phase table in `tables.md`). At 960x540 A is 1.2x (baseline, 55 vs 47 ms)
  to 3.7x (heavy, 169 vs 46 ms) slower than B with `optimizeForSpeed`.
- A, font cache: the library caches fetched fonts itself, so a precomputed `fontEmbedCSS` only helps the
  first capture (baseline 159 -> 114 ms, css 226 -> 162 ms) and not warm captures. `getFontEmbedCSS()`
  itself takes 42-56 ms and returns 822-911 KB of CSS, which is re-parsed inside the SVG on every capture.
- A measured from Node, including the PNG returned as base64: 52 / 138 / 145 / 173 ms at 960 for the
  four slides, so the transfer adds little.
- A's first capture is pixel-identical to its warm captures on all four slides: no "fonts missing on the
  first capture" effect in Chromium.

## Fidelity of A against B

Percent of differing pixels, written `pixelmatch % / hard %`. `pixelmatch` uses threshold 0.1 and
excludes pixels it classifies as anti-aliasing. `hard` is the plain share of pixels where any channel
differs by more than 32 of 255. B captured twice gives 0.00% / 0.00% on every slide.

| slide | A vs B, 960x540 | A vs B, 1920x1080 | A vs B 100% view (LCD text), 1920x1080 | A with one library line patched vs B, 960x540 | patched, 1920x1080 |
|---|---|---|---|---|---|
| baseline | 1.09% / 1.54% | 0.78% / 1.36% | 0.80% / 1.52% | 0.00% / 0.01% | 0.00% / 0.00% |
| css | 0.52% / 0.80% | 0.50% / 0.86% | 0.50% / 0.86% | 0.14% / 0.28% | 0.15% / 0.23% |
| embedded | 8.30% / 16.23% | 7.68% / 15.17% | 7.62% / 15.17% | 8.06% / 15.90% | 7.34% / 14.74% |
| heavy | 1.91% / 3.01% | 0.85% / 2.68% | 0.93% / 3.51% | 0.08% / 0.12% | 0.01% / 0.02% |
| text | 5.16% / 7.33% | 4.06% / 6.69% | 4.19% / 7.57% | 0.15% / 0.22% | <0.01% / <0.01% |

The B reference is the 50% view (at 960: what the user sees; at 1920: the same view with
`clip.scale: 2`), except in the column marked LCD. Diff images: `out/headless/img/<slide>-diff-*.png`.

What the differences are, from the diff images and enlarged crops:

- **Text drift (baseline, heavy, text, and the labels on every slide).** html-to-image rewrites every
  `font-size` in the clone to `floor(px) - 0.1` (`clone-node.ts`, `cloneCSSStyle`). Text is therefore
  slightly narrower and each line drifts further from its start: the Hebrew at the right end of an RTL
  line matches, the digits at its left end are a few pixels off at 1920. Proof that this one line is the
  cause: the same library with that line disabled (served by `src/lib/server.mjs` as a diagnostic) gives
  0.00% on baseline and text. There is no option to turn it off; it needs a patched copy of the library.
- **Reflow at fractional font sizes (text slide).** 21.85 px becomes 20.9 px, so line breaks move
  ("...wrap onto several lines," fits on one line in A and breaks in B) and the `line-clamp` ellipsis
  disappears. At 25.3 px the breaks stayed and the lines got narrower. The 24 px paragraph differs by
  2.20% / 4.11%; its strip was not inspected by eye.
- **Embedded content (embedded slide).** Whole areas missing or wrong; see the next table.
- **Photo resampling.** 1.2% of the baseline image's pixels, all inside the JPEG, differ by 9-16 levels
  and 0.06% by more; invisible, below the pixelmatch threshold.
- **LCD text** is a property of B in the 100% view, not of A; see the B findings.

For scale, B differs from itself by a similar amount when the same slide is captured through a
different zoom: 100% view with `clip.scale: 0.5` against the 50% view is 0.37% / 1.01% on baseline,
1.60% / 4.04% on heavy and 2.91% / 5.81% on text.

## Where A breaks

Measured at 1920x1080 inside each feature's area only, against B. "patched" = the font-size line
disabled, which removes text drift and leaves the feature's own difference. Evidence strips
(A | B | diff) are in `out/headless/features/<slide>-<feature>.png`.

| feature | result in A | A vs B | patched A vs B | what is seen |
|---|---|---|---|---|
| `clip-path` | correct | 0.00% / 0.00% | 0.00% / 0.00% | |
| `mix-blend-mode` | correct | <0.01% / <0.01% | <0.01% / <0.01% | |
| `backdrop-filter` | minor difference | 0.80% / 1.97% | 0.68% / 1.40% | a band about 10 px wide inside the panel edge: A's blur pulls in colours from outside the panel, B's does not |
| `text-shadow` | correct, text drift only | 0.19% / 0.33% | 0.00% / 0.00% | |
| `background-clip: text` gradient text | correct, text drift only | 0.28% / 0.91% | 0.05% / 0.06% | |
| `conic-gradient` | correct | <0.01% / <0.01% | <0.01% / <0.01% | |
| inline SVG, attributes + `currentColor` + gradient | correct | 0.08% / 0.07% | 0.00% / 0.00% | |
| inline SVG styled by a stylesheet outside the slide | **wrong** | 18.56% / 24.23% | 18.12% / 23.81% | fill and stroke lost, shape is black |
| inline SVG styled by the slide's own `<style>` using `var(--color-accent)` from `:root` | correct | 0.47% / 0.65% | 0.00% / 0.00% | |
| SVG `<use href>` of a symbol elsewhere in the slide | correct | 0.33% / 0.40% | 0.00% / 0.00% | |
| `transform: rotate` | correct | 0.03% / 0.71% | 0.00% / 0.00% | |
| `@keyframes` paused at a known time | correct | 0.00% / <0.01% | 0.00% / <0.01% | |
| WAAPI animation paused at a known time | correct | 0.00% / 0.02% | 0.00% / 0.02% | |
| `::before` / `::after` | correct | 0.26% / 1.20% | 0.00% / 0.00% | |
| `::marker` with its own colour | **wrong** | 1.91% / 4.55% | 0.24% / 0.39% | marker text kept, colour lost (red becomes the list's text colour) |
| `mask-image` (gradient and `url()`) | correct | 0.00% / 0.00% | 0.00% / 0.00% | |
| `background: url()` and `filter: drop-shadow` | correct | 0.00% / 0.00% | 0.00% / 0.00% | |
| theme `var()` + `color-mix(in oklch)` | correct | 0.01% / 0.24% | <0.01% / 0.07% | |
| Shadow DOM, open, `<style>` inside, font used only there | correct, text drift | 1.44% / 2.51% | 0.84% / 1.62% | patched residual not examined |
| Shadow DOM, open, `adoptedStyleSheets` | correct, text drift | 1.60% / 2.68% | 0.87% / 1.62% | patched residual not examined |
| Shadow DOM, closed | **missing** | 22.99% / 23.60% | 22.99% / 23.60% | host box drawn, content absent |
| Shadow stylesheet with `!important` rules, next to light DOM with the same class | **wrong** | 1.67% / 3.14% | 1.63% / 3.15% | the shadow rules leak: the light-DOM text turns italic and underlined |
| image from a `blob:` URL | correct | 0.00% / 0.01% | 0.00% / 0.01% | with `cacheBust: true` the whole capture rejects |
| `iframe srcdoc`, `sandbox="allow-scripts"` | **missing** | 28.89% / 73.75% | 28.89% / 73.75% | blank, border included |
| `iframe srcdoc`, same origin | **wrong** | 12.47% / 52.83% | 12.53% / 52.88% | content drawn twice, body background and padding lost |
| `<canvas>` 2D | correct | 0.00% / <0.01% | 0.00% / <0.01% | |
| `<video>` with a loaded frame | correct | 0.51% / 0.36% | 0.51% / 0.36% | slight colour difference in the frame |
| `<video>` with `src` and `poster`, poster showing | **missing** | 81.92% / 97.48% | 81.92% / 97.48% | black rectangle |
| `<video>` with `poster` only | correct | 0.00% / 0.00% | 0.00% / 0.00% | |
| paragraph, 24 px | text drift | 2.20% / 4.11% | 0.00% / 0.00% | strip not inspected by eye |
| paragraph, 25.3 px | text drift | 4.30% / 7.07% | 0.00% / 0.00% | same line breaks, narrower lines |
| paragraph, 1.15em = 21.85 px | **wrong** | 8.32% / 13.36% | 0.00% / 0.00% | line breaks differ |
| justify + letter-spacing, 22.6 px | **wrong** (by the numbers) | 7.31% / 12.63% | 0.00% / 0.00% | strip not inspected by eye |
| `line-clamp: 3` and `text-overflow: ellipsis`, 23.5 px | **wrong** | 3.99% / 6.32% | 0.02% / 0.04% | ellipsis of the clamped block missing |
| bidi mix with underline / strike / superscript, 26.5 px | text drift | 2.47% / 4.35% | 0.00% / 0.00% | strip not inspected by eye |

Options of A (960x540, full table in `tables.md`):

| option | effect |
|---|---|
| `fontEmbedCSS` precomputed | same pixels; faster first capture only |
| `preferredFontFormat: 'woff2'` | **worse fidelity**: baseline 1.09% -> 2.66%, heavy 1.91% -> 4.97%, close to `skipFonts`; images not inspected, so the cause is not established |
| `skipFonts: true` | fonts fall back: baseline 3.79%, heavy 7.23% |
| `cacheBust: true` | same pixels on three slides; on `embedded` the capture rejects (the `blob:` image cannot be re-fetched with a query string) |

Other properties of A:

- The library rejects the whole capture with a bare DOM `Event` when one image fails.
- The output does not depend on the editor zoom (50% view vs 100% view: 0.00%) or on an emulated DPR.
- It captures the slide subtree only, so the selection overlay is not in the image (0.00% with vs without).

## Findings for B

**`clip` + `scale` on a slide that is displayed scaled down.** Correct. From the 50% view, `clip` =
the slide's on-screen rectangle with `scale: 1` gives 960x540 and with `scale: 2` gives a real
1920x1080 rasterisation, not an enlarged bitmap: against the 100% view it differs by 0.08% / 0.44%
(baseline), <0.01% (css), 0.24% / 2.09% (heavy), and by 0.00% on baseline once LCD text is off. `scale: 0.5` on the
100% view is likewise a fresh rasterisation, not a box-filtered copy of the 1920 image.

**Arbitrary zoom.** With the slide at scale 0.613 at a fractional position (1176.96 x 662.04 CSS px),
`scale = 960 / width` produced 959x540 and 1918x1080, also after nudging the scale up by 1e-6. Snapping
the clip to whole pixels gave 960x540, 0.26% / 0.40% away from the 50% view. Exact sizes need an
integer clip.

**Editor overlay.** A clip of the editor stage contains the selection frame and handles: 0.45% of
pixels differ from the same capture without them (`out/headless/misc/baseline-B-editor-with-selection-overlay-960.png`).

**Flags** (baseline and heavy, 20 captures per combination, all 64 rows in `tables.md`):

| flag | time | correctness |
|---|---|---|
| `captureBeyondViewport: true` | no consistent change (within a few ms either way) | identical pixels when the clip is inside the viewport |
| `optimizeForSpeed: true` | baseline 1920: 243-273 -> 75-88 ms; 960: 94-103 -> 48-50 ms | identical pixels, larger file |
| `fromSurface: false` | 217-234 ms regardless of size | wrong: `clip` and `scale` are ignored, the image has the viewport's size and is almost empty (11-42 KB) |

**Device pixel ratio.** With a real scale factor (`--force-device-scale-factor`, no emulation),
`scale = 960 / clipWidth` gave 1200x675, 1440x810 and 1920x1080 at DPR 1.25, 1.5 and 2; dividing by
`devicePixelRatio` gave 960x540 each time. Those images differ from the DPR 1 capture by
0.29-0.90% / 0.64-1.63%, and A changes by the same amount, so it is the layout that changes with DPR.
With an emulated DPR (Playwright's `deviceScaleFactor`) the capture ignores the DPR: the undivided
scale gives 960x540 and identical pixels. A's `pixelRatio` gave 960x540 in all six cases.

**LCD text.** Share of strongly coloured pixels in the white card of the baseline slide, and distance
from the 50% view:

| capture | coloured fringe at 960 / 1920 | vs 50% view, 960 | vs 50% view, 1920 |
|---|---|---|---|
| B 50% view | 0.00% / 0.00% | | |
| A | 0.00% | | |
| B 100% view | 6.50% / 3.40% | 0.37% / 1.01% | 0.08% / 0.44% |
| B 100% view, `will-change: transform` on the slide wrapper | 0.00% / 0.00% | 0.80% / 1.35% | 0.00% / 0.00% |
| B 100% view, browser started with `--disable-lcd-text` | 0.00% / 0.00% | 0.00% / 0.00% | 0.00% / 0.00% |

`will-change: transform` removes the fringes but softens the 960 output.

**Content outside the viewport** (css slide, 960x540):

| case | `captureBeyondViewport` | result |
|---|---|---|
| slide at 100% in an 800x450 viewport | false | wrong, 78.50% / 81.20% |
| slide at 100% in an 800x450 viewport | true | correct, 0.00% |
| another slide rendered in the same page at (0, 2000) | false | wrong, 95.01% / 97.99% |
| another slide rendered in the same page at (0, 2000) | true | correct, 0.01% |
| another slide rendered in the same page at (-10000, 0) | true or false | wrong, 93.2% / 96.7% |

**Page that is not the focused one** (headless; captures of the baseline slide at 960x540, then six
rounds of "swap the slide, wait for fonts and images, capture"). "stock" = Edge launched without the
three "disable backgrounding" switches Playwright adds by default.

| browser | state of the captured page | unchanged content, median / p95 | capture after a content change, median / max | pixels |
|---|---|---|---|---|
| stock | foreground | 96 / 124 | 115 / 223 | 0.00% |
| stock | another window in front | 93 / 113 | 106 / 142 | 0.00% |
| stock | another tab of the same window in front | 94 / 109 | 1291 / 1859 | 0.00% |
| switches present | foreground | 86 / 101 | 111 / 420 | 0.00% |
| switches present | another window in front | 80 / 92 | 103 / 115 | 0.00% |
| switches present | another tab of the same window in front | 89 / 97 | 1107 / 1846 | 0.00% |

The image is always correct; what changes is the wait for the first frame after the DOM changed. The
switches make no difference. A headed run of this section gave the same picture and added the
minimised window: unchanged content 113 / 133 ms and 109 / 129 ms, after a content change
1132 / 1801 ms and 1148 / 1842 ms, pixels 0.00%. The files of that headed run were removed by a later
clean run; `node src/run.mjs --headed --only=background` reproduces them (about 70 s). `document.visibilityState` reported
`visible` in every state, so it cannot be used to tell these states apart under Playwright.

## Capturing a slide the user is not looking at

**A: render it into a container in the same page, then capture.** 960x540.

| container | baseline | embedded | heavy |
|---|---|---|---|
| `position: fixed; left: -10000px` | correct, same pixels as A of the visible slide | same | same |
| `visibility: hidden` | blank | blank | blank |
| `display: none` parent | correct (<0.01% / 0.08%) | capture rejects | wrong, 5.22% / 6.53% |
| not attached to the document | wrong, 4.50% / 5.73% | capture rejects | wrong, 85.06% / 86.51% |

Cost with the off-screen container: build and wait for fonts and images 49 / 132 / 82 ms, first
capture 178 / 301 / 376 ms, later captures 49 / 134 / 176 ms (baseline / embedded / heavy). The slide's
DOM, including its iframes and video, is live in the editor page for that time.

**B: a second page.**

| | baseline | css | embedded | heavy |
|---|---|---|---|---|
| open a new page, wait until ready | 196 | 194 | 305 | 271 |
| then capture (default flags) | 127 | 55 | 68 | 95 |
| kept-alive page: swap the slide, wait until ready | 32-39 | 27-31 | 99-135 | 37-55 |
| then capture (default flags) | 107-120 | 62-71 | 71-79 | 90-95 |

All captures match the reference (0.00%; embedded 0.00% / 0.02% in two rounds). A kept-alive capture
page therefore costs about 90-210 ms per slide, less with `optimizeForSpeed`. B can also capture a
second slide rendered inside the editor page, below the viewport, with `captureBeyondViewport: true`
(63 ms, 0.01%), but not one placed at negative coordinates.

## Measured and not measured

Measured: every number and every "correct / wrong / missing" above, by pixel comparison. Looked at by
eye: the four full-slide A, B and diff images of baseline, css, embedded and heavy; enlarged crops of
baseline text in A, patched A and four B variants; the feature strips for backdrop-filter, `::marker`,
open Shadow DOM, 21.85 px, 25.3 px and line-clamp; the overlay capture. Results marked "correct" for
features not in that list rest on the numbers alone.

Inferred, not measured:

- Why `var(--color-accent)` survives in A: the library takes its property list from the document
  element, so variables declared on `:root` are copied. A variable declared only on an ancestor between
  `:root` and the slide was not tested.
- Why text in the 50% view is greyscale: Chromium's rule against LCD text under a scale transform.
- Where the 1.1 s wait in a hidden page comes from: frame production being throttled.

Not verified:

- Anything in WebView2 itself. In particular whether a hidden or never-shown WebView2 shows the
  1.1 s wait after a content change, and whether `--disable-lcd-text` can be applied to the capture
  surface without affecting the editor.
- Whether the window in "another window in front" was treated as occluded by the OS.
- A full headed run (only the background section was run headed).
- A real high-DPI monitor (the scale factor was forced by a launch switch).
- Other in-page libraries (`modern-screenshot`, `snapdom`), WebGL canvases, cross-origin video and
  images, fonts not served from the app's origin.
- One timing oddity: an earlier run showed A with cached `fontEmbedCSS` on the css slide at 361 ms
  median in two of three contexts; it did not recur in a targeted probe or in the final run.
