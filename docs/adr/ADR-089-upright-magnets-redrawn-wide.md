# ADR-089 — The upright event magnets are drawn again for the wide slide

Status: Implemented in the 2026-10-10 working tree; **not committed** at the time of this record. It follows the change of the same day by which every frame is added so that it covers the whole slide (`4382349`), and extends the event magnets of [ADR-083](ADR-083-event-magnets.md), [ADR-086](ADR-086-frames-keep-their-artwork.md), [ADR-087](ADR-087-magnets-labels-and-sets.md) and [ADR-088](ADR-088-stretchable-text-backgrounds.md).

## Context

A hundred magnets were drawn as cards of 7 by 5: 74 lying (1050×750) and 26 upright (750×1050). Since frames cover the slide, a magnet lands at 1920×1080: its artwork keeps its size and its window takes up the change. The user asked that all of them be gone over: "some were converted from other sizes to the 16:9 format, and the change of proportion hurt their quality and their look. Fix what is needed."

All hundred were rendered at full slide size around a photograph, in Hebrew and in English, and looked at.

- **The 74 lying magnets hold.** Their window grows wider by a quarter and nothing else changes; no line of words overflows, shrinks or is under 24px.
- **The 26 upright magnets do not.** A card made for a narrow sheet is stretched to two and a half times its width: the arch of the wedding and of the thirtieth birthday is a flat dome with a step where its foot begins, the oval of the space magnet is a lens, the windows of the toast and of the newspaper are letterboxes (up to 3.9:1), and a stack of lines that filled the foot of a narrow card sits small in one corner of a band 1920 wide.
- **Six generated pictures are soft.** A lying magnet is now drawn at 1.44 of its units, not 1.23, and the pictures that were already near their limit are enlarged 1.25 to 1.7 times: the garland of the garden birthday, the meadow of the picnic, the branch of Christmas, the two sprays of the botanical magnet and the thatch of the sukkah.

## Decision in the working tree

- **Each of the 26 upright magnets is drawn again as a wide magnet of 1920×1080**, the size it lands at, so a unit of its artwork is a pixel of the slide and nothing is laid out again when it is added. It is the same magnet: id, names, tags, set, concept, palette, faces, sample words, stickers and plates. Its composition is made for a wide slide:
  - a shaped window keeps the proportions of its shape, and the words have a column beside it: the arch of the wedding, of the thirtieth birthday and of the castle gate is a true half circle on straight sides, the window of the space magnet is a gentle oval that stays an oval, the window of Eid has an ogee that reads as an arch;
  - a wide window has a band that was made for its words, and what stands in the band is balanced: a title against a cluster or a plate, never one short line alone;
  - the newspaper is a front page (masthead, photograph of 16:9, a column with the headline and the print) and the magazine is a cover with the photograph to its edges;
  - **every line of words stands inside the slide's safe area** (x 96 to 1824, y 80 to 1000), so the design check's rule of the margins (L03) is quiet on them.
- **What must stay with a line of words is an element, not card artwork** (a rule under a title, a writing line of the album): the words are placed by the thirds of the magnet and card artwork by the edges of its window, so on a resize the two part. They are small drawings beside the picture now.
- **A plate that is an object keeps its shape when the magnet is resized.** A label lengthens with the magnet (ADR-088), which turned a round seal into a pill. Such a label either stands wholly in one outer third, where it keeps its size, or says its own flexible strips on the clear edge of its drawing or on a plain part (the loop of a lanyard, the deck of a surfboard, the paper between the lamps of a marquee), so the object is not stretched.
- **The 74 lying magnets are not changed.** They stay cards of 7 by 5 whose window takes up the rest of the slide.
- `frames.test.ts` says the two sizes a magnet has now, in place of "7 by 5, lying or upright". No source of the app changed.

The 26: anniversary, brit, bachelorette, wedding (family); teen, thirtieth, sixtieth (birthdays); space, kingdom, safari (children); prom, discharge (school and army); toast, first day (work); beach, festival, run, party (leisure); Hanukkah, Lag BaOmer, love, Eid (holidays); black and gold, kraft, magazine, newspaper (styles).

One builder redrew the thirtieth as the worked example; five builders redrew the others at the same time, each in files of its own, from one brief and a line of direction for each magnet, and the lead looked at every one.

## Verification

- **Every one of the hundred was rendered from the app's catalogue at full slide size in both languages and looked at**, before the change and after it; the 26 also from half size made taller and wider, from full size made half and narrower, and as the panel draws them small in the light and the dark interface.
- **Measured, the 26 in both languages (52 renders):** no line of words wider than 85% of its box, drawn smaller than its size or under 24px; no line outside the safe area (before: 98 findings of L03, on 21 of these 26); no sticker stretched or pushed out of the magnet by a resize. What the check still prints: a contrast finding (L05) on six of them for words that stand on a plate, which is a fault of the check and not of the magnets (below), and on three (anniversary, run, magazine) that the boxes of the pieces lie over 19% of the photograph's box, on its corners and edges.
- **Unit tests:** `src/elements`, `stage/space.test.ts` and `stage/textBackground.test.ts`, 111 tests, pass with the new catalogue. ESLint and Prettier pass on the ten files of magnets. No E2E was run: no source of the app changed, and the magnets the E2E names (summer, birthday, trip, pool) are lying ones that were not touched.

## Open for the user

- **The six sharper pictures are not in the media library yet.** They were cut again from the sheets they came from, at the size they are drawn at now, and are in `apps/desktop/test-results/frames/wide/recut/` (six WebP files, 780 kB against 440 kB). Replacing the files of `Slidr-media/elements/source/frames/pictures/` was refused to the agent, as the library is not under version control: copy them over the six of the same names and run `node scripts/generate-frames-catalog.mjs` from `apps/desktop`.
- **The 74 lying magnets have words in the slide's margins.** Since a magnet covers the slide, the design check reports L03 on 66 of them (236 findings over the two languages), 7 to 83 pixels past the safe area, with a fix that would move a caption off its plate. They look right; the rule is what disagrees. Either the words of a frame that covers the slide are counted as part of its artwork, or the lying magnets are gone over as well.
- **The design check gives false contrast findings on a magnet with two plates or more.** Every stretchable plate draws itself through the same ids (`slidr-stretch-source…`), each in a shadow root of its own. The picture the check samples what is under a text from (`paintBackdrop` in `packages/renderer/src/measure.ts`) copies all of them into one document, where the ids collide and every plate is drawn as the first. Its fix would recolour words that read well. It is not of this round and was not changed.
- **Windows wider than 2:1.** Nine of the 26 keep a window that runs the width of the slide over a band, 2.2:1 to 2.5:1 (party, prom, discharge, toast, first day, festival, Hanukkah, black and gold, kraft), as most lying magnets do.
- **What a builder changed from its direction:** the stamp of the sixtieth and of the newspaper stands on the top left corner of the photograph, not the right (in the middle third a label lengthens); the masthead of the magazine is white on a shade over the photograph, not ink; the arch of Eid is an ogee; the three lines of the discharge are one block beside a bar.
- **A magnet that is on a slide already keeps the artwork it has.** Clicking the magnet again in the panel gives the one of now.
- The tools of the round are in `apps/desktop/test-results/frames/tools/wide/` (a review page, `render.mjs`, the brief), with the catalogue as it was (`wide/backup/`) and the renders (`wide/app/`, `wide/<file>/`). They are not in git.
