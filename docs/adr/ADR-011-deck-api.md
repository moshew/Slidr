# ADR-011 — Expose a protocol-independent Deck API

Status: Adopted. This is the current English summary of the decision. The original implementation log remains available in Git history.

## Decision and current interpretation

`packages/agent-tools` defines each tool with a name, input schema, scope, write flag, optional service, and implementation. `createDeckApi(bus, services)` lists and calls tools without MCP or React dependencies. Every mutation goes through `ctx.write`, which enforces scope, gathers change summaries, and joins the agent turn's transaction. The Rust bridge only transports these calls ([ADR-022](ADR-022-mcp-bridge.md)). The unified chat and text selection extensions are in [ADR-072](ADR-072-one-ai-chat.md).
