# Media library

The content the app offers is a library published apart from the app: the built-in templates and their photographs, the designs, card sets, shapes, graphics, frames, emoji and art of Elements, the icon sets and the fonts of decks. It is a static site on Cloudflare Pages, **https://slidr-media.pages.dev** (project `slidr-media`), and the app reads it while it runs. Nothing of it is built into the app or installed with it ([ADR-090](adr/ADR-090-media-library-on-the-web.md)).

```text
manifest.json                  every file below: its size and SHA-256
fonts/catalog.json             the built-in fonts of decks, and fonts/<family>/*.woff2
icons/                         the Lucide and Tabler sets, their search words, hebrew.json
images/templates/*.webp        the photographs of the built-in templates
images/designs/                the pictures of the ready-made slides, and sizes.json
elements/designs/index.json    the ready-made slides of Elements
elements/designs/managed.json  the ready-made slides the management tool makes
elements/cards/catalog.json    the card sets
elements/catalogs/             shapes, graphics, frames and emoji, with their notices
elements/art/                  the drawings of the art sets, with their notices
templates/catalog.json         the built-in templates with their samples, as authored
templates/index.json           their ids in the order they are shown       (written on publishing)
templates/<id>/template.json   each of them as a deck takes it              (written on publishing)
templates/pictures.json        the pictures of their samples, by id         (written on publishing)
templates/reference-decks/     the reference decks
```

## How the app reads it

Pages never name the site. They ask `@slidr/media-library` (`packages/media-library`), which knows where the library is in the place they run:

- **In the app**, through the core's `media` protocol, `http://media.localhost/<path>` (`src-tauri/src/media_library.rs`). The webview stays closed to the network (SEC-05); Rust makes the calls.
  - When the app starts it reads `manifest.json` from the site and keeps it, in `%LOCALAPPDATA%\<identifier>\media\`. Without the network the last one read stands.
  - The library is never copied to the machine. A file is fetched only when a page asks for it: it comes from the cache (`media\objects\<sha256>`) when the cache holds those very bytes; otherwise it is fetched, checked against the manifest and kept. So what the app has used is there without the network, and nothing else is. A new manifest takes from the cache what it no longer names.
- **In a plain browser** (`pnpm dev`, the end-to-end tests, the browser tests), the dev server serves the library at `/media-library/` as the protocol does, from the site, with a cache in `apps/desktop/node_modules/.cache/slidr-media` (`build/media.ts`).
- **In Node** (the unit tests, scripts), from the site itself.

## Without the library

No network, a library that was never published, or an empty one: the app starts and works without what it lacks. Without the network, what the app used before is at hand from its cache; what it never used is not.

| Content                         | Without it                                                                                     |
| ------------------------------- | ---------------------------------------------------------------------------------------------- |
| Built-in templates              | The template library holds the user's own; a new deck starts plain                             |
| Template photographs            | A cover shows its layout without the photograph                                                |
| Fonts of decks                  | Text is set in the fonts of the system; the font lists offer those and the user's own          |
| Icons, graphics, emoji, frames  | The panel says it could not load them, and tries again the next time it is opened              |
| Designs, card sets              | The galleries are empty; a card set already on a slide is a plain group                        |
| Shapes and lines                | The app's own list of them, as it was before the catalog moved to the library                  |

The unit tests that check the library's content (templates, designs, card sets, frames, art) are skipped when it is not published.

## Changing it

Authors keep a copy of the library in a folder, by default `../Slidr-media` beside the repository, with two more folders that are not published: `elements/source` (the inputs of the generators) and `archive`. The generators in `apps/desktop/scripts` write into that copy.

```sh
pnpm media:pull                      # the published library into ../Slidr-media (--to <dir>)
pnpm media:publish --dry-run         # stage ../Slidr-media and say what would change
pnpm media:publish                   # publish it (--from <dir>, --branch <name> for a preview)
```

Publishing stages the published folders, writes the files `templates/` takes from its catalog, writes the manifest, compares it with the published one and deploys with wrangler. It needs `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in the environment. It stops when the copy is empty, or would take away more than half of the published files, unless `--force` is given: a copy that is not all there would otherwise empty the library of every installed app.

A file of the library is at most 25 MB, the limit of Pages.

A development build and the dev server read another copy when `SLIDR_MEDIA_URL` names one: a preview deployment, or a server on this machine. A release build reads the published library.

## Designs made by the management tool

The management tool (`management/`) publishes the designs it makes into a catalog of their own, `elements/designs/managed.json`, so that it never writes over the authored `index.json`. Their ids start with `m-`. Their pictures are `images/designs/<id>.webp` (and `<id>-bg.webp`) like the others, but their pixel sizes and their names in both languages are in `managed.json`, not in `sizes.json` or the app's messages.

The app reads `managed.json` after `index.json` and puts its designs after the authored ones: in a group the authored catalog has, after its designs; in a group of their own, after the authored groups. Where both have an id, the authored design is kept.

A publication is the whole library, from one copy. An author who publishes from another copy pulls first: `pnpm media:pull` adds what the copy lacks, so the managed designs are not taken away. Pull before changing anything, since it also puts the published bytes back over a file that differs.

## Licences

Content made from someone else's data carries its notice beside it (`<name>.notice.json`), and is published with it: the art sets and the emoji catalog from their generators, and each font family of decks as `fonts/<family>/<family>.notice.json` from `scripts/gen-builtin-fonts.mjs` (the package, its licence, and the licence's text with the copyright). The app's own `THIRD-PARTY-NOTICES.txt` lists what its build contains, which is no longer this content; the licences dialog adds every notice the manifest names, read from the library when the dialog is opened (`src/about/notices.ts`). One that cannot be read then (no network, not read before) is counted as missing.
