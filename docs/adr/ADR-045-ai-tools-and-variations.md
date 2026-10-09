# ADR-045 — Represent AI actions and variations as chat data

Status: Partly superseded by [ADR-072](ADR-072-one-ai-chat.md), which replaced the three AI panels with one chat. This is the current English summary of the decision. The original implementation log remains available in Git history.

## Decision and current interpretation

Originally the app had separate deck, slide, and object AI panels. An action was a scoped prompt template, while `ui_present_options` stored candidate changes in an ephemeral gallery. Hover preview ran commands on a temporary deck; choosing an option applied one undoable batch. Image candidates could arrive progressively. [ADR-072](ADR-072-one-ai-chat.md) supersedes the three-panel navigation: the current UI has one AI chat, while context and target IDs preserve targeted actions and variation previews.
