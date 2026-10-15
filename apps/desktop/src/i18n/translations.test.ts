// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { en } from './en';
import { he } from './he';
import { i18n, languageOf, languages, setLanguage, systemLanguage } from './index';

/**
 * The translated languages (UI-05): every string of the Hebrew and English tables, translated
 * into `locales/<code>.json`, which holds every namespace of its language. Each has the keys of
 * the English table, a plural key in the forms of its own language (Intl.PluralRules), the same
 * placeholders and no empty string. A string added to the app is added to every file.
 */

type Table = { [key: string]: string | Table };

/** Every area's strings, by namespace: the same tables `registerMessages` gets. */
const areas = import.meta.glob<{ he?: Table; en?: Table }>('../*/messages.ts', { eager: true });
const sources: Record<string, { he: Table; en: Table }> = { shell: { he, en } };
for (const [path, module] of Object.entries(areas)) {
  if (module.he && module.en)
    sources[path.split('/')[1] ?? path] = { he: module.he, en: module.en };
}

const files = import.meta.glob<Record<string, Table>>('./locales/*.json', {
  eager: true,
  import: 'default',
});
const translations = Object.fromEntries(
  Object.entries(files).map(([path, table]) => [/([^/]+)\.json$/.exec(path)?.[1] ?? path, table]),
);
const translated = languages.filter((lng) => lng !== 'he' && lng !== 'en');

const SUFFIX = /_(zero|one|two|few|many|other)$/;

function strings(table: Table, prefix = ''): Map<string, string> {
  const found = new Map<string, string>();
  for (const [key, value] of Object.entries(table)) {
    if (typeof value === 'string') found.set(prefix + key, value);
    else for (const [k, v] of strings(value, `${prefix}${key}.`)) found.set(k, v);
  }
  return found;
}

const placeholders = (text: string) =>
  [...text.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1] ?? '').sort();

/** The keys a language must have in a namespace, each with the English it translates. */
function expected(ns: string, lng: string): Map<string, { english: string; plural: boolean }> {
  const forms = new Intl.PluralRules(lng).resolvedOptions().pluralCategories;
  const keys = new Map<string, { english: string; plural: boolean }>();
  for (const [key, english] of strings(sources[ns]!.en)) {
    const form = SUFFIX.exec(key)?.[1];
    if (!form) keys.set(key, { english, plural: false });
    else if (form === 'other') {
      const base = key.slice(0, -'_other'.length);
      for (const each of forms) keys.set(`${base}_${each}`, { english, plural: true });
    }
  }
  return keys;
}

describe('translated UI strings (UI-05)', () => {
  it('has a file for every language of the picker but Hebrew and English, with every namespace', () => {
    expect(Object.keys(translations).sort()).toEqual([...translated].sort());
    for (const lng of translated) {
      expect(Object.keys(translations[lng] ?? {}).sort(), lng).toEqual(Object.keys(sources).sort());
    }
  });

  it('has every string, in the plural forms of its language, none empty', () => {
    const wrong: string[] = [];
    for (const lng of translated) {
      for (const ns of Object.keys(sources)) {
        const want = expected(ns, lng);
        const have = strings(translations[lng]?.[ns] ?? {});
        for (const key of want.keys())
          if (!have.get(key)?.trim()) wrong.push(`${lng} ${ns}:${key} missing`);
        for (const key of have.keys())
          if (!want.has(key)) wrong.push(`${lng} ${ns}:${key} unexpected`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it('keeps the placeholders of every string', () => {
    const wrong: string[] = [];
    for (const lng of translated) {
      for (const ns of Object.keys(sources)) {
        const have = strings(translations[lng]?.[ns] ?? {});
        for (const [key, { english, plural }] of expected(ns, lng)) {
          const text = have.get(key);
          if (text === undefined) continue;
          const want = placeholders(english);
          const got = placeholders(text);
          // A plural form may say its number in words ("one slide"), but never another value.
          const same = plural
            ? want.filter((p) => p !== 'count').every((p) => got.includes(p)) &&
              got.every((p) => want.includes(p) || p === 'count')
            : want.join() === got.join();
          if (!same) wrong.push(`${lng} ${ns}:${key} {${got.join()}} for {${want.join()}}`);
        }
      }
    }
    expect(wrong).toEqual([]);
  });

  it('never shows a key for any count', () => {
    const shown: string[] = [];
    for (const lng of translated) {
      for (const ns of Object.keys(sources)) {
        const bases = new Set(
          [...strings(sources[ns]!.en).keys()]
            .filter((key) => SUFFIX.test(key))
            .map((key) => key.replace(SUFFIX, '')),
        );
        for (const base of bases) {
          for (const count of [0, 1, 2, 3, 5, 11, 21, 100, 1_000_000]) {
            const text = i18n.t(`${ns}:${base}`, { lng, count });
            if (text.endsWith(base)) shown.push(`${lng} ${ns}:${base} ${count}`);
          }
        }
      }
    }
    expect(shown).toEqual([]);
  });

  it('switches the UI into each language, mirrored for Arabic', async () => {
    for (const lng of translated) {
      await setLanguage(lng);
      expect(document.documentElement.lang).toBe(lng);
      expect(document.documentElement.dir).toBe(lng === 'ar' ? 'rtl' : 'ltr');
      expect(i18n.t('file.menu')).toBe(strings(translations[lng]?.shell ?? {}).get('file.menu'));
    }
    await setLanguage('he');
  });
});

describe('the UI language of a language tag', () => {
  it('takes the language whatever its region or script, and old codes too', () => {
    expect(languageOf('he-IL')).toBe('he');
    expect(languageOf('iw')).toBe('he');
    expect(languageOf('en-GB')).toBe('en');
    expect(languageOf('fr-CA')).toBe('fr');
    expect(languageOf('pt-PT')).toBe('pt-BR');
    expect(languageOf('pt_BR')).toBe('pt-BR');
    expect(languageOf('zh')).toBe('zh-CN');
    expect(languageOf('zh-Hans-SG')).toBe('zh-CN');
    expect(languageOf('in-ID')).toBe('id');
    expect(languageOf('ar-EG')).toBe('ar');
  });

  it('is the first of the system’s languages the app has, or English', () => {
    const was = Object.getOwnPropertyDescriptor(navigator, 'languages');
    const system = (tags: string[]) => {
      Object.defineProperty(navigator, 'languages', { value: tags, configurable: true });
      return systemLanguage();
    };
    try {
      expect(system(['pl-PL', 'de-DE', 'en-US'])).toBe('de');
      expect(system(['zh-TW', 'ja-JP'])).toBe('ja');
      expect(system(['pl-PL', 'nl-NL'])).toBe('en');
    } finally {
      if (was) Object.defineProperty(navigator, 'languages', was);
    }
  });

  it('has none for a language the app does not have, Traditional Chinese among them', () => {
    expect(languageOf('zh-TW')).toBeUndefined();
    expect(languageOf('zh-Hant')).toBeUndefined();
    expect(languageOf('pl')).toBeUndefined();
    expect(languageOf('')).toBeUndefined();
  });
});
