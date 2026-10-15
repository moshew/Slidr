# ADR-090 — The media library is a site on the web, kept on the machine by the app

Status: Implemented on 2026-10-15 in the working tree; not committed at the time of this record. It supersedes the packaging of [ADR-074](ADR-074-packaged-media-library.md): nothing of the library is built into the app or installed beside it.

## Context

The content the app offers (built-in templates and their photographs, the designs, card sets, shapes, graphics, frames, emoji and art of Elements, icon sets, deck fonts) had moved out of the repository into a sibling folder, `../Slidr-media`. The app imported it at build time: Vite read the folder in development, and a build copied it beside `slidr.exe`. A machine without that folder could not run the dev server, the unit tests or the build. The user asked for the folder to become a Cloudflare Pages site, for every flow of the app to work with it, and for the app to keep working when the network is gone, the site does not exist, or it is empty.

## Decision

- **The library is a static site**, the Pages project `slidr-media` at `https://slidr-media.pages.dev/`, with the same layout as the folder's published parts. `pnpm media:publish` stages an author's copy, writes from the templates catalog the files the app reads (`templates/index.json`, `templates/<id>/template.json`, `templates/pictures.json`), writes `manifest.json` (every file's size and SHA-256), `_headers` (CORS for a page of another origin) and a `404.html` (without it Pages answers a missing path with a page and status 200), and deploys with wrangler. It refuses an empty copy, or one that would remove more than half of the published files, without `--force`. `pnpm media:pull` copies the site back into a folder.
- **The webview still never reaches the web** (SEC-05). Pages read the library through the core's `media` protocol, as before; `src-tauri/src/media_library.rs` replaces `media_dir.rs`. At start it reads the manifest from the site (8 s at most) and keeps it; it answers a file from a content-addressed cache (`%LOCALAPPDATA%\<identifier>\media\objects\<sha256>`) when the bytes there are the manifest's, and otherwise fetches it, checks it and keeps it. Nothing is fetched ahead of a page asking for it: by the user's decision the library is not copied to the machine, and the cache holds only what the app has used. A new manifest takes from it what it no longer names. The protocol is asynchronous, so a slow network holds no thread of the webview.
- **What the app does without the network follows from the cache.** The manifest read last stands; a cached file is answered; a file not cached is 503; a path the manifest does not name, or any path when no manifest was ever read, is 404. A request waits for the manifest of this start for 1.5 s when an older one is kept, and for up to 9 s when none is (the first run).
- **Pages read the library at run time, never at build time.** `@slidr/media-library` is the one module that knows where it is: the protocol in the app, `/media-library/` on the dev server (a plugin that reads the site with a disk cache, `build/media.ts`), the site itself in Node. Every read answers `undefined` rather than throwing. The catalogs the app needs to start (templates, fonts, designs, card sets, shapes, template and design pictures) are read with top-level `await`, as the packaged build already did; the large ones (icon sets, art, graphics, emoji, frames) are read when first asked for, as before.
- **Each reader says what it does without its file.** No built-in templates, fonts, designs or card sets; covers without photographs; panels that report a failed load and try again. The shape library falls back to the list it had before it became a catalog, since the shapes are drawn by the renderer and the Insert menu must not lose them.
- **The import window may read the font catalog.** Its policy allows `connect-src http://media.localhost`; Rust still lets nothing of the library but `fonts/` through to that window.
- **Tests read the site.** Unit tests of the library's content are skipped when it is not published. happy-dom asks OPTIONS before a cross-origin GET and Pages refuses OPTIONS, so the unit tests turn off happy-dom's same-origin policy.

## Consequences

- An installed app needs the network for content it has not used yet; what it used works offline. A new publication reaches it at its next start.
- The installer no longer carries the library; `tauri.conf.json` has no resources, and `vite build` needs no local folder.
- The notices of third-party content are files of the library, published with it; the app's `THIRD-PARTY-NOTICES.txt` lists only what the build contains.
- On 2026-10-15 the site was created and seeded with what could be rebuilt on a machine without the authored folder: the deck fonts and their catalog (`gen-builtin-fonts.mjs` and the `@fontsource` packages), the icon sets (the `lucide-static` and `@tabler/icons` packages, and `hebrew.json`, `browse.json` and `filled-browse.json` from `15ad71a^`), the graphics and emoji catalogs and their art (`generate-graphics-catalog.mjs`, `generate-emoji-catalog.mjs`, and the four whole `@iconify-json` sets): 198 files, 31 MB. The templates, designs, card sets, shapes, frames and photographs are authored content that only the author's folder holds; they are published from there with `pnpm media:publish`.

## Checks

- Rust: 13 tests in `media_library.rs` against a stand-in site on this machine (cache, offline, unreachable, never published, empty, a new publication, bytes that do not match, only what is asked for fetched, traversal refused).
- `packages/media-library/src/index.test.ts`, `apps/desktop/build/media.test.ts` (staging, manifest, template files, the dev server's reader with and without the site).
- The unit suite runs against the published site: 2,640 pass, 106 are skipped for content not yet published; the 4 failures are those of `HEAD` before this change (`designRules` twice, the size of the tool listing, the runtime bundle's hash).
- `apps/desktop/packaged/build.spec.ts` was changed to the new model and not run.
