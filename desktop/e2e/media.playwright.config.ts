import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';

// The suites of the media side (WG3-T08, WG5-T11, T13, WG12-T03 to T07): the settings screen, the
// media panel, stock photos, icons and the image placeholders. A dev server of their own, so they
// run next to a session that holds the app's port, 1420 (see ../playwright.config.ts):
//   pnpm exec playwright test -c e2e/media.playwright.config.ts
//
// With SLIDR_E2E=app the same server runs every suite of the app, as ../playwright.config.ts
// would: for a worktree, where port 1420 answers with another checkout's code.
// In a plain browser the keychain, the image providers, the stock sources and the agent are the
// in-memory stand-ins of each area.
const PORT = 1521;
const app = process.env.SLIDR_E2E === 'app';

export default defineConfig({
  testDir: '.',
  testMatch: app ? /.*\.spec\.ts/ : /media-.*\.spec\.ts/,
  fullyParallel: true,
  // Several sessions share this machine, each with a browser suite of its own.
  workers: 3,
  forbidOnly: Boolean(process.env.CI),
  reporter: [['list']],
  outputDir: '../test-results/.playwright-media',
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
