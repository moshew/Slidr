import { BASE_LANGUAGES, CONTENT_LANGUAGES, languageDir } from '@slidr/model';
import i18n from 'i18next';
import { describe, expect, it } from 'vitest';
import { languages } from '../i18n';

/**
 * Ready-made content (the samples of templates, the designs of Elements) may be written in every
 * language the interface has: a deck made in the interface's language finds it in its own.
 */
describe('the languages of ready-made content', () => {
  it('are the languages of the interface', () => {
    expect([...CONTENT_LANGUAGES].sort()).toEqual([...languages].sort());
    for (const base of BASE_LANGUAGES) expect(languages).toContain(base);
  });

  it('are written in the direction the interface takes for them', () => {
    for (const lang of CONTENT_LANGUAGES) expect(languageDir(lang), lang).toBe(i18n.dir(lang));
  });
});
