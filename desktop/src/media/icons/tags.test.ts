import { readMediaJson } from '@slidr/media-library';
import { describe, expect, it } from 'vitest';
import { CARD_SETS } from '../../elements/cardSets';
import { designWords, searchDesigns } from '../../elements/designCatalog';
import { loadAllDesigns } from '../../elements/designs';
import { he as elementsHe, en as elementsEn } from '../../elements/messages';
import { loadEmoji, loadGraphics, searchStickers } from '../../elements/stickers';
import { LINE_KINDS, shapeLibrary } from '../../objects/shapes';
import { TAG_KINDS, tagsOf, type TagKind } from './library';
import { searchIcons, withTags, type SearchWords, type TagsOf } from './search';

/*
 * The search tags of the media library (ADR-108): how they join the words a thing is found by,
 * and, in the library as it is published, that every thing of each kind has them and that they
 * find what a user looks for. A kind the library has no tags of yet is skipped.
 */

const { groups: DESIGN_GROUPS, designsOf, loadDesignTags } = await loadAllDesigns();

const thing = (id: string, en: string, he: string): SearchWords & { id: string } => ({
  id,
  filled: false,
  nameWords: en.split(' '),
  tagWords: [],
  nameTerms: [he],
  nameHebrew: he.split(' '),
  tagTerms: [],
  tagHebrew: [],
});
const found = (all: readonly (SearchWords & { id: string })[], query: string) =>
  searchIcons(all, query, { count: all.length }).map(({ id }) => id);

describe('tags', () => {
  const balloon = withTags(thing('balloon', 'balloon', 'בלונ'), {
    en: ['birthday party', 'Balloon'],
    he: ['יום הולדת', 'מסיבה', 'בלון'],
  });
  const cake = thing('cake', 'birthday cake', 'עוגת יומ הולדת');
  const calendar = withTags(thing('calendar', 'calendar', 'לוח שנה'), { he: ['יום'] });

  it('add their words to a thing, apart from what its name says', () => {
    expect(balloon.tagWords).toEqual(['birthday', 'party']);
    expect(balloon.tagTerms).toEqual(['יומ הולדת', 'מסיבה']);
    expect(balloon.tagHebrew).toEqual(['יומ', 'הולדת', 'מסיבה']);
    expect(withTags(cake, undefined)).toBe(cake);
  });

  it('find a thing by what it is for, in either language, after what is named so', () => {
    const all = [calendar, balloon, cake];
    expect(found(all, 'יום הולדת')).toEqual(['cake', 'balloon']);
    expect(found(all, 'ליום הולדת')).toEqual(['cake', 'balloon']);
    expect(found(all, 'birthday')).toEqual(['cake', 'balloon']);
    expect(found(all, 'מסיבה')).toEqual(['balloon']);
    expect(found(all, 'party')).toEqual(['balloon']);
  });

  it('find the singular of a plural before a guess that takes a prefix off it as well', () => {
    // "שלבים" (steps) could also be read as "that" and "hearts": a heart is the least sure match.
    const heart = thing('heart', 'heart', 'לב');
    const chevron = withTags(thing('chevron', 'chevron', 'שברונ'), { he: ['שלב'] });
    expect(found([heart, chevron], 'שלבים')).toEqual(['chevron', 'heart']);
  });

  it('keeps translated tags and searches native words, accents and unspaced phrases', () => {
    const tags = tagsOf({
      balloon: {
        en: ['balloon'],
        he: ['בלון'],
        fr: ['fête anniversaire'],
        ar: ['عيد ميلاد'],
        de: ['Geburtstag'],
        hi: ['जन्मदिन की पार्टी'],
        ja: ['誕生日パーティー'],
        ko: ['생일 파티'],
        'zh-CN': ['生日派对'],
        unknown: ['ignored'],
      },
    });
    expect(tags.balloon?.fr).toEqual(['fête anniversaire']);
    expect(tags.balloon).not.toHaveProperty('unknown');
    const index = [withTags(thing('balloon', 'balloon', 'בלונ'), tags.balloon)];
    for (const query of [
      'fete',
      'عيد ميلاد',
      'geburtstag',
      'जन्मदिन',
      'पार्टी',
      'パーティー',
      '생일',
      '派对',
    ]) {
      expect(found(index, query), query).toEqual(['balloon']);
    }
    expect(found(index, 'पर्टी')).toEqual([]);
    expect(found(index, 'ハーティー')).toEqual([]);
  });

  it('are taken from a file only as lists of words', () => {
    expect(tagsOf({ a: { en: ['x', 3], he: 'y' }, b: null, c: { he: ['ז'] } })).toEqual({
      a: { en: ['x'], he: [] },
      c: { en: [], he: ['ז'] },
    });
    expect(tagsOf(['a'])).toEqual({});
  });

  it('find a design by its name, its group and its tags', () => {
    const designs = [
      designWords('cover', { en: 'Cover', he: 'שער' }, { en: 'Deck', he: 'מצגת' }, undefined),
      designWords(
        'birthday',
        { en: 'Birthday invitation', he: 'הזמנה ליום הולדת' },
        { en: 'Invitations', he: 'הזמנות' },
        { en: ['kids party'], he: ['מסיבת ילדים', 'יומולדת'] },
      ),
    ];
    expect(searchDesigns(designs, 'יום הולדת')).toEqual(['birthday']);
    expect(searchDesigns(designs, 'יומולדת')).toEqual(['birthday']);
    expect(searchDesigns(designs, 'הזמנות')).toEqual(['birthday']);
    expect(searchDesigns(designs, 'kids')).toEqual(['birthday']);
    expect(searchDesigns(designs, 'שער')).toEqual(['cover']);
  });
});

