# WG0-S6 results: TipTap bidi editing on a CSS-transform-scaled slide

Run of 2026-10-02, Edge 154.0.4258.48 headless (installed WebView2 runtime is the same version, 154.0.4258.48),
viewport 1920x1080, deviceScaleFactor 1 unless stated. TipTap 3.31.4, prosemirror-view 1.42.6, React 19.3.0,
@floating-ui/dom 1.8.0, TypeScript 6.0.3, Vite 8.3.2, playwright-core 1.63.0, Node 24.15.0. Fonts: Heebo and Inter
bundled from @fontsource, load verified before every measurement.

## Recommendation

**Use TipTap directly on the `transform: scale()` surface, as-is: no CSS `zoom`, no unscaled editing overlay.**
Every editing behaviour measured (click, selection, keyboard, typing, IME, undo, drag-and-drop) gave the same
result at 0.25, 0.64, 1.0 and 2.0 as the same page with no transform at all. Three conditions come with it:

1. Floating UI anchored to the selection must live outside the scaled slide (`appendTo: document.body`, screen
   coordinates). TipTap's default placement is inside the slide and is wrong there (section 8).
2. Do not position anything from `view.coordsAtPos(pos)` alone at a Hebrew/English junction. At those positions it
   can point a whole word away from the painted caret. This is the same without any scaling (section 2).
3. The native caret gets thin and faint below 100% (0.25 px wide at s=0.25). It is the only scale-dependent
   degradation found. A person has to decide whether it is acceptable (manual checklist, item 1). CSS `zoom`
   fixes it and was measured, but changes how text is laid out (section "Workarounds").

## How to run

```
cd spikes/s6-bidi-text
pnpm install
pnpm measure      # full matrix, about 15 minutes; writes out/results.json, out/summary.md, out/*.png
pnpm measure --only click,coords --modes transform --scales 0.64   # a subset, merged into out/results.json
pnpm summary      # regenerate out/summary.md from out/results.json
pnpm manual       # opens http://localhost:5176/?s=0.64&bubble=body for the manual checklist
```

`pnpm measure` builds the page, serves it on a free port, drives the installed Edge (`channel: 'msedge'`), closes
both. Measures: `click, coords, selection, keyboard, typing, ime, undo, bubble, caret, lines, listdir, scroll, eotb,
dnd, focus, trailing, dsf`. URL parameters of the page: `s`, `mode=transform|zoom|plain`, `bubble=inside|body`,
`hist=tiptap|external|none`, `native=1`, `norot=1`, `tiptapDir=1`, `trailing=1`, `hud=0`.

Files: `src/boxes.ts` (fixtures), `src/extensions.ts` (paragraph `dir`, outside-history demo), `src/harness.ts`
(in-page measurement API), `tests/measures.ts`, `tests/run.ts`, `tests/summary.ts`.

## Method in brief

- Slide: 1920x1080 container with five absolutely positioned TipTap editors: English, Hebrew, mixed (RTL paragraph
  with English, a number, parentheses and a URL; a `dir=auto` paragraph with a bold run; an LTR paragraph with
  Hebrew), a bulleted list, and a box rotated 15 degrees. Paragraph `dir` is an attribute (rtl / ltr / auto) with
  `text-align: start`.
- Three ways of scaling, same content: `transform` (the subject), `zoom` (workaround A), `plain` = nothing scaled,
  every length multiplied by s (the geometry an unscaled overlay editor would have; workaround B). `plain` at s=1
  is the no-transform control. A bare `contenteditable` with the same markup is the native control for keys.
- Ground truth is geometry from `Range.getClientRects` and, for the caret and the selection highlight, pixels
  from screenshots (difference between a red and a transparent caret; difference before/after selecting).
- The harness resolves the visual direction of each glyph itself and checks that model against the real layout:
  0 violations in 486 adjacent glyph pairs at every scale.

Two accommodations in the tests, both about ProseMirror, neither about scaling:

- ProseMirror counts two mousedowns less than 500 ms and less than 10 px apart as a double click and three as a
  triple click (which selects the paragraph), whatever `event.detail` says. Automated clicks on neighbouring
  glyphs are that fast, so the harness clears that click chain between test clicks. A paced control without the
  reset (26 clicks, 520 ms apart) gives the same outcome: 24/26 strict at all four scales, the two misses being
  the boundary cases described below.
