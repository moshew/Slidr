import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { bundledPackages, noticesText } from './notices.ts';

const require = createRequire(import.meta.url);

describe('the third-party notices (WG13-T05)', () => {
  it('finds the package a bundled module came from, with its licence and its text', () => {
    const react = require.resolve('react');
    const found = bundledPackages([
      react,
      // A module of the same package again, with a query, and one of the app itself.
      `${react}?v=1`,
      new URL('../src/main.tsx', import.meta.url).pathname,
    ]);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ name: 'react', license: 'MIT' });
    expect(found[0]!.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(found[0]!.texts.join('\n')).toContain('Permission is hereby granted');
  });

  it('lists who is in the app, and writes each licence text once', () => {
    const mit = 'MIT License\n\nPermission is hereby granted…';
    const text = noticesText(
      { name: 'Slidr', version: '0.1.0' },
      [
        {
          name: 'alpha',
          version: '1.0.0',
          license: 'MIT',
          homepage: 'https://a.example',
          texts: [mit],
        },
        // The same words with other line breaks are the same licence.
        {
          name: 'beta',
          version: '2.0.0',
          license: 'MIT',
          texts: ['MIT License\nPermission is hereby granted…'],
        },
      ],
      [{ name: 'gamma', version: '3.0.0', license: 'Apache-2.0 OR MIT', texts: [mit, 'Apache…'] }],
    );
    expect(text).toContain('Slidr 0.1.0: third-party notices');
    expect(text).toContain('In the interface: libraries, fonts and icons (2)');
    expect(text).toContain('alpha 1.0.0  |  MIT  |  https://a.example');
    expect(text).toContain('In the core: Rust crates (1)');
    expect(text).toContain('gamma 3.0.0  |  Apache-2.0 OR MIT');
    expect(text).toContain('----- alpha 1.0.0, beta 2.0.0, gamma 3.0.0 -----');
    expect(text.split('Permission is hereby granted')).toHaveLength(2);
    expect(text).toContain('----- gamma 3.0.0 -----\n\nApache…');
  });

  it('says so when the crates could not be listed, instead of listing none', () => {
    const text = noticesText({ name: 'Slidr', version: '0.1.0' }, [], undefined);
    expect(text).toContain('In the core: Rust crates (not listed: Cargo was not available');
  });
});
