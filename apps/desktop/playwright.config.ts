import { defineConfig } from '@playwright/test';

// E2E and visual regression run against the Vite frontend with Tauri IPC mocked (SPEC 14.5).
// The `msedge` channel is the installed Edge: the same Chromium engine WebView2 uses,
// and it needs no browser download.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
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
