import { describe, expect, it } from 'vitest';
import { mediaFile, mediaModule, mediaOrigin } from './media.ts';

describe('the place of an import in the media library', () => {
  it('is a folder by kind: fonts by family, icons by set, the photographs of the templates', () => {
    const store = 'C:/repo/node_modules/.pnpm';
    expect(
      mediaFile(
        `${store}/@fontsource-variable+heebo@5.3.0/node_modules/@fontsource-variable/heebo/files/heebo-hebrew-wght-normal.woff2?url`,
      ),
    ).toMatchObject({ path: 'fonts/heebo/heebo-hebrew-wght-normal.woff2', as: 'url' });
    expect(
      mediaFile(
        'C:\\repo\\apps\\desktop\\node_modules\\@fontsource\\alef\\files\\alef-latin-400-normal.woff2?url',
      ),
    ).toMatchObject({
      path: 'fonts/alef/alef-latin-400-normal.woff2',
      source:
        'C:/repo/apps/desktop/node_modules/@fontsource/alef/files/alef-latin-400-normal.woff2',
    });
    expect(mediaFile('/repo/docs/reference-decks/images/shvil-ridge.webp?url')?.path).toBe(
      'images/templates/shvil-ridge.webp',
    );
    expect(mediaFile('/repo/node_modules/lucide-static/icon-nodes.json?raw')).toMatchObject({
      path: 'icons/lucide/icon-nodes.json',
      as: 'text',
    });
    expect(mediaFile('/repo/node_modules/@tabler/icons/tabler-nodes-filled.json?raw')?.path).toBe(
      'icons/tabler/tabler-nodes-filled.json',
    );
    expect(mediaFile('/repo/apps/desktop/src/media/icons/hebrew.json?raw')?.path).toBe(
      'icons/hebrew.json',
    );
  });

  it('is none for what stays in the bundle', () => {
    for (const id of [
      // A font the interface itself is set in comes through its stylesheet, not as an address.
      '/repo/node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2',
      '/repo/node_modules/@fontsource-variable/inter/index.css',
      '/repo/node_modules/harfbuzzjs/dist/harfbuzz-subset.wasm?url',
      '/repo/node_modules/lucide-static/icon-nodes.json',
      '/repo/apps/desktop/src/i18n/he.json',
      '/repo/docs/reference-decks/zerem.html?raw',
    ]) {
      expect(mediaFile(id), id).toBeUndefined();
    }
  });
});

describe('what an import of a media file becomes in a build', () => {
  it('is the address of the file, or its text read from there', () => {
    const origin = mediaOrigin('windows');
    expect(origin).toBe('http://media.localhost/');
    expect(mediaModule({ path: 'fonts/alef/a.woff2', as: 'url' }, origin)).toBe(
      'export default "http://media.localhost/fonts/alef/a.woff2";\n',
    );
    const text = mediaModule({ path: 'icons/hebrew.json', as: 'text' }, origin);
    expect(text).toContain('fetch("http://media.localhost/icons/hebrew.json")');
    expect(text).toContain('export default await response.text();');
    expect(mediaOrigin('win32')).toBe('http://media.localhost/');
    expect(mediaOrigin('darwin')).toBe('media://localhost/');
  });
});
