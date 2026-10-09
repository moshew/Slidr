# ADR-072 — Use one AI chat with per-message editing context

Status: Adopted. This is the current English summary of the decision. The original implementation log remains available in Git history.

## Decision and current interpretation

The former deck, slide, and object AI tabs are replaced by one AI chat. Each turn supplies current slide, selected elements, and selected text; `selection_get` can refresh the same context during a turn. Text selection stays visible when focus moves to chat, and `text_replace` can change one occurrence without flattening other rich-text marks. Actions and option galleries carry explicit slide or element targets. This supersedes the navigation in [ADR-045](ADR-045-ai-tools-and-variations.md). HTML import joins the same chat surface in the current, uncommitted working tree ([ADR-077](ADR-077-import-conversation.md)).
