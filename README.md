# Slidr

Slidr is a desktop presentation editor in which the AI is a full editing partner, not an add-on. You build and edit a deck by hand, in conversation, or both, and every change the agent makes shows up on the slide as it happens.

It is a Tauri app (Rust + React/TypeScript) for Windows 11, with a Hebrew and English interface and first-class support for right-to-left and mixed-direction content.

> **Status: early development.** Everything planned for the first version is built and runs in the app. None of it has passed its design review yet, many decisions are still open, several parts have only ever run against mocks, and the last full run of the test suites was stopped before its end, with thirteen end-to-end tests failing. See [Status](#status).

## The idea

- **Two-thirds editor, one-third AI.** Tools on top, the slide in the middle, the filmstrip below; next to it **one AI chat**. Whatever you have selected (the slide on the stage, objects on it, words inside a text) goes to the agent with every message, so "make the picture more realistic" or "add another bullet to this slide" needs nothing more.
- **An external agent, a single API.** The AI runs through an agent harness (Claude Code CLI first) that reaches the deck only through the Deck API the app defines. Any future harness (Codex CLI, Gemini CLI, a direct API) uses the same API, with no change to the editor.
- **The model never limits the look.** A deck is an object model stored in a `.slidr` file, but any HTML/CSS is displayed as is. Converting HTML into editable objects must never change how a slide looks.
- **HTML in, HTML out.** Export produces one self-contained HTML file that plays in any browser. Import accepts any HTML presentation: the agent explores the file and rebuilds it through the Deck API, with no per-format adapters.
- **Designed by default.** Slides are fixed at 1920×1080. Design guidelines and a design lint hold the agent to modern, full-bleed layouts, and the app itself is held to the same bar.
- **Hebrew and English.** The whole layout mirrors with the interface language, and text direction is set per paragraph.

Out of scope: PowerPoint (`.pptx`) compatibility, cloud accounts and real-time collaboration, web and mobile versions.

## Status

The work is split into eight milestones, M0 to M7 ([docs/PLAN.md](docs/PLAN.md)). M0 (feasibility) is done. Since then every must-have task and almost every task of the full first version has been built, by coding agents working in parallel, each track recorded in an ADR. No milestone after M0 is closed: each one waits for its design review, for checks only a person can make, and for decisions. Sections 4, 7 and 8 of the plan say what is missing for each.

On 2026-10-05 a round of fixes was merged that a cloud session had built in a Linux container ([ADR-069](docs/adr/ADR-069-cloud-fixes.md)): the defects that earlier records had left open, part of what was still unbuilt, and a hunt for new defects. It was checked there in Edge against the mocked backend. On Windows the regular suites pass on it after two fixes, one for a pair of file names that only Linux tells apart and one in a test; nothing it added has run in the real window yet.

On 2026-10-05, and into the night of 2026-10-06, a round called `m8-finish` followed, in fifteen parallel tracks. Six of them built what was left of the full first version ([ADR-070](docs/adr/ADR-070-remaining-p1.md)), and nine fixed what a hunt for defects had found, 97 findings that are 88 different defects ([ADR-071](docs/adr/ADR-071-bug-hunt-fixes.md)). No capability of the full first version is left wholly unbuilt. Three things stand between built and usable: upscaling ships no model, the keyboard pass was checked in Edge and not with a real keyboard in the app's window or with a screen reader, and what needs a schema change was left out and recorded as a decision. Three of the findings were not closed to the end, two in HTML import and one in the cost shown after an agent process is killed. In the same days the three AI tools became one chat ([ADR-072](docs/adr/ADR-072-one-ai-chat.md)), and five more built-in templates arrived from a cloud session. All of it is in `main`. Most of the round was checked in Edge against the mocked backend, part of it in the real window, and a little against the real Claude Code CLI; 104 and 75 decisions wait in the two records.

In the app today:

- **Model and storage** — Zod schemas for deck, slide, element, theme and layout; every change goes through an undoable command. The `.slidr` archive, atomic saves, backups, recent files and content-addressed assets are on the Rust side, and the chat is saved inside the file. A `.slidr` file is unpacked only up to 20,000 entries and up to 1 GiB plus a hundred times its own size, a save that had to leave files out says which, and the question about unsaved changes is asked at the moment a document is replaced.
- **Shell** — a welcome screen (start with the AI, from an empty deck, from a template, by opening a file or by importing HTML), a custom title bar, activity bar and panels in light and dark themes and in both directions, a settings screen, and a shortcut map (Ctrl+/) that lists every key and is where a key is changed: press a shortcut in the map, then the new combination. The settings file keeps the changed keys and the agent's defaults (harness, model, effort), and a Fonts section takes font files of your own (WOFF2, TTF, OTF); a deck that uses such a font carries it.
- **Keyboard and accessibility** — F6 and Shift+F6 move the keyboard between the seven regions of the window; crop handles, the points of a line, the rule between table cells, panning a zoomed slide, lock and hide all have keys; a tool reached with the keyboard keeps it, and one used with the mouse gives it back to the slide. An audit with `axe-core` holds 339 surfaces of the app, in both languages and both themes, to no serious or critical fault.
- **Stage and filmstrip** — select, drag, resize, rotate and snap, also several objects together; image crop, line editing and working inside a group; a right-click menu for every kind of selection, also inside text that is being edited, and a floating toolbar beside the selection; Tab walks the objects, Ctrl+arrows resizes, Alt+arrows rotates, Alt+F10 reaches the floating toolbar, and Alt+Down or Alt+Up with Alt+Enter picks objects that are not neighbours. The two tool rows scroll sideways when they are narrower than their tools. In the filmstrip, Ctrl+arrows moves the selected slides, and a slide carries marks beside its number: hidden, design findings, a transition, animations.
- **Text** — in-place editing and formatting for mixed Hebrew and English, also of several selected boxes at once, with "mixed" where they differ; the weights a font really has; paste from Word and the browser in three kinds (match the destination, keep the source's look with Shift+Insert, text only); text styles from the theme, links to a web address or to a slide, also on a shape's text and in table cells, a format painter, gradient, outline and shadow for the text of a box, and find and replace across the deck, which reads past Hebrew vowel points. The built-in font library, the fonts installed on the computer and the fonts you added.
- **Objects** — shapes with text inside, lines, fill, outline, effects and the slide background, also for several selected objects at once; image masks, adjustments, filter presets and duotone in the template's colours; a picture replaced from the media panel keeps its frame and crop, and a photo comes in turned the way its EXIF orientation says, not stretched; SVG files whose colours can be replaced and tied to the template; an icon library (Lucide and Tabler, about 8,000 icons) with search in English and Hebrew; position, size and rotation as numbers, and paste style. A picture the deck no longer uses can be removed from the media panel.
- **Tables** — cells edited in place with the same text editor, with the arrows moving between cells and Ctrl+arrows moving the rule at the end of a cell; rows and columns, several at a time, merge and split; cell padding; six table styles; paste from Excel, Google Sheets, Word and CSV; right-to-left tables.
- **Charts** — eight types drawn as SVG by ECharts in the theme's colours, with bar corners that follow the template's, and mirrored in a right-to-left deck, a data grid that stays open beside the chart, paste of a range, and options for title, legend, axes and labels. A chart builds on its step in a show and stays live in the exported file.
- **Video and audio** — mp4, webm, mp3, wav and m4a, with trim, poster, loop, mute and volume; one player serves the editor, present mode and the exported file.
- **HTML objects** — the text inside an HTML object is edited in place; a Code panel edits its HTML and CSS with the Stage as the live preview; "Decompose into objects" converts it, showing the differences first.
- **Templates** — fifteen built-in templates, each a theme and fourteen layouts in both directions; a Templates panel to apply one, edit colours, the chart palette, fonts, text styles, corners, shadow, backgrounds and the logo, and save personal templates; a default template for new decks; slide number and footer; a Layout tool that moves an existing slide to another layout, drops the empty placeholders nobody touched that have no seat there, and gives each free seat an empty element. A template offers only backgrounds its own text can be read on. A slide the agent drew on no layout follows a change of template in the colours inside its CSS fills, in its corner radius and in its shadow.
- **Design check** — a panel with the design lint's findings for the whole deck, slide by slide: go to the object, fix one, fix all in one undo step, or hand the deck to the agent. A fix never moves or recolours a locked element.
- **One AI chat** ([ADR-072](docs/adr/ADR-072-one-ai-chat.md)) — a single conversation per deck, which knows what is selected: the slide on the stage, objects, or words selected inside a text, which it can change without touching the rest. A chip beside the composer shows what the next message is about, and a tab of ready-made actions offers those of the selection (text, image, chart, table, shape, icon), of the slide and of the deck. Until 2026-10-05 there were three tools, for the deck, the slide and the object. Ask for a deck and watch the slides appear; a request that names only a subject gets an outline first, which can be edited in its card (retitle, move, remove or add a slide) before it is approved. Each message is one undo step, and a quality gate sends the agent back to look again or to fix what the design lint finds. Stop stops: nothing is written after it, and a tool call writes only to the document it began in. Options the agent offers (wordings, images, redesigns) appear as cards: hover to preview on the slide, click to apply; the sets offered earlier for the same target stay a step back while the window is open. The chat has a model and effort picker for each conversation, cost per turn, several conversations and attachments, and what was typed stays in the composer when you look elsewhere. It runs on Claude Code CLI; in tests a scripted mock takes its place.
- **AI actions for a chart, a table, a shape and an icon** ([ADR-070](docs/adr/ADR-070-remaining-p1.md)) — built for the object tool a day before it was removed, they are now in the chat's actions tab, under what is selected. For a chart: suggest another type, a title that says what the data shows, fill the data from pasted text. For a table: fill it from pasted text, design suggestions, a line of insight beside it, turn it into a chart. For a shape or an icon: another shape, a better icon, colours from the template. Choices come as cards that draw the object itself.
- **Templates made by the agent** — from a description, a site address, a logo, an image, an HTML file or the open deck, the agent drafts a theme and layouts; the app checks every layout with the design lint and shows the draft before anything is saved.
- **AI images and stock** — two image providers (Codex CLI and `openai-api`), chosen in the settings, with API keys kept in the operating system's credential store; placeholders that carry a prompt, filled one by one or all together; a deck-wide image style; stock photos from Unsplash and Pexels with the credit saved in the asset; background removal and upscaling (×2 and ×4) on this machine, each switched off until its model file is present.
- **HTML import** — open any HTML presentation; the agent explores the file in a hidden window with no network and six permitted commands, shows a plan, and captures the slides into a plain deck of its own, with a count of the slides captured out of those planned and a report of what became editable and what stayed HTML. The deck file keeps the source file and the record of the import, so the report comes back when the file is reopened, and a button removes the source. An import that was cut (Stop, a dead agent process, a crash) continues from what was captured.
- **Animations, present mode, export** — an animations panel and transitions, full-screen presenting on the current display, and export of one self-contained HTML file: images re-encoded, fonts cut down to the characters in use and written once, animations, live charts and links included, media inside the file or in a folder beside it. A black or white screen holds the show (auto-advance, media, a step that is playing), and after the last step an end screen comes up. A link in a show or in an exported file is reached with Tab and followed with Enter, and only web, mail and phone addresses are opened; in the app's own show a mail or phone link is drawn as plain text, because the window is permitted to open web addresses only.
- **Free markup stays a picture** ([ADR-071](docs/adr/ADR-071-bug-hunt-fixes.md)) — what a deck holds as free markup or free CSS (an SVG, an HTML object, a slide's CSS) is drawn and does nothing else, whoever wrote it, in the editor, in a show and in the exported file. An `svg` object is drawn in a shadow root of its own, a slide's CSS cannot restyle the editor or another slide, and the export checks what it wrote: it parses the file as a browser will and compares it with what was drawn.
- **Packaged build** — `tauri build` makes a Windows executable and an unsigned NSIS installer. Every page runs under a strict content policy, the main window holds only the permissions it uses, failures of files, disk and agent are recovered from in plain words, and the seven performance targets of the spec are met on an idle machine.

Working behind all this:

- **Agent platform** — the harness layer with a Claude Code CLI adapter and a mock, the Deck API tool catalogue, the tool bridge that connects an external agent to it, native slide capture through WebView2, and the system prompt modules.
- **HTML conversion** — the engine that turns an HTML slide into editable objects, with a fidelity guard that keeps the look unchanged. It serves the agent's own slides and the import.
- **Evaluation set** — ten fixed requests that one command sends to the real app against the real CLI, with measurements and a review page where a person scores the decks.

What the list above does not say:

- **Nobody has reviewed the design**, of the app or of the fifteen templates, and the decks the agent builds have no agreed visual score yet.
- **The agent does not build slides from a template's layouts.** A deck it builds on a template takes the template's colours and fonts and nothing the layouts draw (0 of 108 slides in two evaluation runs). Whether that should change is an open decision.
- **Never called with a real key:** the OpenAI image API, Unsplash and Pexels. Unsplash's API guidelines also speak against asking each user for a key of their own.
- **Background removal by the subject and upscaling are switched off on a clean install:** each needs a model file, none ships or is downloaded, and no candidate is free of a licence question. Removing a flat background colour works.
- **Checked in Edge against a mocked backend, not in the real window:** most of the editor's newer tools, everything ADR-069 added, the keyboard and accessibility pass of ADR-070 and most of the fixes of ADR-071. No new key has been pressed on a real keyboard in the app's window, and no screen reader has been run: only the tree a screen reader reads was checked. The installer has never been run, drag and drop from Explorer and the system file dialogs were never exercised by hand, and an exported file has not been opened in real Safari.
- **The suites have not passed whole on what is in `main`.** The one full run on the round's result was stopped with thirteen end-to-end tests failing, and after the merge of the one AI chat only type checking, ESLint, Prettier and the unit tests ran (see [Checks](#checks)). The packaged build, the evaluation set and the performance measurements did not run in the round.
- **HTML import** was measured on ten files (103 of 103 measured slides match their source, median editability 98%) but not against a hostile file. After the fixes of ADR-071 three of the ten were run again; the largest, 35 slides, came in with every slide faithful and a median editability of 97%. It works on Windows only, one file at a time, and a canvas drawn by the file's scripts comes in as a still picture.
- **New dependencies wait for approval:** ECharts, CodeMirror, `tract`, `tauri-plugin-opener` and the icon sets among them.

Not there yet: a model for upscaling and for background removal by the subject (both are built and wait for a decision), a text effect on part of a text, a font asset with several faces and table styles of a template (each needs a schema change), audio that plays across slides, and template files (`.slidrtheme`).

## Getting started

Prerequisites:

- Windows 11. The code is kept cross-platform, but the app has only ever run on Windows (the test suites have also run in a Linux container, see [Checks](#checks)); slide capture, HTML import and the list of installed fonts rely on WebView2 and DirectWrite.
- Node.js 22 or later and pnpm 12.
- Rust 1.90 or later with the MSVC toolchain (Visual Studio Build Tools, C++ workload), and `cargo` on the PATH.
- Microsoft Edge, for the end-to-end tests.
- Claude Code CLI, installed and logged in, for the AI tools and for HTML import. The rest of the editor works without it.
- Optional: Codex CLI, logged in, for image generation with the default provider; an OpenAI, Unsplash or Pexels key, entered in the settings, for the other image provider and for stock photos.

```sh
pnpm install
pnpm tauri dev    # the desktop app
pnpm dev          # the frontend alone, at http://localhost:1420
```

The desktop app opens on the welcome screen. The frontend alone opens in the editor, with the Tauri backend mocked and the agent played by a script; `http://localhost:1420/?welcome` shows the welcome screen there.

With the dev server running, a few pages are useful on their own:

| Page                             | Shows                                                                      |
| -------------------------------- | -------------------------------------------------------------------------- |
| `/dev/gallery.html`              | Every design-system component, in both themes and both directions          |
| `/dev/slides.html`               | The renderer's reference decks; `?deck=charts` and `charts-rtl` for charts |
| `/dev/stage.html?deck=reference` | The stage and filmstrip on a real deck                                     |
| `/dev/runtime.html`              | The runtime player and the HTML export; `?deck=charts` for charts          |

[docs/reference-decks/index.html](docs/reference-decks/index.html) opens by double-click, with no server: it shows the first ten built-in templates, slide by slide. The five that joined on 2026-10-06 are not on it yet.

## Checks

```sh
pnpm check        # typecheck, ESLint, Prettier, unit tests (Vitest)
pnpm check:rust   # rustfmt, Clippy, cargo test
pnpm check:all    # both
pnpm test:browser # unit tests that need a real browser (Vitest in headless Edge)
pnpm e2e          # Playwright end-to-end and visual regression
```

The last full run on Windows that finished was in the middle of the `m8-finish` round, at `940c974` (five of its six feature tracks merged): 261 Rust tests, 239 browser tests, and 1,340 of 1,342 end-to-end tests; the two that failed pass on their own. The full run before it, on `main` at `05fc875` (2026-10-05, the merge of ADR-069), found two things that are fixed since: two modules whose names differ only in case, which Windows reads as one file (`61e0001`; a test now forbids such a pair), and a test that read a colour before its fade was over (`53abe48`).

The one full run on the round's result (`c94ea2a`, 2026-10-06, before the merge of ADR-072) was stopped before its end. Until then: type checking, ESLint and Prettier pass; 2,618 unit tests pass; rustfmt and Clippy pass, with 272 Rust tests and 16 more skipped. The browser tests broke while loading after 23 of 42 files, with 296 tests passed; the same had happened on an earlier merge, where a second run passed whole, and this time there was no second run. Of 1,555 end-to-end tests 1,412 ran: 1,399 passed and 13 failed, four in `aifinish-look.spec.ts`, three of the layers panel in `arrange-objects.spec.ts`, two in `text-bidi.spec.ts`, and one each in `chart-options.spec.ts`, `editor-shell.spec.ts`, `image-upscale.spec.ts` and `objects-ai.spec.ts`. The run did not print the errors before it was stopped. A small track then went through the thirteen on `main` as it is after ADR-072: six already passed there, six were tests that had fallen behind the product, and one was a defect (Enter after the hex code of a colour closed the popover behind the picker), fixed together with one more that no test had caught; two tests that the ADR-072 merge had left broken were fixed too. The seven spec files of the thirteen (101 tests) and the 24 spec files that merge changed (251 tests) then passed, each run once; the whole end-to-end suite has not run again.

On `main` as it is after the merge of ADR-072 (`d202fc0`), type checking, ESLint, Prettier and 2,633 unit tests ran, and pass. The end-to-end, browser and Rust suites have not run on it. The packaged build and its suites (two of them were edited and not run, `packaged/security.spec.ts` and `packaged/import.spec.ts`), the evaluation set and the performance project did not run in the round at all.

A finding left open on purpose is written as a test marked `it.fails`, with the proposed change inside it; such a test fails on the day its finding is closed, until the mark is removed. The three that ADR-069 left are closed, and no test carries the mark now.

The accessibility audit is one of the end-to-end specs, `apps/desktop/e2e/a11y-audit.spec.ts`. It runs `axe-core` (a development dependency, MPL-2.0, not in the bundle) on 339 surfaces of the app, each in Hebrew and English and in the light and the dark theme, and holds them to no fault of serious or critical impact; the same walk holds every surface to what `axe-core` does not judge, such as a control that answers the mouse and that the keyboard cannot reach. A fault that is found and not fixed goes into the list `OPEN` in that file, which is empty. The specs beside it (`a11y-focus`, `a11y-keyboard`, `a11y-reader`, `a11y-panes`, `a11y-filmstrip`) hold focus, keyboard-only use and what a screen reader is told. No screen reader has been run. From `apps/desktop`:

```sh
pnpm exec playwright test a11y-audit   # the audit alone, against the dev server on port 1420
```

Three rules came out of the round, for a machine on which several working trees are checked at once. Run only the end-to-end specs you added or changed, and leave the full run to one place: eight tracks running browsers side by side loaded the machine until tests failed of the load. Start a real window that a script drives hidden, and with an identifier of its own: a visible, maximised test window was taken for the app and used. And do not use `git stash`, which all the working trees of a repository share.

The suites have also been run in a Linux container (ADR-069). Eight browser tests and six end-to-end tests fail there on the fonts, codecs and browser of that system, and the screenshot comparisons have no baseline; Playwright writes a baseline where none exists, so on Linux run the end-to-end suites with `--update-snapshots=none`.

The end-to-end tests run against the Vite frontend with the Tauri IPC mocked, in the installed Edge (the same Chromium engine WebView2 uses). The dev server sends the app's content policy with the app's pages, so a test fails where the packaged app would. The screenshot baselines are Windows-only, and the suites named `*-visual` compare nothing: they write screenshots for the design review to `apps/desktop/test-results/` (ignored by git).

`pnpm e2e` uses the dev server on port 1420. A second working tree runs the suites against a dev server and a port of its own, with one of the configs under `apps/desktop/e2e/`, from `apps/desktop`:

```sh
pnpm exec playwright test -c e2e/editor.playwright.config.ts   # the editor's suites, port 1551
SLIDR_E2E=app pnpm exec playwright test -c e2e/editor.playwright.config.ts   # every suite of the app on that server
```

There is one such config for each area (`runtime`, `agent`, `tables`, `aitools`, `quality`, `templates`, `charts`, `media`, `aifinish`, `import`, `objects`, `design`, `hardening`, `editor`), each with its port; `SLIDR_E2E_PORT` gives a second run a port of its own. In PowerShell a switch is set first (`$env:SLIDR_E2E = 'app'`). Start a run that counts against a fresh dev server.

The export suite also opens the exported file in Firefox and WebKit. Those two checks are skipped unless Playwright's own browsers are installed (`pnpm exec playwright install firefox webkit`, from `apps/desktop`).

### The packaged app

A second set of Playwright suites drives the app as `tauri build` makes it, not a page of the dev server. It needs a build first, about five minutes, and is part of no regular check. From `apps/desktop`:

```sh
pnpm tauri build --config e2e/hardening.tauri.conf.json      # target\release\slidr.exe, and an installer under target\release\bundle\nsis\
pnpm exec playwright test -c packaged/playwright.config.ts   # the gate: smoke, build, security, recovery, import, welcome (34 tests)

SLIDR_PERF=1 pnpm exec playwright test -c packaged/playwright.config.ts --project=perf         # the performance targets; about ten minutes, on an idle machine
SLIDR_REAL_AGENT=1 pnpm exec playwright test -c packaged/playwright.config.ts --project=agent  # against the real Claude Code CLI; costs money
```

The app's identifier is compiled into the binary and decides the data folder. Built with that `--config`, the app keeps its data in `%APPDATA%\dev.slidr.app.hardening`, and the suites refuse a binary without the test identifier. A build without `--config` is the real app and writes to your own `%APPDATA%\dev.slidr.app`. The installer is unsigned and has not been run.

### The evaluation set

Not a check: it starts the real app and the real agent, on the signed-in Claude account, and a full run takes about 17 minutes and a few dollars.

```sh
pnpm --filter @slidr/desktop eval -- --model sonnet --label <name>   # ten requests in the real app
pnpm --filter @slidr/desktop eval -- --template all                  # each request on a built-in template
pnpm --filter @slidr/desktop eval -- --check                         # start the app, prepare the first request, and send nothing
pnpm --filter @slidr/desktop eval:review -- <run>                    # the review page of a run, at http://localhost:1492
```

Runs are kept under `apps/desktop/test-results/eval/`. The runner uses a data folder of its own and stops when its budget is spent (`--budget`, $30 by default).

### Generated files

Two generated files are in git, and a test fails when one is stale: the runtime bundle (`pnpm --filter @slidr/runtime bundle`, after a change in `packages/runtime/src`) and the chart script of exported files (`pnpm --filter @slidr/renderer chart-bundle`, after a change in `packages/renderer/src/chart`).

## Repository layout

| Path                                             | Contents                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [apps/desktop/](apps/desktop/)                   | The app. React frontend in `src/`, one folder per area (shell, stage, text, objects, tables, charts, media, templates, design check, animations, present mode, export, import, find, settings, the AI tools and the agent service). Tauri backend in `src-tauri/` (storage, assets, capture, agent harness, tool bridge, the import window, image and stock providers, local image processing, keys and settings, system fonts) |
| [apps/desktop/e2e/](apps/desktop/e2e/)           | End-to-end suites, their configs, and the HTML import test set                                                                                                                                                                                                                                                                                                                                                                  |
| [apps/desktop/packaged/](apps/desktop/packaged/) | Suites that drive the built `slidr.exe` over the WebView2 DevTools port                                                                                                                                                                                                                                                                                                                                                         |
| [apps/desktop/eval/](apps/desktop/eval/)         | The evaluation set: the requests, the runner over the real app, the measurements and the review page                                                                                                                                                                                                                                                                                                                            |
| [packages/model/](packages/model/)               | Deck schema, commands, store, history, migrations                                                                                                                                                                                                                                                                                                                                                                               |
| [packages/renderer/](packages/renderer/)         | `SlideRenderer`, the chart renderer, and the reference decks                                                                                                                                                                                                                                                                                                                                                                    |
| [packages/ui/](packages/ui/)                     | Design system: tokens, theme and components                                                                                                                                                                                                                                                                                                                                                                                     |
| [packages/agent-tools/](packages/agent-tools/)   | The Deck API: tool catalogue, scope guard, transport-independent                                                                                                                                                                                                                                                                                                                                                                |
| [packages/templates/](packages/templates/)       | Template schema and engine, and the fifteen built-in templates                                                                                                                                                                                                                                                                                                                                                                  |
| [packages/lint/](packages/lint/)                 | Design lint: the engine, its rules and their automatic fixes                                                                                                                                                                                                                                                                                                                                                                    |
| [packages/prompts/](packages/prompts/)           | The system prompt per scope, each turn's context block, and the action templates                                                                                                                                                                                                                                                                                                                                                |
| [packages/html-import/](packages/html-import/)   | The HTML conversion engine and its fidelity guard, and the page side of HTML import                                                                                                                                                                                                                                                                                                                                             |
| [packages/runtime/](packages/runtime/)           | The player: transitions, animation presets and clip playback; no dependencies                                                                                                                                                                                                                                                                                                                                                   |
| [packages/html-export/](packages/html-export/)   | Export of a deck as one self-contained HTML file                                                                                                                                                                                                                                                                                                                                                                                |
| [spikes/](spikes/)                               | The six M0 feasibility spikes. Standalone, throwaway code; the findings are in the ADRs                                                                                                                                                                                                                                                                                                                                         |
| [docs/](docs/)                                   | Spec, plan, architecture decision records, and the reference decks the first templates were derived from                                                                                                                                                                                                                                                                                                                        |

## Documentation

The design documents are written in Hebrew.

- [docs/SPEC.md](docs/SPEC.md) — product and architecture specification.
- [docs/PLAN.md](docs/PLAN.md) — work groups, milestones and estimates.
- [docs/adr/](docs/adr/) — architecture decision records:
  - [ADR-001](docs/adr/ADR-001-claude-cli-harness.md) — Claude Code adapter: the raw CLI, not an Agent SDK sidecar
  - [ADR-002](docs/adr/ADR-002-mcp-bridge.md) — MCP transport: rmcp over local HTTP, forwarding to the webview
  - [ADR-003](docs/adr/ADR-003-slide-capture.md) — Slide capture: native WebView2 screenshots
  - [ADR-004](docs/adr/ADR-004-image-provider.md) — Default image provider: Codex CLI
  - [ADR-005](docs/adr/ADR-005-agent-led-import.md) — Agent-led HTML import and the fidelity guard
  - [ADR-006](docs/adr/ADR-006-bidi-text-editing.md) — Bidirectional text editing with TipTap on the scaled surface
  - [ADR-007](docs/adr/ADR-007-model-and-commands.md) — Model, commands and history
  - [ADR-008](docs/adr/ADR-008-design-system-and-shell.md) — Design system and app shell
  - [ADR-009](docs/adr/ADR-009-slide-renderer.md) — The `SlideRenderer` contract
  - [ADR-010](docs/adr/ADR-010-agent-harness.md) — The agent harness layer
  - [ADR-011](docs/adr/ADR-011-deck-api.md) — The Deck API, the scope guard, and a turn as a transaction
  - [ADR-012](docs/adr/ADR-012-stage-and-text-editing.md) — Stage, filmstrip and in-place text editing
  - [ADR-013](docs/adr/ADR-013-text-formatting.md) — Text formatting, paste, and the BiDi suite
  - [ADR-014](docs/adr/ADR-014-objects.md) — Objects: insertion, fill, outline, effects and the slide background
  - [ADR-015](docs/adr/ADR-015-arrange-and-slides.md) — Arranging objects and managing slides
  - [ADR-016](docs/adr/ADR-016-stage-crop-lines-groups.md) — The Stage: image crop, line editing, working inside a group, and duplicate by drag
  - [ADR-017](docs/adr/ADR-017-html-conversion-engine.md) — The HTML conversion engine: render, measure, compare
  - [ADR-018](docs/adr/ADR-018-design-lint.md) — Design lint: the engine, the measurements, and the rules returned to the agent
  - [ADR-019](docs/adr/ADR-019-prompts-and-context.md) — The `prompts` package: the system prompt per scope, and each turn's context block
  - [ADR-020](docs/adr/ADR-020-runtime.md) — The runtime: the player, transitions and animations
  - [ADR-021](docs/adr/ADR-021-html-export.md) — HTML export: one self-contained file from the live DOM
  - [ADR-022](docs/adr/ADR-022-mcp-bridge.md) — The tool bridge: the transport adapter between the agent and the Deck API
  - [ADR-023](docs/adr/ADR-023-template-engine.md) — The template engine: templates, layouts in both directions, a slide from a layout, and switching templates
  - [ADR-025](docs/adr/ADR-025-image-providers.md) — Image providers: the contract, the service, and the `codex-cli` provider
  - [ADR-026](docs/adr/ADR-026-m2-core-integration.md) — M2 core: the shared infrastructure, the integration, and what is missing before the app runs it
  - [ADR-027](docs/adr/ADR-027-agent-in-the-app.md) — The agent in the app: conversion in the capture window, the agent service, the quality gate, the transcript and the chat
  - [ADR-030](docs/adr/ADR-030-present-mode.md) — Present mode, and wiring animations and export into the app
  - [ADR-031](docs/adr/ADR-031-animations-panel.md) — The animations panel and the transition tool
  - [ADR-032](docs/adr/ADR-032-export-dialog-and-fonts.md) — The export dialog, and fonts in the exported file
  - [ADR-033](docs/adr/ADR-033-tables.md) — Tables: editing on the Stage, the row B tools, paste, and two renderer fixes
  - [ADR-034](docs/adr/ADR-034-html-text-editing.md) — Editing text in place inside an `html` object
  - [ADR-036](docs/adr/ADR-036-html-import.md) — HTML import: the isolated import window, the import tools, the import session and the wizard
  - [ADR-039](docs/adr/ADR-039-reference-decks-and-templates.md) — The reference decks and the first three templates: the role contract, and what a template cannot carry
  - [ADR-040](docs/adr/ADR-040-templates-in-the-app.md) — Templates in the app: the library, the default template, the template editor and personal templates
  - [ADR-042](docs/adr/ADR-042-agent-design-quality.md) — The agent's design quality: the evaluation set, what it measured, and the design prompt tuned against it
  - [ADR-045](docs/adr/ADR-045-ai-tools-and-variations.md) — The three AI tools: the slide tool and the object tool, the action templates, the session brief and the variations gallery (the two tools were replaced by one chat in ADR-072)
  - [ADR-048](docs/adr/ADR-048-live-charts.md) — Live charts: drawing with ECharts as SVG, the data editor, charts on the animation timeline and in the exported file
  - [ADR-051](docs/adr/ADR-051-media-and-settings.md) — Media and settings: keys in the OS credential store, the `openai-api` image provider, stock photos, the icon library and the media panel
  - [ADR-054](docs/adr/ADR-054-ai-finish-templates-outline-chat.md) — Templates made by the agent, the deck's look in the deck tool, the outline flow and the full chat
  - [ADR-057](docs/adr/ADR-057-objects-code-media-images.md) — Objects: the code editor and decompose for an `html` object, video and audio, the image look and local background removal, SVG import, paste style and numeric fields
  - [ADR-060](docs/adr/ADR-060-editor-shell-text-stage.md) — The editor's P1: the Stage's right-click menu and floating toolbar, the text tools, find and replace, the shortcut map, the welcome screen and system fonts
  - [ADR-063](docs/adr/ADR-063-design-check-and-templates.md) — The user's design check and its panel, seven more built-in templates, master components, and changing the layout of a slide
  - [ADR-066](docs/adr/ADR-066-packaging-and-hardening.md) — Packaging and hardening: the first packaged Windows build and the suites that drive it, the content policy and trimmed permissions, failure recovery, and the performance pass
  - [ADR-069](docs/adr/ADR-069-cloud-fixes.md) — The cloud fixes: the defects earlier records had left open, part of what was still unbuilt (removing an asset, the findings mark in the filmstrip, the history of options, the rest of the template editor, three table gaps, part of the keyboard pass), and a hunt for new defects
  - [ADR-070](docs/adr/ADR-070-remaining-p1.md) — What was left of the full first version, in six tracks: shortcuts the user changes, the agent's settings in the settings file and the Fonts section; the keyboard and accessibility pass; an import that keeps its source file and continues after it is cut; AI actions for a chart, a table, a shape and an icon, and an outline edited in its card; the end of a show, local upscaling and replacing a picture from the media panel; formatting several objects at once, font weights, the kinds of paste and the app's menu inside text
  - [ADR-071](docs/adr/ADR-071-bug-hunt-fixes.md) — The fixes of the bug hunt, in nine tracks: the life of a document and its storage, the agent under the chat, the AI panels, HTML import, editing by hand, the boundary between a deck and the page that draws it, templates and the design check, changing the template of a deck the agent drew, and five defects seen in other tracks' files
  - [ADR-072](docs/adr/ADR-072-one-ai-chat.md) — One AI chat: the slide and object tools removed, and what is selected (words in a text too) goes to the agent with every message

## License

No license has been granted. The packages are private and the crates are marked `UNLICENSED`.
