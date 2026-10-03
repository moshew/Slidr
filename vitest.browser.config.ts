import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

// Tests that need a real layout engine (HTML conversion, lint measurements): `*.browser.test.ts`.
// They run headless in the installed Edge, the same Chromium engine WebView2 uses, served by
// Vitest itself on its own port. No dev server and no app, so they do not touch port 1420.
export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.browser.test.{ts,tsx}', 'apps/*/src/**/*.browser.test.{ts,tsx}'],
    browser: {
      enabled: true,
      headless: true,
      screenshotFailures: false,
      provider: playwright({ launchOptions: { channel: 'msedge' } }),
      instances: [{ browser: 'chromium', viewport: { width: 1920, height: 1080 } }],
    },
  },
});
