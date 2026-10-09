# ADR-060 — Complete the editor shell and contextual tools

Status: Adopted. This is the current English summary of the decision. The original implementation log remains available in Git history.

## Decision and current interpretation

The Stage context menu is assembled from domain registrations, and a floating selection toolbar is positioned by the Stage. Group bounds are refitted through shared model composition so one action stays one undo step. Registered shortcuts feed the shortcut map; the welcome screen replaces the editor until a document opens in the desktop app. Text effects use an existing per-element CSS field, and slide links use `#slide=<id>`. The design refresh later moves document actions, creation tools, and zoom; see its [plan](../design-refresh/PLAN.md) and [specification](../design-refresh/SPEC.md).
