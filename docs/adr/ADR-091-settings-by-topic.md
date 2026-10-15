# ADR-091 — The settings screen is a tab for each topic

Status: Implemented on 2026-10-15 in the working tree; not committed at the time of this record.

## Context

The settings screen (SPEC 4.2 ⚙) was one long column in the Tool Panel: the theme, the language, the agent, the image providers, the photo libraries, the fonts and "About and diagnostics", one under the other, each as a muted heading over bare controls. The user asked for a better-looking screen, split into sub-screens by topic.

## Decision

- **Five topics, a tab each**, in this order: General (theme and language, the shell's own), Agent, Images (the AI image providers and the stock photo libraries), Fonts, About. They are `SETTINGS_PAGES` in `src/settings/sections.ts`, each with its icon and tint. A section registers on a topic (`registerSettingsSection({ page, … })`), so an area still adds its part without editing the screen. A topic that nothing is registered on has no tab.
- **The tabs are tiles**, `TabsTileList` and `TabsTile` in `@slidr/ui`: an icon over a short label, the active one in the accent's soft tint, as the Activity Bar draws its panels. Five fit the narrowest Tool Panel (280 px) in both languages. They stay at the top while a tab scrolls.
- **Every tab has a header** (its mark, its name, one line about it) and the same layout: groups under a small heading, each a card of rows divided by hairlines, with a note under the card where needed (`SettingsGroup`, `SettingsCard`, `SettingsItem`, `SettingsRow`, `StatusPill` in `src/settings/layout.tsx`). A choice that shows itself (the theme's tiles, the language, the image quality) has no card around it. A section that is a whole tab (agent, fonts, about) has no heading of its own.
- **The theme is chosen by its picture**: three tiles, each a miniature of the app drawn in that theme's own tokens under `data-theme`; "System" is the same picture cut on the diagonal (`.theme-split` in `app.css`).
- **States are pills**: the agent's connection and each image provider show their state as a tinted pill with a dot; the agent's harness has its mark, as in the chat's setup.
- **A way in opens the right tab**: `openSettings(page)` in the shell. The chat and the model picker open the Agent tab; the media panel's "Open Settings" opens Images. The open tab is the shell's state and is not kept between runs; the screen opens on General.
- **Fonts**: the user's own fonts are a card of their own, each with a sample drawn in its face; the other sources are one card of rows that open to their lists.

## Consequences

- A test that looks for a section clicks its tab first (`[data-settings-tab="…"]`); every tab is `[data-settings-page="…"]`. The accessibility audit already walks the tabs of every panel.
- The heading "About and diagnostics" moved from its section to the tab's header, and the version from a line of text to a card in the colours of the title bar.

## Checks

- `e2e/editor-settings.spec.ts`: the tabs and their sections, the arrow keys between tabs, the way in from the media panel, and screenshots of every tab in both languages and both themes at 1366 × 768 (`test-results/editor/settings-<tab>-<lang>-<theme>-1366.png`). Each tab was also looked at full height at 2× and at the narrowest panel.
- `media-settings`, `hardening-about`, `shell-fonts`, `shell-agent`, `harness-setup`, `media-visual` pass. `shell.spec.ts` has two failures that do not concern settings and were there before (the saved store's version, the Filmstrip's height). The full accessibility audit could not run: its fixture's chart does not draw in this working tree. Run on the settings tabs alone, axe reports only that the Model list scrolls with the arrow keys rather than with Tab, which comes from the design system's Select and its 19 scripted models.
