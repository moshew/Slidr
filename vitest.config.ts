import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'packages/*/src/**/*.test.{ts,tsx}',
      'apps/*/src/**/*.test.{ts,tsx}',
      'apps/*/eval/**/*.test.{ts,tsx}',
      'apps/*/build/**/*.test.{ts,tsx}',
    ],
    // Real-browser tests have their own config: vitest.browser.config.ts (`pnpm test:browser`).
    exclude: [...configDefaults.exclude, '**/*.browser.test.{ts,tsx}'],
    // Tests read the media library from its site. happy-dom asks another origin with OPTIONS
    // before any request, where a browser asks a plain GET straight away; the site, Cloudflare
    // Pages, refuses OPTIONS. So in happy-dom a read goes as in Node.
    environmentOptions: {
      happyDOM: { settings: { fetch: { disableSameOriginPolicy: true } } },
    },
  },
});
