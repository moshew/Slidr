# Authored templates and designs

The sources of three technology templates (Anan, Shvav and Mutzar) and of the
ready-made slides of Elements → Designs, the pictures of their samples, and the scripts that
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
| `designs/kit.ts`, `designs/<topic>.ts` | Ready-made slides in the shape of `elements/designs/managed.json`. Each topic module exports `designs`.                                  |
| `pictures/`                            | The pictures of the samples (`<id>-<name>.webp`, recorded in `<id>.json`) and of the designs (`designs/<id>.webp`, size in `<id>.json`). |
| `artwork/`                             | The HTML and three.js pages the pictures were rendered from.                                                                             |
| `registry.ts`, `designs/registry.ts`   | Everything in this folder, for the review page and the catalog.                                                                          |
| `catalog.ts`                           | Writes the catalog fragments and copies the pictures into a folder laid out like the library.                                            |
| `check.ts`                             | The structural checks the app's unit tests make of a template.                                                                           |
| `tools/`                               | The scripts below.                                                                                                                       |

## Working on a template

From `packages/templates`:

```sh
node src/authoring/tools/run-ts.mjs src/authoring/check.ts anan    # structure, contract, contrast
```

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
