# ADR-069 — Carry cloud-found fixes into the desktop codebase

Status: Adopted. This is the current English summary of the decision. The original implementation log remains available in Git history.

## Decision and current interpretation

The cloud pass added `asset.remove`, which rejects removal while a deck still references an asset, plus shell slide-mark registration and several Stage, Filmstrip, link, template, and variation fixes. Its original Linux-only verification was later complemented by the Windows work in [ADR-070](ADR-070-remaining-p1.md) and [ADR-071](ADR-071-bug-hunt-fixes.md); the historical Linux caveat is not a current branch status. Asset removal and safe link schemes remain the architectural decisions.
