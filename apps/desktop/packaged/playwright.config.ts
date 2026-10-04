import { defineConfig } from '@playwright/test';

// The suites that drive the packaged app (WG13; ADR-066), not a page of the dev server:
// `slidr.exe` as `tauri build` made it, reached over the WebView2 DevTools port.
//
//   pnpm --filter @slidr/desktop tauri build --config e2e/hardening.tauri.conf.json
//   pnpm --filter @slidr/desktop exec playwright test -c packaged/playwright.config.ts
//
// That runs the five suites that are a gate: smoke, build, security, recovery, import. Two more
// are run when asked for, each by its own switch:
//
//   SLIDR_PERF=1        --project=perf     the measurements of SPEC 14.4; about ten minutes
//   SLIDR_REAL_AGENT=1  --project=agent    the agent against the real CLI; costs money
//
// One app at a time: there is one debugging port, and one data folder under the identifier the
// binary was built with (see app.ts). A spec starts the app itself, so each begins clean.
export default defineConfig({
  testDir: '.',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  reporter: [['list']],
  outputDir: '../test-results/.playwright-packaged',
  timeout: 120_000,
  expect: { timeout: 10_000 },
  projects: [
    { name: 'smoke', testMatch: /smoke\.spec\.ts/ },
    { name: 'build', testMatch: /build\.spec\.ts/ },
    { name: 'security', testMatch: /security\.spec\.ts/ },
    { name: 'recovery', testMatch: /recovery\.spec\.ts/ },
    { name: 'import', testMatch: /import\.spec\.ts/ },
    ...(process.env.SLIDR_PERF ? [{ name: 'perf', testMatch: /perf\.spec\.ts/ }] : []),
    ...(process.env.SLIDR_REAL_AGENT ? [{ name: 'agent', testMatch: /agent\.spec\.ts/ }] : []),
  ],
});
