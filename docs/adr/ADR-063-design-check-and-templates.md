# ADR-063 — Expose design findings and expand templates

Status: Adopted. This is the current English summary of the decision. The original implementation log remains available in Git history.

## Decision and current interpretation

The user design-check panel shares measured lint findings with the status bar, offers object navigation, deterministic fixes, and AI fixes. Agent-returned rules remain a selected subset, while extra user-facing rules cover more design checks. Master layout elements provide slide numbers and deck footers without new schema fields. Seven templates expanded the built-in library from three to ten at this milestone; later additions bring the catalog to 17 ([ADR-076](ADR-076-template-layouts.md)). Each template is tested against its own layouts, including mirrored direction.

## Addition: the slide number chosen as a template is applied (2026-10-14)

The card that spreads a template's slides over the Stage has a button beside "Apply to the deck": "Slide numbering", with the # icon, tinted while it is pressed (on) and an outline while it is not. It starts as the open deck has it, the slides in the card follow it, and the template is applied with the number shown or hidden in the same undo step (`switchCommands` takes the choice). On the template the deck is already on, the button hides or shows the deck's number at once, as the panel's own control does. A template whose layouts draw no number shows no button. Covered by `actions.test.ts` and `design-master.spec.ts`.
