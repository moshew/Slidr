import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  forgetMediaManifest,
  lazyMediaJson,
  MEDIA_LIBRARY_URL,
  mediaBase,
  mediaFiles,
  mediaUrl,
  readMediaJson,
  readMediaText,
  requireMediaJson,
} from './index';

/**
 * A site that answers `files` by their place in the library, and nothing else; with a manifest
 * that names them, unless `files` has a manifest of its own.
 */
function site(files: Record<string, string>) {
  const listed = Object.fromEntries(
    Object.keys(files).map((path) => [path, { size: 0, sha256: 'x' }]),
  );
  files = { 'manifest.json': JSON.stringify({ version: 1, files: listed }), ...files };
  const asked: string[] = [];
  const fetch = vi.fn((url: string) => {
    asked.push(url);
    const path = decodeURIComponent(url.slice(MEDIA_LIBRARY_URL.length));
    const text = files[path];
    return Promise.resolve({
      ok: text !== undefined,
      status: text === undefined ? 404 : 200,
      text: () => Promise.resolve(text ?? ''),
    });
  });
  vi.stubGlobal('fetch', fetch);
  return asked;
}

beforeEach(() => forgetMediaManifest());
afterEach(() => vi.unstubAllGlobals());

describe('where the media library is read from', () => {
  it('is the published site outside a page', () => {
    expect(mediaBase()).toBe(MEDIA_LIBRARY_URL);
    expect(mediaUrl('fonts/heebo/heebo latin.woff2')).toBe(
      `${MEDIA_LIBRARY_URL}fonts/heebo/heebo%20latin.woff2`,
    );
  });

  it('is the core protocol in the app, as WebView2 spells it on Windows', () => {
    vi.stubGlobal('isTauri', true);
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/141' });
    expect(mediaUrl('icons/hebrew.json')).toBe('http://media.localhost/icons/hebrew.json');
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)' });
    expect(mediaUrl('icons/hebrew.json')).toBe('media://localhost/icons/hebrew.json');
  });
});

describe('a read of the media library', () => {
  it('answers a file as text or as JSON', async () => {
    site({ 'icons/hebrew.json': '{"cat":"חתול"}' });
    expect(await readMediaText('icons/hebrew.json')).toBe('{"cat":"חתול"}');
    expect(await readMediaJson('icons/hebrew.json')).toEqual({ cat: 'חתול' });
  });

  it('comes to nothing, without throwing, for a file that cannot be had', async () => {
    site({ 'broken.json': '{' });
    expect(await readMediaText('missing.json')).toBeUndefined();
    expect(await readMediaJson('broken.json')).toBeUndefined();
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('Failed to fetch')));
    expect(await readMediaJson('icons/hebrew.json')).toBeUndefined();
    await expect(requireMediaJson('icons/hebrew.json')).rejects.toThrow(
      'The media library has no icons/hebrew.json.',
    );
  });

  it('is read once when it is lazy, and again after a failure', async () => {
    const words = lazyMediaJson<Record<string, string>>('icons/hebrew.json');
    site({});
    await expect(words()).rejects.toThrow();
    forgetMediaManifest();
    const asked = site({ 'icons/hebrew.json': '{"a":"b"}' });
    expect(await words()).toEqual({ a: 'b' });
    expect(await words()).toEqual({ a: 'b' });
    expect(asked.filter((url) => url.endsWith('hebrew.json'))).toHaveLength(1);
  });

  it('does not ask for a file the manifest does not name', async () => {
    const asked = site({ 'manifest.json': '{"version":1,"files":{}}', 'icons/hebrew.json': '{}' });
    expect(await readMediaJson('icons/hebrew.json')).toBeUndefined();
    expect(asked).toEqual([`${MEDIA_LIBRARY_URL}manifest.json`]);
  });
});

describe('the files of the media library', () => {
  it('are those its manifest names', async () => {
    site({ 'icons/hebrew.json': '{}' });
    expect([...(await mediaFiles())]).toEqual(['icons/hebrew.json']);
  });

  it('are none without a library, or with one that is empty', async () => {
    // No site at all: every request is not found.
    vi.stubGlobal('fetch', () =>
      Promise.resolve({ ok: false, status: 404, text: () => Promise.resolve('') }),
    );
    expect((await mediaFiles()).size).toBe(0);
    forgetMediaManifest();
    site({});
    expect((await mediaFiles()).size).toBe(0);
    forgetMediaManifest();
    site({ 'manifest.json': '<html>not a manifest</html>' });
    expect((await mediaFiles()).size).toBe(0);
  });
});
