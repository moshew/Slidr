import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';

// The suites of the three AI tools and the variations gallery (WG11-T04 to T10), with a dev
// server of their own, so they run next to a session that holds the app's port, 1420 (see
// ../playwright.config.ts):
//   pnpm exec playwright test -c e2e/aitools.playwright.config.ts
// `agent-*` are the deck chat's suites (ADR-027) and run here too: the chat is shared.
// In a plain browser the agent is the scripted mock (src/agent/pageAgent.ts); a test picks the
// script by writing `slidr.agent` to localStorage.
const PORT = 1501;

export default defineConfig({
  testDir: '.',
  testMatch: /(?:aitools|agent)-.*\.spec\.ts/,
  fullyParallel: true,
  workers: 3,
  forbidOnly: Boolean(process.env.CI),
  reporter: [['list']],
  outputDir: '../test-results/.playwright-aitools',
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
