# Slidr

Slidr is a desktop presentation editor in which the AI is a full editing partner, not an add-on. You build and edit a deck by hand, in conversation, or both, and every change the agent makes shows up on the slide as it happens.

It is a Tauri app (Rust + React/TypeScript) for Windows 11, with a Hebrew and English interface and first-class support for right-to-left and mixed-direction content.

> **Status: early development.** Everything planned for the first version is built and runs in the app, and the test suites pass. None of it has passed its design review yet, many decisions are still open, and several parts have only ever run against mocks. See [Status](#status).

## The idea

- **Two-thirds editor, one-third AI.** Tools on top, the slide in the middle, the filmstrip below; next to it a panel with three AI tools, one per scope: the whole **deck**, the current **slide**, the selected **object**.
- **An external agent, a single API.** The AI runs through an agent harness (Claude Code CLI first) that reaches the deck only through the Deck API the app defines. Any future harness (Codex CLI, Gemini CLI, a direct API) uses the same API, with no change to the editor.
- **The model never limits the look.** A deck is an object model stored in a `.slidr` file, but any HTML/CSS is displayed as is. Converting HTML into editable objects must never change how a slide looks.
- **HTML in, HTML out.** Export produces one self-contained HTML file that plays in any browser. Import accepts any HTML presentation: the agent explores the file and rebuilds it through the Deck API, with no per-format adapters.
- **Designed by default.** Slides are fixed at 1920×1080. Design guidelines and a design lint hold the agent to modern, full-bleed layouts, and the app itself is held to the same bar.
- **Hebrew and English.** The whole layout mirrors with the interface language, and text direction is set per paragraph.

Out of scope: PowerPoint (`.pptx`) compatibility, cloud accounts and real-time collaboration, web and mobile versions.

## Status

The work is split into eight milestones, M0 to M7 ([docs/PLAN.md](docs/PLAN.md)). M0 (feasibility) is done. Since then every must-have task and almost every task of the full first version has been built, by coding agents working in parallel, each track recorded in an ADR. No milestone after M0 is closed: each one waits for its design review, for checks only a person can make, and for decisions. Sections 4, 7 and 8 of the plan say what is missing for each.

On 2026-10-05 a round of fixes was merged that a cloud session had built in a Linux container ([ADR-069](docs/adr/ADR-069-cloud-fixes.md)): the defects that earlier records had left open, part of what was still unbuilt, and a hunt for new defects. It was checked there in Edge against the mocked backend. On Windows the regular suites pass on it after two fixes, one for a pair of file names that only Linux tells apart and one in a test; nothing it added has run in the real window yet.

In the app today:

- **Model and storage** — Zod schemas for deck, slide, element, theme and layout; every change goes through an undoable command. The `.slidr` archive, atomic saves, backups, recent files and content-addressed assets are on the Rust side, and the chat is saved inside the file.
- **Shell** — a welcome screen (start with the AI, from an empty deck, from a template, by opening a file or by importing HTML), a custom title bar, activity bar and panels in light and dark themes and in both directions, a settings screen, and a shortcut map (Ctrl+/) that lists every key. Shortcuts cannot be rebound.
- **Stage and filmstrip** — select, drag, resize, rotate and snap, also several objects together; image crop, line editing and working inside a group; a right-click menu for every kind of selection and a floating toolbar beside it; Tab walks the objects, Ctrl+arrows resizes, Alt+arrows rotates and Alt+F10 reaches the floating toolbar. In the filmstrip, Ctrl+arrows moves the selected slides, and a slide with design findings carries a mark beside its number.
- **Text** — in-place editing and formatting for mixed Hebrew and English, paste from Word and the browser, text styles from the theme, links to a web address or to a slide, a format painter, gradient, outline and shadow for the text of a box, and find and replace across the deck. The built-in font library and the fonts installed on the computer.
- **Objects** — shapes with text inside, lines, fill, outline, effects and the slide background; image masks, adjustments, filter presets and duotone in the template's colours; SVG files whose colours can be replaced and tied to the template; an icon library (Lucide and Tabler, about 8,000 icons) with search in English and Hebrew; position, size and rotation as numbers, and paste style. A picture the deck no longer uses can be removed from the media panel.
- **Tables** — cells edited in place with the same text editor, with the arrows moving between cells; rows and columns, several at a time, merge and split; cell padding; six table styles; paste from Excel, Google Sheets, Word and CSV; right-to-left tables.
- **Charts** — eight types drawn as SVG by ECharts in the theme's colours and mirrored in a right-to-left deck, a data grid that stays open beside the chart, paste of a range, and options for title, legend, axes and labels. A chart builds on its step in a show and stays live in the exported file.
- **Video and audio** — mp4, webm, mp3, wav and m4a, with trim, poster, loop, mute and volume; one player serves the editor, present mode and the exported file.
- **HTML objects** — the text inside an HTML object is edited in place; a Code panel edits its HTML and CSS with the Stage as the live preview; "Decompose into objects" converts it, showing the differences first.
- **Templates** — ten built-in templates, each a theme and fourteen layouts in both directions; a Templates panel to apply one, edit colours, the chart palette, fonts, text styles, corners, shadow, backgrounds and the logo, and save personal templates; a default template for new decks; slide number and footer; a Layout tool that moves an existing slide to another layout.
- **Design check** — a panel with the design lint's findings for the whole deck, slide by slide: go to the object, fix one, fix all in one undo step, or hand the deck to the agent.
- **Three AI tools** — a chat for the deck, one for every slide, and one that follows the selection, each with a tab of ready-made actions. Ask for a deck and watch the slides appear; a request that names only a subject gets an outline to approve first. Each message is one undo step, and a quality gate sends the agent back to look again or to fix what the design lint finds. Options the agent offers (wordings, images, redesigns) appear as cards: hover to preview on the slide, click to apply; the sets offered earlier for the same target stay a step back while the window is open. The chat has a model and effort picker, cost per turn, several conversations per tool and attachments. It runs on Claude Code CLI; in tests a scripted mock takes its place.
- **Templates made by the agent** — from a description, a site address, a logo, an image, an HTML file or the open deck, the agent drafts a theme and layouts; the app checks every layout with the design lint and shows the draft before anything is saved.
- **AI images and stock** — two image providers (Codex CLI and `openai-api`), chosen in the settings, with API keys kept in the operating system's credential store; placeholders that carry a prompt, filled one by one or all together; a deck-wide image style; stock photos from Unsplash and Pexels with the credit saved in the asset; background removal on this machine.
- **HTML import** — open any HTML presentation; the agent explores the file in a hidden window with no network and six permitted commands, shows a plan, and captures the slides into the deck, with a report of what became editable and what stayed HTML.
- **Animations, present mode, export** — an animations panel and transitions, full-screen presenting on the current display, and export of one self-contained HTML file: images re-encoded, fonts cut down to the characters in use, animations, live charts and links included, media inside the file or in a folder beside it. A link in a show or in an exported file is reached with Tab and followed with Enter, and only web, mail and phone addresses are opened.
- **Packaged build** — `tauri build` makes a Windows executable and an unsigned NSIS installer. Every page runs under a strict content policy, the main window holds only the permissions it uses, failures of files, disk and agent are recovered from in plain words, and the seven performance targets of the spec are met on an idle machine.

Working behind all this:

- **Agent platform** — the harness layer with a Claude Code CLI adapter and a mock, the Deck API tool catalogue, the tool bridge that connects an external agent to it, native slide capture through WebView2, and the system prompt modules.
- **HTML conversion** — the engine that turns an HTML slide into editable objects, with a fidelity guard that keeps the look unchanged. It serves the agent's own slides and the import.
- **Evaluation set** — ten fixed requests that one command sends to the real app against the real CLI, with measurements and a review page where a person scores the decks.

What the list above does not say:

- **Nobody has reviewed the design**, of the app or of the ten templates, and the decks the agent builds have no agreed visual score yet.
- **The agent does not build slides from a template's layouts.** A deck it builds on a template takes the template's colours and fonts and nothing the layouts draw (0 of 108 slides in two evaluation runs). Whether that should change is an open decision.
- **Never called with a real key:** the OpenAI image API, Unsplash and Pexels. Unsplash's API guidelines also speak against asking each user for a key of their own.
- **Background removal by the subject is switched off on a clean install:** it needs a matting model file, none ships or is downloaded, and no candidate is free of a licence question. Removing a flat background colour works.
- **Checked in Edge against a mocked backend, not in the real window:** most of the editor's newer tools, and everything ADR-069 added, its new keys among them; what it added for screen readers has not been heard in one. The installer has never been run, drag and drop from Explorer and the system file dialogs were never exercised by hand, and an exported file has not been opened in real Safari.
- **HTML import** was measured on ten files (103 of 103 measured slides match their source, median editability 98%) but not against a hostile file. It works on Windows only, one file at a time, and a canvas drawn by the file's scripts comes in as a still picture.
- **New dependencies wait for approval:** ECharts, CodeMirror, `tract`, `tauri-plugin-opener` and the icon sets among them.

Not there yet: rebinding shortcuts, the rest of the accessibility pass, upscaling a picture, AI actions for charts and tables, editing an outline in its card, audio that plays across slides, resuming an interrupted import and keeping its source file, and template files (`.slidrtheme`).

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

[docs/reference-decks/index.html](docs/reference-decks/index.html) opens by double-click, with no server: it shows every built-in template, slide by slide.

## Checks

```sh
pnpm check        # typecheck, ESLint, Prettier, unit tests (Vitest)
pnpm check:rust   # rustfmt, Clippy, cargo test
pnpm check:all    # both
pnpm test:browser # unit tests that need a real browser (Vitest in headless Edge)
pnpm e2e          # Playwright end-to-end and visual regression
```

The last full run on Windows was on `main` at `05fc875` (2026-10-05), the merge of ADR-069: 2,063 unit tests pass and 3 fail as expected, 246 Rust tests, 236 browser tests, and 1,211 of 1,212 end-to-end tests, the 22 screenshot baselines among them. Two things that run found are fixed since. Type checking and ESLint failed, because the branch brought two modules whose names differ only in case, which Windows reads as one file (`61e0001`; a test now forbids such a pair). And the one end-to-end failure was a test that read a colour before its fade was over (`53abe48`).

The three expected failures are findings left open on purpose, each written as a test marked `it.fails` with the proposed change inside it; such a test fails on the day its finding is closed, until the mark is removed.

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
| [packages/templates/](packages/templates/)       | Template schema and engine, and the ten built-in templates                                                                                                                                                                                                                                                                                                                                                                      |
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
  - [ADR-045](docs/adr/ADR-045-ai-tools-and-variations.md) — The three AI tools: the slide tool and the object tool, the action templates, the session brief and the variations gallery
  - [ADR-048](docs/adr/ADR-048-live-charts.md) — Live charts: drawing with ECharts as SVG, the data editor, charts on the animation timeline and in the exported file
  - [ADR-051](docs/adr/ADR-051-media-and-settings.md) — Media and settings: keys in the OS credential store, the `openai-api` image provider, stock photos, the icon library and the media panel
  - [ADR-054](docs/adr/ADR-054-ai-finish-templates-outline-chat.md) — Templates made by the agent, the deck's look in the deck tool, the outline flow and the full chat
  - [ADR-057](docs/adr/ADR-057-objects-code-media-images.md) — Objects: the code editor and decompose for an `html` object, video and audio, the image look and local background removal, SVG import, paste style and numeric fields
  - [ADR-060](docs/adr/ADR-060-editor-shell-text-stage.md) — The editor's P1: the Stage's right-click menu and floating toolbar, the text tools, find and replace, the shortcut map, the welcome screen and system fonts
  - [ADR-063](docs/adr/ADR-063-design-check-and-templates.md) — The user's design check and its panel, seven more built-in templates, master components, and changing the layout of a slide
  - [ADR-066](docs/adr/ADR-066-packaging-and-hardening.md) — Packaging and hardening: the first packaged Windows build and the suites that drive it, the content policy and trimmed permissions, failure recovery, and the performance pass
  - [ADR-069](docs/adr/ADR-069-cloud-fixes.md) — The cloud fixes: the defects earlier records had left open, part of what was still unbuilt (removing an asset, the findings mark in the filmstrip, the history of options, the rest of the template editor, three table gaps, part of the keyboard pass), and a hunt for new defects

## License

No license has been granted. The packages are private and the crates are marked `UNLICENSED`.
