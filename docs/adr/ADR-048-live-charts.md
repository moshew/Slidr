# ADR-048 — Render editable charts as live SVG

Status: Adopted. This is the current English summary of the decision. The original implementation log remains available in Git history.

## Decision and current interpretation

Charts use ECharts with its SVG renderer. Pure transforms convert the model and theme into a data specification and then chart options; the same description drives the editor, capture window, and export. Chart code loads only when a chart appears, and settling waits for its drawing. Export includes a static SVG fallback and chart data for interactive playback without embedding the full deck model. Animation steps signal chart playback through DOM events, keeping the core runtime independent of ECharts.
