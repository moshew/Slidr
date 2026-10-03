import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';

// The whole E2E suite with a dev server of its own, so a second working tree can run it next to a
// session that holds the app's port, 1420 (see ../playwright.config.ts, which this mirrors):
//   pnpm exec playwright test -c e2e/templates.playwright.config.ts
const PORT = 1481;

export default defineConfig({
  testDir: '.',
  outputDir: '../test-results/.playwright-templates',
  fullyParallel: true,
  workers: 3,
  forbidOnly: Boolean(process.env.CI),
  reporter: [['list']],
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
