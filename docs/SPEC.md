# Slidr — product and architecture specification

Updated: 2026-10-09. Companion: [implementation plan](PLAN.md). This document describes the implemented product and the current working-tree direction. Unless explicitly marked **working tree**, behavior is represented by the committed baseline `fdb2036`. The [ADRs](adr/) explain why the major choices were made.

## 1. Product and document

Slidr is a desktop presentation editor with an AI assistant. A user can edit a deck directly, ask the agent to create or revise it, import an HTML presentation, present it, and export a self-contained HTML file. The native `.slidr` workspace stores the deck, assets, chat, and import source/report. Hebrew and English are first-class UI and content languages, including mixed-direction rich text.

Deck changes are validated model commands. The document schema and command catalog live in `packages/model`; both UI and agent use the same `CommandBus`. A gesture or agent turn groups its commands into one undo step. The model includes slides, layout and theme data, text, shapes, lines, images, SVG, media, tables, charts, HTML objects, animations, transitions, and assets. Optional fields let older decks load while newer visual features are added. See [ADR-007](adr/ADR-007-model-and-commands.md).

## 2. Editor surface

The title bar contains File and document actions, undo/redo, deck name, Export, Present, and window controls. The Activity Bar opens AI, Elements, Templates, Media, Animations, and other registered areas. A creation row sits above the workspace; a contextual toolbar appears near the current slide or selection; the status bar contains zoom and the Design Check count. The shell mirrors with the UI language while the deck and individual paragraphs keep their own direction. **Working tree:** the logo and document name are centered together, navigation icons use a common treatment, and Ctrl+A selects all slides when the Filmstrip list has focus ([ADR-081](adr/ADR-081-shell-navigation-polish.md)). Exact placement, focus, and responsive rules are in the [design refresh specification](design-refresh/SPEC.md).

The Stage uses the shared 1920×1080 DOM `SlideRenderer`, scaled by its container. Filmstrip, Stage selection, and Layers panel are separate views over the same deck. Users can insert and arrange elements, enter grouped objects, crop images, edit table cells, and edit rich text in place through TipTap. Selection geometry and object changes are command-based; an interrupted gesture rolls back. Text direction, formatting, paste, and line wrapping must preserve the displayed layout. See [ADR-009](adr/ADR-009-slide-renderer.md), [ADR-012](adr/ADR-012-stage-and-text-editing.md), [ADR-013](adr/ADR-013-text-formatting.md), and [ADR-016](adr/ADR-016-stage-crop-lines-groups.md).

**Working tree:** image edge handles crop or reveal the picture while corners size the full image; an actively edited text box can still be moved, resized, or rotated by its frame. Compact creation controls and a paragraph alignment/direction menu are also in progress. These rules are in [ADR-078](adr/ADR-078-stage-editing-refinements.md); they are not asserted as committed behavior.

## 3. Elements and media

The committed Elements browser offers shapes, graphics, emoji, icons, photos, clips, tables, and charts. Graphic and emoji choices insert self-contained editable SVG through one undoable command. Recent stickers are per-machine UI data, capped at 12, and are not part of the deck until inserted. Media providers, credentials, and external requests belong to Rust; the webview does not receive API keys. The `openai-api` provider is optional. See [ADR-051](adr/ADR-051-media-and-settings.md) and [ADR-075](adr/ADR-075-elements-and-presets.md).

**Working tree:** Elements gains a Designs collection with 250 complete, editable slide compositions, shown in sixteen groups by what they are for, with a search of their names. Choosing one inserts a new slide after the current slide in one undo step. Shapes and lines gain richer, direction-aware tile previews. See [ADR-079](adr/ADR-079-elements-designs.md).

Built-in icons, template images, fonts, and serialized templates are generated into a packaged `media/` resource beside the executable and served read-only in WebView2. Development imports the source resources. A saved deck's assets remain its own workspace assets. Optional image `smartFrame` metadata defines a decorative image opening; its artwork keeps its size when the image is resized, and the opening takes up the change ([ADR-086](adr/ADR-086-frames-keep-their-artwork.md)). See [ADR-074](adr/ADR-074-packaged-media-library.md).

