# Authored templates and designs

The sources of three technology templates (Anan, Shvav and Mutzar), of Atlas, a template written
in every language of the app, and of the ready-made slides of Elements → Designs, the pictures of their samples, and the scripts that
render, check and package them. The app does not read this folder. It reads the media library
(docs/media-library.md); what is authored here reaches the library through
`tools/merge-into-library.mjs` and `pnpm media:publish`.

Kod and Magen, the other technology templates of the library, are written in the author's copy
of the library (`archive/templates-source/`) and put into its catalog by
`apps/desktop/scripts/export-templates.mjs`, not here: a template of that id authored here would
take their place when merged.

| Path                                   | What it is                                                                                                                               |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `<id>.ts`                              | A template: theme, layouts for both directions, the sample in Hebrew and English. It exports `entry`.                                    |
| `atlas/<lang>.ts`                      | The words of Atlas's sample, a module a language (`atlas/copy.ts` lists them).                                                           |
| `designs/kit.ts`, `designs/<topic>.ts` | Ready-made slides in the shape of `elements/designs/managed.json`. Each topic module exports `designs`.                                  |
| `pictures/`                            | The pictures of the samples (`<id>-<name>.webp`, recorded in `<id>.json`) and of the designs (`designs/<id>.webp`, size in `<id>.json`). |
| `artwork/`                             | The HTML and three.js pages the pictures were rendered from.                                                                             |
| `registry.ts`, `designs/registry.ts`   | Everything in this folder, for the review page and the catalog.                                                                          |
| `catalog.ts`                           | Writes the catalog fragments and copies the pictures into a folder laid out like the library.                                            |
| `check.ts`                             | The structural checks the app's unit tests make of a template.                                                                           |
| `tools/`                               | The scripts below.                                                                                                                       |

## Languages

Everything is written in Hebrew and English. A template's sample, and a design, may also be written
in any other language of `packages/model/src/languages.ts`, and only when it is asked for
(`AGENTS.md`): a template's `samples` take a key a language, a design its other languages in
`more`. A deck in a language a piece has gets it; any other gets the English one. Atlas
(`atlas.ts`) and the designs of `designs/world.ts` are written in all sixteen; their drawings hold
no words, and each run of a design names a family with the letters of its language. Look at each
language on the review page (`lang=<code>`), at full size and as a thumbnail.

## Working on a template

From `packages/templates`:

```sh
node src/authoring/tools/run-ts.mjs src/authoring/check.ts anan    # structure, contract, contrast, what the slides hold
```

What a layout draws is the slide's own (ADR-094): a template goes through `withObjects` before its
sample is drawn, draws a scene as its parts rather than as one drawing the size of the slide, and
keeps its drawings clear of the foot. The check fails a template whose layouts keep their drawings,
and lists the grounds that stay, to look at.

To look at it, stage a copy of the library and bring up the servers, then take screenshots of the
review page (`apps/desktop/dev/review.html`):

```sh
node src/authoring/tools/stage.mjs ../../../Slidr-media /tmp/slidr-site
SITE=/tmp/slidr-site src/authoring/tools/up.sh
SLIDR_CHECK=1 node src/authoring/tools/shot.mjs /tmp/anan-he.png "t=anan&lang=he&w=470&cols=4"
SLIDR_CHECK=1 node src/authoring/tools/shot.mjs /tmp/anan-en-1.png "t=anan&lang=en&slide=0&w=1280"
SLIDR_CHECK=1 node src/authoring/tools/shot.mjs /tmp/designs.png "d=group:hitech&src=new&lang=he&w=460"
```

Pictures: render an artwork page with `tools/render-art.mjs <page.html> <out.png> <w> <h> [scale]`,
then record it with `tools/pictures.py <id>-<name> <out.png>` for a template, or
`tools/design-picture.py <id> <out.png>` for a design. Portraits take a colour treatment
with `tools/tone.py`.

The acceptance tests of the app (`apps/desktop/src/templates/acceptance.ts`, `acceptDraft`) are the
final word on a template: run them against the library with the template merged into it.

## Into the library

```sh
src/authoring/tools/package.sh /tmp/slidr-tech            # the catalog fragments, pictures, merge script, sources
node /tmp/slidr-tech/merge-into-library.mjs ../../../Slidr-media
pnpm media:publish
```
