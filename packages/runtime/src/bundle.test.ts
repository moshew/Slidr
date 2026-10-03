import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { playerBundle, playerBundleSource } from './bundle.generated';

const src = dirname(fileURLToPath(import.meta.url));

/** The same hash as in scripts/bundle.config.mjs: every source file, by name, with LF line ends. */
function sourceHash(): string {
  const hash = createHash('sha256');
  const files = readdirSync(src)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && !f.endsWith('.generated.ts'))
    .sort();
  for (const file of files) {
    hash.update(`${file}\n${readFileSync(join(src, file), 'utf8').replace(/\r\n/g, '\n')}\n`);
  }
  return hash.digest('hex');
}

describe('the runtime bundle', () => {
  it('was built from the sources as they are now', () => {
    // An exported file carries the bundle, not the sources: a stale bundle would play one runtime
    // in the editor and another in the export. Rebuild with `pnpm --filter @slidr/runtime bundle`.
    expect(playerBundleSource).toBe(sourceHash());
  });

  it('is a script that can sit inside an HTML file', () => {
    expect(playerBundle.startsWith('(function')).toBe(true);
    expect(playerBundle).not.toMatch(/\bimport\s|\bexport\s/);
  });
});
