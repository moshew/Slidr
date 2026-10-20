import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  changes,
  contentType,
  libraryPath,
  libraryReader,
  manifestOf,
  MAX_FILE_BYTES,
  mediaLibraryServer,
  stageLibrary,
  templateFiles,
  type Manifest,
} from './media.ts';

const dirs: string[] = [];
const servers: Server[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  for (const server of servers.splice(0)) server.close();
});

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'slidr-media-'));
  dirs.push(dir);
  return dir;
}

function write(root: string, path: string, text: string | Buffer) {
  const file = join(root, ...path.split('/'));
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
}

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

/** A site on this machine that answers `files`, and 404 for anything else. */
async function site(files: Map<string, string>): Promise<{ url: string; asked: string[] }> {
  const asked: string[] = [];
  const server = createServer((request, response) => {
    const path = decodeURIComponent((request.url ?? '/').slice(1));
    asked.push(path);
    const text = files.get(path);
    response.statusCode = text === undefined ? 404 : 200;
    response.end(text ?? 'not found');
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/`, asked };
}

describe('a path of the media library', () => {
  it('is plain names joined by slashes', () => {
    expect(libraryPath('/fonts/heebo/heebo%20latin.woff2')).toBe('fonts/heebo/heebo latin.woff2');
    expect(libraryPath('icons//hebrew.json')).toBe('icons/hebrew.json');
  });

  it('never climbs out of the library or names a drive', () => {
    for (const path of [
      '/',
      '',
      '/../secret',
      '/%2e%2e/secret',
      '/a/..%5Cb',
      '/C%3A/win.ini',
      '/%E0%A4%A',
    ]) {
      expect(libraryPath(path), path).toBeUndefined();
    }
  });

  it('is served with the type of its file', () => {
    expect(contentType('fonts/a.woff2')).toBe('font/woff2');
    expect(contentType('images/templates/a.WEBP')).toBe('image/webp');
    expect(contentType('templates/index.json')).toBe('application/json');
    expect(contentType('README')).toBe('application/octet-stream');
  });
});

describe('the built-in templates as files of the media library', () => {
  const catalog = {
    templates: [
      { theme: { id: 'zerem' }, layouts: [{ id: 'l1' }], sample: [{ id: 's' }], assets: { a: {} } },
      { theme: { id: 'tzuk' }, layouts: [] },
    ],
    pictures: { shvilRidge: { id: 'shvil-ridge', name: 'shvil-ridge.webp' } },
  };
  const files = templateFiles(catalog);

  it('are one file each, an index that keeps their order, and the pictures of their samples', () => {
    expect(JSON.parse(files.get('index.json')!)).toEqual(['zerem', 'tzuk']);
    expect([...files.keys()].sort()).toEqual(
      ['index.json', 'pictures.json', 'tzuk/template.json', 'zerem/template.json'].sort(),
    );
    expect(JSON.parse(files.get('pictures.json')!)).toEqual(catalog.pictures);
  });

  it('carry a template without its samples and their pictures', () => {
    expect(JSON.parse(files.get('zerem/template.json')!)).toEqual({
      theme: { id: 'zerem' },
      layouts: [{ id: 'l1' }],
    });
  });
});

describe('a publication of the media library', () => {
  it('stages the published folders, the files made from the catalog, and a manifest of them', () => {
    const source = tempDir();
    const target = tempDir();
    write(source, 'icons/hebrew.json', '{}');
    write(source, 'fonts/heebo/heebo-latin.woff2', 'font');
    write(
      source,
      'templates/catalog.json',
      JSON.stringify({ templates: [{ theme: { id: 'z' } }] }),
    );
    // The author's own: the generators' inputs, the archive, the files of the system.
    write(source, 'elements/source/frames.svg', '<svg/>');
    write(source, 'archive/old.json', '{}');
    write(source, 'icons/.DS_Store', '');
    write(source, 'images/Thumbs.db', '');
    write(target, 'stale.json', 'from the last publication');

    const manifest = stageLibrary(source, target, '2026-10-15T00:00:00.000Z');
    expect(Object.keys(manifest.files)).toEqual([
      'fonts/heebo/heebo-latin.woff2',
      'icons/hebrew.json',
      'templates/catalog.json',
      'templates/index.json',
      'templates/pictures.json',
      'templates/z/template.json',
    ]);
    expect(manifest.files['icons/hebrew.json']).toEqual({ size: 2, sha256: sha256('{}') });
    expect(manifest.published).toBe('2026-10-15T00:00:00.000Z');
    const staged = (path: string) => readFileSync(join(target, ...path.split('/')), 'utf8');
    expect(JSON.parse(staged('manifest.json'))).toEqual(manifest);
    expect(staged('fonts/heebo/heebo-latin.woff2')).toBe('font');
    expect(JSON.parse(staged('templates/index.json'))).toEqual(['z']);
    expect(staged('_headers')).toContain('Access-Control-Allow-Origin: *');
    // A missing file must be a 404, not the site's first page.
    expect(existsSync(join(target, '404.html'))).toBe(true);
    expect(existsSync(join(target, 'stale.json'))).toBe(false);
    expect(existsSync(join(target, 'elements'))).toBe(false);
  });

  it('of an empty copy is an empty manifest', () => {
    const manifest = stageLibrary(tempDir(), tempDir());
    expect(manifest.files).toEqual({});
  });

  it('refuses a file larger than the site takes', () => {
    const source = tempDir();
    write(source, 'images/huge.webp', Buffer.alloc(MAX_FILE_BYTES + 1));
    expect(() => stageLibrary(source, tempDir())).toThrow(/Cloudflare Pages takes up to/);
  });

  it('stages a large JSON catalog behind its unchanged logical manifest entry', () => {
    const source = tempDir();
    const target = tempDir();
    const text = JSON.stringify({ copy: 'a'.repeat(MAX_FILE_BYTES) });
    write(source, 'elements/designs/index.json', text);
    const manifest = stageLibrary(source, target);
    expect(manifest.files['elements/designs/index.json']).toEqual({
      size: Buffer.byteLength(text),
      sha256: sha256(text),
    });
    expect(existsSync(join(target, 'elements/designs/index.json'))).toBe(false);
    expect(existsSync(join(target, '_worker.js'))).toBe(true);
    const routes = JSON.parse(readFileSync(join(target, '_routes.json'), 'utf8')) as {
      include: string[];
    };
    expect(routes.include).toEqual(['/elements/designs/index.json']);
  });

  it('says what it adds, changes and takes away', () => {
    const before: Manifest = manifestOf(
      new Map([
        ['a.json', Buffer.from('1')],
        ['b.json', Buffer.from('2')],
      ]),
      'then',
    );
    const after = manifestOf(
      new Map([
        ['a.json', Buffer.from('1')],
        ['b.json', Buffer.from('3')],
        ['c.json', Buffer.from('4')],
      ]),
      'now',
    );
    expect(changes(before, after)).toEqual({ added: ['c.json'], changed: ['b.json'], removed: [] });
    expect(changes(after, before).removed).toEqual(['c.json']);
    expect(changes(undefined, after).added).toHaveLength(3);
  });
});

describe('the media library on the dev server', () => {
  it('reads a file from the site once, and keeps it for when the site is gone', async () => {
    const { url, asked } = await site(new Map([['icons/hebrew.json', '{"a":1}']]));
    const cache = tempDir();
    const read = libraryReader({ upstream: url, cache });
    for (let i = 0; i < 2; i++) {
      const words = await read('icons/hebrew.json');
      expect(words.status).toBe(200);
      expect(words.body?.toString()).toBe('{"a":1}');
    }
    expect(asked).toEqual(['icons/hebrew.json']);
    expect((await read('icons/missing.json')).status).toBe(404);

    // The next run of the server, without the network.
    servers.splice(0).forEach((server) => server.close());
    const offline = libraryReader({ upstream: 'http://127.0.0.1:9/', cache });
    expect((await offline('icons/hebrew.json')).body?.toString()).toBe('{"a":1}');
    expect((await offline('icons/other.json')).status).toBe(503);
  });

  it('forgets a file the site no longer has', async () => {
    const files = new Map([['icons/gone.json', '[]']]);
    const { url } = await site(files);
    const cache = tempDir();
    expect((await libraryReader({ upstream: url, cache })('icons/gone.json')).status).toBe(200);
    files.delete('icons/gone.json');
    expect((await libraryReader({ upstream: url, cache })('icons/gone.json')).status).toBe(404);
    expect(existsSync(join(cache, 'icons', 'gone.json'))).toBe(false);
  });

  it('tells the pages where it serves the library', () => {
    const plugin = mediaLibraryServer({ upstream: 'http://127.0.0.1:9/', cache: tempDir() });
    const config = (plugin.config as () => { define: Record<string, string> })();
    expect(config.define.__SLIDR_MEDIA_PATH__).toBe('"/media-library/"');
  });
});
