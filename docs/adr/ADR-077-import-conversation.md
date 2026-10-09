# ADR-077 — Show HTML import as a conversation in the AI chat

Status: Implemented in the current working tree on 2026-10-09; **not committed** at the time of this record. The code and tests may change before commit. This updates the user flow described in [ADR-036](ADR-036-html-import.md) and extends [ADR-072](ADR-072-one-ai-chat.md).

## Context

The committed application has one general AI chat but still opens HTML import in a separate Activity Bar panel. Import already has its own agent session, saved source, capture report, approval, and interrupted-import recovery. The user should see the import request, agent plan, capture progress, and subsequent conversation in one chat surface.

## Decision in the working tree

- The File menu and welcome screen register and invoke an `import` action. In Tauri, it opens the system HTML file dialog; the browser test path uses a file picker. A cancelled dialog leaves the current document alone. `startImport` creates a deck only when needed, opens the isolated import page, then sends the first request to the import session.
- The AI panel can show a deck conversation or the import conversation associated with the open deck. It lists them together by latest activity, but each keeps its own `SessionScope`, agent conversation, and harness lifecycle. A normal AI action switches back to the deck conversation.
- `ImportChat` reuses the chat component. The application's own approval, interrupted-import recovery, source-file actions, and measured import report appear after the agent messages. An imported deck can reopen its import conversation; an interrupted import opens that conversation so Continue is visible.
- The former import panel is removed. Persisted shell state migrates its `activePanel: 'import'` value to the AI panel (storage version 3). This is a shell migration, not a deck-schema change.

## Limits and verification

The file remains isolated during capture; showing its conversation in the AI panel does not grant the deck session file access. The report is still computed from import state and deck measurements, not from the agent's prose. The working tree changes tests in `apps/desktop/src/import/flow.test.ts`, `apps/desktop/src/ai/sessions.test.ts`, and import/AI E2E files. These tests have not been run as part of this documentation update, so the record describes the implementation visible in the working tree rather than a verified release.
