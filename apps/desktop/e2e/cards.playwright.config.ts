import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';

// The suites of the cards track (a converted slide as groups, and working inside a group on the
// Stage as in PowerPoint) with a dev server of their own, so they run next to a session that
// holds the app's port, 1420 (see ../playwright.config.ts), or another track's:
//   pnpm exec playwright test -c e2e/cards.playwright.config.ts
//
// With SLIDR_E2E=app the same server runs every suite of the app, each at the viewport its own
// config gives it: the runtime's at 1280x720 (runtime.playwright.config.ts), the rest at the
// editor's size.
//
// Two runs at once need two servers: SLIDR_E2E_PORT gives the second one its own port, and
// `--output` its own output folder.
const PORT = Number(process.env.SLIDR_E2E_PORT) || 1623;
const app = process.env.SLIDR_E2E === 'app';
const runtime = /runtime-.*\.spec\.ts/;
// By the name of the file, not by its path: the worktrees themselves are folders with "cards-"
// in their names.
const own = /[\\/]cards-[^\\/]*\.spec\.ts$/;

export default defineConfig({
  testDir: '.',
  fullyParallel: true,
  // Several sessions share this machine, each with a browser suite of its own.
  workers: 3,
  forbidOnly: Boolean(process.env.CI),
  reporter: [['list']],
  outputDir: '../test-results/.playwright-cards',
  // The baselines are named as the other configs name them, without the project: one picture
  // for a test, whichever config ran it.
  snapshotPathTemplate: '{testDir}/{testFilePath}-snapshots/{arg}-{platform}{ext}',
  use: {
    baseURL: `http://localhost:${PORT}`,
    channel: 'msedge',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'cards',
      testMatch: app ? /.*\.spec\.ts/ : own,
      testIgnore: runtime,
      use: { viewport: { width: 1920, height: 1032 } },
    },
    ...(app
      ? [{ name: 'runtime', testMatch: runtime, use: { viewport: { width: 1280, height: 720 } } }]
      : []),
  ],
  webServer: {
    command: `pnpm exec vite --port ${PORT} --strictPort`,
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
