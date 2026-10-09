# Slidr editor design refresh — specification

Date: 2026-10-07. Updated: 2026-10-09. This document refines the shell and editor layout in [the main specification](../SPEC.md). The 2026-10-09 notes describe uncommitted working-tree changes.

## Purpose

Make document actions, creation tools, and contextual editing tools easy to find without changing deck content or exported slides. The shell supports Hebrew and English, light and dark themes, keyboard use, and narrow panels.

## Layout

```text
┌ Title: File · Undo/Redo | deck name | Export · Present · window controls ┐
├ Navigation ┬ AI or tool panel ┬ Create: text · image · Elements · line · table… ┤
│            │                  │ Workspace                                   │
│            │                  │   Floating slide/selection toolbar          │
│            │                  │   Slide and nearby object controls          │
│            │                  ├ Filmstrip                                   │
└ Status: slide number · zoom · save state | AI · design check ──────────────┘
```

The order mirrors with the UI language. Text direction inside a deck follows the deck and paragraph settings, not the shell alone.

### Title and document actions

- The 56px title bar provides the File menu, Undo/Redo, deck name, Export, Present, and window controls. Its gradient must keep light text readable.
- The File menu offers New, Open, Recent, Import HTML, Save, Save As, Search, keyboard shortcuts, and the way back to the welcome screen. Export is also accessible there; its implementation stays in the export domain.
- In the current working tree, the product logo/name and open document name are centered together. The document name truncates within the available width, uses automatic text direction, and still shows unsaved state. Empty title-bar regions drag the window; controls remain clickable. Document editing actions are unavailable during startup and on the welcome screen. See [ADR-081](../adr/ADR-081-shell-navigation-polish.md).

### Creation and navigation

- The 2026-10-07 implementation used eight colored, labeled creation buttons in an 80px row. The committed Elements change (`fdb2036`) combines shapes, graphics, emoji, icons, photos, clips, tables, and charts in one browser. The working tree adds ready-made slide designs and richer shape/line previews ([ADR-079](../adr/ADR-079-elements-designs.md)).
- In the current working tree, the creation row uses compact icon buttons with accessible names. The navigation bar keeps large icons and short labels and scrolls when height is limited. A narrow tool panel can scroll its creation row horizontally.
- Animations and Transitions use the same plain icon treatment as the other navigation items in the current working tree. Ctrl+A selects every slide only when the Filmstrip list has focus ([ADR-081](../adr/ADR-081-shell-navigation-polish.md)).
- Zoom lives in the 32px status bar. Registered actions and popovers remain the source of behavior; shell controls do not duplicate domain commands.

### Workspace and selection tools

- The contextual toolbar is a rounded, floating surface within the Stage area. Space is reserved above the slide so the toolbar does not cover slide content when fit-to-window zoom is calculated.
- The toolbar changes with slide, object, or multiple selection. In the current working tree it omits the redundant selection label; the tools themselves keep accessible names.
- The floating object bar stays near the selected object. Crop, right-click menus, in-place text editing, preview, and keyboard focus use their existing domain behavior, with the interaction refinements recorded in [ADR-078](../adr/ADR-078-stage-editing-refinements.md).
- Transition settings appear below the selected effect row in the working tree and scroll into view on selection ([ADR-080](../adr/ADR-080-transition-settings.md)).

### Visual system

- Shared tokens in `packages/ui/src/theme.css` define both color schemes. Controls use approximately 12px corners; panels and floating surfaces use approximately 18px corners. Nested controls may use smaller radii.
- The shell uses lavender-gray surfaces, a vivid purple accent for selection and AI, and soft shadows to separate layers. The slide canvas and export content retain their own design.
- Decorative motion respects reduced-motion settings. No cloud-sharing control is shown without a working feature.

## Accessibility and acceptance

1. The File menu, Undo/Redo, Export, and Present work from the title bar; startup blocks document edits.
2. Every visible creation and contextual control has an accessible name and keyboard path. Color never carries the only meaning.
3. F6 moves among interface regions, including document actions; Alt+F10 reaches object controls. Pointer use and keyboard use preserve the documented focus return rules.
4. Hebrew/English × light/dark layouts fit at 1920×1032 and 1366×768, including a 45% tool panel, without hiding actions.
5. The contextual toolbar changes with selection and does not cover the slide in fit-to-window mode.
6. Typecheck, lint, design-rule checks, targeted E2E tests, and screenshots provide verification. A real Tauri window and installer need separate checks where noted in [the plan](PLAN.md).
