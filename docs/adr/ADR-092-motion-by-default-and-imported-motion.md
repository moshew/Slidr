# ADR-092 — Motion by default, and the motion of an imported file carried over

Status: Implemented on 2026-10-15 in the working tree; not committed at the time of this record.

## Context

The model, the runtime, the animations panel and the export have had transitions and animation steps since [ADR-031](ADR-031-animations-panel.md), but a deck the agent built came out still: the agent wrote `data-anim` rarely, and `animation_set` almost never. An imported HTML deck lost its motion altogether: the capture waited for every entrance to end and kept the end, and the agent was told to "carry over" a transition it had to work out by reading the file's code.

The user asked for a default transition between slides and animation on the objects of a slide in decks made by the AI, and for the transitions and animations of an imported HTML deck to come in as close to the original as possible.

## Decision

### Motion by default (`packages/agent-tools/src/motion.ts`)

- A slide the agent makes (`slide_create_from_html`, `slide_create`) gets the transition of the nearest slide before it that has one, else after it, else a 600 ms fade (`DEFAULT_TRANSITION`). `none` counts, so a deck set to cut keeps cutting. `slide_replace_from_html` keeps the slide's transition and gives one only to a slide that had none.
- Unless the agent's HTML says anything of animation (`data-anim` anywhere), the slide gets an entrance (`defaultTimeline`): what is on it enters as the slide opens, after its transition, in the order the slide lists it, which is the order the HTML was written in. Text, cards and shapes with text rise; pictures, charts, tables and html fade; a small drawing grows in. Each starts 150 ms after the one before, less for a long list (the last starts by 900 ms), 260 ms on an opening or a quote, which also fades more slowly. The title, the footer, the slide number and the logo are there with the slide, and so is anything that covers 40% of it or more and any decoration of 8% or more (a backdrop, a band). A small decoration enters with the nearest thing beside it, and stays put beside the title. Nothing waits for a click: a deck nobody looked at for animation still presents with one press per slide.
- The agent overrides all of it: `data-anim` on an element, `data-anim="none"` on the root for a slide that stays still, `animation_set` and `slide_update` afterwards.

### `data-anim` as JSON (`packages/html-import/src/anim.ts`)

`data-anim` takes a preset name as before, or JSON with the fields of an `animation_set` step and an `order` (one step or a list of them). Steps go in document order, or by `order` where any step gives one: 0 plays as the slide opens, `n` on the n-th click, steps of one order together. A preset the runtime does not have is left out with a note, where before it played as a fallback the agent never heard of; `none` stops what an ancestor gives.

### The slide's own keyframes (`packages/runtime/src/keyframes.ts`)

A step whose preset is `css:<name>` plays the `@keyframes <name>` that the slide carries in its `css`, looked up in the slide's own stylesheets first. The element keeps its opacity, rotation and shadow while it moves. No schema change: `preset` was free text, and an older app plays such a step as a fade. The panel calls it "Original motion" and replacing it with a ready-made effect is one choice away.

### Motion seen on the imported page (`packages/html-import/src/motion.ts`)

- `import_capture` watches the page from just before `before` runs until the capture: every animation the page starts (CSS animations, CSS transitions, script animations), and what the slide still holds from before. It knows no format (IMP-04); it reads keyframes and timing as the browser has them.
- What moves inside the captured element becomes a step of order 0 with the file's own keyframes, written as a `slidr-<hash>` `@keyframes` rule (px scaled to the slide), and its duration, delay and easing. Several animations of one element are merged onto one timeline. Its kind is read off the keyframes: from nothing (entrance), to nothing (exit), and back to where it was (emphasis). The delay counts from when the slide began to come in, less the transition, because the deck's steps start once the transition ends.
- What moves the captured element, its ancestors or the slide beside it that leaves is the transition, matched to the nearest the runtime has: a turn in depth is `flip` or `cube`; a cut shape `iris`, `split` or `wipe`; a blur `blur`; a move across the whole slide `push`, `cover` or `reveal`; a scale `zoom`; a shorter move `slide`; and opacity alone `fade` or `crossfade`. Its duration spans what both slides did; its easing is the one that played; its direction follows the file's reading direction.
- Build steps that wait for a click are not played by themselves. The agent reveals them in `before` and marks each with `data-slidr-anim` (`{ "order": n }`); the motion the page plays as they appear comes with the mark, and a mark wins over what was seen. The page's own `data-anim`, if it has one, means whatever the page made it mean and is not read. Marks hold for one capture.
- An entrance that ended where the element rests now lets go of it, unless letting go changes how it looks. Held, it kept the element on a compositing layer of its own, where text is drawn otherwise, and the comparison with the page kept such elements as html; the four cards of slide 4 of `canvas-animations.html` were html for that alone, and are groups now.
- `import_capture` takes a `transition` type per slide in place of the one seen (null for none), and reports `motion` for every slide. The import prompt tells the agent to reach each slide the way the deck does, with its animations on.

### The runtime holds a waiting element transparent as well as hidden

While an element waits for its entrance the runtime held it with `visibility: hidden`. A part that says `visibility: visible` of itself, as the copied markup of an `html` element does, showed through: a paragraph of a card was on screen before its card. The hold now sets opacity 0 as well, and an effect reads the element's own look before the hold is put on it.

## Consequences

- An imported slide plays as the file did. On slide 4 of `canvas-animations.html` the capture finds a 350 ms cross-fade and five entrances (the heading 700 ms, four cards 800 ms each, 180 ms apart, with the file's own cubic-bezier), and frames of the imported slide taken 600 ms and 900 ms into it match frames of the source; the heading, which in the file starts with the transition, starts 350 ms later.
- The tool listing grew by about 1.3 KB; its budget is raised from 95 KB to 97 KB. The listing was already 95.3 KB in the working tree before this change. The system prompt stays within its budgets.
- The runtime bundle was rebuilt (`pnpm --filter @slidr/runtime bundle`).

## Checks

- Unit: `packages/agent-tools/src/motion.test.ts`, `services.test.ts`, `import.test.ts`, `listing.test.ts`; `packages/runtime/src/timeline.test.ts`; the prompts' tests.
- Real browser: `packages/html-import/src/motion.browser.test.ts` (the import of slide 4 of `canvas-animations.html`, its playback with the file's keyframes, and click steps marked by the agent), `compose.browser.test.ts` (`data-anim` as JSON, `none`, unknown presets, `css:` keyframes), `packages/runtime/src/timeline.browser.test.ts` (the hold and the element's own opacity, for a preset and for layered keyframes).
- Looked at: frames of the imported slide beside frames of the source at 200, 600, 900, 1300 and 2000 ms, and frames of a slide made with the default motion in English and in Hebrew at 0, 250, 450 and 1400 ms (written to `test-results/motion/`, not kept).
- End to end, in Edge against the mocked backend: the runtime area (`e2e/runtime.playwright.config.ts`, 72 tests) passes. `runtime-acceptance.spec.ts` told a hold from an animation by keyframes that set only `visibility`, and now by every keyframe being hidden. `import-panel.spec.ts` and `import-continue.spec.ts` (12 tests) pass.
- Not run: the rest of the end-to-end suites, an import through the real agent CLI, and a deck built by the agent in the real window. Three real-browser tests fail with or without this change: `compose.browser.test.ts` ("does not keep a sheen over the whole card…") and `card-variants.browser.test.ts` fail on the engine as it was, and `media.browser.test.ts` ("a sound is trimmed…") fails only when the machine is loaded.
