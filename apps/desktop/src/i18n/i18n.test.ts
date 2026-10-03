// @vitest-environment happy-dom
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { en } from './en';
import { he } from './he';
import { currentLanguage, i18n, registerMessages, setLanguage } from './index';

/** Every key of a string table, as `a.b.c`. */
function keys(table: object, prefix = ''): string[] {
  return Object.entries(table).flatMap(([key, value]) =>
    typeof value === 'string' ? [prefix + key] : keys(value as object, `${prefix}${key}.`),
  );
}

const shellDir = join(dirname(fileURLToPath(import.meta.url)), '../shell');
const groups = Object.keys(he).join('|');

describe('UI strings (UI-05)', () => {
  it('has the same keys in Hebrew and English, none empty', () => {
    expect(keys(en).sort()).toEqual(keys(he).sort());
    const empty = keys(he).filter((k) => !i18n.t(k, { lng: 'he' }) || !i18n.t(k, { lng: 'en' }));
    expect(empty).toEqual([]);
  });

  it('has every key the shell asks for', () => {
    const known = new Set(keys(he));
    const pattern = new RegExp(`['"\`]((?:${groups})\\.[a-zA-Z]+)['"\`]`, 'g');
    const used = readdirSync(shellDir)
      .filter((name) => /\.tsx?$/.test(name) && !name.includes('.test.'))
      .flatMap((name) => [...readFileSync(join(shellDir, name), 'utf8').matchAll(pattern)])
      .map((m) => m[1] ?? '');
    expect(used.length).toBeGreaterThan(50);
    expect(used.filter((key) => !known.has(key))).toEqual([]);
  });

  it('defaults to Hebrew, and switching mirrors the document', async () => {
    expect(currentLanguage()).toBe('he');
    expect(document.documentElement.dir).toBe('rtl');
    await setLanguage('en');
    expect(document.documentElement.dir).toBe('ltr');
    expect(document.documentElement.lang).toBe('en');
    expect(i18n.t('file.menu')).toBe('File');
    await setLanguage('he');
    expect(document.documentElement.dir).toBe('rtl');
    expect(i18n.t('file.menu')).toBe('קובץ');
  });

  it('lets an area add its own namespace', () => {
    registerMessages('demo', { he: { hello: 'שלום' }, en: { hello: 'Hello' } });
    expect(i18n.t('demo:hello', { lng: 'he' })).toBe('שלום');
    expect(i18n.t('demo:hello', { lng: 'en' })).toBe('Hello');
  });
});
