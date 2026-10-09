# ADR-021 — Export standalone HTML from the rendered DOM

Status: Adopted. This is the current English summary of the decision. The original implementation log remains available in Git history.

## Decision and current interpretation

`exportHtml` renders every included slide at full logical size with `SlideRenderer`, waits for fonts and settled content, and serializes the live DOM including shadow roots. Assets become data URIs; animations and transitions are attached to each slide as runtime data. The deck model is not embedded in the file. The same playback script runs in the editor and exported file. [ADR-032](ADR-032-export-dialog-and-fonts.md) adds the export UI and font handling.
