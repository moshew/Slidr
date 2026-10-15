import { describe, expect, it } from 'vitest';
import { createDeck, isRtlLanguage } from './factories';

describe('the direction of a new deck', () => {
  it('is right to left for a right-to-left language, whatever its region', () => {
    for (const lang of ['he', 'he-IL', 'ar', 'ar-EG', 'fa', 'ur-PK']) {
      expect(isRtlLanguage(lang)).toBe(true);
    }
    // Mapuche (`arn`) only starts like Arabic.
    for (const lang of ['en', 'fr', 'zh-CN', 'hi', 'arn']) expect(isRtlLanguage(lang)).toBe(false);
    expect(createDeck({ lang: 'ar' }).meta.dir).toBe('rtl');
    expect(createDeck({ lang: 'ja' }).meta.dir).toBe('ltr');
  });
});
