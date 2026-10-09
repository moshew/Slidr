# ADR-002 — Forward MCP calls through a local bridge

Status: Adopted. This is the current English summary of the decision. The original implementation log remains available in Git history.

## Decision and current interpretation

The transport uses `rmcp` Streamable HTTP over `axum`, bound to loopback, with a session route and bearer token. Tool names, descriptions, and schemas come from TypeScript; Rust only authenticates and forwards calls to the webview. The original spike verified text and image tool results through Claude Code. [ADR-022](ADR-022-mcp-bridge.md) records the integrated bridge and its per-session registration.