/* ---------------------------------------------------------------- the published library */

const published = Object.fromEntries(
  await Promise.all(
    TAG_KINDS.map(async (kind) => {
      const file = await readMediaJson<{ tags?: unknown }>(`tags/${kind}.json`);
      return [kind, file ? tagsOf(file.tags) : undefined] as const;
    }),
  ),
) as Record<TagKind, TagsOf | undefined>;

/** What of each kind the library has, by the key its tags are filed under. */
async function keysOf(kind: TagKind): Promise<string[]> {
  switch (kind) {
    case 'icons': {
      const lucide = await readMediaJson<Record<string, unknown>>('icons/lucide/tags.json');
      const tabler = await readMediaJson<Record<string, unknown>>('icons/tabler/icons.json');
      return [
        ...Object.keys(lucide ?? {}).map((name) => `lucide:${name}`),
        ...Object.keys(tabler ?? {}).map((name) => `tabler:${name}`),
      ];
    }
    case 'graphics': {
      const catalog = await readMediaJson<{ icons: string[] }[]>(
        'elements/catalogs/graphics-catalog.json',
      );
      return [...new Set((catalog ?? []).flatMap(({ icons }) => icons))];
    }
    case 'emoji': {
      const catalog = await readMediaJson<{ emoji: string[] }[]>(
        'elements/catalogs/emoji-catalog.json',
      );
      return (catalog ?? []).flatMap(({ emoji }) => emoji.map((line) => line.split('|')[0]!));
    }
    case 'frames': {
      const catalog = await readMediaJson<{ groups: { frames: { id: string }[] }[] }>(
        'elements/catalogs/frames-catalog.json',
      );
      return (catalog?.groups ?? []).flatMap(({ frames }) => frames.map(({ id }) => id));
    }
    case 'shapes':
      return [
        ...shapeLibrary().flatMap(({ presets }) => presets.map((preset) => `shape:${preset}`)),
        ...LINE_KINDS.map((line) => `line:${line}`),
        'card',
      ];
    case 'cards':
      return [...CARD_SETS];
    case 'designs':
      return DESIGN_GROUPS.flatMap(designsOf);
  }
}

describe('the library', () => {
  for (const kind of TAG_KINDS) {
    it.skipIf(!published[kind])(`tags every one of its ${kind} in Hebrew and English`, async () => {
      // A design of the studio may carry its tags in `managed.json` instead.
      const tags = kind === 'designs' ? await loadDesignTags() : (published[kind] ?? {});
      const keys = await keysOf(kind);
      expect(keys.length).toBeGreaterThan(0);
      const bare = keys.filter((key) => !tags[key]?.en?.length || !tags[key]?.he?.length);
      expect(bare).toEqual([]);
      for (const key of keys) {
        for (const tag of tags[key]?.he ?? []) expect(tag, key).toMatch(/\p{Script=Hebrew}/u);
        for (const tag of tags[key]?.en ?? []) expect(tag, key).not.toMatch(/\p{Script=Hebrew}/u);
      }
    });
  }

  it.skipIf(!published.designs || !published.graphics || !published.emoji)(
    'finds a birthday party in Hebrew: the invitation, the cake and the balloons',
    async () => {
      const tags = await loadDesignTags();
      const designs = DESIGN_GROUPS.flatMap((group) =>
        designsOf(group).map((id) =>
          designWords(
            id,
            {
              he: (elementsHe.designs.name as Record<string, string>)[id],
              en: (elementsEn.designs.name as Record<string, string>)[id],
            },
            {
              he: (elementsHe.designs.group as Record<string, string>)[group],
              en: (elementsEn.designs.group as Record<string, string>)[group],
            },
            tags[id],
          ),
        ),
      );
      expect(searchDesigns(designs, 'יום הולדת').slice(0, 5)).toContain('birthday');
      const graphics = searchStickers(await loadGraphics(), 'יום הולדת', 60).map(({ id }) => id);
      expect(graphics.some((id) => id.endsWith(':birthday-cake'))).toBe(true);
      expect(graphics).toContain('graphic:glossy:balloon');
      const emoji = searchStickers(await loadEmoji(), 'יום הולדת', 30).map(({ id }) => id);
      expect(emoji).toEqual(expect.arrayContaining(['emoji:birthday-cake', 'emoji:balloon']));
    },
  );
});
