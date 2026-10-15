import { fileURLToPath } from 'node:url';
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  // The template catalog and its pictures live in the media library beside the repository
  // (docs/media-library.md). Tests in a DOM environment load modules as a browser would, and
  // those may only read files the server allows.
  server: {
    fs: {
      allow: [
        fileURLToPath(new URL('./', import.meta.url)),
        fileURLToPath(new URL('../Slidr-media/', import.meta.url)),
      ],
    },
  },
  test: {
    include: [
      'packages/*/src/**/*.test.{ts,tsx}',
      'apps/*/src/**/*.test.{ts,tsx}',
      'apps/*/eval/**/*.test.{ts,tsx}',
      'apps/*/build/**/*.test.{ts,tsx}',
    ],
    // Real-browser tests have their own config: vitest.browser.config.ts (`pnpm test:browser`).
    exclude: [...configDefaults.exclude, '**/*.browser.test.{ts,tsx}'],
  },
});
