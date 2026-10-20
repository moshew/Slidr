# ADR-093 — The event magnets are shown from pictures made ahead

Status: Implemented in the 2026-10-13 working tree; **not committed** at the time of this record. It replaces the loading state of the magnets' list, and changes how the panel shows the magnets of [ADR-083](ADR-083-event-magnets.md) and [ADR-087](ADR-087-magnets-labels-and-sets.md). What a magnet is on a slide is not changed.

## Request

"Try to find a better solution for loading the event magnets, and not a loader every time on entry."

## What was measured

The list of all the magnets drew each of the hundred live, with the renderer, and showed a loading state until every one was drawn and every picture inside them was decoded. In the dev build, in the installed Edge:

- the first entry took 4.7 s, and every entry after it 2.8 to 3.3 s: the list is unmounted when it is left, and so is the whole Elements panel when another panel is opened, so nothing was kept;
- one entry built 23,517 nodes and 439 shadow roots, and cleaned 8 MB of picture data inside the stickers again (`sanitize.ts` alone was about 0.8 s), with 0.25 to 0.55 s of forced layout for the fitting of the captions and 0.6 to 1.4 s of the browser's own layout, paint and decoding.

No arrangement of that work makes it short. A hundred whole designs do not have to be built to be looked at small.

## Decision

- **A magnet is shown in the panel from a small picture of it**: `Slidr-media/images/frames/<language>/<frame>.webp`, in Hebrew and in English, 420 by 300 pixels of the frame (300 by 420 for an upright one) with 16 pixels around it for its shadow, on a clear ground. 192 pictures, 3.1 MB, 6 to 30 kB each. `FrameThumb` shows the picture where there is one (`frameThumbs.ts`); the frame is exactly as large in its tile as the renderer drew it there, and the room of the shadow reaches past the tile.
- **The pictures are of the renderer's own drawing.** `scripts/generate-frames-thumbs.mjs` opens the page `dev/frame-thumbs.html`, which draws every such frame with `DrawnFrame` as the panel did, and a browser takes the picture of each. So a picture is what lands on the slide, as the live thumbnail was. The script starts a dev server of its own, without reloading: a page of the server a session works with is loaded again whenever a file is saved, and a picture that is being taken at that moment never comes. It writes the pictures once all were taken.
- **A picture is known to be of the frame as it is now.** `index.json` beside the pictures says for each the word of what it was drawn from (`frameRev`: the frame's box, cut, artwork, extras with their drawings, and shadow). A frame whose word is another, or that has no picture, is drawn live as before, once its tile is near the visible part of the panel (`LateDrawnThumb`). So a catalogue that was written again without its pictures shows the right magnets, slowly, and `frames.test.ts` fails until the script runs.
- **A magnet that follows the deck is still drawn live**: one with a colour of the theme in its artwork or its words, or a line in the deck's own font (`followsTheme`). There are four (launch, welcome, conference, company), all of plain vector artwork. They are drawn when they come near, in the theme of the deck.
- **The loading state is gone.** The list is the sets under their names, as it was after its reveal. The pictures are fetched while the browser is idle once the frames collection is open (`prepareFrameThumbs`), so they are there before the group is opened.
- Only the magnets have pictures. The other frames that the renderer draws (instant photos, picture frames, devices) are plain vector artwork and are drawn as they were.

## Alternatives that were weighed

- **Keeping the built list alive between entries** (a host outside the panel's tree, with the list moved into the panel when it is shown): the second entry is fast, but the first is still seconds unless the list is also built ahead in idle time; 23,000 nodes stay in memory for the session, and every change of the theme draws a hundred hidden designs again.
- **Drawing each magnet only when it is near** (as the designs do), with the cleaned drawings kept: no loading state, but the names of the sets stand over empty tiles while the first screen is built, and a fast scroll outruns the drawing. This is what the list did before the loading state, a set at a time.
- **Taking the picture in the app the first time** and keeping it: a copy of the DOM inside an SVG image (as `paintBackdrop` does) has none of the fonts of the captions, and the ids of the stickers collide in one document; the capture window is not there in the browser the tests run in.

## Verification

- **Measured the same way, dev build**: the list is 328 nodes with no slide of the renderer in it at first; from the click to the first screen with its pictures 0.26 to 0.57 s over several runs, of which about half is React's development build; a later entry is no slower than the first.
- **Every picture was looked at**, the 96 in Hebrew and the 96 in English, on a light and on a dark ground: each card whole, its words in its language and in its own faces, its shadow soft at the edge of the picture.
- **The panel was looked at** in Hebrew and in English, in the light and the dark interface: the list at two columns and at four (the widest panel, a picture 203 pixels wide), the first rows of the group in the collection's first screen, and the frames a search of the first screen finds. Against a picture of the live list taken before the change, every magnet stands in the same place at the same size.
- **Unit tests**: `frames.test.ts`, 39 tests, three of them new: which frames have a picture, the word of a drawing, and the pictures of the media library against the catalogue.
- **E2E on the shared server**: `elements-panel.spec.ts`, `media-replace.spec.ts` and `text-background-resize.spec.ts`, 28 of 28. The test of the loading state is replaced by one that the list is there at once in both languages, of pictures in the deck's language, with the magnets of the theme drawn live when they come near.
- `tsc`, ESLint and Prettier pass on the files of the change. **No package was built**: in a package the pictures are read through the `media` protocol, as the pictures of the designs are, by the same kind of import.

## Open for the user

- **After the magnets are changed, the pictures are made again**: `node scripts/generate-frames-thumbs.mjs`, from `desktop`, about two minutes. `generate-frames-catalog.mjs` says so when it is done.
- **The pictures are in the media library, outside git**, like the catalogue they are made of.
- **A running dev server learns of pictures that are new by name only when `frameThumbs.ts` is loaded again** (a restart, or a save of that file): the list of the files is read when the module is. Pictures that were made again under the names they had need nothing.
- **In a very wide panel on a dense screen** a picture is drawn larger than it is (above about 210 pixels of width at twice the density) and is slightly soft there.
- The loading state's words (`frames.loading`) were removed from the messages.
