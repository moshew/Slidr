import { defineConfig } from '@playwright/test';

// E2E and visual regression run against the Vite frontend with Tauri IPC mocked (SPEC 14.5).
// The `msedge` channel is the installed Edge: the same Chromium engine WebView2 uses,
// and it needs no browser download.
export default defineConfig({
  testDir: './e2e',
  // Playwright empties its output folder at the start of every run. Screenshots written for the
  // design gate live next to it (`test-results/<area>/`), so they survive the next run.
  outputDir: './test-results/.playwright',
  fullyParallel: true,
  // Half the cores by default is too many here: every test drives a full editor, and with a
  // dozen at once they time out waiting for a stable frame.
  workers: 6,
  forbidOnly: Boolean(process.env.CI),
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:1420',
    channel: 'msedge',
    viewport: { width: 1920, height: 1032 },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:1420',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