- ProseMirror reverts a selection change that lands on the document start within 200 ms after the editor gained
  focus without a click. The harness disables that for its own programmatic focus; it is measured on purpose in
  section 11.

## Results

### 1. Click-to-caret (two real clicks per glyph, at 25% and 75% of its width; 1060 clicks per row)

"Strict" = the selection is at that glyph's own logical start/end. "Caret at clicked edge" = strict hit, or a strict
miss for which a caret was found painted within 2 px of the glyph edge nearest to the click.

| scaling | s | mean glyph width px | Hebrew | English | at a bidi boundary | digits, punctuation, spaces | rotated box | all, strict | caret at clicked edge |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| transform | 0.25 | 4.7 | 341/342 | 368/368 | 64/86 | 157/158 | 102/106 | 1032/1060 (97.4%) | 1059/1060 |
| transform | 0.64 | 12.0 | 341/342 | 368/368 | 64/86 | 157/158 | 102/106 | 1032/1060 (97.4%) | 1060/1060 |
| transform | 1.0 | 18.8 | 341/342 | 368/368 | 64/86 | 157/158 | 102/106 | 1032/1060 (97.4%) | 1060/1060 |
| transform | 2.0 | 37.5 | 341/342 | 368/368 | 64/86 | 157/158 | 102/106 | 1032/1060 (97.4%) | 1060/1060 |
| transform (extra) | 0.1 | 1.9 | 341/342 | 368/368 | 64/86 | 157/158 | 102/106 | 1032/1060 | 1060/1060 |
| transform (extra) | 4.0 | 75.1 | 341/342 | 368/368 | 64/86 | 157/158 | 102/106 | 1032/1060 | 1054/1060 |
| zoom | 0.25 / 0.64 / 1 / 2 | same | 341/342 | 368/368 | 64/86 | 157/158 | 102/106 | 1032/1060 | 1060/1060 each |
| plain (no transform) | 0.25 / 0.64 / 1 / 2 | same | 341/342 | 368/368 | 64/86 | 157/158 | 102/106 | 1032/1060 | 1060/1060 each |
| transform, deviceScaleFactor 1.5 | 0.25 / 0.64 / 1 / 2 | | | | | | | 1032/1060 each | 1059, 1060, 1060, 1059 |

- For the 1032 strict hits the caret reported by `coordsAtPos` is at most 0.01 px (s=0.64) from the clicked glyph
  edge.
- The 28 strict misses are the same 28 clicks in every one of the 18 rows, including `plain` at s=1 where nothing
  is transformed. 26 of them are on a glyph next to a direction change. In each, the caret is painted at the
  clicked edge but the logical position belongs to the neighbouring run: clicking the left half of `S` in
  `של Slidr גרסה` gives the position after `r`, clicking the right half of `r` gives the position before `S`.
  That decides where the next typed character goes (a Hebrew letter appears at the caret, a Latin letter joins the
  far end of the English word). This is Chromium's bidi caret model, not an effect of scaling. List (s=1, plain):
  `mixed:11L(S)->16 15R(r)->11 22L(2)->25 24R(5)->22 27L(b)->31 30R(a)->27 46L(h)->71 70R(2)->46 89L(ו)->89
  89R(ו)->90 102R(ה)->125 111L( )->116 116R( )->112 124L(ח)->102 137R(ש)->141 140L(ם)->137 167R(ע)->171
  170L(ם)->167 list:32L(A)->35 34R(I)->32 42L(4)->44 43R(2)->42 66R(ע)->71 70L(ת)->66 rot:15L(E)->22 21R(h)->15
  41L(1)->44 43R(3)->41`.
- Rotated box: 102/106 strict at every scale, the 4 misses are the same run-edge cases, painted at the clicked edge.
- Not pixel-verified: 1 strict miss at transform 0.25, 6 at s=4, 1 each at deviceScaleFactor 1.5 with s=0.25 and
  s=2 (the caret was not found in the search window; at s=4 the boxes are larger than the window). The other
  configurations found all 28.

### 2. Caret geometry (`coordsAtPos`, `posAtCoords`), px on screen

974 samples per row (both sides of 487 caret positions, unrotated boxes), 108 in the rotated box.

