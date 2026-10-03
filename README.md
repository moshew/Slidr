# Slidr

Slidr is a desktop presentation editor in which the AI is a full editing partner, not an add-on. You build and edit a deck by hand, in conversation, or both, and every change the agent makes shows up on the slide as it happens.

It is a Tauri app (Rust + React/TypeScript) for Windows 11, with a Hebrew and English interface and first-class support for right-to-left and mixed-direction content.

> **Status: early development.** Milestone M1 (the basic editor) is in progress. The AI chat is not wired into the app yet. See [Status](#status).

## The idea

- **Two-thirds editor, one-third AI.** Tools on top, the slide in the middle, the filmstrip below; next to it a panel with three AI tools, one per scope: the whole **deck**, the current **slide**, the selected **object**.
- **An external agent, a single API.** The AI runs through an agent harness (Claude Code CLI first) that reaches the deck only through the Deck API the app defines. Any future harness (Codex CLI, Gemini CLI, a direct API) uses the same API, with no change to the editor.
- **The model never limits the look.** A deck is an object model stored in a `.slidr` file, but any HTML/CSS is displayed as is. Converting HTML into editable objects must never change how a slide looks.
- **HTML in, HTML out.** Export produces one self-contained HTML file that plays in any browser. Import accepts any HTML presentation: the agent explores the file and rebuilds it through the Deck API, with no per-format adapters.
- **Designed by default.** Slides are fixed at 1920×1080. Design guidelines and a design lint hold the agent to modern, full-bleed layouts, and the app itself is held to the same bar.
- **Hebrew and English.** The whole layout mirrors with the interface language, and text direction is set per paragraph.

Out of scope: PowerPoint (`.pptx`) compatibility, cloud accounts and real-time collaboration, web and mobile versions.

## Status

The work is split into eight milestones, M0 to M7 ([docs/PLAN.md](docs/PLAN.md)). M0 (feasibility) is done; M1 (basic editor) is in progress.

In the repository today:

- **Model** — Zod schemas for deck, slide, element, theme and layout; every change goes through an undoable command; store, history and migrations.
- **Storage** — the `.slidr` archive, atomic saves, backups, recent files and content-addressed assets, on the Rust side.
- **Renderer** — `SlideRenderer`, the one component that draws a slide everywhere, covered by visual regression tests.
- **Design system and shell** — tokens and components in light and dark themes, custom title bar, activity bar and panels, in both directions.
- **Stage and filmstrip** — select, drag, resize, rotate and snap; in-place text editing for mixed Hebrew and English.
- **Agent platform** — the harness layer with a Claude Code CLI adapter and a mock harness, the Deck API tool catalogue, and native slide capture through WebView2.

Not there yet: the AI chat panels and the MCP bridge that connects the agent to the app (M2), templates and design lint (M2), HTML import (M3), image generation and stock assets (M4), animations, present mode and HTML export (M5), live charts and media (M6).

## Getting started

Prerequisites:

- Windows 11. The code is kept cross-platform, but it is only tested on Windows, and slide capture relies on WebView2.
- Node.js 22 or later and pnpm 12.
- Rust 1.90 or later with the MSVC toolchain (Visual Studio Build Tools, C++ workload).
- Microsoft Edge, for the end-to-end tests.

```sh
pnpm install
pnpm tauri dev    # the desktop app
pnpm dev          # the frontend alone, at http://localhost:1420
```

With the dev server running, a few pages are useful on their own:

| Page                             | Shows                                                             |
| -------------------------------- | ----------------------------------------------------------------- |
| `/dev/gallery.html`              | Every design-system component, in both themes and both directions |
| `/dev/slides.html`               | The renderer's reference decks                                    |
| `/dev/stage.html?deck=reference` | The stage and filmstrip on a real deck                            |

## Checks

```sh
pnpm check        # typecheck, ESLint, Prettier, unit tests (Vitest)
pnpm check:rust   # rustfmt, Clippy, cargo test
pnpm check:all    # both
pnpm e2e          # Playwright end-to-end and visual regression
```

The end-to-end tests run against the Vite frontend with the Tauri IPC mocked, in the installed Edge (the same Chromium engine WebView2 uses). The screenshot baselines are Windows-only.

## Repository layout

| Path                                                                             | Contents                                                                                                                                               |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [apps/desktop/](apps/desktop/)                                                   | The app: React frontend in `src/` (shell, stage, text editing, i18n, capture), Tauri backend in `src-tauri/` (storage, assets, capture, agent harness) |
| [packages/model/](packages/model/)                                               | Deck schema, commands, store, history, migrations                                                                                                      |
| [packages/renderer/](packages/renderer/)                                         | `SlideRenderer` and the reference decks                                                                                                                |
| [packages/ui/](packages/ui/)                                                     | Design system: tokens, theme and components                                                                                                            |
| [packages/agent-tools/](packages/agent-tools/)                                   | The Deck API: tool catalogue, scope guard, transport-independent                                                                                       |
| `packages/runtime`, `templates`, `lint`, `prompts`, `html-import`, `html-export` | Placeholders for later milestones                                                                                                                      |
| [spikes/](spikes/)                                                               | The six M0 feasibility spikes. Standalone, throwaway code; the findings are in the ADRs                                                                |
| [docs/](docs/)                                                                   | Spec, plan and architecture decision records                                                                                                           |

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

## License

No license has been granted. The packages are private and the crates are marked `UNLICENSED`.
