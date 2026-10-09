# Slidr — implementation plan

Updated: 2026-10-09. Companion: [SPEC](SPEC.md). This is the current plan and source audit. Earlier detailed task logs remain in Git history; the [ADR files](adr/) hold current English summaries of the decisions.

## 1. Source status

The committed baseline is `fdb2036` (2026-10-08). The table covers the commits from 2026-10-07 and 2026-10-08 and the relevant work present in the working tree on 2026-10-09. A working-tree row is an implementation in progress, not a released or verified feature.

| Change | Source | Decision and current work |
| --- | --- | --- |
| Saved-deck chat attachments | `5b15953` | Conversation and attachment behavior in [ADR-054](adr/ADR-054-ai-finish-templates-outline-chat.md). Keep reopened-deck attachment tests in the chat regression set. |
| SVG visibility and hidden rendering | `54942e3` | Renderer contract in [ADR-009](adr/ADR-009-slide-renderer.md). Check Stage, capture, and export parity. |
| Shidur and Bina templates | `b4a7211`, `62de1ae` | [ADR-076](adr/ADR-076-template-layouts.md); the committed built-in catalog contains 17 templates. |
| Editor design refresh | `6026d0d` | [Design refresh plan](design-refresh/PLAN.md) and [spec](design-refresh/SPEC.md). |
| Local `slides/` ignored | `ea5fd81` | Repository housekeeping; no product behavior. |
| Template-specific title/text layouts | `10f782f` | [ADR-076](adr/ADR-076-template-layouts.md). |
| Generated packaged media and image `smartFrame` | `dcda014` | [ADR-074](adr/ADR-074-packaged-media-library.md). Verify packaged resources. |
| File-menu export and serialized packaged templates | `abc5243` | [ADR-074](adr/ADR-074-packaged-media-library.md) and [design refresh spec](design-refresh/SPEC.md). |
| Elements browser, graphics/emoji stickers, expanded motion presets | `fdb2036` | [ADR-075](adr/ADR-075-elements-and-presets.md). |
| Import as an AI conversation | Working tree | [ADR-077](adr/ADR-077-import-conversation.md). The old import panel is removed in the working tree. |
| Image-edge crop, active text-frame handles, compact creation/alignment controls | Working tree | [ADR-078](adr/ADR-078-stage-editing-refinements.md). |
| Ten ready-made designs and richer shape/line tiles | Working tree | [ADR-079](adr/ADR-079-elements-designs.md). |
| Transition settings beside the chosen effect | Working tree | [ADR-080](adr/ADR-080-transition-settings.md). |
| Centered document identity and Filmstrip select-all | Working tree | [ADR-081](adr/ADR-081-shell-navigation-polish.md). |

The merge commit `25d32f6` adds no separate feature to this list. Historical ADRs that described an unmerged branch now describe the decision and point to the current source state. No code or test changes are part of this documentation update.

## 2. Delivery map

| Area | Current implementation | Next gate |
| --- | --- | --- |
| Model, commands, storage | Typed deck model, validated commands, grouped undo/redo, `.slidr` workspace persistence. | Keep old-deck migration, autosave recovery, and command-history tests green. |
| Renderer and Stage | One DOM renderer for editing, thumbnails, capture, presentation, and export; editable objects, groups, crop, text, tables, and charts. | Review the current image and text-handle changes across zoom, RTL, and group transforms. |
| Shell and design | Token-based bilingual UI; document actions, creation row, Elements, contextual toolbar, status zoom, and responsive panels. | Recheck focus order, keyboard use, narrow windows, and light/dark rendering after working-tree changes. |
| Templates and design check | 17 built-in templates, personal templates, layout fallback, design lint and fixes. | Test all built-ins and packaged serialized templates, including Hebrew/English and mirrored layouts. |
| AI and images | One AI chat, Deck API, restricted CLI harness, per-turn context, saved conversations, providers, variations, and agent quality gate. | Validate saved-deck attachments, cancellation, document ownership, and configured-provider paths. |
| HTML import/export | Isolated agent-led import with fidelity guard; self-contained HTML export using the shared renderer/runtime. | Test current chat-based import, interrupted recovery, packaged media, export parity, and offline output. |
| Motion and presentation | Shared runtime, animation timeline, transition presets, presentation mode. | Check the new transition settings placement and full picker/playback/export parity. |
| Packaging and safety | CSP, window/IPC boundaries, read-only bundled media, packaged-app suites. | Build and inspect the generated `media/` directory and run packaged Windows gates. |

