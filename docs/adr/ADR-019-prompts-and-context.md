# ADR-019 — Build stable system prompts and fresh turn context

Status: Adopted. This is the current English summary of the decision. The original implementation log remains available in Git history.

## Decision and current interpretation

`packages/prompts` exposes pure functions for a session system prompt and each turn's context block. The system prompt depends on scope and available tools, so a resumed CLI session does not carry stale slide identifiers or titles. The per-turn block contains the current deck, selection, change summary, and other mutable state as line-safe JSON. HTML conventions have one source in the prompts package. [ADR-072](ADR-072-one-ai-chat.md) adds selected text to current turn context.
