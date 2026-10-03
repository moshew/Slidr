import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'packages/*/src/**/*.test.{ts,tsx}',
      'apps/*/src/**/*.test.{ts,tsx}',
      'apps/*/eval/**/*.test.{ts,tsx}',
    ],
    // Real-browser tests have their own config: vitest.browser.config.ts (`pnpm test:browser`).
    exclude: [...configDefaults.exclude, '**/*.browser.test.{ts,tsx}'],
  },
});