| scaling | s | distance to nearest adjacent glyph edge, max (Hebrew / English / boundary) | same in slide px | `side` picks the named edge: all | at boundaries | top/bottom error max | rotated: centre / `left` error max | `posAtCoords` round trip unrotated (exact + same place + mismatch) | rotated |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| transform | 0.25 | 0 / 0 / 0 | 0.016 | 950/974 | 20/44 | 0 | 1.72 / 1.72 | 473 + 12 + 2 of 487 | 51 + 3 + 0 of 54 |
| transform | 0.64 | 0.01 / 0 / 0.01 | 0.016 | 950/974 | 20/44 | 0 | 4.39 / 4.40 | 473 + 12 + 2 | 51 + 2 + 1 |
| transform | 1.0 | 0.02 / 0 / 0.02 | 0.016 | 950/974 | 20/44 | 0 | 6.86 / 6.87 | 473 + 12 + 2 | 51 + 2 + 1 |
| transform | 2.0 | 0.03 / 0 / 0.03 | 0.016 | 950/974 | 20/44 | 0 | 13.72 / 13.75 | 473 + 12 + 2 | 51 + 2 + 1 |
| zoom | 0.25 | 0.02 | 0.064 | 950/974 | 20/44 | 0 | 1.70 / 1.70 | 473 + 12 + 2 | 51 + 3 + 0 |
| zoom | 0.64 | 0.02 | 0.025 | 950/974 | 20/44 | 0 | 4.42 / 4.42 | 473 + 12 + 2 | 49 + 2 + 3 |
| zoom | 1.0 | 0.02 | 0.016 | 950/974 | 20/44 | 0 | 6.86 / 6.87 | 473 + 12 + 2 | 51 + 2 + 1 |
| zoom | 2.0 | 0.02 | 0.008 | 950/974 | 20/44 | 0 | 13.59 / 13.60 | 471 + 12 + 4 | 51 + 2 + 1 |
| plain | 0.25 .. 2 | identical to the zoom rows | | | | | | | |

- `coordsAtPos` is exact under scaling: always on a glyph edge that is logically adjacent to the position, error
  at most 0.03 px at s=2 (0.016 slide px), vertical extent identical to the glyph rect.
- 21 of the 487 positions (all at direction changes) have two caret places on the same line, and `side` does not
  choose between them predictably (20/44 at boundaries). Section 9 shows the painted caret is at one of them, and
  which one depends on how the caret got there, so `coordsAtPos(head)` can be a full run away from the visible
  caret. Same numbers with no transform.
- `posAtCoords` mismatches: `mixed:71->46` and `list:66->71` in every mode (start or end of a line that begins or
  ends with an opposite-direction run), plus the paragraph end in the rotated box. With `zoom`/`plain` 2 to 3 more.
- Rotated box: `coordsAtPos` returns the axis-aligned bounding box of the slanted caret (width = height x sin 15),
  so `left`/`top` are off by up to 4.4 px at 0.64 and 13.75 px at 2.0; the centre of the rect is right for all but about two of the 108 samples (95th percentile 0.01 px;
  the maximum shown is those samples).
- Drag-and-drop of selected text, which uses `posAtCoords` for the drop position: correct in all 12 configurations.

### 3. Selection

| scaling | s | mouse drags logically correct | highlight covers the selection rects, min | highlight pixels inside the rects, min | rotated: inside / covered | double-click selects the word | triple-click selects the paragraph |
| --- | --- | --- | --- | --- | --- | --- | --- |
| transform | 0.25 | 9/9 | 100% | 98.3% | 100% / 68.1% | 10/10 | 3/3 |
| transform | 0.64 | 9/9 | 100% | 98.1% | 100% / 64.7% | 10/10 | 3/3 |
| transform | 1.0 | 9/9 | 99.8% | 97.6% | 100% / 62.9% | 10/10 | 3/3 |
| transform | 2.0 | 9/9 | 99.3% | 95.1% | 100% / 61.6% | 10/10 | 3/3 |
| zoom | 0.25 .. 2 | 9/9 each | 99.0 .. 99.9% | 93.6 .. 98.7% | 100% / 61 .. 70% | 10/10 each | 3/3 each |
| plain | 0.25 .. 2 | 9/9 each | 99.0 .. 99.9% | 93.6 .. 98.7% | 100% / 61 .. 70% | 10/10 each | 3/3 each |

- Drag cases: Hebrew into an embedded English word and back, Hebrew through a number into `(beta)`, across a soft
  wrap into the URL, LTR paragraph into Hebrew, three lines Hebrew, three lines English, rotated box, across list
  items. Selected text is the logical range in all cases, e.g. `של Slid`, `גרסה 2.5 (bet`,
  `מינה בכתובת https://slid`, `סובב עם Engli`.
