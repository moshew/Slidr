# ADR-027 — Run conversion and the agent inside the application

Status: Adopted. This is the current English summary of the decision. The original implementation log remains available in Git history.

## Decision and current interpretation

The HTML conversion engine runs in the hidden capture window; Rust passes opaque jobs without learning conversion semantics. `AgentService` orchestrates the generic harness, bridge, chat, and quality gate. A user turn and its quality corrections share one undo transaction. Normalized conversations are saved in the workspace, and scripted browser tests use a mock harness. The current UI has one general AI chat ([ADR-072](ADR-072-one-ai-chat.md)), and import joins that chat in the current working tree ([ADR-077](ADR-077-import-conversation.md)).
