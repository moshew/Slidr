import type { Template } from '@slidr/templates';
import { describe, expect, it } from 'vitest';
import type { LibraryEntry } from './library';
import { offeredIn } from './written';

const entry = (id: string, personal = false): LibraryEntry => ({
  template: { theme: { id } } as Template,
  personal,
});

/** The languages of the samples, as their catalog has them: Atlas in more than the two. */
const LANGUAGES = {
  zerem: ['he', 'en'],
  atlas: ['he', 'en', 'ar', 'de', 'ja', 'pt-BR'],
} as const;

describe('the templates an interface offers', () => {
  it('in Hebrew and English: every one, without waiting for the languages of the samples', () => {
    for (const lang of ['he', 'en', 'en-US']) {
      for (const id of ['zerem', 'atlas']) {
        expect(offeredIn(entry(id), lang, undefined), `${lang}/${id}`).toBe(true);
        expect(offeredIn(entry(id), lang, LANGUAGES), `${lang}/${id}`).toBe(true);
      }
    }
  });

  it('in another language: those whose sample is written in it, once that is known', () => {
    for (const lang of ['de', 'ar', 'ja', 'pt-BR']) {
      expect(offeredIn(entry('atlas'), lang, LANGUAGES), lang).toBe(true);
      expect(offeredIn(entry('zerem'), lang, LANGUAGES), lang).toBe(false);
      expect(offeredIn(entry('atlas'), lang, undefined), lang).toBeUndefined();
    }
    expect(offeredIn(entry('atlas'), 'fr', LANGUAGES)).toBe(false);
  });

  it('a personal one, or a built-in one with no sample, in every language: it is in the app’s words', () => {
    for (const lang of ['he', 'en', 'de', 'zh-CN']) {
      expect(offeredIn(entry('brand', true), lang, undefined), lang).toBe(true);
      expect(offeredIn(entry('brand', true), lang, LANGUAGES), lang).toBe(true);
      expect(offeredIn(entry('plain'), lang, LANGUAGES), lang).toBe(true);
    }
  });
});
