import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.{ts,tsx}', 'apps/*/src/**/*.test.{ts,tsx}'],
    // Until the first package has tests; remove once `model` lands (WG1).
    passWithNoTests: true,
  },
});
