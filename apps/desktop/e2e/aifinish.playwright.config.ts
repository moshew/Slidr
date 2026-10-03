import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';

// The suites of the rest of the AI side (WG7-T11, WG11-T04/T05/T11, WG10-T09/T10): templates
// made by the agent, the look of the deck in the deck tool, the outline flow, and the chat's
// picker, usage, conversations, attachments and suggestions. They have a dev server of their
// own, so they run next to a session that holds the app's port, 1420 (see ../playwright.config.ts):
//   pnpm exec playwright test -c e2e/aifinish.playwright.config.ts
// `agent-*` and `aitools-*` are the suites of the chat and of the three tools (ADR-027, ADR-045)
// and run here too: these suites change the same panels. With `SLIDR_E2E=app` every suite of the
// app runs here instead.
// In a plain browser the agent is the scripted mock (src/agent/pageAgent.ts); a test picks the
// script by writing `slidr.agent` to localStorage.
const PORT = 1531;

export default defineConfig({
  testDir: '.',
  testMatch:
    process.env.SLIDR_E2E === 'app' ? /.*\.spec\.ts/ : /(?:aifinish|aitools|agent)-.*\.spec\.ts/,
  fullyParallel: true,
  workers: 3,
  forbidOnly: Boolean(process.env.CI),
  reporter: [['list']],
  outputDir: '../test-results/.playwright-aifinish',
  use: {
    baseURL: `http://localhost:${PORT}`,
    channel: 'msedge',
    viewport: { width: 1920, height: 1032 },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `pnpm exec vite --port ${PORT} --strictPort`,
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
