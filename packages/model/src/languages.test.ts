import { describe, expect, it } from 'vitest';
import {
  CONTENT_LANGUAGES,
  contentLanguageOf,
  familyForDeck,
  familyForLetters,
  familyOfLanguage,
  inLanguage,
  LANGUAGE_NAMES,
  languageDir,
  languagesOf,
  pieceLanguage,
  writtenIn,
} from './languages';

describe('the languages of ready-made content', () => {
  it('start with the base languages and each has its names', () => {
    expect(CONTENT_LANGUAGES.slice(0, 2)).toEqual(['he', 'en']);
    expect(Object.keys(LANGUAGE_NAMES).sort()).toEqual([...CONTENT_LANGUAGES].sort());
  });

  it('are found from a deck’s language tag, whatever its region', () => {
    expect(contentLanguageOf('he-IL')).toBe('he');
    expect(contentLanguageOf('iw')).toBe('he');
    expect(contentLanguageOf('fr-CA')).toBe('fr');
    expect(contentLanguageOf('pt-PT')).toBe('pt-BR');
    expect(contentLanguageOf('zh-Hans-SG')).toBe('zh-CN');
    expect(contentLanguageOf('zh-TW')).toBeUndefined();
    expect(contentLanguageOf('pl')).toBeUndefined();
    expect(languageDir('ar-EG')).toBe('rtl');
    expect(languageDir('ja')).toBe('ltr');
  });

  it('give a deck its own language, or English', () => {
    const piece = { he: 'שלום', en: 'Hello', ar: 'مرحبا', ja: 'こんにちは' };
    expect(inLanguage(piece, 'he-IL')).toBe('שלום');
    expect(inLanguage(piece, 'ar')).toBe('مرحبا');
    expect(inLanguage(piece, 'ja-JP')).toBe('こんにちは');
    // A right-to-left deck in a language the piece lacks gets the English one, not the Hebrew.
    expect(inLanguage(piece, 'fa')).toBe('Hello');
    expect(inLanguage(piece, 'ru')).toBe('Hello');
    expect(writtenIn(piece, 'ru')).toBeUndefined();
    expect(pieceLanguage(piece, 'ar-EG')).toBe('ar');
    expect(languagesOf(piece)).toEqual(['he', 'en', 'ar', 'ja']);
  });
});

describe('the fonts of a language', () => {
  const heebo = { family: 'Heebo', scripts: ['he', 'latin'], for: ['he'] };
  const openSans = { family: 'Open Sans', scripts: ['he', 'latin', 'cyrillic'], for: ['latin'] };
  const cairo = { family: 'Cairo', scripts: ['latin', 'arabic'], for: ['arabic'] };
  const notoJp = {
    family: 'Noto Sans JP',
    scripts: ['latin', 'cyrillic', 'japanese'],
    for: ['japanese'],
  };
  const fonts = [heebo, openSans, cairo, notoJp];
  const of = (lang: Parameters<typeof familyOfLanguage>[1]) =>
    fonts.filter((entry) => familyOfLanguage(entry, lang)).map((entry) => entry.family);
  const forDeck = (lang: string) =>
    fonts.filter((entry) => familyForDeck(entry, lang)).map((entry) => entry.family);

  it('are those with its letters, made for them or for Latin letters', () => {
    expect(of('he')).toEqual(['Heebo', 'Open Sans']);
    // A Hebrew family's Latin letters are for English words in Hebrew text.
    expect(of('en')).toEqual(['Open Sans']);
    expect(of('ar')).toEqual(['Cairo']);
    // A Japanese family's Cyrillic letters are not a Russian font.
    expect(of('ru')).toEqual(['Open Sans']);
    expect(of('ja')).toEqual(['Noto Sans JP']);
    expect(of('hi')).toEqual([]);
  });

  it('are offered to a deck with English’s, or all of them in a language of none', () => {
    expect(forDeck('ar-EG')).toEqual(['Open Sans', 'Cairo']);
    expect(forDeck('he')).toEqual(['Heebo', 'Open Sans']);
    expect(forDeck('ja')).toEqual(['Open Sans', 'Noto Sans JP']);
    expect(forDeck('pl')).toEqual(['Heebo', 'Open Sans', 'Cairo', 'Noto Sans JP']);
  });

  it('draw a deck’s letters in a family that has them, or in its counterpart', () => {
    const poppins = {
      family: 'Poppins',
      scripts: ['latin', 'devanagari'],
      for: ['latin', 'devanagari'],
      counterparts: { arabic: 'Cairo', vietnamese: 'Be Vietnam Pro', he: 'Rubik' },
    };
    expect(familyForLetters(poppins, 'hi')).toEqual({ family: 'Poppins', whole: false });
    // Arabic letters beside the family's Latin ones; Vietnamese is the whole text.
    expect(familyForLetters(poppins, 'ar-EG')).toEqual({ family: 'Cairo', whole: false });
    expect(familyForLetters(poppins, 'vi')).toEqual({ family: 'Be Vietnam Pro', whole: true });
    // Hebrew has the theme's pair; a family with no counterpart in the letters has none.
    expect(familyForLetters(poppins, 'he')).toBeUndefined();
    expect(familyForLetters(poppins, 'ja')).toBeUndefined();
  });

  it('take a catalog written before it said what a family is made for by its first letters', () => {
    const old = { family: 'Rubik', scripts: ['he', 'latin', 'arabic', 'cyrillic'] };
    expect(familyOfLanguage(old, 'he')).toBe(true);
    expect(familyOfLanguage(old, 'en')).toBe(false);
  });
});
