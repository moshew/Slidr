import { createDeck, createSlide } from '@slidr/model';
import type { TFunction } from 'i18next';
import { describe, expect, it } from 'vitest';
import { exportFileName, fontFamilyName, formatBytes, ltr, planExport } from './exportDeck';
import { en, he } from './messages';
import { warningText } from './warnings';

const deck = createDeck({
  slides: [
    createSlide({ id: 's_1' }),
    createSlide({ id: 's_2', hidden: true }),
    createSlide({ id: 's_3' }),
    createSlide({ id: 's_4' }),
    createSlide({ id: 's_5', hidden: true }),
  ],
});

describe('planExport', () => {
  it('exports the whole deck without its hidden slides, and says how many those are', () => {
    expect(planExport(deck, null)).toEqual({ slideIds: ['s_1', 's_3', 's_4'], hidden: 2 });
  });

  it('takes a range by position, both ends included', () => {
    expect(planExport(deck, { from: 2, to: 4 })).toEqual({ slideIds: ['s_3', 's_4'], hidden: 1 });
    expect(planExport(deck, { from: 4, to: 4 })).toEqual({ slideIds: ['s_4'], hidden: 0 });
    // Typed the other way round, it is the same range.
    expect(planExport(deck, { from: 4, to: 2 }).slideIds).toEqual(['s_3', 's_4']);
    // Past the ends, it is what the deck has.
    expect(planExport(deck, { from: 0, to: 99 }).slideIds).toEqual(['s_1', 's_3', 's_4']);
  });

  it('may come to nothing: a range of hidden slides only', () => {
    expect(planExport(deck, { from: 5, to: 5 })).toEqual({ slideIds: [], hidden: 1 });
  });
});

describe('exportFileName', () => {
  it('is the name of the document, else the title of the deck, else the fallback', () => {
    expect(exportFileName('C:\\decks\\Roadmap 2027.slidr', 'Other', 'Untitled')).toBe(
      'Roadmap 2027.html',
    );
    expect(exportFileName('/home/me/plan.SLIDR', '', 'Untitled')).toBe('plan.html');
    expect(exportFileName(null, 'מפת דרכים', 'Untitled')).toBe('מפת דרכים.html');
    expect(exportFileName(null, '   ', 'מצגת ללא שם')).toBe('מצגת ללא שם.html');
  });

  it('leaves out what a file name cannot hold', () => {
    expect(exportFileName(null, 'Q3: plan / review? "final"', 'x')).toBe(
      'Q3 plan review final.html',
    );
  });
});

describe('formatBytes', () => {
  it('reads as a person would say it', () => {
    expect(formatBytes(820)).toBe('820 B');
    expect(formatBytes(41_300)).toBe('41 kB');
    expect(formatBytes(999_400)).toBe('999 kB');
    expect(formatBytes(999_600)).toBe('1.0 MB');
    expect(formatBytes(2_380_000)).toBe('2.4 MB');
    expect(formatBytes(48_200_000)).toBe('48 MB');
  });
});

describe('fontFamilyName', () => {
  it('is the family, also for its Hebrew-only face', () => {
    expect(fontFamilyName('Heebo::hebrew')).toBe('Heebo');
    expect(fontFamilyName('IBM Plex Sans Hebrew')).toBe('IBM Plex Sans Hebrew');
  });
});

describe('warningText', () => {
  // The key and its values, as the dialog's `t` would be asked.
  const t = ((key: string, values?: { name?: string }) =>
    `${key}(${values?.name ?? ''})`) as unknown as TFunction<'export'>;

  it('says a warning in the language of the UI, by its code', () => {
    // The file name is kept apart from the Hebrew around it, to be read left to right.
    expect(
      warningText(t, {
        code: 'asset-unreadable',
        subject: 'clip.mp4',
        message: 'Asset clip.mp4 could not be read',
      }),
    ).toBe(`warning.assetUnreadable(${ltr('clip.mp4')})`);
    expect(ltr('clip.mp4')).toHaveLength('clip.mp4'.length + 2);
    expect(warningText(t, { code: 'shadow-roots', message: 'No shadow roots' })).toBe(
      'warning.noShadowRoots()',
    );
  });

  it('has a string in both languages for every code', () => {
    const codes = [
      'asset-unreadable',
      'font-unreadable',
      'font-whole',
      'fonts-whole',
      'shadow-roots',
    ] as const;
    for (const code of codes) {
      const key = warningText(t, { code, message: '' }).replace(/^warning\.|\(.*$/g, '');
      expect(he.warning, key).toHaveProperty(key);
      expect(en.warning, key).toHaveProperty(key);
    }
  });
});
