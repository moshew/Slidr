import { describe, expect, it } from 'vitest';
import { Template } from '@slidr/templates';
import { builtInTemplates } from '@slidr/templates/builtin';
import {
  isTemplatesModule,
  mediaFile,
  mediaModule,
  mediaOrigin,
  templateFiles,
  templatesModule,
} from './media.ts';

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

describe('the built-in templates as files of the media library', () => {
  const templates = builtInTemplates();
  const files = templateFiles(templates);

  it('are one file each, and an index that keeps their order', () => {
    const ids = templates.map((template) => template.theme.id);
    expect(JSON.parse(files.get('index.json')!)).toEqual(ids);
    expect([...files.keys()].sort()).toEqual(
      ['index.json', ...ids.map((id) => `${id}/template.json`)].sort(),
    );
  });

  it('read back as the templates the code makes, without their samples', () => {
    for (const { sample: _sample, assets: _assets, ...template } of templates) {
      const read = Template.parse(JSON.parse(files.get(`${template.theme.id}/template.json`)!));
      expect(read, template.theme.id).toEqual(template);
    }
  });

  it('are read by the module that stands in for their code, and only there', () => {
    expect(isTemplatesModule('C:\\repo\\apps\\desktop\\src\\templates\\builtIn.ts')).toBe(true);
    expect(isTemplatesModule('/repo/apps/desktop/src/templates/library.ts')).toBe(false);
    expect(isTemplatesModule('/repo/packages/templates/src/builtin/index.ts')).toBe(false);
    const module = templatesModule('http://media.localhost/');
    expect(module).toContain('fetch("http://media.localhost/templates/" + path)');
    expect(module).toContain('export const builtIn = await load()');
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
