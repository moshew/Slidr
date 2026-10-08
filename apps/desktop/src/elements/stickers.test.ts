import { readFileSync } from 'node:fs';
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
 * The two catalogues against the art sets as the app's packages ship them. The data is read
 * here from the files; the app reads the same files through the bundler, when it first needs
 * them (`stickers.ts`).
 */

const file = (path: string) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8')) as unknown;

const art = (set: string) =>
  (file(`../../node_modules/@iconify-json/${set}/icons.json`) as { icons: Record<string, unknown> })
    .icons;

const graphicsCatalog = file('./graphics-catalog.json') as GraphicsCatalog;
const graphics = graphicsOf(graphicsCatalog, file('../media/icons/hebrew.json') as HebrewTags);
const emoji = emojiOf(file('./emoji-catalog.json') as EmojiCatalog);

const ids = (found: readonly { id: string }[]) => found.map(({ id }) => id);

describe('the graphics', () => {
  it('come in three styles, each a set of drawings the packages still have', () => {
    expect(graphicsCatalog.map(({ id }) => id)).toEqual([...GRAPHIC_STYLES]);
    for (const { set, icons } of graphicsCatalog) {
      expect(icons.length).toBeGreaterThan(150);
      const drawn = art(set);
      expect(icons.filter((name) => !(name in drawn))).toEqual([]);
    }
    expect(graphics.length).toBeGreaterThan(1000);
    expect(new Set(ids(graphics)).size).toBe(graphics.length);
  });

  it('leave out the logos and characters of other firms', () => {
    expect(ids(graphics).filter((id) => /logo|spongebob|pokeball|blackberry/.test(id))).toEqual([]);
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
      ]
        .map((id) => graphics.find((graphic) => graphic.id === id)!)
        .map(stickerMarkup),
    );
    expect(markup[0]).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="0 0 48 48">/);
    expect(markup[1]).toContain('viewBox="0 0 48 48"');
    expect(markup[2]).toContain('viewBox="0 0 24 24"');
    expect(markup.every((svg) => svg?.endsWith('</svg>'))).toBe(true);
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
