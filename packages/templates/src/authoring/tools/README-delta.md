# Templates and designs for the media library

This folder adds to the Slidr media library:

- **Four templates** (`templates/catalog.tech.json`, pictures in `images/templates/`):
  - **Anan** (Cloud): cloud and DevOps architecture.
  - **Shvav** (Chip): hardware, IoT and chips.
  - **Mutzar** (Product): software product launches.
  - **Atlas**: a modern atlas for what crosses borders, its sample written in all sixteen
    languages of the app.
- **Seventeen ready-made slides** (`elements/designs/managed.tech.json`, pictures in
  `images/designs/`): five each for the topics High-tech, Tech products and Defence tech, and two in all
  sixteen languages, a night market (Food & restaurants) and a panorama train (Travel & tourism).

Atlas and its two neighbours need the fonts catalog regenerated in the same copy of the library,
for their Arabic, Cyrillic, Vietnamese and Devanagari letters
(`SLIDR_MEDIA_DIR=../Slidr-media node apps/desktop/scripts/gen-builtin-fonts.mjs`).

## Adding them to the library

From the repository, with your copy of the library at `../Slidr-media`:

```sh
node <this folder>/merge-into-library.mjs ../Slidr-media --dry-run   # what would change
node <this folder>/merge-into-library.mjs ../Slidr-media             # merge
pnpm media:publish --dry-run
pnpm media:publish
```

The script adds the templates to `templates/catalog.json` after the ones already there, together
with their samples and the pictures of the samples. It adds the slides to
`elements/designs/managed.json`, under their topics. A template or slide whose id is already in the
library is replaced in place, so running the script again changes nothing more. Nothing else in
the library is touched.

The app shows the templates' names and taglines from `apps/desktop/src/templates/messages.ts`.
They are on the branch this package came with.

## Sources

`source/` holds what this was made from:

- the templates as TypeScript, drawn with `packages/templates/src/builtin/kit.ts`;
- the slides as TypeScript, drawn with `source/designs/kit.ts`;
- the HTML and three.js scenes the pictures were rendered from;
- the tools that rendered, checked and packaged them.

Keep the sources in the library's `archive/`, which is not published. The same sources are also
on the branch, under `packages/templates/src/authoring/`.
