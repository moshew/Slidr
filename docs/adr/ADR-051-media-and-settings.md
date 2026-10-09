# ADR-051 — Keep media providers and credentials in the native layer

Status: Adopted. This is the current English summary of the decision. The original implementation log remains available in Git history.

## Decision and current interpretation

API keys are stored in the operating system credential store and are never returned to the webview; error messages are scrubbed before they cross into UI or agent output. Provider settings live in `settings.json`. Network requests go through a Rust HTTPS boundary, and stock image selection passes provider IDs rather than arbitrary URLs. The optional `openai-api` image provider supports exact masked edits. The media panel exposes stock images and the icon library. [ADR-074](ADR-074-packaged-media-library.md) later moves bundled media into generated package resources; [ADR-075](ADR-075-elements-and-presets.md) adds the unified Elements browser.
