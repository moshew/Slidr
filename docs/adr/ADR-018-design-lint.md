# ADR-018 — Separate deterministic design rules from DOM measurement

Status: Adopted. This is the current English summary of the decision. The original implementation log remains available in Git history.

## Decision and current interpretation

`@slidr/lint` evaluates model and measurement data without DOM access. `@slidr/renderer` measures painted text and objects; the desktop adapter renders and connects them for the agent and user. Findings describe actual visible ink for overflow, margins, collisions, and contrast rather than only bounding boxes. A rule registry marks which findings return automatically after agent writes. [ADR-063](ADR-063-design-check-and-templates.md) adds the user panel, fixes, and further user-only rules.
