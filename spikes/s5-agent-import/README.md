# Spike S5: agent-led HTML import

Findings: `docs/adr/ADR-005-agent-led-import.md`. This is throwaway feasibility code.

```
pnpm install                                   # standalone install (own pnpm-workspace.yaml)
node fixtures/build.mjs                        # builds handwritten.html and reveal.html
node import.mjs <file.html> <label> [model]    # full run with the real Claude Code CLI
node dev-convert.mjs handwritten|reveal|reveal-stage|example   # capture engine only, no agent
S5_ROUNDS=1 node dev-guard-check.mjs           # injected-error test of the fidelity guard
```

`S5_DEBUG=1` saves per-round pictures and prints the per-element verdicts. Output goes to `out/`.

| File | Role |
|---|---|
| `page/import.js` | runs inside the isolated page: DOM outline, render-and-measure conversion, HTML copies |
| `lib/engine.mjs` | isolated page (Playwright, Edge), capture, backdrop, fidelity guard |
| `lib/render.mjs` | minimal model -> HTML renderer used by the guard |
| `lib/tools.mjs` | the import tools as the agent sees them |
| `lib/mcp.mjs` | minimal MCP-over-HTTP transport for the prototype |
| `prompts/import.md` | the import system prompt |
