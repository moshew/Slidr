# HTML import test set

Six of the files the import is tested on (SPEC 13.5). Every file is one self-contained `.html`:
no network, only `data:` URIs. The decks carry no hints for the importer; what an import must get
right is written here and nowhere else.

Kinds 2 (AI-made deck with classes and a shared stylesheet) and 3 (packed file built at run time,
`examples/E-CIX NG - standalone.html`) of SPEC 13.5 are not in this folder.

| File                        | Kind (SPEC 13.5)            | Language     | Design size                      | Slides                     | Shown as                                          | Origin                  |
| --------------------------- | --------------------------- | ------------ | -------------------------------- | -------------------------- | ------------------------------------------------- | ----------------------- |
| `handwritten.html`          | 1: simple hand-written deck | Hebrew, RTL  | 1280×720                         | 6                          | one `<section>` at a time (`display`)             | written here            |
| `canvas-animations.html`    | 6: canvas and animations    | English, LTR | 1920×1080                        | 6                          | one `.slide` at a time (`opacity` + `visibility`) | written here            |
| `long-page.html`            | 7: one long scrolling page  | English, LTR | 1440 wide, 6292 tall             | none                       | plain scroll                                      | written here            |
| `photo-tour.html`           | 8: English, image-heavy     | English, LTR | fluid 16:9, authored at 1600×900 | 7                          | vertical scroll-snap, all slides in the layout    | `photo-tour.build.mjs`  |
| `examples/reveal-demo.html` | 4: reveal.js                | English, LTR | 960×700                          | 8 (7 horizontal positions) | reveal runtime                                    | `third-party/build.mjs` |
| `examples/marp-demo.html`   | 5: Marp export              | English, LTR | 1280×720                         | 7                          | bespoke runtime                                   | `third-party/build.mjs` |

The two files under `examples/` (repository root, git-ignored) embed third-party code and are
not tracked; their sources are in `third-party/`.

## Ground truth

Slide titles are the text of the slide's heading, in order.

### handwritten.html (6 slides)

1. גינה קהילתית ברחוב הדקל (title, subtitle, date line)
2. למה גינה קהילתית? (5 bullets)
3. המגרש: היום ואחרי ההקמה (two columns, "המצב היום" and "אחרי ההקמה", 4 bullets each)
4. No heading: a quote, "״הילדים שלי לא ידעו שעגבנייה גדלה על שיח…״", attributed to רונית אברהמי
5. תקציב ההקמה (table: 3 columns, a header row, 5 rows and a total row, 22,000)
6. מצטרפים? (closing)

Not slide content: the `n / 6` counter. Forward is the left arrow (also PageDown, Space), back is
the right arrow. Everything should become editable.

### canvas-animations.html (6 slides)

1. Pedal City (subtitle "Year One in Numbers")
2. Rides per month: a `<canvas>` bar chart of 12 months drawn by the page's own script. It is
   drawn once at load and grows in again (1.1 s, `requestAnimationFrame`) each time the slide is entered
3. The network, right now: CSS animations that never end (9 pulsing dots, a rotating ring, a
   blinking dot, 7 bouncing bars)
4. Four changes that moved the numbers: entrance animations that end about 1.7 s after the slide
   is entered (heading slides in, four cards rise one after another)
5. A typical commute: an inline SVG animated with SMIL, looping
6. Year two: 40 new stations (closing)

Expected to stay `html` and keep playing: the canvas of slide 2, the map, ring and bars of
slide 3, the SVG of slide 5. The text around them (headings, lead, the three chips of slide 5)
and all of slides 1, 4 and 6 should be editable. Not slide content: the brand line, the pager
and the progress bar. The deck writes `#n` to the URL with `history.replaceState`.

### long-page.html (no ground-truth slide count)

A product landing page with nothing that marks slides. The importer is expected to propose a
split and ask for approval. Natural sections, in order, with their height at 1440 px width:

1. Sticky header with navigation (73 px; stays on screen while scrolling)
2. Hero: "One list for the whole household. No more second trips." (850)
3. Press strip: "As written up in" (89)
4. Features: "Everything between “we are out of milk” and dinner on the table", 6 cards (1091)
5. How it works: "Three habits, about five minutes a week", three steps: "Everyone adds as they
   notice", "Plan the week on Sunday", "Shop once, in order" (1634)
6. Numbers band: 310,000 / 23% / 1.4 / 4.8 / 5 (268)
7. Voices: "Fewer texts that say “did you get the…”", 3 quotes (788)
8. Pricing: "Free for two. One price for the whole house.", 3 plans (1143)
9. Footer (356)

### photo-tour.html (7 slides)

1. Six Days on the Northern Ridge (full-bleed CSS background under a gradient, PNG badge)
2. 92 kilometres, from sea level to 2,469 metres (image beside text, list of 6 days)
3. Days 1 and 2: the coast (mosaic of 4 captioned images)
4. Into Alder Wood (full-bleed CSS background, text panel)
5. The people we walked with (row of 4 circular portraits)
6. Summit morning (text and three figures beside an arch-cropped image)
7. Until next season (full-bleed CSS background, centred text)

