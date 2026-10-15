import { describe, expect, it } from 'vitest';
import {
  CONTENT_LANGUAGES,
  contentLanguageOf,
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
