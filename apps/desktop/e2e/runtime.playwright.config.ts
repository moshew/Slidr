import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';

// The runtime and export suites (WG8, WG9B) with a dev server of their own, so they run next to
// a session that holds the app's port, 1420 (see ../playwright.config.ts):
//   pnpm exec playwright test -c e2e/runtime.playwright.config.ts
const PORT = 1437;

export default defineConfig({
  testDir: '.',
  testMatch: /runtime-.*\.spec\.ts/,
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  reporter: [['list']],
  outputDir: '../test-results/runtime',
  use: {
    baseURL: `http://localhost:${PORT}`,
    channel: 'msedge',
    viewport: { width: 1280, height: 720 },
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
