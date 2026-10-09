# ADR-071 — Close the bug-hunt findings at their owning boundaries

Status: Adopted. This is the current English summary of the decision. The original implementation log remains available in Git history.

## Decision and current interpretation

The Windows bug-hunt pass reproduced and addressed findings across rendering, import, agent writes, template switching, and editing. Agent tool calls are tied to the document and turn that started them, preventing writes after Stop or a document switch. SVG, HTML, and CSS content are kept inert in editor, presentation, and export. `element.replace` was added for conversion of one child in a group. The original record identifies a few known limits, including imported CSS counters, multi-face font assets, and cost of a killed CLI turn; those are not claims of new fixes.
