import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { chartBundle, chartBundleSource, chartLibraryVersion } from './bundle.generated';

const src = dirname(fileURLToPath(import.meta.url));
const library = JSON.parse(
  readFileSync(
    join(realpathSync(join(src, '..', '..', 'node_modules', 'echarts')), 'package.json'),
    'utf8',
  ),
) as { version: string };

/** The same hash as in scripts/chartBundle.config.mjs: the library's version and every source. */
function sourceHash(): string {
  const hash = createHash('sha256');
  hash.update(`echarts@${library.version}\n`);
  const files = readdirSync(src)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && !f.endsWith('.generated.ts'))
    .sort();
  for (const file of files) {
    hash.update(`${file}\n${readFileSync(join(src, file), 'utf8').replace(/\r\n/g, '\n')}\n`);
  }
  return hash.digest('hex');
}

describe('the chart bundle', () => {
  it('was built from the sources and the library as they are now', () => {
    // An exported file carries the bundle, not the sources: a stale bundle would draw one chart
    // in the editor and another in the export. Rebuild with `pnpm --filter @slidr/renderer chart-bundle`.
    expect(chartBundleSource).toBe(sourceHash());
    expect(chartLibraryVersion).toBe(library.version);
  });

  it('is a script that can sit inside an HTML file', () => {
    expect(chartBundle).not.toMatch(/\bimport\s*[({'"]|\bexport\s/);
    // Nothing in it closes the script element or opens a comment, and no browser has `process`.
    expect(chartBundle).not.toMatch(/<\/script/i);
    expect(chartBundle).not.toContain('<!--');
    expect(chartBundle).not.toMatch(/\bprocess\.env\b/);
  });

  it('carries the notices its licences ask for', () => {
    expect(chartBundle.startsWith('/*!')).toBe(true);
    const banner = chartBundle.slice(0, chartBundle.indexOf('*/'));
    expect(banner).toContain(`Apache ECharts ${library.version}`);
    expect(banner).toContain('The Apache Software Foundation');
    expect(banner).toContain('Apache License, Version 2.0');
    expect(banner).toContain('ZRender');
    expect(banner).toContain('BSD 3-Clause');
  });

  it('holds the reduced library, not the whole of it', () => {
    // The whole library is 1.1 MB minified. A size far from this one means the build changed.
    expect(chartBundle.length).toBeGreaterThan(300_000);
    expect(chartBundle.length).toBeLessThan(700_000);
  });
});