- The 2 to 5% of highlight pixels outside the DOM rects are the line-end fill Chromium paints for a selection
  that continues on the next line. The rotated "covered" figure is low because the comparison uses bounding boxes
  of slanted rects; it is not a defect.
- Screenshots looked at: `out/sel-transform-0.64-he-num-paren.png`, `out/sel-transform-0.64-wrap-into-url.png`,
  `out/sel-transform-0.64-rotated.png`, `out/sel-transform-0.25-he-to-en.png`,
  `out/sel-transform-2-list-cross-item.png`. The highlight sits on the glyphs, split into the correct visual
  pieces for a bidi range, rotated with the box.
- Double-click selects the word plus the following space (`Slidr `, `זמינה `), and `beta` alone inside the
  parentheses. Identical in all 12 configurations.
- Shift+Arrow selection: section 4.

### 4. Keyboard movement

26 scenarios, the caret read after every key as (paragraph : offset) and compared with a bare `contenteditable`
holding the same markup, unscaled.

| | transform 0.25 | transform 0.64 | transform 1 | transform 2 | zoom, 4 scales | plain, 4 scales |
| --- | --- | --- | --- | --- | --- | --- |
| scenarios identical to native | 26/26 | 26/26 | 26/26 | 26/26 | 26/26 each | 26/26 each |
| ProseMirror state equal to the DOM selection after every key | yes | yes | yes | yes | yes | yes |

What the keys do (native and TipTap alike):

- Left/Right move logically, one position per key, in the direction given by the paragraph: ArrowLeft in an RTL
  paragraph goes offset +1 on each of 80 presses straight through `Slidr`, `2.5`, `(beta)` and the URL; ArrowRight
  in an LTR paragraph goes +1 through the Hebrew words. So inside an opposite-direction word the caret moves
  against the arrow.
- Shift+ArrowLeft/Right extend by one logical position per key across the boundary (`0:6>0:7 ... 0:6>0:20`).
- Home/End go to the logical start/end of the visual line (`1:29 1:64` on a wrapped Hebrew line; `0:45 0:80` on
  the line that starts with the URL), Ctrl+Home/End to the document ends.
- Ctrl+Arrow moves by word in logical order (`0:7 0:10 0:16 0:21 0:25 0:26 0:30 ...`), Shift+Ctrl+Arrow extends.
- Up/Down keep the column, also in the rotated box (`0:46 0:10 0:46`, same as the same box without rotation).

### 5. Typing

11 checks per configuration, Hebrew sent as real key events on the Hebrew layout's physical keys (26 keydown and
26 `beforeinput insertText` events for 26 characters).

| scaling | 0.25 | 0.64 | 1.0 | 2.0 |
| --- | --- | --- | --- | --- |
| transform | 11/11 | 11/11 | 11/11 | 11/11 |
| zoom | 11/11 | 11/11 | 11/11 | 11/11 |
| plain | 11/11 | 11/11 | 11/11 | 11/11 |

Checks: `dir=auto` paragraph typed Hebrew-first (`שלום world 123, (test) זה.` gives rtl), English-first (ltr),
digits then Hebrew (rtl); digits, Hebrew, Latin and a comma inserted before the embedded English word, and
punctuation, Hebrew and a digit after it (text exactly as typed, in logical order); Enter in the middle of an RTL
paragraph keeps `dir="rtl"`; Backspace x3 and Delete x3 across the boundary delete logically; `dir=auto` flips ltr
to rtl when a Hebrew letter is typed at the start; typing in the rotated box; Enter in a list item keeps
`dir="auto"` on the new `<li>`; `setParagraphDir` rtl/ltr/auto changes one paragraph only.

### 6. IME composition (CDP `Input.imeSetComposition`, then `Input.insertText`)

| scaling | 0.25 | 0.64 | 1.0 | 2.0 |
| --- | --- | --- | --- | --- |
| transform | 8/8 | 8/8 | 8/8 | 8/8 |
| zoom | 8/8 | 8/8 | 8/8 | 8/8 |
| plain | 8/8 | 8/8 | 8/8 | 8/8 |

