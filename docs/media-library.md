# Media library

The content the app offers is a library published apart from the app: the built-in templates and their photographs, the designs, card sets, shapes, graphics, frames, emoji and art of Elements, the icon sets and the fonts of decks. It is a static site on Cloudflare Pages, **https://slidr-media.pages.dev** (project `slidr-media`), and the app reads it while it runs. Nothing of it is built into the app or installed with it ([ADR-090](adr/ADR-090-media-library-on-the-web.md)).

```text
manifest.json                  every file below: its size and SHA-256
fonts/catalog.json             the built-in fonts of decks, and fonts/<family>/*.woff2
icons/                         the Lucide and Tabler sets, their search words, hebrew.json
images/templates/*.webp        the photographs of the built-in templates
images/designs/                the pictures of the ready-made slides, and sizes.json
images/frames/                 the event magnets as the Elements panel shows them, and index.json
elements/designs/index.json    the ready-made slides of Elements
elements/designs/managed.json  the ready-made slides Slidr Studio makes
elements/cards/catalog.json    the card sets
elements/catalogs/             shapes, graphics, frames and emoji, with their notices
elements/art/                  the drawings of the art sets, with their notices
tags/<kind>.json               the search tags of the icons, graphics, emoji, frames, shapes, card sets and designs
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

A ready-made slide is written in a pack file under `elements/source/design-packs/` and put into `elements/designs/index.json` by `apps/desktop/scripts/export-designs.mjs`. A built-in template is written as `archive/templates-source/<id>.ts`, beside the files the first eighteen were made from, and put into `templates/catalog.json` (with `templates/index.json` and `templates/<id>/template.json`) by `apps/desktop/scripts/export-templates.mjs`. Each script's header lists the steps for adding one.

The photo frames are written into `elements/catalogs/frames-catalog.json` by `apps/desktop/scripts/generate-frames-catalog.mjs`. The Elements panel shows an event magnet from a small picture of it, `images/frames/<language>/<frame>.webp`, which `apps/desktop/scripts/generate-frames-thumbs.mjs` makes of the renderer's own drawing: run it after the catalogue is written. A magnet whose picture is of an earlier drawing is drawn live in the panel until then, and `frames.test.ts` fails.

### Search tags

Everything Elements and Ready slides offer is searched by its names and by its tags: words in Hebrew and in English for what it shows, what it is for, and the occasions and themes it suits, so "יום הולדת" finds the birthday invitation, the cake, the balloons and the birthday magnets ([ADR-108](adr/ADR-108-search-tags.md)). They are in `tags/`, a file a kind (`icons`, `graphics`, `emoji`, `frames`, `shapes`, `cards`, `designs`), each an item a line under the key its catalog gives it:

```json
{
  "version": 1,
  "tags": {
    "fluent-emoji:balloon": { "en": ["balloon", "party", "birthday"], "he": ["בלון", "מסיבה", "יום הולדת"] }
  }
}
```

Claude writes them: `apps/desktop/scripts/tag-elements.mjs` gives it each item with what the catalogs say of it (its names, the words its set gives it, a design's text) and, for a graphic, a picture of the drawing, and checks every answer. It tags what has no tags yet, so run it after a generator adds to a catalog; `--again <key,...>` writes an item's tags again. It needs the Claude Code CLI, signed in. A design of Slidr Studio comes with its tags, in `managed.json` (below). `src/media/icons/tags.test.ts` fails while an item of a kind the library tags has none. Without the files, the app finds everything by its names, as before.

```sh
pnpm media:pull                      # the published library into ../Slidr-media (--to <dir>)
pnpm media:publish --dry-run         # stage ../Slidr-media and say what would change
pnpm media:publish                   # publish it (--from <dir>, --branch <name> for a preview)
```

Publishing stages the published folders, writes the files `templates/` takes from its catalog, writes the manifest, compares it with the published one and deploys with wrangler. It needs `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in the environment. It stops when the copy is empty, or would take away more than half of the published files, unless `--force` is given: a copy that is not all there would otherwise empty the library of every installed app.