## 4. Templates, layout, and design quality

The committed built-in catalog has 17 templates, including Shidur and Bina. Templates contain a theme, layouts, and sample slides; users can also save personal templates. A missing title or text layout is derived from that template's own content layout. Applying a template preserves unmatched slide content, and matching placeholders follow layout changes while manually adjusted elements retain their frame. Direction is mirrored where a template has no explicit alternative. See [ADR-023](adr/ADR-023-template-engine.md), [ADR-040](adr/ADR-040-templates-in-the-app.md), and [ADR-076](adr/ADR-076-template-layouts.md).

**Working tree:** the catalog gains an eighteenth template, Mifgash: a royal blue ground, a leaning band of a video call, and white cards with hot pink numbered tiles. A placeholder can give its text a colour in place of its text style’s, for text a layout seats on a card of its own; the text box keeps that colour, and it follows the placeholder when the slide changes layout or template. See [ADR-082](adr/ADR-082-mifgash-and-placeholder-colour.md).

Design Check measures rendered ink and reports deterministic findings for layout, contrast, text, and consistency. It runs automatically after deck edits. The status bar shows the total actionable findings; its compact list navigates to affected objects and can send the deck to the agent for repair. Informational notes stay out of this list. The agent automatically receives a defined subset of rules after writes. A template or agent-generated slide is judged against actual rendered content. See [ADR-018](adr/ADR-018-design-lint.md) and [ADR-063](adr/ADR-063-design-check-and-templates.md).

## 5. Animation, presentation, and export

`packages/runtime` plays timelines and slide transitions in the editor preview, presentation mode, and exported HTML. The committed preset catalog has 16 entrance, 14 emphasis, 16 exit, and 18 transition names; the runtime owns valid names used by the picker and agent tools. Presentation mode renders slides through `SlideRenderer` and binds keyboard, pointer, touch, fullscreen, links, and slide-number navigation. See [ADR-020](adr/ADR-020-runtime.md), [ADR-030](adr/ADR-030-present-mode.md), and [ADR-075](adr/ADR-075-elements-and-presets.md).

**Working tree:** transition controls open immediately below the row containing the chosen effect and scroll that control group into view. The underlying transition schema and playback remain the same. See [ADR-080](adr/ADR-080-transition-settings.md).

HTML export renders the deck into the shared slide DOM, waits for fonts and settled content, serializes shadow roots, embeds assets, and includes the shared runtime. The deck model is not embedded in the export. Users choose slide range and animation inclusion through the export dialog, accessible from the File menu. The output must open offline and preserve slide appearance and navigation. See [ADR-021](adr/ADR-021-html-export.md) and [ADR-032](adr/ADR-032-export-dialog-and-fonts.md).

## 6. AI chat and Deck API

The product exposes one AI chat. Each user turn sends current slide, selected elements, and selected text; the agent may refresh selection through `selection_get`. It can modify one text occurrence with `text_replace` without flattening other marks. Scope and target IDs keep slide and element actions available in that chat. Conversations, attachments, saved-deck continuation, outline approval, template drafts, and option galleries are represented in the chat. The former separate slide and object AI panels were superseded by [ADR-072](adr/ADR-072-one-ai-chat.md).

The agent harness is event-based. Its production adapter runs a restricted Claude CLI process; scripted runs support browser tests. `packages/agent-tools` defines protocol-independent, validated Deck API tools. Every write passes the same scope/transaction guard. The local MCP bridge authenticates and transports calls to the webview; it does not own tool logic. User-generated prompt data and current context are separated so a resumed CLI process does not receive stale deck state. See [ADR-001](adr/ADR-001-claude-cli-harness.md), [ADR-010](adr/ADR-010-agent-harness.md), [ADR-011](adr/ADR-011-deck-api.md), and [ADR-022](adr/ADR-022-mcp-bridge.md).

