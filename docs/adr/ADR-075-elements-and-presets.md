# ADR-075 — One Elements browser and named animation presets

Status: Implemented in `fdb2036` on 2026-10-08. This record describes committed code in `HEAD`.

## Context

Insertion was spread across the top tools and separate media and object libraries. The animation panel also exposed fewer choices than the runtime could represent. A unified browser needs to preserve the existing element types, undo model, localization, and accessibility.

## Decision

- `apps/desktop/src/elements/` provides one Elements panel for shapes, graphics, emoji, icons, photos, clips, tables, and charts. Its home screen offers collections, cross-collection search, and recently used stickers. The source catalogs and generated graphics/emoji lists live in this domain; grids defer artwork loading until near the viewport.
- A graphic or emoji inserts as a self-contained editable SVG element through one `element.add` command and one undo step. Recent choices are kept per machine in `localStorage`, up to 12 entries, with their markup so the row can render before a catalog loads. They are not deck content until inserted.
- The runtime owns the valid preset names in `packages/runtime/src/names.ts`, separate from DOM playback. There are 16 entrance, 14 emphasis, and 16 exit names, plus 18 transition names at this commit. The picker, agent-facing names, runtime definitions, and export paths use these lists. An unknown preset falls back to a category-appropriate effect rather than breaking playback.
- The animation and transition panels display effect choices with previews while retaining the existing timeline and trigger model. Hebrew and English labels are registered for the new controls.

## Consequences and checks

The SVG inserted into a deck must remain self-contained and editable after reopening; recents must not be mistaken for deck assets. The new catalogs and third-party artwork require the build's license notices. Coverage was added in `apps/desktop/src/elements/stickers.test.ts`, `apps/desktop/e2e/elements-panel.spec.ts`, animation E2E files, and `packages/runtime/src/presets.test.ts`. This record documents the committed tests; it does not claim a fresh run for this documentation change.

See also [ADR-014](ADR-014-objects.md), [ADR-031](ADR-031-animations-panel.md), and [ADR-051](ADR-051-media-and-settings.md).
