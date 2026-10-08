import { hebrewTags, lazy } from '../media/icons/library';
import {
  hebrewOf,
  searchIcons,
  wordsOf,
  type HebrewTags,
  type SearchWords,
} from '../media/icons/search';

/*
 * The colour art of the Elements panel: graphics in three styles, and every emoji. Each is a
 * drawing of an art set of the app's packages, and goes onto a slide as an `svg` element with
 * the drawing's own markup, so a deck carries it wherever it is opened.
 *
 * Nothing of it is loaded when the app starts. The two catalogues say what is offered, in what
 * order and under which words; a set's drawings are megabytes of JSON, read as text and parsed
 * the first time one of them is shown (as the icon library's are, `media/icons/library.ts`).
 */

export type StickerKind = 'graphic' | 'emoji';

/** The styles of graphics, in the order the panel shows them. */
export const GRAPHIC_STYLES = ['glossy', 'illustrated', 'outlined'] as const;
export type GraphicStyle = (typeof GRAPHIC_STYLES)[number];

/** Unicode's groups of emoji, in its order. */
export const EMOJI_GROUPS = [
  'smileys',
  'people',
  'animals',
  'food',
  'travel',
  'activities',
  'objects',
  'symbols',
  'flags',
] as const;
export type EmojiGroup = (typeof EMOJI_GROUPS)[number];

export interface Sticker extends SearchWords {
  /** `graphic:glossy:trophy-48`, `emoji:rocket`: the name of the element it becomes. */
  id: string;
  kind: StickerKind;
  /** A style of graphics, or a group of emoji. */
  group: string;
  /** The art set that draws it, and its name there. */
  set: ArtSet;
  art: string;
  /** What it is called, by the language of the interface. */
  label: { en: string; he: string };
}

/* ---------------------------------------------------------------- the drawings */

/** An art set as its package stores it: a drawing is the inside of an `<svg>`, and its box. */
interface Art {
  icons: Readonly<Record<string, { body: string; width?: number; height?: number }>>;
  width?: number;
  height?: number;
}

const ART = {
  'fluent-color': lazy<Art>(() => import('@iconify-json/fluent-color/icons.json?raw')),
  'streamline-kameleon-color': lazy<Art>(
    () => import('@iconify-json/streamline-kameleon-color/icons.json?raw'),
  ),
  'streamline-ultimate-color': lazy<Art>(
    () => import('@iconify-json/streamline-ultimate-color/icons.json?raw'),
  ),
  twemoji: lazy<Art>(() => import('@iconify-json/twemoji/icons.json?raw')),
};

export type ArtSet = keyof typeof ART;

/** The side of a drawing's box when neither it nor its set states one. */
const DEFAULT_BOX = 16;

/** A sticker as a whole SVG document, or undefined when its set no longer draws it. */
export async function stickerMarkup(sticker: Sticker): Promise<string | undefined> {
  const art = await ART[sticker.set]();
  const drawing = art.icons[sticker.art];
  if (!drawing) return undefined;
  const width = drawing.width ?? art.width ?? DEFAULT_BOX;
  const height = drawing.height ?? art.height ?? DEFAULT_BOX;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">${drawing.body}</svg>`;
}

/* ---------------------------------------------------------------- graphics */

/** The graphics catalogue: a style, the art set that draws it, and the drawings offered. */
export type GraphicsCatalog = readonly { id: string; set: string; icons: readonly string[] }[];

/** A drawing's name as words: without the size or the serial number its set ends it with. */
const spoken = (name: string) => name.replace(/(-\d+)+$/, '').replaceAll('-', ' ');

function graphic(style: string, set: ArtSet, art: string, hebrew: HebrewTags): Sticker {
  const name = spoken(art);
  const nameWords = wordsOf(name);
  const { terms, parts } = hebrewOf(nameWords, hebrew);
  return {
    id: `graphic:${style}:${art}`,
    kind: 'graphic',
    group: style,
    set,
    art,
    label: { en: name, he: name },
    filled: false,
    nameWords,
    tagWords: [],
    nameTerms: terms,
    nameHebrew: parts,
    tagTerms: [],
    tagHebrew: [],
  };
}

/** Every graphic, style by style. Its Hebrew words are the dictionary's for its English name. */
export function graphicsOf(catalog: GraphicsCatalog, hebrew: HebrewTags): Sticker[] {
  return catalog.flatMap(({ id, set, icons }) =>
    icons.map((art) => graphic(id, set as ArtSet, art, hebrew)),
  );
}

let graphics: Promise<Sticker[]> | undefined;

export function loadGraphics(): Promise<Sticker[]> {
  graphics ??= Promise.all([import('./graphics-catalog.json'), hebrewTags()])
    .then(([module, hebrew]) => graphicsOf(module.default, hebrew))
    .catch((error: unknown) => {
      graphics = undefined;
      throw error;
    });
  return graphics;
}

/* ---------------------------------------------------------------- emoji */

/** The emoji catalogue: a group's emoji, each a line of `|`-separated fields. */
export type EmojiCatalog = readonly { id: string; emoji: readonly string[] }[];

/** A keyword list as the search holds it: whole terms, and the single words they are made of. */
function keywords(list: string, known: ReadonlySet<string>) {
  const terms = new Set<string>();
  const parts = new Set<string>();
  for (const keyword of list.split(',')) {
    const words = wordsOf(keyword);
    if (words.length === 0) continue;
    terms.add(words.join(' '));
    for (const word of words) parts.add(word);
  }
  const fresh = (words: Set<string>) => [...words].filter((word) => !known.has(word));
  return { terms: fresh(terms), parts: fresh(parts) };
}

/** Every emoji of the catalogue, in its order: Unicode's own, group by group. */
export function emojiOf(catalog: EmojiCatalog): Sticker[] {
  return catalog.flatMap(({ id, emoji }) =>
    emoji.map((line): Sticker => {
      const [art = '', , en = '', enWords = '', he = '', heWords = ''] = line.split('|');
      const nameWords = wordsOf(en);
      const nameHebrew = wordsOf(he);
      const nameTerms = [nameHebrew.join(' ')];
      const english = keywords(enWords, new Set(nameWords));
      const hebrew = keywords(heWords, new Set([...nameTerms, ...nameHebrew]));
      return {
        id: `emoji:${art}`,
        kind: 'emoji',
        group: id,
        set: 'twemoji',
        art,
        label: { en, he: he || en },
        filled: false,
        nameWords,
        tagWords: english.parts,
        nameTerms,
        nameHebrew,
        tagTerms: hebrew.terms,
        tagHebrew: hebrew.parts,
      };
    }),
  );
}

let emoji: Promise<Sticker[]> | undefined;

export function loadEmoji(): Promise<Sticker[]> {
  emoji ??= import('./emoji-catalog.json')
    .then((module) => emojiOf(module.default))
    .catch((error: unknown) => {
      emoji = undefined;
      throw error;
    });
  return emoji;
}

/* ---------------------------------------------------------------- search */

/** The stickers that match every word of a query in Hebrew or English, best first. */
export function searchStickers(stickers: readonly Sticker[], query: string, count: number) {
  return searchIcons(stickers, query, { count });
}
