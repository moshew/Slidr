import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';

// The runtime, present-mode and export suites (WG8, WG9B) with a dev server of their own, so they
// run next to a session that holds the app's port, 1420 (see ../playwright.config.ts):
//   pnpm exec playwright test -c e2e/runtime.playwright.config.ts
//
// With SLIDR_E2E=app the same server runs the app's other suites instead, as ../playwright.config.ts
// would: for a worktree, where port 1420 answers with another checkout's code.
const PORT = 1437;
const app = process.env.SLIDR_E2E === 'app';
const own = /runtime-.*\.spec\.ts/;

export default defineConfig({
  testDir: '.',
  testMatch: app ? /.*\.spec\.ts/ : own,
  testIgnore: app ? own : [],
  fullyParallel: true,
  // Several sessions share this machine, each with a browser suite of its own.
  workers: 3,
  forbidOnly: Boolean(process.env.CI),
  reporter: [['list']],
  outputDir: app ? '../test-results/.playwright' : '../test-results/runtime',
  use: {
    baseURL: `http://localhost:${PORT}`,
    channel: 'msedge',
    viewport: app ? { width: 1920, height: 1032 } : { width: 1280, height: 720 },
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