Cases: inside a Hebrew word; before and after the embedded English word; rotated box; end of a list item;
cancelled composition (document unchanged); a Hebrew composition inside English; composition replacing a
selection. Each passes only if the intermediate text holds the composing string once at the caret,
`view.composing` is true, the committed text is exact (nothing duplicated or dropped), the caret is after it,
ProseMirror's selection matches the DOM, and there is exactly one `compositionstart` and one `compositionend`.
Screenshots looked at: `out/ime-transform-0.64-mixed.png`, `out/ime-transform-0.64-rot.png` (composition highlight
on the right glyphs, slanted in the rotated box).

### 7. Undo granularity (transform, s=0.64)

| typing | TipTap `UndoRedo` groups | Ctrl+Z presses to restore | outside history: entries (transactions merged) | Ctrl+Z presses to restore |
| --- | --- | --- | --- | --- |
| 20 characters, 30 ms apart | 1 | 1 | 1 (20) | 1 |
| 12 characters, 200 ms apart | 1 | 1 | 1 (12) | 1 |
| 4 characters, 650 ms apart | 4 | 4 | 4 (1+1+1+1) | 4 |
| 10 characters, 700 ms pause, 10 characters | 2 | 2 | 2 (10+10) | 2 |
| three words with spaces, fast | 1 | 1 | 1 (14) | 1 |
| 5 characters, ArrowLeft x3, 5 characters | 2 | 2 | 2 (5+5) | 2 |
| 5 characters, Enter, 5 characters | 1 | 1 | 1 (11) | 1 |
| 5 characters, Backspace x2, 3 characters | 1 | 1 | 1 (10) | 1 |
| 3 characters, Ctrl+B, 3 characters | 1 | 1 | 1 (6) | 1 |
| 3 characters, then an IME commit | 1 | 1 | 1 (10) | 1 |
| 10 Hebrew characters, 30 ms apart | 1 | 1 | 1 (10) | 1 |

- TipTap's `UndoRedo` (prosemirror-history, `newGroupDelay` 500 ms) already groups a typing burst into one step
  and starts a new one after a pause or when the caret moved.
- Hook for an outside history (`src/extensions.ts`, `ExternalHistory`): configure
  `StarterKit.configure({ undoRedo: false })`, listen to every transaction (`onTransaction` in an extension, or
  `editor.on('transaction')`), use `tr.docChanged`, `tr.before`, `tr.doc`, `tr.time` and `tr.mapping` to merge a
  burst into one entry, and bind `Mod-z`, `Mod-y`, `Shift-Mod-z` to handlers that return `true`. The 60-line demo
  reproduces the grouping above. A lighter alternative is to keep `UndoRedo` and watch `undoDepth(state)` from
  `@tiptap/pm/history`: a new group started whenever it grows.
- With no history plugin and no key binding, Ctrl+Z x12 left the document unchanged and the DOM equal to the
  state in all 11 scenarios: the browser's own undo does not corrupt the editor, it does nothing.

### 8. Bubble menu positioned from the selection (menu is 112x32 px in layout, placement top, offset 8)

`dx` = menu centre minus selection centre; `gap` = selection top minus menu bottom.

| scaling | s | menu parent | max abs dx px | gap px | menu size on screen | rotated box | after the stage scrolled 60x40 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| transform | 0.25 | inside the slide (TipTap default) | 0 | 2 | 28x8 | dx 5.3, gap -13.0, menu rotated | |
| transform | 0.64 | inside | 0 | 5.12 | 72x20 | dx 13.6, gap -33.2, menu rotated | |
| transform | 1.0 | inside | 0.01 | 8 | 112x32 | dx 21.2, gap -51.9 | |
| transform | 2.0 | inside | 0.02 | 16 | 224x64 | dx 42.4, gap -103.8 | follows |
| transform | 0.25 | `document.body` | 0.01 | 8.0 | 112x32 | dx 0, gap 8.01 | |
| transform | 0.64 | `document.body` | 0.01 | 8.01 | 112x32 | dx 0, gap 8.01 | |
| transform | 1.0 | `document.body` | 0.01 | 8.0 | 112x32 | dx 0, gap 8.01 | |
| transform | 2.0 | `document.body` | 0 | 8.0 | 112x32 | dx 0, gap 8.0 | dx 0, gap 8 |
| zoom | 0.25 .. 2 | inside | 0.05 | 2 .. 16 | 28x8 .. 224x64 | overlaps, as transform | |
| zoom / plain | 0.25 .. 2 | `document.body` | 0.01 | 8.0 | 112x32 | dx 0, gap 8.0 | dx 0.01, gap 8 |