The milestone names M0–M7 and workgroups WG0–WG13 in earlier plans are historical delivery organization. M1–M7 code has been integrated into the product; a milestone's old test count does not certify the present working tree. [ADR-070](adr/ADR-070-remaining-p1.md) records the last P1 implementation pass, and [ADR-071](adr/ADR-071-bug-hunt-fixes.md) records its bug-hunt pass.

## 3. Shared implementation rules

1. The schema and commands in `packages/model` own deck mutations. UI and agent operations use the same `CommandBus`, and one deliberate action or agent turn is one undo transaction ([ADR-007](adr/ADR-007-model-and-commands.md), [ADR-011](adr/ADR-011-deck-api.md)).
2. `SlideRenderer` owns the slide DOM at logical 1920×1080. Stage, hidden capture, presentation, HTML export, and visual checks must agree on the rendered result ([ADR-009](adr/ADR-009-slide-renderer.md)).
3. Agent tools are protocol-independent TypeScript functions; Rust handles restricted processes, storage, media, networking, and transport boundaries ([ADR-010](adr/ADR-010-agent-harness.md), [ADR-022](adr/ADR-022-mcp-bridge.md)).
4. HTML conversion proposes editable elements, measures fidelity against renderer output, and retains HTML for regions it cannot reproduce faithfully ([ADR-017](adr/ADR-017-html-conversion-engine.md)). Imported content runs in an isolated webview ([ADR-036](adr/ADR-036-html-import.md)).
5. Product strings, keyboard behavior, text direction, and layout work in Hebrew and English. Deck direction is separate from shell direction.
6. Built-in resources generated during packaging stay outside the source bundle and are served through the read-only media boundary ([ADR-074](adr/ADR-074-packaged-media-library.md)).

## 4. Completion criteria for the current work

- Confirm the working-tree import route from File and Welcome: cancel without deck mutation, initial request, approval, report, source access, interruption/restart, conversation switching, and persisted panel-state migration. Check browser E2E and the real Tauri file dialog separately.
- Confirm active text-frame and image-edge interactions with pointer and keyboard at several zoom levels, in nested/rotated groups, Hebrew and English decks, and after undo/redo. Check crop overlay and image `smartFrame` exceptions.
- Confirm each of the ten ready-made designs inserts an editable slide after the current slide, with localized preview/copy and a single undo step. Check the new shape and line previews in both deck directions.
- Confirm transition settings appear under the selected row, remain reachable in a narrow/scrolling panel, and do not change saved transition data or playback. Check reduced-motion scrolling.
- Confirm the centered title identity and window drag regions in both UI directions, and that Filmstrip Ctrl+A does not capture the shortcut from text or other controls.
- Run focused TypeScript/unit and Playwright suites for the changed domains, then the repository's normal check gate. Run a packaged Windows build for generated media, native capture, import isolation, export, and installer contents before claiming release readiness.
- Keep historic test numbers attached to their original runs. Record any new run with date, environment, command, and result. Documentation changes alone do not close a runtime gate.

## 5. Decision and evidence index

The [ADRs](adr/) describe the architecture and its evolution. In particular, [ADR-072](adr/ADR-072-one-ai-chat.md) supersedes the three AI tabs in ADR-045; [ADR-077](adr/ADR-077-import-conversation.md) updates the import entry point in ADR-036; [ADR-078](adr/ADR-078-stage-editing-refinements.md) updates Stage interaction details; and [ADR-079](adr/ADR-079-elements-designs.md), [ADR-080](adr/ADR-080-transition-settings.md), and [ADR-081](adr/ADR-081-shell-navigation-polish.md) record additional current working-tree changes. Git history contains the original detailed implementation logs and test reports for all compressed ADRs.
