# ADR-008 — Share design tokens and register shell extensions

Status: Adopted. This is the current English summary of the decision. The original implementation log remains available in Git history.

## Decision and current interpretation

UI tokens live in `packages/ui/src/theme.css`; Radix-based components and Lucide icons consume them. Light and dark colors follow `color-scheme`, with a subtree override through `data-theme`. Feature domains register panels and tools with the shell instead of editing the shell's internals. i18next supports live Hebrew and English switching. The later editor redesign changes layout and control placement; see the design-refresh PLAN and SPEC.
