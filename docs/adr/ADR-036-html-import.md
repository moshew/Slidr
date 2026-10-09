# ADR-036 — Import arbitrary HTML in an isolated webview

Status: Adopted; the import entry point is replaced by [ADR-077](ADR-077-import-conversation.md) in the current working tree. This is the current English summary of the decision. The original implementation log remains available in Git history.

## Decision and current interpretation

The imported file runs in its own disposable, private webview. A command gate allows only import-specific IPC calls, while CSP and a WebView2 request filter block external network access. The agent receives general DOM exploration and capture tools; the resulting slide data is validated in the main window before it changes the deck. The conversion engine is shared with other HTML-to-slide paths. Import source and a fidelity report remain with the workspace. The current working tree moves the user flow into the AI chat; see [ADR-077](ADR-077-import-conversation.md). The isolation and conversion rules remain in force.
