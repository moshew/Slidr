# ADR-003 — Capture slides with WebView2 rather than DOM image reconstruction

Status: Adopted. This is the current English summary of the decision. The original implementation log remains available in Git history.

## Decision and current interpretation

Slide PNG capture uses `Page.captureScreenshot` through the WebView2 DevTools protocol in a dedicated hidden, full-size rendering window. The spike found that native capture met the latency target while preserving browser rendering better than `html-to-image`, particularly for free CSS. The capture window is also used for conversion work described in [ADR-027](ADR-027-agent-in-the-app.md).
