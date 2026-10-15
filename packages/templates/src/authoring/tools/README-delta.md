# Technology templates and designs for the media library

This folder adds to the Slidr media library:

- **Five technology templates** (`templates/catalog.tech.json`, pictures in `images/templates/`):
  - **Kod** (קוד): a code editor for tech talks and engineering reviews.
  - **Anan** (ענן): cloud and DevOps architecture.
  - **Magen** (מגן): cybersecurity briefings.
  - **Shvav** (שבב): hardware, IoT and chips.
  - **Mutzar** (מוצר): software product launches.
- **Fifteen ready-made slides** for the topics הייטק, מוצר טכנולוגי and דיפנס־טק, five each
  (`elements/designs/managed.tech.json`, pictures in `images/designs/`).

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
