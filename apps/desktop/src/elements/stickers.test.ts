import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { HebrewTags } from '../media/icons/search';
import {
  EMOJI_GROUPS,
  emojiOf,
  GRAPHIC_STYLES,
  graphicsOf,
  searchStickers,
  stickerMarkup,
  type EmojiCatalog,
  type GraphicsCatalog,
} from './stickers';

/*
 * The two catalogues against the art sets: as the app's packages ship them, or as the drawings
 * taken from a larger set were copied into `art/`. The data is read here from the files; the app
 * reads the same files through the bundler, when it first needs them (`stickers.ts`).
 */

const file = (path: string) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8')) as unknown;

const sets = new Map<string, Record<string, unknown>>();

/** A set's drawings: the ones copied into `art/`, or the whole of its package. */
function art(set: string) {
  const path = `../../../../../Slidr-media/elements/art/${set}.json`;
  if (!sets.has(set)) sets.set(set, (file(path) as { icons: Record<string, unknown> }).icons);
  return sets.get(set)!;
}

/** The copied drawings that grow the existing styles and establish the fourth. */
const COPIED = {
  glossy: [
    ['fluent-emoji', 365],
    ['noto', 35],
  ],
  illustrated: [
    ['fluent-emoji-flat', 365],
    ['streamline-stickies-color', 35],
  ],
  outlined: [
    ['streamline-emojis', 304],
    ['streamline-flex-color', 96],
  ],
  handdrawn: [['streamline-freehand-color', 986]],
} as const;
const COUNTS = { glossy: 599, illustrated: 533, outlined: 1178, handdrawn: 986 };

const graphicsCatalog = file('../../../../../Slidr-media/elements/catalogs/graphics-catalog.json') as GraphicsCatalog;
const graphics = graphicsOf(graphicsCatalog, file('../../../../../Slidr-media/icons/hebrew.json') as HebrewTags);
const emoji = emojiOf(file('../../../../../Slidr-media/elements/catalogs/emoji-catalog.json') as EmojiCatalog);

const ids = (found: readonly { id: string }[]) => found.map(({ id }) => id);

