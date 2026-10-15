# Slidr Studio

A local web app that makes ready-made designs for Elements → Designs from a prompt and publishes the approved ones to the media library on Cloudflare Pages (docs/media-library.md). The server is Python (FastAPI). The pages are React and use the app's own packages: the HTML conversion engine, the renderer and the design check.

```powershell
./management/start.ps1            # http://127.0.0.1:8765, opened in the browser
```

On the first run, the launcher creates `server/.venv` and installs `server/requirements.txt`. It rebuilds the pages whenever a source file is newer than the build. It needs Python 3.11 or newer, Node, pnpm and the installed Microsoft Edge (the headless renders run in it). It also needs both CLIs, signed in:

- **Claude Code** (`claude`), on your Claude login. It plans the concepts and writes, reviews and fixes the designs.
- **Codex CLI** (`codex login`), on your ChatGPT login. It makes the pictures. The studio finds `codex` on the PATH, behind npm's shim, or inside VS Code's ChatGPT extension. `CODEX_PATH` names it outright.

The status chips at the top of the studio say which of them it found and whether they are signed in.

## What happens to a request

Each request is a tab, and requests run side by side. A tab keeps working while another is open, and survives a restart of the server.

1. **Plan.** Claude plans the number of concepts asked for (1 to 6), each distinct in layout, type, palette and picture. Each concept has its own art direction, copy in Hebrew and English, and a prompt for its picture.
2. **Picture.** For each concept, Codex makes the picture, as the app's own Codex provider does (same command line, same rule at the head of the prompt). At most four pictures are made at a time.
3. **Design.** Claude looks at the picture, then writes the design as HTML twice, `he.html` and `en.html`, mirrored. Each concept has its own Claude conversation, whose file tools reach only its own folder.
4. **Render.** A headless Edge opens `render.html`. That page converts both files with `@slidr/html-import`, the engine the app's agent uses, and its fidelity guard gets real pictures of the page, as in the app. It then:
   - writes the theme's text styles out onto the runs, so the design keeps its type and colours in any deck;
   - runs the app's design check (`@slidr/lint`, the agent's rules);
   - checks the contract that `apps/desktop/src/elements/designs.test.ts` holds every design to;
   - finds the point on the picture's subject;
   - takes the full-size slide and the gallery's 384 px thumbnail, in both languages.
5. **Review.** Claude reads the four renders together with the findings and fixes the design. The number of rounds is set per request (default 2). A round in which Claude changes nothing ends the review. A design that still breaks the gallery's contract after the rounds gets one more turn to fix it, even when no rounds were asked for. Claude can also ask for a new picture, or a change to this one, through the concept's `brief.json`.
6. **You.** Open a variant to see it full size and as a thumbnail, in both languages, with its findings and a log of what Claude and Codex did. From there you can:
   - ask for a change in words (another turn of the same conversation, then a new render);
   - ask for a new picture, or a change to the current one;
   - approve the variant, or discard it.

   A design that breaks the gallery's contract cannot be approved. A design with errors from the design check can be, after a confirmation.

What Claude is told comes from the app itself, never from a copy: the design guidelines and HTML conventions of `packages/prompts` (read through `web/tools/instructions.mjs`), the quality bar of `AGENTS.md`, and the fonts the library offers. `server/slidr_manager/prompts.py` adds only what a gallery design needs on top: the contract and the studio's workflow.

## Publishing

Publishing has two steps, and nothing reaches Cloudflare before the second.

1. **Prepare** (the "פרסום" panel):
   - The studio copies into the author copy of the library (`../Slidr-media`, or `SLIDR_MEDIA_DIR`) any published files that copy lacks. A file the copy already has is never touched.
   - It writes the approved designs into the copy: `elements/designs/managed.json` and `images/designs/<id>.webp`.
   - It runs `apps/desktop/scripts/media-publish.mjs --dry-run --report`, the repository's own publishing script, with its staging, manifest and guards.
   - The panel then shows every file that would be added, changed or removed, and warns about any change that is not one of these designs.
2. **Confirm.** The script deploys with wrangler. The studio then reads the published manifest back to check the files.

Cancelling, or a failed deploy, puts the author copy back as it was.

Designs from the studio go to their own catalog, `elements/designs/managed.json`, with ids that start with `m-`. They never collide with the hand-authored `index.json`. The app reads both files: names and groups come from `managed.json`, and an authored design wins on an id clash.

Publishing needs a Cloudflare API token with Pages edit rights. Give it in the panel, where it is kept in the server's memory only, or set `CLOUDFLARE_API_TOKEN` in the environment. The account defaults to the library's (`CLOUDFLARE_ACCOUNT_ID` overrides it).

## Settings

| Variable                                               | Default                          |
| ------------------------------------------------------ | -------------------------------- |
| `SLIDR_STUDIO_PORT`, `SLIDR_STUDIO_HOST`               | `8765`, `127.0.0.1`              |
| `SLIDR_STUDIO_DATA`                                    | `management/.data`               |
| `SLIDR_MEDIA_DIR`                                      | `../Slidr-media`                 |
| `SLIDR_MEDIA_URL`                                      | `https://slidr-media.pages.dev/` |
| `SLIDR_STUDIO_MAX_CLAUDE`, `_MAX_CODEX`, `_MAX_RENDER` | `4`, `4`, `2`                    |
| `SLIDR_STUDIO_BROWSER`                                 | `msedge` (a Playwright channel)  |
| `CLAUDE_PATH`, `CODEX_PATH`, `NODE_PATH_EXE`           | found on the PATH                |

Each request lives in `.data/requests/<rid>/`. Each variant's working folder, `<vid>/work/`, holds the concept, the picture, the two HTML files and `snap/` (the renders and `result.json`).

## Working on the studio

```powershell
pnpm --filter @slidr/management dev          # the pages at http://127.0.0.1:5175, the API proxied to :8765
$env:SLIDR_STUDIO_UI_URL = 'http://127.0.0.1:5175'   # the server renders through the dev pages
cd management/server; .venv/Scripts/python -m slidr_manager --no-open
.venv/Scripts/python -m pip install -r requirements-dev.txt; .venv/Scripts/python -m pytest
node management/web/tools/snap.mjs --url "http://127.0.0.1:8765/render.html?v=<vid>" --out <dir> --debug
```

`pnpm --filter @slidr/management typecheck` and the repository's `eslint` and `prettier` cover the pages.
