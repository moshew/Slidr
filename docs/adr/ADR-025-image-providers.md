# ADR-025 — Run image generation through a cancellable provider service

Status: Adopted. This is the current English summary of the decision. The original implementation log remains available in Git history.

## Decision and current interpretation

One provider call produces one image; a job fans out calls up to the provider's concurrency limit. The caller chooses the job ID, and cancellation signals the provider and waits for process cleanup. Providers return image bytes, which the service imports into workspace assets. Results return with the IPC call while events report progress. `codex-cli` is the initial provider; `openai-api`, settings, and key storage are covered by [ADR-051](ADR-051-media-and-settings.md).
