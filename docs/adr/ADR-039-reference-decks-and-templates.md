# ADR-039 — Derive the first built-in templates from reference decks

Status: Adopted. This is the current English summary of the decision. The original implementation log remains available in Git history.

## Decision and current interpretation

The first three reference decks are self-contained HTML examples under `docs/reference-decks/`. Their themes and content roles informed the initial built-in templates, and the index compares source slides with template-produced slides. Layout direction is mirrored from the Hebrew base; specific exceptions can be defined by a template. The original visual-quality review was a human decision point, so historical test measurements are not a claim that every template meets a universal design threshold. Later built-in templates and fallback layouts are recorded in [ADR-063](ADR-063-design-check-and-templates.md) and [ADR-076](ADR-076-template-layouts.md).
