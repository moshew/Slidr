import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { findIcons, iconMarkup, STARTERS, starterIcons, toEnglish } from './library';
import {
  buildIndex,
  englishQuery,
  hebrewToEnglish,
  normalize,
  searchIcons,
  wordsOf,
  type HebrewTags,
  type IconSources,
} from './search';

/*
 * The icon library against the real sets, as the app's packages ship them. The data is read
 * here from the files; the app reads the same files through the bundler, when it first needs
 * them (`library.ts`).
 */

const file = (path: string) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8')) as unknown;

const modules = '../../../node_modules/';
const sources: IconSources = {
  lucide: file(`${modules}lucide-static/tags.json`) as IconSources['lucide'],
  tabler: file(`${modules}@tabler/icons/icons.json`) as IconSources['tabler'],
  hebrew: file('./hebrew.json') as HebrewTags,
};
const index = buildIndex(sources);
const ids = (query: string, count = 5, style: 'line' | 'filled' = 'line') =>
  searchIcons(index, query, { count, style }).map((icon) => icon.id);

describe('the index', () => {
  it('holds both sets, line icons first and filled ones under their own ids', () => {
    const count = (test: (id: string) => boolean) => index.filter((icon) => test(icon.id)).length;
    const lucide = count((id) => id.startsWith('lucide:'));
    const filled = index.filter((icon) => icon.filled).length;
    const tabler = count((id) => id.startsWith('tabler:')) - filled;
    expect(lucide).toBeGreaterThan(1500);
    expect(tabler).toBeGreaterThan(5000);
    expect(filled).toBeGreaterThan(900);
    expect(new Set(index.map((icon) => icon.id)).size).toBe(index.length);
    expect(index[0]?.set).toBe('lucide');
    expect(index.filter((icon) => icon.filled).every((icon) => icon.id.endsWith('-filled'))).toBe(
      true,
    );
  });

  it('gives nearly every icon a Hebrew word for its own name', () => {
    // Brand marks are names, not words: nobody looks for them in Hebrew.
    const brands = new Set(
      Object.entries(sources.tabler).flatMap(([name, icon]) =>
        (icon as { category?: string }).category === 'Brand' ? [name] : [],
      ),
    );
    const plain = index.filter(
      (icon) => !(icon.set === 'tabler' && brands.has(icon.name.replace(/-filled$/, ''))),
    );
    const named = plain.filter((icon) => icon.nameTerms.length > 0).length;
    const tagged = plain.filter((icon) => icon.nameTerms.length + icon.tagTerms.length > 0);
    expect(named / plain.length).toBeGreaterThan(0.98);
    expect(tagged.length / plain.length).toBeGreaterThan(0.999);
  });

  it('has only Hebrew letters in its Hebrew, with no niqqud and no geresh', () => {
    for (const [word, terms] of Object.entries(sources.hebrew)) {
      expect(terms.length, word).toBeGreaterThan(0);
      for (const term of terms) expect(term, word).toMatch(/^[\p{Script=Hebrew} ]+$/u);
    }
  });
});

