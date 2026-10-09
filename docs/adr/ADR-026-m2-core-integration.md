# ADR-026 — Integrate the M2 core behind shared contracts

Status: Adopted. This is the current English summary of the decision. The original implementation log remains available in Git history.

## Decision and current interpretation

The M2 core combined the HTML conversion engine ([ADR-017](ADR-017-html-conversion-engine.md)), design lint ([ADR-018](ADR-018-design-lint.md)), prompts ([ADR-019](ADR-019-prompts-and-context.md)), and tool bridge ([ADR-022](ADR-022-mcp-bridge.md)). It added the optional `Slide.archetype` needed for slides produced from HTML without a layout and reconciled interfaces among the packages. At this historical checkpoint the pieces were not yet wired into the running app; [ADR-027](ADR-027-agent-in-the-app.md) documents that later integration. Read this record as the contract handoff, not as current product status.
