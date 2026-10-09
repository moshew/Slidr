# ADR-017 — Convert rendered HTML with a fidelity guard

Status: Adopted. This is the current English summary of the decision. The original implementation log remains available in Git history.

## Decision and current interpretation

`packages/html-import` measures a rendered subtree, proposes model elements, renders them through the real `SlideRenderer`, then compares the result with the source. Regions that differ visibly remain `html` objects, preserving fidelity at the cost of editability. Text positions follow rendered measurements; HTML fallback starts from the original markup and stylesheets. One conversion host supplies screenshot and asset services. The engine serves agent-created slides, object conversion, and imported slide capture.
