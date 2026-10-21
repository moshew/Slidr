import { createHash } from 'node:crypto';
import { createSlide } from '@slidr/model';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { designFiles } from '../../build/media';

/*
 * The designs read in one language, and the pictures made of them (ADR-109), from a library the
 * publisher's own `designFiles` wrote: what it writes is what the app reads.
 */

const MEDIA = 'https://slidr-media.pages.dev/';
const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');
const slide = (id: string) => ({ ...createSlide(), id });

const authored = {
  groups: ['deck'],
  groupIds: { deck: ['cover', 'quote'] },
  subjects: {},
  slides: {
    cover: { he: slide('c-he'), en: slide('c-en'), de: slide('c-de') },
    quote: { he: slide('q-he'), en: slide('q-en') },
  },
};

interface Revs {
  designs: Record<string, Record<string, string>>;
}

/**
 * A published library of `authored` and `files`: with the files of each language and their words
 * when `written`, as the publisher writes them, and then the files `more` adds for those words.
 */
function publish(
  files: Record<string, string> = {},
  {
    written = true,
    more,
  }: { written?: boolean; more?: (revs: Revs) => Record<string, string> } = {},
) {
  const all: Record<string, string> = {
    'elements/designs/index.json': JSON.stringify(authored),
    'images/designs/cover.webp': 'cover',
    ...files,
  };
  const made = designFiles(
    new Map(Object.entries(all).map(([path, text]) => [path, Buffer.from(text)])),
  );
  if (written) for (const [path, text] of made) all[`elements/designs/${path}`] = text;
  Object.assign(all, more?.(JSON.parse(made.get('revs.json')!) as Revs));
  const manifest = {
    version: 1,
    files: Object.fromEntries(
      Object.entries(all).map(([path, text]) => [
        path,
        { size: text.length, sha256: sha256(text) },
      ]),
    ),
  };
  all['manifest.json'] = JSON.stringify(manifest);
  const asked: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      const path = decodeURIComponent(url.slice(MEDIA.length));
      asked.push(path);
      const text = all[path];
      return Promise.resolve({
        ok: text !== undefined,
        status: text === undefined ? 404 : 200,
        text: () => Promise.resolve(text ?? ''),
      });
    }),
  );
  return asked;
}

/** The modules afresh: each reads the library once, and keeps what it read. */
const designs = () => import('./designs');
const thumbs = () => import('./designThumbs');

beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllGlobals());

describe('the designs of a language', () => {
  it('are read from the file the publisher wrote for it, not from the whole catalog', async () => {
    const asked = publish();
    const read = await (await designs()).loadDesigns('de-DE');
    expect(read.ids).toEqual(['cover']);
    expect(read.designLanguages('cover')).toEqual(['he', 'en', 'de']);
    expect(read.designSlide('cover', 'de', 'photo').elements).toEqual([]);
    expect(asked).toContain('elements/designs/de/index.json');
    expect(asked).not.toContain('elements/designs/index.json');
  });

  it('are none in a language the publication drew none in, without reading the whole', async () => {
    const asked = publish();
    expect((await (await designs()).loadDesigns('fr')).ids).toEqual([]);
    expect(asked).not.toContain('elements/designs/index.json');
  });

  it('are read from the whole catalog of a library published without the files', async () => {
    const asked = publish({}, { written: false });
    const read = await (await designs()).loadDesigns('de');
    expect(read.ids).toEqual(['cover']);
    expect(read.designLanguages('quote')).toEqual(['he', 'en']);
    expect(asked).toContain('elements/designs/index.json');
  });

  it('are read from the whole catalog when the file of the language is of another one', async () => {
    // As a copy pulled from the site and published by a publisher that does not write the files.
    const stale = {
      ...authored,
      slides: {},
      languages: {},
      from: { 'elements/designs/index.json': 'old' },
    };
    const asked = publish(
      { 'elements/designs/de/index.json': JSON.stringify(stale) },
      { written: false },
    );
    expect((await (await designs()).loadDesigns('de')).ids).toEqual(['cover']);
    expect(asked).toContain('elements/designs/index.json');
  });
});

describe('the pictures of the designs made ahead', () => {
  const pictures = (revs: Revs, word = revs.designs.de!.cover!) => ({
    'images/designs/thumbs/index.json': JSON.stringify({
      widths: [640, 320],
      designs: { de: { cover: word } },
    }),
    'images/designs/thumbs/320/de/cover.webp': 'small',
    'images/designs/thumbs/640/de/cover.webp': 'large',
  });

  it('are shown at the widths they were made at, while the design is as it was drawn', async () => {
    publish({}, { more: (revs) => pictures(revs) });
    const thumb = await (await thumbs()).loadDesignThumbs();
    expect(thumb('cover', 'de')).toEqual({
      src: `${MEDIA}images/designs/thumbs/640/de/cover.webp`,
      srcSet: `${MEDIA}images/designs/thumbs/320/de/cover.webp 320w, ${MEDIA}images/designs/thumbs/640/de/cover.webp 640w`,
    });
    expect(thumb('cover', 'he')).toBeUndefined();
  });

  it('are not shown of a design that has changed since', async () => {
    publish({}, { more: (revs) => pictures(revs, 'an older word') });
    expect((await (await thumbs()).loadDesignThumbs())('cover', 'de')).toBeUndefined();
  });

  it('are not shown when the words are not of the library published', async () => {
    publish(
      {
        'elements/designs/revs.json': JSON.stringify({
          from: { 'elements/designs/index.json': 'old' },
          designs: {},
        }),
      },
      { written: false, more: (revs) => pictures(revs) },
    );
    expect((await (await thumbs()).loadDesignThumbs())('cover', 'de')).toBeUndefined();
  });
});