AI image jobs run provider calls with per-provider concurrency and cancellation. Returned bytes enter workspace assets. Credentials stay in the OS credential store and are absent from tool results and logs. See [ADR-025](adr/ADR-025-image-providers.md) and [ADR-051](adr/ADR-051-media-and-settings.md).

## 7. HTML import and conversion

An imported HTML file runs in a disposable isolated webview with limited IPC and blocked network access. General agent tools inspect the rendered page and identify slides; no deck-format-specific selectors are part of the core converter. The conversion engine measures rendered HTML, proposes native elements, and compares them with the source through `SlideRenderer`. Content that would lose visible fidelity remains an HTML object. Import output is validated before it changes the deck. The source file and report are saved for later inspection. See [ADR-017](adr/ADR-017-html-conversion-engine.md) and [ADR-036](adr/ADR-036-html-import.md).

**Working tree:** File and Welcome start import through a file picker and an import-scoped conversation in the AI panel. That conversation displays agent messages, approval, report, source access, and interrupted-import recovery. It appears beside ordinary deck conversations but keeps its own session and scope. The former import panel is removed, and old persisted panel state migrates. See [ADR-077](adr/ADR-077-import-conversation.md).

## 8. Security, performance, and verification

Deck HTML, SVG, CSS, and imported files must remain inside rendering and import boundaries. The desktop app enforces CSP and limited window capabilities; packaged media is read-only; native networking and secret storage stay in Rust. The release should preserve capture, editor, presentation, and export parity while honoring offline output. See [ADR-066](adr/ADR-066-packaging-and-hardening.md), [ADR-071](adr/ADR-071-bug-hunt-fixes.md), and [ADR-074](adr/ADR-074-packaged-media-library.md).

Verification spans pure model/runtime tests, TypeScript checks, browser E2E in both UI directions, visual baselines, real Tauri checks for native features, and packaged Windows checks. The [PLAN](PLAN.md) lists the current worktree gates. Historical ADR test counts describe their original runs only; this documentation update did not rerun the application suites.

## 9. Acceptance contract for the latest changes

| Area | Required behavior | Source state |
| --- | --- | --- |
| Editor shell | File, Export, Present, and document actions remain keyboard accessible; the slide is not obscured by the floating toolbar at fit zoom. Hebrew/English and light/dark layouts remain usable at narrow widths. | Committed refresh; title centering and Filmstrip select-all are working-tree refinements. |
| Templates | All 17 built-ins render their own layouts and sample slides. A missing title or text layout inherits the chosen template's visual language, while an explicit layout remains authoritative. Serialized packaged templates render like source templates. | Committed. |
| Elements | A graphic or emoji becomes a self-contained editable SVG in one undo step; recents do not become deck content by themselves. A ready-made design inserts a complete native slide, selects it, and undoes in one step. | First two behaviors committed; designs are working tree. |
| Motion | Every offered preset is accepted and played by the shared runtime in preview, presentation, and export. Choosing a transition exposes its controls next to that choice, including in a short panel and with reduced motion. | Presets committed; settings placement is working tree. |
| Import | Cancelling source selection does not alter the deck. The isolated page cannot use general app IPC or the network. The import conversation can show approval, source, measured report, and recovery after interruption, and can be reopened with its deck. | Isolation committed; unified conversation is working tree. |
| Stage editing | Every pointer gesture is one undoable transaction. For an ordinary image, edge drag changes the visible crop while corner drag sizes the image. An active text editor retains its caret and content while its frame is manipulated. | Transactions committed; edge and active-frame details are working tree. |
| Packaging and export | The installed app can read its generated media without exposing arbitrary resource paths. Standalone HTML works offline and retains the renderer's slide appearance, font resources, runtime, and supported links. | Committed; packaged release still needs an environment-specific verification run. |

The source-state labels in this table are part of the specification: a working-tree behavior must not be described as already released until it is committed and verified in the target environment.