- Default placement fails in two ways: the menu is scaled with the slide (28x8 px at 25%, 224x64 px at 200%) and
  in a rotated box it is rotated and lands on top of the selection (gap -33 px at 0.64).
  Evidence: `out/bubble-transform-0.25-inside-mixed.png`, `out/bubble-transform-0.64-inside-rot.png`.
- With `appendTo: () => document.body` the error is at most 0.01 px at every scale, also for the rotated box
  (`out/bubble-transform-0.64-body-rot.png`), and with `options.scrollTarget` set to the scrolling stage it stays
  on the selection when the stage scrolls at 200%.
- Measured with `flip` and `shift` off, to see the raw anchoring.
- ProseMirror's own `scrollIntoView` when typing in a box that is off screen at s=2 brings the caret into view in
  all three modes (stage scrolled to 1254, 694).

### 9. Painted caret (10 cases per configuration, caret found in all 120)

`peak` = strongest colour change against the same frame without a caret; 255 means a fully opaque caret pixel.

| scaling | s | painted width px | peak | click cases: painted caret to clicked glyph edge, max px | ordinary positions: painted caret to `coordsAtPos`, max px | run-edge clicks: painted caret to `coordsAtPos` side 1 / side -1, px |
| --- | --- | --- | --- | --- | --- | --- |
| transform | 0.25 | 1 to 2 | 40 to 56 | 0.39 (one case 33.5, see below) | 0.43 | 19/0, 0/19, 70/159, rotated 29/0 |
| transform | 0.64 | 2 | 101 to 146 | 0.66 | 0.43 | 49/0, 1/49, 264/491, rotated 75/1 |
| transform | 1.0 | 1 | 255 | 0.63 | 0.47 | 76/0, 0/76, 413/768, rotated 117/0 |
| transform | 2.0 | 2 | 255 | 1.27 | 0.94 | 152/0, 0/152, 826/1536, rotated 234/0 |
| zoom | 0.25 | 1 | 255 | 0.61 | 0.48 | 19/0, 0/19, 103/192, 29/0 |
| zoom | 0.64 | 1 | 255 | 1.02 | 0.67 | 48/1, 0/48, 264/491, 74/1 |
| zoom | 1.0 | 1 | 255 | 0.63 | 0.47 | 76/0, 0/76, 413/768, 117/0 |
| zoom | 2.0 | 1 | 255 | 0.54 | 0.54 | 151/0, 0/151, 827/1536, 233/0 |
| plain | 0.25 / 2 | 1 | 255 | 0.61 / 0.54 | 0.48 / 0.54 | as zoom |
| plain | 0.64 / 1 | 1 | 255 | 1.02 / 0.63 (one case each 24.3 / 37.8, see below) | 0.67 / 0.47 | as zoom |
| transform, deviceScaleFactor 1.5 | 0.25 / 0.64 / 1 / 2 | 0.7 to 1.3 / 1.3 / 1.3 / 2 | 54 to 90 / 142 to 220 / 255 / 255 | | | |

- The caret is painted where the click was: within 1.3 px of the clicked glyph edge at every scale, in the rotated
  box and at run edges.
- Under `transform` the caret is one slide pixel wide, so it is s pixels wide on screen: at 0.64 it is smeared
  over 2 px at 40 to 57% of full contrast, at 0.25 it is at 16 to 22%. With 150% display scaling the figures are
  56 to 86% at 0.64 and 21 to 35% at 0.25. `zoom` and `plain` paint a full-contrast 1 px caret at every scale.
- Run-edge clicks (left half of `S`, right half of `r`, right half of the last URL character, rotated `E`): the
  painted caret is 49 px (s=0.64) from one `coordsAtPos` side and on the other, and which side is right flips
  between the first two cases. For the URL case, where the line starts with an LTR run, neither side is right
  (264 and 491 px away). Identical without a transform (76, 413/768 px at s=1).
- Unexplained: in 3 of the 120 samples (transform 0.25 URL case, plain 0.64 and plain 1.0 left-half-of-`S` case)
  the changed-pixel box was as wide as the whole run (69, 49, 77 px), meaning pixels changed at both ends of the
  run in that frame. The same clicks in the click measurement found the caret at the clicked edge. Not
  investigated further.

### 10. Does the text reflow when the scaling technique changes

Line-start offsets of the 11 text blocks, compared with the transform layout: 0 of 11 differ for `zoom` and for
`plain` at 0.25, 0.64, 1.0 and 2.0. With these fixtures the three techniques break lines identically.

