# ADR-005 — Let an agent discover slides in arbitrary HTML

Status: Adopted. This is the current English summary of the decision. The original implementation log remains available in Git history.

## Decision and current interpretation

HTML import uses general exploration and capture tools instead of format-specific selectors. The agent locates slides and the conversion engine proposes editable objects. A fidelity guard compares rendered output and retains HTML where conversion would visibly diverge. Table support was a prerequisite for useful editability. This spike's approach was implemented by [ADR-017](ADR-017-html-conversion-engine.md) and [ADR-036](ADR-036-html-import.md); the current chat entry point is in [ADR-077](ADR-077-import-conversation.md).