Static assets are at most 25 MiB, the limit of Pages. A JSON catalog above that
limit is staged as 10 MiB parts and a narrowly routed
[Pages Function](https://developers.cloudflare.com/pages/functions/advanced-mode/). The Function
streams the exact original bytes at the original catalog URL; its manifest entry,
hash, client format and offline cache are unchanged. Other media requests stay
static. The authoring copy still holds the ordinary complete JSON file.

A development build and the dev server read another copy when `SLIDR_MEDIA_URL` names one: a preview deployment, or a server on this machine. A release build reads the published library, unless its installation names another (below).

## A library of your own

An installed app reads the library from an address the organization chooses, in place of the published one. It is set in one of two places, and nothing of the app is built again for it ([ADR-107](adr/ADR-107-a-library-of-your-own.md)). An organization sets a policy; a single installer carries the address itself.

### A policy for the organization

`HKLM\SOFTWARE\Policies\Slidr`, the string value `MediaLibraryUrl`, is the address every app on the machine reads. Set it once for the domain with Group Policy or Intune (or `HKCU` for one user), and the machines run the **released installer, unchanged and signed as it is**; the end user sets nothing and need not know where the library is. The app reads the policy each time it starts, so a change reaches every machine at its next start. `HKLM` comes before `HKCU`, and both before an installer's own file below.

```powershell
New-Item   -Path 'HKLM:\SOFTWARE\Policies\Slidr' -Force | Out-Null
New-ItemProperty -Path 'HKLM:\SOFTWARE\Policies\Slidr' -Name MediaLibraryUrl `
  -PropertyType String -Value 'https://media.example.org/slidr/' -Force
```

### An installer that carries the address

An installed app also reads the library from a file beside `slidr.exe`, `media-library.json`: `{ "url": "https://media.example.org/slidr/" }`. The released installer writes that file, so a single installer that carries an address needs no build of the app:

```bat
Slidr_0.1.0_x64-setup.exe /S /MEDIA="https://media.example.org/slidr/"
```

Without a command line, a `media-library.json` beside the installer does the same: the installer copies it. A folder with the two is an installation that reads that copy. `/MEDIA=` wins over the file, and `/MEDIA=` with nothing after it takes the file away, back to the published library. An installation with neither keeps the address it had, so the app's own updates keep it; uninstalling takes it away. An administrator may also write the file by hand; the app reads it when it next starts.

A policy or a file that names no address the app may read leaves it with no library at all, as in [Without the library](#without-the-library). That covers a file that cannot be read, is not JSON, or has no `url`, and an address that is not HTTPS (plain HTTP is allowed only on `localhost`). The app never falls back to the published library then: the administrator chose a copy, and on a closed network a call to the published site would look like an attempt to get out. Only an installation with neither a policy nor a file reads the published library.

Keep the address in quotes. Unquoted, a part of its path that begins like one of the installer's own options turns that option on too (`/public/` is `/P`, passive; `/reports/` is `/R`, restart). cmd.exe and deployment tools pass the quotes on. PowerShell keeps them only inside one string: `Start-Process .\Slidr_0.1.0_x64-setup.exe -ArgumentList '/S /MEDIA="https://media.example.org/slidr/"'`.

The copy is any static site with the layout above, over HTTPS (plain HTTP only on `localhost`). It needs `manifest.json` at its root and every file at its path. A file it does not have is answered 404, not a page with 200, and a redirect stays on its host. The app reads it from Rust, so it needs no CORS. `_headers` and `404.html` are for Pages, and another server may ignore them. To make one from the published library:

```sh
pnpm media:pull --to ../my-media                                        # the published library
pnpm media:publish --from ../my-media --out ../my-media-site --dry-run  # staged as a site; nothing is deployed
```

Then upload `../my-media-site` to the server. A copy changed as above is staged the same way. The dry run still compares the copy with the published library: a copy that holds less than half of it is reported as blocked, which does not matter here, since nothing is deployed. Publishing (`pnpm media:publish`, the studio) deploys only to Pages. The dev server and the studio read such a copy with `SLIDR_MEDIA_URL`.

On a machine that ran Slidr before, the manifest of the old address stands until the new one is read, when the app starts online. What is cached is kept by its hash, so a file both libraries have is not fetched again.

## Designs made by Slidr Studio

Slidr Studio ([slidrhq/studio](https://github.com/slidrhq/studio)) publishes the designs it makes into a catalog of their own, `elements/designs/managed.json`, so that it never writes over the authored `index.json`. Their ids start with `m-`. Their pictures are `images/designs/<id>.webp` (and `<id>-bg.webp`) like the others, but their pixel sizes, their names in both languages and their search tags (`tags`, written by Claude as it plans the design) are in `managed.json`, not in `sizes.json`, the app's messages or `tags/designs.json`. The app finds a design by the tags of both files.

A design's slide, and a template's sample, is written in Hebrew and in English, and may be written in any other language of `packages/model/src/languages.ts` (`slides[id].<code>`, `samples[template].<code>`). A deck gets the one in its own language, else the English one ([ADR-098](adr/ADR-098-content-in-every-language.md)). The fonts catalog tags each family with the scripts it ships (`he`, `latin`, `arabic`, `cyrillic`, `vietnamese`, `devanagari`, `japanese`, `korean`, `chinese`), the ones it was made for (`for`), and, for each script it lacks, its `counterparts`: the family of those letters closest to it in character. A deck's font lists offer the families of its language and of English (`familyForDeck`), and a design's text in another language is set in its source's family or that family's counterpart (`apps/desktop/scripts/design-fonts.mjs`, [ADR-105](adr/ADR-105-fonts-of-every-language.md)).

The app reads `managed.json` after `index.json` and puts its designs after the authored ones: in a group the authored catalog has, after its designs; in a group of their own, after the authored groups. Where both have an id, the authored design is kept.

A publication is the whole library, from one copy. An author who publishes from another copy pulls first: `pnpm media:pull` adds what the copy lacks, so the managed designs are not taken away. Pull before changing anything, since it also puts the published bytes back over a file that differs.

## Licences

Content made from someone else's data carries its notice beside it (`<name>.notice.json`), and is published with it: the art sets and the emoji catalog from their generators, and each font family of decks as `fonts/<family>/<family>.notice.json` from `scripts/gen-builtin-fonts.mjs` (the package, its licence, and the licence's text with the copyright). The app's own `THIRD-PARTY-NOTICES.txt` lists what its build contains, which is no longer this content; the licences dialog adds every notice the manifest names, read from the library when the dialog is opened (`src/about/notices.ts`). One that cannot be read then (no network, not read before) is counted as missing.
