# ADR-042 — Measure agent design quality with a repeatable evaluation set

Status: Adopted. This is the current English summary of the decision. The original implementation log remains available in Git history.

## Decision and current interpretation

The evaluation set defines ten fixed requests and runs them through the real app and CLI, collecting the deck, transcript, tool outcomes, and lint findings. Deterministic metrics are computed from those artifacts; visual quality remains a human score and is never filled in automatically. Web access was disabled for comparable runs, and image generation was simulated during most tuning. The prompt was adjusted to describe actual supported features. This record establishes the measurement method; its historical score and run state should not be read as fresh validation of the current working tree.
