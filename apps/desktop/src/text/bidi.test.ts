import { describe, expect, it } from 'vitest';
import { firstStrong, resolveDirection, scriptOf } from './bidi';

// Invisible characters are written by code point, so they can be seen in this file.
const RLM = String.fromCharCode(0x200f);
const LRM = String.fromCharCode(0x200e);
const NBSP = String.fromCharCode(0xa0);

describe('the first strong character', () => {
  it('is the first letter, whatever comes before it', () => {
    expect(firstStrong('שלום world')).toBe('rtl');
    expect(firstStrong('Hello עולם')).toBe('ltr');
    // Digits, punctuation, spaces, symbols and emoji are not strong.
    expect(firstStrong('123 שלום')).toBe('rtl');
    expect(firstStrong('(1) hello')).toBe('ltr');
    expect(firstStrong('"שלום"')).toBe('rtl');
    expect(firstStrong(`${NBSP}- 12.5% → עברית`)).toBe('rtl');
    expect(firstStrong('😀 ok')).toBe('ltr');
    expect(firstStrong('€100 לחודש')).toBe('rtl');
  });

  it('knows the scripts that read right to left, and the rest read left to right', () => {
    expect(firstStrong('مرحبا')).toBe('rtl');
    expect(firstStrong('ܫܠܡܐ')).toBe('rtl');
    expect(firstStrong('Привет')).toBe('ltr');
    expect(firstStrong('你好')).toBe('ltr');
    expect(firstStrong('éa')).toBe('ltr');
    // Hebrew presentation forms, and a letter with points.
    expect(firstStrong('שּׁלום')).toBe('rtl');
  });

  it('follows a direction mark, as the bidi algorithm does', () => {
    expect(firstStrong(`${RLM}hello`)).toBe('rtl');
    expect(firstStrong(`${LRM}שלום`)).toBe('ltr');
  });

  it('is undefined for text without a strong character', () => {
    expect(firstStrong('')).toBeUndefined();
    expect(firstStrong('12.10.2026')).toBeUndefined();
    expect(firstStrong(' ... !? ')).toBeUndefined();
    expect(firstStrong('87%')).toBeUndefined();
  });
});

describe('the direction of a paragraph', () => {
  it('is its own when it is explicit', () => {
    expect(resolveDirection('rtl', 'Hello', 'ltr')).toBe('rtl');
    expect(resolveDirection('ltr', 'שלום', 'rtl')).toBe('ltr');
  });

  it('follows the first strong character when it is auto', () => {
    expect(resolveDirection('auto', 'שלום world', 'ltr')).toBe('rtl');
    expect(resolveDirection('auto', 'Hello עולם', 'rtl')).toBe('ltr');
    expect(resolveDirection('auto', '3 דברים', 'ltr')).toBe('rtl');
  });

  it('is left to right for text without letters, as the browser lays out dir="auto"', () => {
    expect(resolveDirection('auto', '2026', 'rtl')).toBe('ltr');
    expect(resolveDirection('auto', '...', 'rtl')).toBe('ltr');
  });

  it('is the deck direction for a line without text', () => {
    expect(resolveDirection('auto', '', 'rtl')).toBe('rtl');
    expect(resolveDirection('auto', '', 'ltr')).toBe('ltr');
  });
});

describe('the script a font is wanted for', () => {
  it('is Hebrew when there is any Hebrew, Latin when there is only Latin', () => {
    expect(scriptOf('שלום')).toBe('he');
    expect(scriptOf('Slidr הוא עורך')).toBe('he');
    expect(scriptOf('Hello')).toBe('latin');
    expect(scriptOf('Café')).toBe('latin');
    expect(scriptOf('12.10')).toBeUndefined();
    expect(scriptOf('')).toBeUndefined();
  });
});
