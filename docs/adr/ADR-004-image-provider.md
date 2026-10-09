# ADR-004 — Use Codex CLI as the default image provider

Status: Adopted. This is the current English summary of the decision. The original implementation log remains available in Git history.

## Decision and current interpretation

The initial default provider uses the existing ChatGPT login through `codex-cli`, avoiding a required API key. An optional `openai-api` provider offers API-based generation and exact masked editing when configured; see [ADR-051](ADR-051-media-and-settings.md). A request for several images runs separate provider calls in parallel. The original Windows spike under `spikes/s4-codex-images/` measured generation, concurrency, reference editing, and output discovery. [ADR-025](ADR-025-image-providers.md) defines the provider service used by the app.