### 11. Other findings

- `view.endOfTextblock('up')` is wrong on the first line of the rotated box (returns false) at transform 0.64 and
  at plain 1.0, and right for the same box without rotation. Rotation-specific, not scale-specific. No visible
  effect was found: ArrowUp/Down in the rotated box match native.
- Home pressed after a programmatic focus (caret expected to go to offset 0):

  | page | 30 ms | 120 ms | 250 ms | 400 ms | after a mouse click, 30 ms |
  | --- | --- | --- | --- | --- | --- |
  | TipTap, transform 0.64 | stays | stays | moves | moves | moves |
  | TipTap, unscaled | stays | stays | moves | moves | moves |
  | bare contenteditable | moves | moves | moves | moves | |

  This is ProseMirror's focus heuristic. It will bite end-to-end tests of Slidr that focus an editor and press
  Home or Ctrl+Home at once; a person is unlikely to hit it.
- List direction. `dir=auto` on the `<li>` and none on the inner `<p>` gives the right direction per item
  (rtl, rtl, ltr), but the markers of RTL items sit outside the box, because the `<ul>` stays LTR and reserves
  padding on the left only (`out/list-dir-1.png`). `dir=auto` on the inner `<p>` only, or TipTap's built-in
  `textDirection: 'auto'` (which puts `dir` on every node), leave the `<li>` LTR while the text is RTL: bullets on
  the left of right-aligned Hebrew (`out/list-dir-3.png`). The built-in option is not usable for lists; the
  custom schema has to put direction and marker padding on the list item itself.
- StarterKit's `TrailingNode` appends an empty paragraph after a list at the end of the document as soon as the
  user types (`...</li></ul><p></p>`). The spike turns it off (`trailingNode: false`).
- Chromium's spellchecker underlines `Slidr` in the screenshots; the product will want `spellcheck="false"` or a
  deliberate choice.

## Failures and evidence

| # | what | scale-related | evidence |
| --- | --- | --- | --- |
| F1 | Native caret thin and faint under `transform` below 100% (peak 40 to 56 of 255 at 0.25, 101 to 146 at 0.64) | yes | section 9; `caret` and `dsf15.caret` in `out/results.json` |
| F2 | TipTap bubble menu in its default parent is scaled with the slide and overlaps the selection in a rotated box | yes | section 8; `out/bubble-transform-0.25-inside-mixed.png`, `out/bubble-transform-0.64-inside-rot.png` |
| F3 | `coordsAtPos(pos, side)` is not where the caret is painted at 21 of 487 positions (direction changes); one case with neither side right | no, same unscaled | sections 2 and 9; `coords`, `caret` in `out/results.json` |
| F4 | 28 of 1060 clicks land on the logical position of the neighbouring run (caret painted at the click) | no, same unscaled | section 1; `click.*.strictMisses` |
| F5 | `posAtCoords` round trip wrong at 2 of 487 positions, 1 of 54 rotated; 2 to 3 more with `zoom`/`plain` | no | section 2; `coords.*.roundTripMismatches` |
| F6 | `coordsAtPos` in a rotated box is a bounding box: `left`/`top` off by up to 4.4 px at 0.64, 13.75 px at 2.0 | grows with s | section 2 |
| F7 | `endOfTextblock('up')` wrong on the first line of a rotated box | no | section 11; `eotb` |
| F8 | Home within 200 ms of a programmatic focus is reverted | no | section 11; `focusHeuristic` |
| F9 | TipTap `textDirection: 'auto'` and `dir` on the inner paragraph put list markers on the wrong side | no | `out/list-dir-3.png`, `out/list-dir-1.png`; `listdir` |
| F10 | StarterKit `TrailingNode` adds an empty paragraph after a trailing list | no | `trailing` |

## Workarounds measured

Only F1 calls for one of the candidate workarounds; F2 is solved by `appendTo: document.body`.

