# ADR-076 — Built-in templates own their simple layouts

Status: Implemented by `b4a7211`, `62de1ae`, and `10f782f` on 2026-10-07–08.

## Context

The built-in library gained the webinar-oriented `shidur` design and the AI-introduction `bina` design. Simple title and text slides previously looked generic when a template had no explicit version of those layouts. A generic slide ignored the selected template's title placement, framing, footer, and colors.

## Decision

- The built-in list now contains 17 templates. `shidur` and `bina` each have their own theme, layouts, and sample slides. `bina` also has artwork and images in `docs/reference-decks/`.
- `withStandardLayouts` adds missing `title` and `text` layouts to a template using its existing content layouts as the source for title position and style, background, frame, and footer decorations. A template that already defines either layout keeps its own implementation.
- The generated sample slides use the same layouts, and the library inserts them in layout order. This rule applies to older personal templates as well as built-ins; it adds no new deck schema field.

## Consequences and checks

Template authors can draw special simple layouts explicitly; otherwise the fallback must use the template's own design. Tests in `packages/templates/src/standardLayouts.test.ts` and `master.test.ts` cover the derived layouts, and desktop template tests cover selection and previews. This record does not imply a new test run.

See also [ADR-039](ADR-039-reference-decks-and-templates.md), [ADR-040](ADR-040-templates-in-the-app.md), and [ADR-063](ADR-063-design-check-and-templates.md).
