# ADR-010 — Define an event-based agent harness

Status: Adopted. This is the current English summary of the decision. The original implementation log remains available in Git history.

## Decision and current interpretation

`AgentHarness` describes and starts sessions; `AgentSession` accepts turns, cancellation, and closure. A manager owns active sessions, a guard normalizes terminal events, and each session streams events to the webview through one Tauri IPC channel. The UI consumes generic descriptors and `AgentEvent`, not a Claude-specific type. A scripted harness supports browser E2E tests; the production adapter uses the restricted CLI from [ADR-001](ADR-001-claude-cli-harness.md).
