# ADR-022 — Keep the integrated tool bridge transport-only

Status: Adopted. This is the current English summary of the decision. The original implementation log remains available in Git history.

## Decision and current interpretation

The desktop Rust bridge holds sessions, bearer tokens, pending calls, and timeouts. Each agent session registers exactly the tools that the TypeScript Deck API exposes for its scope. Calls cross one Tauri channel to the webview and return through IPC; tool failures become readable tool results. `rmcp` and `axum` implement local Streamable HTTP, while Rust does not define Deck API tool behavior. This integrates the transport spike in [ADR-002](ADR-002-mcp-bridge.md).
