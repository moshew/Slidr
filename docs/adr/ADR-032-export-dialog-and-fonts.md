# ADR-032 — Export through a dialog with explicit font handling

Status: Adopted. This is the current English summary of the decision. The original implementation log remains available in Git history.

## Decision and current interpretation

The export dialog offers slide range and animation choices, opens a native save dialog, writes through Rust, then reports the file, assets, fonts, and relevant limits. Font assets are embedded and subset where possible so the standalone HTML preserves typography without network access. The export domain owns this UI; the underlying DOM serialization is defined in [ADR-021](ADR-021-html-export.md). A later File-menu entry is recorded in the design refresh and [ADR-074](ADR-074-packaged-media-library.md).