describe('the graphics', () => {
  it('come in four styles, each of drawings its sets still have', () => {
    expect(graphicsCatalog.map(({ id }) => id)).toEqual([...GRAPHIC_STYLES]);
    for (const { id, icons } of graphicsCatalog) {
      expect(icons).toHaveLength(COUNTS[id as keyof typeof COUNTS]);
    }
    expect(graphics.filter((graphic) => !(graphic.art in art(graphic.set)))).toEqual([]);
    expect(graphics).toHaveLength(3296);
    expect(new Set(ids(graphics)).size).toBe(graphics.length);
  });

  it('copy only the offered drawings and their licence notices', () => {
    for (const style of GRAPHIC_STYLES) {
      for (const [set, count] of COPIED[style]) {
        const taken = graphics.filter(
          ({ group, set: source }) => group === style && source === set,
        );
        expect(taken).toHaveLength(count);
        expect(Object.keys(art(set)).sort()).toEqual(taken.map((one) => one.art).sort());
        expect(file(`../../../../../Slidr-media/elements/art/${set}.notice.json`)).toMatchObject({
          name: `@iconify-json/${set}`,
          license: expect.stringMatching(/^(MIT|Apache-2.0|CC-BY-4.0)$/) as string,
          text: expect.stringMatching(/Microsoft|Streamline|Google/) as string,
        });
      }
      const names = graphics.filter(({ group }) => group === style).map(({ label }) => label.en);
      const twice = new Set(names.filter((name, at) => names.indexOf(name) !== at));
      const newSets = new Set<string>(COPIED[style].map(([set]) => set));
      expect(
        graphics.filter(
          ({ group, set, label }) => group === style && newSets.has(set) && twice.has(label.en),
        ),
        style,
      ).toEqual([]);
    }
    // The two Fluent sets draw the same subjects: a subject is in one of the two styles.
    const flat = new Set(Object.keys(art('fluent-emoji-flat')));
    expect(Object.keys(art('fluent-emoji')).filter((name) => flat.has(name))).toEqual([]);
  });

  it('leave out the logos and characters of other firms', () => {
    expect(
      ids(graphics).filter((id) => /(?:^|-)logo(?:-|$)|spongebob|pokeball|blackberry/.test(id)),
    ).toEqual([]);
  });

  it('are found by an English word of their name, and by its Hebrew', () => {
    expect(ids(searchStickers(graphics, 'trophy', 5))).toContain('graphic:glossy:trophy-48');
    expect(ids(searchStickers(graphics, 'גביע', 5))).toContain('graphic:glossy:trophy-48');
    expect(searchStickers(graphics, 'qqqzzz', 5)).toEqual([]);
  });

  it('are named without the size or the number their set ends a name with', () => {
    expect(graphics.find(({ id }) => id === 'graphic:glossy:trophy-48')?.label.en).toBe('trophy');
    expect(graphics.find(({ id }) => id === 'graphic:illustrated:beach-2')?.label.en).toBe('beach');
  });

  it('are whole SVG documents in the box of their drawing', async () => {
    const markup = await Promise.all(
      [
        'graphic:glossy:trophy-48',
        'graphic:illustrated:space-shuttle',
        'graphic:outlined:startup-launch',
        'graphic:glossy:rocket',
        'graphic:illustrated:bar-chart',
        'graphic:outlined:thumbs-up-1',
        'graphic:handdrawn:camera',
      ]
        .map((id) => graphics.find((graphic) => graphic.id === id)!)
        .map(stickerMarkup),
    );
    expect(markup[0]).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="0 0 48 48">/);
    expect(markup[1]).toContain('viewBox="9 9 30 30"');
    expect(markup[2]).toContain('viewBox="0 0 24 24"');
    expect(markup[3]).toContain('viewBox="0 0 32 32"');
    expect(markup[4]).toContain('viewBox="0 0 32 32"');
    expect(markup[5]).toContain('viewBox="0 0 48 48"');
    expect(markup[6]).toContain('viewBox="0 0 24 24"');
    expect(markup.every((svg) => svg?.endsWith('</svg>'))).toBe(true);
  });

  it('are without the disc the illustrated set draws everything on', async () => {
    const drawn = art('streamline-kameleon-color') as Record<string, { body: string }>;
    const paths = (svg: string) => svg.split('<path').length - 1;
    for (const graphic of graphics.filter(({ set }) => set === 'streamline-kameleon-color')) {
      const markup = (await stickerMarkup(graphic))!;
      expect(markup, graphic.id).toContain('viewBox="9 9 30 30"');
      expect(paths(markup), graphic.id).toBe(paths(drawn[graphic.art]!.body) - 1);
    }
  });
});

describe('the emoji', () => {
  it('are all there, in Unicode order and groups, each with art and a Hebrew name', () => {
    expect([...new Set(emoji.map(({ group }) => group))]).toEqual([...EMOJI_GROUPS]);
    expect(emoji.length).toBeGreaterThan(1800);
    expect(new Set(ids(emoji)).size).toBe(emoji.length);
    expect(emoji[0]?.id).toBe('emoji:grinning-face');
    const drawn = art('twemoji');
    expect(emoji.filter((one) => !(one.art in drawn))).toEqual([]);
    // One name is the same letters in every language.
    expect(ids(emoji.filter((one) => !/\p{Script=Hebrew}/u.test(one.label.he)))).toEqual([
      'emoji:dvd',
    ]);
  });

  it('are found by name and by keyword, in both languages', () => {
    expect(ids(searchStickers(emoji, 'rocket', 3))[0]).toBe('emoji:rocket');
    expect(ids(searchStickers(emoji, 'טיל', 3))[0]).toBe('emoji:rocket');
    expect(ids(searchStickers(emoji, 'חלל', 20))).toContain('emoji:rocket');
    expect(ids(searchStickers(emoji, 'דגל ישראל', 3))[0]).toBe('emoji:flag-israel');
    expect(ids(searchStickers(emoji, 'לב אדום', 3))[0]).toBe('emoji:red-heart');
  });

  it('are whole SVG documents', async () => {
    const rocket = emoji.find(({ id }) => id === 'emoji:rocket')!;
    expect(rocket.label).toEqual({ en: 'rocket', he: 'טיל' });
    expect(await stickerMarkup(rocket)).toMatch(
      /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="0 0 36 36"><path/,
    );
  });
});