14 raster images, all `data:` URIs: 3 in CSS `background-image` (JPEG 1600×900) and 11 in
`<img>` (6 JPEG, 4 WebP portraits of 480×600, 1 PNG with transparency). Most `<img>` are cropped
with `object-fit: cover`. Sizes are in `rem`, and one `rem` is `min(1vw, 1.7778vh)`, so a slide
is always the viewport. Not slide content: the column of dots on the right. The pictures are
synthetic: `photo-tour.build.mjs` paints them on a canvas in headless Edge (Playwright from this
workspace) and writes the page; `--dump DIR` also saves the pictures.

    node apps/desktop/e2e/import-set/photo-tour.build.mjs

### examples/reveal-demo.html (8 slides)

Every vertical child counts as a slide: 7 horizontal positions, the third is a stack of 2.

| #   | reveal index | Title                        |                                   |
| --- | ------------ | ---------------------------- | --------------------------------- |
| 1   | 0            | Caching 101                  | speaker notes                     |
| 2   | 1            | When is a cache worth it?    | 4 fragments, speaker notes        |
| 3   | 2/0          | Where a cache can live       |                                   |
| 4   | 2/1          | In-process or shared?        | table                             |
| 5   | 3            | Cache-aside in a dozen lines | code block                        |
| 6   | 4            | The hard part                | `data-background-gradient`, quote |
| 7   | 5            | Choosing a TTL               | table, speaker notes              |
| 8   | 6            | Takeaways                    |                                   |

4 fragments in all, on slide 2; one slide, not five. Notes (`<aside class="notes">`) on slides
1, 2 and 7. The theme shows headings in capitals (`text-transform`); the text itself is mixed
case. The theme's font, Source Sans Pro, is embedded by reveal's own CSS as `data:` WOFF.
Configuration is reveal's stock page: `hash: true` and the notes plugin, the rest default.

### examples/marp-demo.html (7 slides)

1. Solar on Our Roof (`_class: lead`, no footer, no page number; presenter notes)
2. Why we did it
3. The system (`![bg right:40%]`, a JPEG `data:` URI)
4. Production by season (table: 4 columns, header and 5 rows; presenter notes)
5. What surprised us
6. Payback (`_backgroundColor`, `_color`; presenter notes)
7. What we propose for 2026

Notes on slides 1, 4 and 6. The footer "Orchard Lane Housing Co-op" and the page number are on
slides 2 to 7. Each slide is an `<svg data-marpit-svg>`; slide 3 is three stacked `<section>`
layers, so the file has 9 `<section>` elements for 7 slides. Not slide content: the on-screen
controller that fades in at the bottom.

## Third-party builds

| File                        | Built from                                                                                                                                                                 | Version               | License                                             |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | --------------------------------------------------- |
| `examples/reveal-demo.html` | `third-party/reveal-demo.src.html` + `reveal.js` from npm (`dist/reset.css`, `dist/reveal.css`, `dist/theme/black.css`, `dist/reveal.js`, `dist/plugin/notes.js`, inlined) | 6.0.2                 | MIT (Source Sans Pro inside the theme: SIL OFL 1.1) |
| `examples/marp-demo.html`   | `third-party/marp-demo.md` exported by `@marp-team/marp-cli` from npm, default theme, bespoke template                                                                     | CLI 4.5.1, Core 4.4.0 | MIT                                                 |

    node apps/desktop/e2e/import-set/third-party/build.mjs [--packages DIR]

`DIR` is a folder whose `node_modules` holds `reveal.js` and `@marp-team/marp-cli`. Without it
the script installs the pinned versions with npm into `<system temp>/slidr-import-set`. Nothing
is added to a `package.json` of this repository. The build fails if an output refers to an
external resource. The picture in `marp-demo.md` is stored in the Markdown as a `data:` URI; it
was painted the same way as the pictures of `photo-tour.html`.

## Checked

Each file was opened in headless Edge from `file://` with every request other than `file:`,
`data:` and `blob:` aborted: no request was aborted, no error was logged. Each was also loaded
as `iframe.src = URL.createObjectURL(new Blob([html], { type: 'text/html' }))` in a blank page
on an `http:` origin. The slides rendered pixel for pixel like the top-level page (apart from
running animations and Marp's fading controller), and navigation worked with real key presses
and with synthetic `keydown` events. Two differences:

- **reveal (`hash: true`).** For the first slide reveal passes `location.pathname` to
  `history.replaceState`, and in a `blob:` document that is not a URL the document may take, so
  the call throws a `SecurityError` whenever the deck lands on the first slide: once at load
  (uncaught), and again on `Reveal.slide(0)` or a key press that goes back there. reveal writes
  the URL at most once a second, so the error comes either straight out of the call or from a
  timer shortly after. The slide still changes and `slidechanged` fires; only the hash is left
  stale. Every other move works and updates the hash (`#/2/1`). With `hash: false` nothing throws.
- **Marp.** bespoke's `history.replaceState` fails on every move; bespoke catches it and logs a
  `console.error`. Navigation works, the hash does not change.

`canvas-animations.html` writes a hash-only URL (`#3`), which works in a `blob:` document.
