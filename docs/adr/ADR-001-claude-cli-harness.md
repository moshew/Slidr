# ADR-001 — Run Claude Code as a restricted long-lived CLI process

Status: Adopted. This is the current English summary of the decision. The original implementation log remains available in Git history.

## Decision and current interpretation

The first agent harness launches the Claude CLI directly from Rust with bidirectional stream-json. A separate Agent SDK sidecar is unnecessary. A turn can be interrupted through the CLI control message without killing the process; the following turn can reuse it. The adapter restricts built-in tools and user configuration while preserving the user's existing subscription login. These points were measured in the original Windows spike under `spikes/s1-claude-cli/`. The application-facing harness contract is in [ADR-010](ADR-010-agent-harness.md).