describe('search', () => {
  it('finds an icon by its English name, the plainest icon first', () => {
    expect(ids('rocket', 3)).toEqual(['lucide:rocket', 'tabler:rocket', 'tabler:rocket-off']);
    expect(ids('heart', 1)).toEqual(['lucide:heart']);
    expect(ids('arrow right', 2)).toEqual(['lucide:arrow-right', 'tabler:arrow-right']);
    // A beginning of a word is enough, and so is a tag.
    expect(ids('rock')).toContain('lucide:rocket');
    expect(ids('launch')).toContain('lucide:rocket');
  });

  it('finds the same icons in Hebrew', () => {
    expect(ids('רקטה', 2)).toEqual(['lucide:rocket', 'tabler:rocket']);
    expect(ids('לב', 1)).toEqual(['lucide:heart']);
    expect(ids('חץ ימינה', 1)).toEqual(['lucide:arrow-right']);
    expect(ids('חץ ימינה', 8)).toContain('tabler:arrow-right');
    expect(ids('מנעול', 1)).toEqual(['lucide:lock']);
    // A whole term beats a word of a longer one: a house before a hospital ("בית חולים").
    expect(ids('בית', 1)).toEqual(['lucide:house']);
    expect(ids('כוכב', 1)).toEqual(['lucide:star']);
    expect(ids('לוח שנה', 1)).toEqual(['lucide:calendar']);
  });

  it('reads Hebrew as people type it: with a prefix, in the plural, with niqqud or a geresh', () => {
    expect(ids('הרקטה', 1)).toEqual(['lucide:rocket']);
    expect(ids('חצים', 20).some((id) => id.includes('arrow'))).toBe(true);
    expect(ids('כּוֹכָב', 1)).toEqual(['lucide:star']);
    // A loan word typed with its geresh finds what the dictionary spells without one.
    expect(ids("צ'יפ").length).toBeGreaterThan(0);
    expect(ids('צ׳יפ')).toEqual(ids("צ'יפ"));
  });

  it('keeps the two styles apart, and finds nothing for nonsense', () => {
    expect(ids('star', 3, 'filled').every((id) => id.endsWith('-filled'))).toBe(true);
    expect(ids('star', 3, 'filled')[0]).toBe('tabler:star-filled');
    expect(ids('star', 50).some((id) => id.endsWith('-filled'))).toBe(false);
    expect(ids('qqqzzz')).toEqual([]);
    expect(ids('   ')).toEqual([]);
    // Every word must match: a rocket that is also a giraffe does not exist.
    expect(ids('rocket giraffe')).toEqual([]);
  });

  it('normalises what it compares', () => {
    expect(normalize('כּוֹכָבִים')).toBe('כוכבימ');
    expect(normalize("צ'יפ")).toBe('ציפ');
    expect(wordsOf('Arrow-Right, 2')).toEqual(['arrow', 'right', '2']);
  });
});

describe('a Hebrew query for a library that indexes English', () => {
  const english = hebrewToEnglish(sources.hebrew);

  it('is translated word by word, and left alone when a word is not known', () => {
    expect(englishQuery('רקטה', english)).toBe('rocket');
    expect(englishQuery('שמש', english)).toBe('sun');
    expect(englishQuery('לוח שנה', english)).toBe('calendar');
    // Latin words pass through; a Hebrew word with no translation leaves the query as typed.
    expect(englishQuery('רקטה red', english)).toBe('rocket red');
    expect(englishQuery('rocket', english)).toBeNull();
    expect(englishQuery('אבגדהוז', english)).toBeNull();
  });
});

describe('the library as the app loads it', () => {
  it('draws an icon of either set in currentColor', async () => {
    const lucide = await iconMarkup('lucide:rocket');
    expect(lucide).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 24 24" /);
    expect(lucide).toContain('stroke="currentColor"');
    expect(lucide).toContain('<path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>');
    expect(await iconMarkup('rocket')).toBe(lucide);
    expect(await iconMarkup(' Lucide:Rocket ')).toBe(lucide);

    const tabler = await iconMarkup('tabler:rocket');
    expect(tabler).toContain('stroke="currentColor"');
    expect(tabler).not.toBe(lucide);
    const filled = await iconMarkup('tabler:star-filled');
    expect(filled).toContain('fill="currentColor"');
    expect(filled).not.toContain('stroke=');
  });

  it('has no icon for an id it does not know', async () => {
    for (const id of ['lucide:no-such-icon', 'fontawesome:rocket', 'tabler:', '', 'lucide:../x']) {
      expect(await iconMarkup(id), id).toBeUndefined();
    }
  });

  it('searches with the markup of what it finds', async () => {
    const [first] = await findIcons('רקטה', { count: 2, style: 'line' });
    expect(first).toMatchObject({ id: 'lucide:rocket', name: 'rocket' });
    expect(first?.svg).toBe(await iconMarkup('lucide:rocket'));
    expect(await toEnglish('שמש')).toBe('sun');
  });

  it('has every starter icon', async () => {
    const line = await starterIcons();
    expect(line.map((icon) => icon.name)).toEqual([...STARTERS]);
    const filled = await starterIcons('filled');
    expect(filled.length).toBeGreaterThan(30);
    expect(filled.every((icon) => icon.svg.includes('fill="currentColor"'))).toBe(true);
  });
});