| | transform (as-is) | CSS `zoom` | unscaled layout / overlay editor (`plain`) |
| --- | --- | --- | --- |
| caret, s=0.25: width px, peak | 1 to 2, 40 to 56 | 1, 255 | 1, 255 |
| caret, s=0.64: width px, peak | 2, 101 to 146 | 1, 255 | 1, 255 |
| click, strict / caret at clicked edge | 1032 / 1059 to 1060 | 1032 / 1060 | 1032 / 1060 |
| keyboard scenarios same as native | 26/26 | 26/26 | 26/26 |
| typing, IME, drags | 11/11, 8/8, 9/9 | 11/11, 8/8, 9/9 | 11/11, 8/8, 9/9 |
| `coordsAtPos` max error, slide px | 0.016 at every scale | 0.064 at 0.25, 0.008 at 2 | same as zoom |
| `posAtCoords` mismatches (unrotated / rotated) | 2 / 0 to 1 | 2 to 4 / 0 to 3 | 2 to 4 / 0 to 3 |
| text blocks that reflow against the transform layout | 0/11 | 0/11 at all four scales | 0/11 at all four scales |

- `zoom` is the cheapest fix for the caret: one CSS property, full-contrast caret, everything else equal.
- It was not chosen because `zoom` and an overlay lay the text out at the scaled font size, while thumbnails,
  presentation and export use the 1920x1080 layout. The fixtures did not reflow, but the per-scale variation of
  the geometry error in slide px (0.064 to 0.008, against a constant 0.016 for transform) shows the layouts are
  not the same computation. That a longer or tighter text could wrap differently is an inference, not a
  measurement.
- A caret drawn by the application in the unscaled layer from `coordsAtPos` was not built: F3 shows it would be
  drawn in the wrong place at Hebrew/English junctions.

## Manual checklist (about 5 minutes)

```
cd spikes/s6-bidi-text
pnpm manual
```

This opens `http://localhost:5176/?s=0.64&bubble=body`. The panel at the bottom right switches scale and mode and
sets the paragraph direction. Stop the server with Ctrl+C.

1. Caret visibility. At 0.64, then 0.25, click into each box. Can you find the caret at once and follow it while
   typing? Compare with mode `zoom` at the same scale. If the display is at 125% or 150%, note that too.
2. Hebrew keyboard. In the mixed box switch layout (Alt+Shift or Win+Space) in the middle of a sentence and type
   Hebrew, English, digits, punctuation. Does every character appear where you expect?
3. Ctrl+Right Shift and Ctrl+Left Shift (the Windows direction shortcut). Does the whole box flip instead of one
   paragraph, and does it stay consistent after more typing? Automation cannot send this.
4. Arrow keys in the mixed paragraph. Hold ArrowLeft through `Slidr` and the URL: the caret walks the English
   word against the arrow. Acceptable, or does Slidr need visual movement?
5. Click the left edge and the right edge of `Slidr` inside the Hebrew sentence and type one Hebrew and one
   English letter each time. Is where the letter lands acceptable?
6. Real IME, emoji panel (Win+.), voice typing (Win+H) at 0.64 and in the rotated box: does the candidate or
   emoji window open next to the caret, and is the text committed once?
7. Drag-select across lines, double-click a word, triple-click a paragraph, in the rotated box as well. Does it
   feel right?
8. At scale 2, select text and scroll the stage: does the menu stay on the selection?

## Not verified

- Real Windows keyboard layout switching, the Ctrl+Shift direction shortcut, a real IME and the position of its
  candidate window, the emoji panel, voice typing. Composition was driven through CDP only.
- How the caret looks and feels to a person. Only its painted width and contrast were measured.
- WebView2 itself. Everything ran in headless Edge 154.0.4258.48; the installed WebView2 runtime has the same
  version number. No headed run was made.
- Pixel confirmation for 1 strict-miss click at transform 0.25, 6 at s=4, and 2 at deviceScaleFactor 1.5; and the
  3 wide caret boxes in section 9.
- Scales 0.1 and 4.0 were measured for click and caret geometry only.
- Double-click and drag selection were compared across the 12 configurations (identical), not against the bare
  `contenteditable`.
- Reflow under `zoom`/overlay for text other than the five fixtures.
- Marks that change metrics inside a paragraph (font size, letter spacing), tables, and the custom Slidr schema.

## Measured and inferred

Measured: every number in the tables above, by `pnpm measure`; the screenshots named in the text were opened and
checked by eye.

Inferred: that Edge headless and WebView2 behave the same (same engine version); that the 28 strict click misses
are Chromium's bidi caret model (they are identical with no transform, but the bare `contenteditable` was compared
for 4 of them only, in an ad-hoc run that is not part of the suite, where it gave the same positions); that `zoom` or an overlay could reflow other
text; that F7 has no user-visible effect beyond the scenarios tried; that a person will not trip the focus
heuristic (F8).
