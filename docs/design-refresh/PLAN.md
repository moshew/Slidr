# Slidr editor design refresh — implementation plan and status

Created: 2026-10-07. Updated: 2026-10-09. Requirements: [SPEC.md](SPEC.md).

## Committed implementation

| Step | Work | Status and evidence |
|---|---|---|
| 1. Design tokens | Update colors, surfaces, corner radii, shadows, and large icon sizing | Committed in `6026d0d`; `packages/ui/src/theme.css` and `components/icon.tsx` |
| 2. Document actions | Put File, Undo/Redo, Export, and Present in the title bar; keep startup and focus rules | Committed in `6026d0d`; `DocumentTools.tsx`, `TitleBar.tsx`, `a11y/panes.ts` |
| 3. Creation and navigation | Add the creation row, move zoom to status, and support scrolling navigation | Committed in `6026d0d`; `TopTools.tsx`, `ActivityBar.tsx`, `StatusBar.tsx`, `ZoomMenu.tsx` |
| 4. Contextual tools | Place the slide/selection toolbar in the workspace and reserve slide space | Committed in `6026d0d`; `StageRegion.tsx`, `SelectionToolbar.tsx` |
| 5. First verification | Focused E2E, design rules, accessibility, color/language combinations, screenshots, frontend build | Reported in the original 2026-10-07 run; see details below |
| 6. File and Elements follow-up | Move Export into the File menu and add the Elements browser | Committed in `abc5243` and `fdb2036`; see [ADR-075](../adr/ADR-075-elements-and-presets.md) |

The first verification reported 106 unit tests, 63 passing tests in the final focused E2E run, 11 new design-refresh E2E cases, and eight screenshots under ignored `apps/desktop/test-results/design-refresh/`. It used Edge and a simulated backend. Those counts describe that run, not a fresh check of today's working tree. The frontend build completed; a packaged installer and real Tauri visual review were not part of that run.

## Current working-tree follow-up

The following changes are present locally on 2026-10-09 and are **not committed**:

- Use compact, accessible icon buttons in the creation row and remove the redundant selection label in the contextual row (`TopTools.tsx`, `ActivityBar.tsx`).
- Keep the HTML import in the AI chat instead of a separate navigation panel ([ADR-077](../adr/ADR-077-import-conversation.md)).
- Refine Stage handles, image-edge crop behavior, in-place text-frame dragging, and paragraph alignment ([ADR-078](../adr/ADR-078-stage-editing-refinements.md)).
- Add 250 editable slide designs, in sixteen groups, and richer, direction-aware shape/line previews to Elements ([ADR-079](../adr/ADR-079-elements-designs.md)).
- Show transition settings beside the selected effect and scroll them into view ([ADR-080](../adr/ADR-080-transition-settings.md)).
- Center the product/document identity in the title bar, simplify navigation icons, and add Filmstrip Ctrl+A ([ADR-081](../adr/ADR-081-shell-navigation-polish.md)).

Before treating this follow-up as complete, run typecheck and the focused design-refresh, import, Elements, animation, Stage, and text E2E files against the final working tree, then inspect the four language/theme combinations and a real Tauri window. The modified tests are present but have not been run for this documentation update.
