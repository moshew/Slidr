/**
 * The reference decks (`docs/reference-decks/*.html`) as the tests and the dev page read them:
 * the slides one by one, as the HTML an agent would hand to `slide_create_from_html`, and the
 * pictures they use as assets of a deck.
 */
import type { AssetMeta } from '@slidr/model';

const files = import.meta.glob<string>('../../../../docs/reference-decks/*.html', {
  eager: true,
  query: '?raw',
  import: 'default',
});
const pictures = import.meta.glob<string>('../../../../docs/reference-decks/images/*.webp', {
  eager: true,
  query: '?url',
  import: 'default',
});

export interface ReferenceSlide {
  /** `s01`, `s02`, ... */
  id: string;
  archetype: string;
  /** What the slide shows, in a word or two. */
  title: string;
  /** The slide alone, with the stylesheet the deck's slides share. */
  html: string;
}

export interface ReferenceDeck {
  /** The file name without its extension: `zerem`, `tzuk.en`. */
  id: string;
  /** The template derived from the deck: the first part of the id. */
  template: string;
  lang: string;
  dir: 'rtl' | 'ltr';
  /** The theme block of the file: the CSS variables the template's theme must equal. */
  themeCss: string;
  slides: ReferenceSlide[];
}

function part(doc: Document, name: string): string {
  return doc.querySelector(`style[data-part="${name}"]`)?.textContent ?? '';
}

/** The reference decks, in the order of their file names. */
export function referenceDecks(): ReferenceDeck[] {
  return Object.entries(files)
    .filter(([path]) => !path.endsWith('/index.html'))
    .map(([path, source]) => {
      const id = path.slice(path.lastIndexOf('/') + 1).replace(/\.html$/, '');
      const doc = new DOMParser().parseFromString(source, 'text/html');
      const shared = part(doc, 'deck');
      return {
        id,
        template: id.split('.')[0]!,
        lang: doc.documentElement.lang,
        dir: doc.documentElement.dir === 'ltr' ? 'ltr' : 'rtl',
        themeCss: part(doc, 'theme'),
        slides: Array.from(doc.querySelectorAll('section.slide'), (section) => ({
          id: section.id,
          archetype: section.getAttribute('data-archetype') ?? 'blank',
          title: section.getAttribute('data-title') ?? section.id,
          html: `<style>${shared}</style>\n${section.outerHTML}`,
        })),
      };
    });
}

export interface ReferenceAssets {
  /** The pictures as assets of a deck, by id: the sha256 of the file, as `data-asset` names it. */
  assets: Record<string, AssetMeta>;
  resolve(asset: AssetMeta): string | undefined;
}

let loaded: Promise<ReferenceAssets> | undefined;

/** The pictures of the reference decks, read once. */
export function referenceAssets(): Promise<ReferenceAssets> {
  loaded ??= (async () => {
    const assets: Record<string, AssetMeta> = {};
    const urls = new Map<string, string>();
    for (const [path, url] of Object.entries(pictures)) {
      const bytes = await (await fetch(url)).arrayBuffer();
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      const id = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join(
        '',
      );
      const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/webp' }));
      assets[id] = {
        id,
        file: `${id}.webp`,
        mime: 'image/webp',
        kind: 'image',
        bytes: bytes.byteLength,
        width: bitmap.width,
        height: bitmap.height,
        origin: 'ai',
        name: path.slice(path.lastIndexOf('/') + 1),
      };
      bitmap.close();
      urls.set(id, url);
    }
    return { assets, resolve: (asset) => urls.get(asset.id) };
  })();
  return loaded;
}
