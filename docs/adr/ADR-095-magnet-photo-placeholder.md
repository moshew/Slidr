# ADR-095 — A magnet's photograph is an object of its own, on its card

Status: Implemented in the 2026-10-14 working tree; **not committed** at the time of this record. It changes what a magnet of [ADR-083](ADR-083-event-magnets.md) is on a slide. The other photo frames, plain and decorated ([ADR-086](ADR-086-frames-keep-their-artwork.md)), are not changed.

## Request

The hint the frames collection showed for a selected empty frame ("The selected frame has no picture yet", with a button to choose one from the computer) is not wanted. The placeholder of a magnet's photograph is to stay as it was, but be an object that can be moved and sized, not part of the background. Only the magnets.

## Context

A magnet was a group whose one picture carried the card as its artwork (`smartFrame`): a picture as large as the whole magnet, the card drawn over it, the photograph seen through the card's window. The placeholder was the opening of that picture. It could not be selected, moved or sized apart from the card; a double click on it took whatever sticker lay over it.

## Decision

- **The hint and its button are gone.** The collection still says, with a photograph selected, that a click on a frame puts it in the frame.
- **A magnet is its card, its photograph, and what stands beside them.** The card is an `svg` element as large as the group, under the photograph. The photograph is an `image` element in the card's opening, as large as the opening: empty, it is the placeholder it was (`PendingImage`), and a double click takes it, its handles move and size it, and every tool of a picture works on it.
- **The card keeps its size**, as frame artwork does: `SvgElement.layout` (`viewBox`, `scale`) draws a drawing that lays itself out at its scale, in a box never smaller than its own (`artworkLayout` in `packages/model/src/imageFrame.ts`). The card's window is filled (`cardDrawing` in `frames.ts`: a white box over the opening, in the mask that cuts the window), so a photograph moved away leaves the card whole.
- **The photograph is cut by the card as it was drawn.** A new image mask, `window`, carries the card's drawing, its box, its opening and its scale. The renderer lays the card out around the photograph, as large as the opening is now (`windowLayout`), and the photograph shows wherever that card does not paint (`mask-composite: exclude`). So every window is exact, whatever cuts it (an ellipse, an arch, teeth, a scalloped edge, a perforated strip), and what the card drew over the photograph's edge (an outline, a border) still shows over it. The window goes where the photograph goes. The theme's colours do not reach a mask image, so the card's colours of the theme are given one there: only where it paints counts.
- **A magnet made larger** gives the stretch to the card; the photograph goes with the opening as a part of artwork does (`placedAround`): one that fills the opening grows with it, the card's margins as wide as they were; one that was moved and made smaller keeps its size, at its place along the opening. Stickers, captions and labels keep their size, as before (`aroundCard` in `stage/groups.ts`). An edge handle of the card moves that edge alone.
- **Putting a picture in a magnet, or changing one magnet for another,** builds the new structure (`reframe`); the picture keeps its file, crop and adjustments.
- A magnet already on a slide in the earlier structure is drawn and resized as it was; nothing converts it.

## Considered and rejected

- **A stand-in photograph** (the landscape of the thumbnails as a picture of the deck). Not what was asked: the placeholder was to stay as it was.
- **Cutting the photograph by the window alone**, taken out of the card's mask. The outlines that cards draw over the photograph's edge were then hidden under it (most magnets).
- **Writing each window as a path of the model's masks.** A quarter of the windows are drawn with arches, clips, patterns and calc() ties; translated by hand they would be approximations, and the generator would have to say each one twice.

## Verification

- Unit tests: `frames.test.ts` (every magnet: the card, its layout and filled window, the photograph in the opening with the card as its window; putting a picture in a magnet), `space.test.ts` (a magnet with its card apart, made larger and smaller; a photograph that was moved and made smaller), and the suites of the model, the renderer and the app areas touched.
- E2E: `elements-panel.spec.ts` (a magnet's placeholder taken by a double click, made smaller and moved alone while the card stays, and one undo step each; a magnet made larger), `text-background-resize.spec.ts`, `media-replace.spec.ts`, `media-placeholder.spec.ts`, `stage-crop-frame.spec.ts`, `stage-image-handles.spec.ts`, `numeric-placement.spec.ts`.
- All hundred magnets were drawn the earlier way and the new, empty and around a photograph, and compared pixel by pixel: what differs is antialiasing along the edge of the window, of at most a pixel. In the app, an engagement, a dinosaur and a film magnet were added in Hebrew and in English, their placeholder selected, made smaller, moved and filled, at the size of the Stage and of the filmstrip.
- The agent's tool definitions grew with the schema: their budgets are 31 KB for `element_add` and 97 KB in all.

## Open for the user

- The photograph is drawn through a mask image. Where the slide is drawn smaller than its size, its resampling can be a little softer than before, depending on where it falls on the pixel grid; at the slide's own size it is the same.
- A card's details are where the card draws them: a photograph that is moved leaves the outline that surrounded it where it was.
