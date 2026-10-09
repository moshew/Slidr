# ADR-054 — Let the agent draft templates and propose an outline

Status: Adopted. This is the current English summary of the decision. The original implementation log remains available in Git history.

## Decision and current interpretation

The agent may produce a template draft from a description or supplied sources. Layout HTML is converted with the existing engine, checked with lint, previewed in chat, and saved to the personal library only after a user action. A topic-only deck request can first produce an outline card; approval triggers construction. The chat supports model and effort selection, multiple conversations, attachments, and continuation from a saved transcript when CLI resume fails. Current navigation uses the single chat from [ADR-072](ADR-072-one-ai-chat.md); saved-deck attachment support was extended in `5b15953`.
