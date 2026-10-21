# ADR-110 — The library is published through its API, from the Worker's bucket

Status: Implemented on 2026-10-21 in the working trees of the app, Slidr Library and Slidr Studio; not committed at the time of this record, and not yet set up on Cloudflare (below). It changes how [ADR-090](ADR-090-media-library-on-the-web.md)'s site is written, and completes the publication of [ADR-108](ADR-108-search-tags.md)'s tags.

## Request

"I no longer want to work with a path to a copy, and with syncing. Upload straight through the API."

## Context

- The library's upload API (Slidr Library, `worker/uploads`) checked and kept what came in, but nothing took an accepted upload into the library: the 13,124 search tags of ADR-108 waited, accepted, in the Worker's R2 bucket, and the app found nothing by them.
- The only way into the library was `pnpm media:publish`: stage an author's copy (`../Slidr-media`, after `pnpm media:pull`) and deploy all of it to Cloudflare Pages. A publication from a Worker is not possible that way. A Pages deployment is the whole site, and its upload API asks for every file's hash in its own form.
- An installed app reads `https://slidr-media.pages.dev/manifest.json` and the files it names, checked against their SHA-256. That address is in every released build.

## Decision

- **The library lives in the bucket of Slidr Library's Worker**, R2 `slidr-media` (`MEDIA`): every file under its path, with its SHA-256, and `manifest.json` in the form the app reads (`worker/media/live.ts`). The Worker serves it at `/media/` with the headers Pages gave it (`worker/media/serve.ts`). Every file answers its SHA-256 as its ETag, and a large catalog is one file, not parts.
- **slidr-media.pages.dev forwards to it.** The Pages project's one deployment holds no files: its `_worker.js` sends every request to the Worker through a service binding (`media-site/` of Slidr Library). The address of the library, its manifest and the app's cache are unchanged, and no release of the app is needed.
- **A publication of uploads is one call**: `POST /api/publish` (`worker/media/publish.ts`), from the library's page (**Uploads**, or an upload up close) or from Slidr Studio's Publish panel, by an editor or a program that may publish. It checks each accepted upload once more against the library as it is, and writes it into the files it changes (`worker/media/merge.ts`):
  - tags into `tags/<part>.json`, an item named taking the tags given;
  - a new design into `managed.json` with its picture, and a translation into its slides;
  - a sample into `templates/catalog.json`, spliced into its bytes, since the 17 MB catalog is more than a Worker holds as objects.
  It keeps what it replaces under `_history/<published>/`, writes the manifest last, and marks each upload published. One that no longer holds stays accepted, with the reason.
- **An author's files go through the API too.** What the generators write is still made in an author's copy. `pnpm media:publish` no longer deploys once the site answers `X-Slidr-Library: live`. It sends only the files changed since the copy was pulled, each with the hash it was changed from (`PUT /api/library/staged/<sha256>`, `POST /api/library/files`; `desktop/build/mediaApi.ts`). `pnpm media:pull` keeps the manifest it pulled in the copy, `.published-manifest.json`, for that. A file the library changed meanwhile, as a published upload, is a conflict, and nothing is written. Every file the author did not change stays as the library has it.
- **No copy is needed to tag or to make designs.** `tag-elements.mjs` and `translate-tags.mjs` read the published library, and keep their tags in `desktop/.tags/` until they are uploaded; `--from` still reads a copy. Slidr Studio reads the published library only, and no longer stages, deploys or holds a Cloudflare token.
- **The library came into the bucket once, through the API**: `POST /api/library/import` copies the site's files a batch at a time, each checked against its hash, and writes the manifest when every file is in (`scripts/import-library.mjs` of Slidr Library).

## Setting it up

The code is in place. Cloudflare is not set up yet: the bucket, the Worker's deployment, the import and the Pages deployment are one-time steps of Slidr Library's README, "Publishing the uploads". Until the Pages deployment, slidr-media.pages.dev is the static site it was, and `pnpm media:publish` deploys to it as before.

## Consequences

- An accepted upload reaches every app with one click, and the app reads it the next time it reads the manifest.
- Pages no longer keeps a deployment per publication. `_history/` keeps what each publication replaced, but no tool puts it back yet. The deployments before the move stay in the Pages project.
- The files `pnpm media:publish` writes on publishing from the catalogs (`templates/` from the templates' catalog, and ADR-109's per-language design catalogs and `revs.json`) are written by an author's publication. A publication of uploads does not write them: a design published from an upload changes `managed.json`, and its derived files wait for the next author's publication. The templates' derived files do not change with a sample.
- Each request for a file of the library is a request to a Worker, where Pages served static files.

## Verification

- Slidr Library: `worker/media/media.test.ts` and `site.test.ts`, 15 tests, beside the 51 of the uploads. They cover the merges, serving with ETags and 304, the import in batches with a damaged file refused, the publication of tags, a design and a sample, what is left accepted, the lock, the refusal to mark by hand, and an author's files with a conflict.
- Slidr Library's dev server with its local buckets: the whole published library (3,277 files, 260 MB) imported through the API, and served byte for byte as the site serves it, manifest included. A tag upload, then a design in sixteen languages, were published into it and served. A sample spliced into the real catalog of templates took 54 ms and changed nothing else.
- The app's scripts against that server: `media:pull` into a scratch copy; `media:publish` of one changed file through the API; a conflict refused after a tag upload was published; nothing left to publish after a pull; a copy that was not pulled refused. `tag-elements.mjs --dry-run` read the published library and counted the 13,124 items. `desktop/build/mediaApi.test.ts`.
- Slidr Studio: 40 unit tests; typecheck, lint and build of its pages.
