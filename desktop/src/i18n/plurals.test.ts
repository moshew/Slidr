// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { en } from './en';
import { he } from './he';
import { i18n, registerMessages } from './index';

/**
 * Plurals (UI-05). i18next runs with no fallback language, and Hebrew has a `two` form: a key
 * with `_one` and `_other` and no `_two` comes back as the key itself for a count of 2. Every
 * plural key of every Hebrew table has the three forms, and English has `_one` and `_other`.
 */

type Table = { [key: string]: string | Table };

/** Every area's strings, by folder: the same tables `registerMessages` gets. */
const areas = import.meta.glob<{ he?: Table; en?: Table }>('../*/messages.ts', { eager: true });

const tables: Array<{ name: string; he: Table; en: Table }> = [
  { name: 'shell', he, en },
  ...Object.entries(areas).flatMap(([path, module]) =>
    module.he && module.en
      ? [{ name: path.split('/')[1] ?? path, he: module.he, en: module.en }]
      : [],
  ),
];

function keys(table: Table, prefix = ''): string[] {
  return Object.entries(table).flatMap(([key, value]) =>
    typeof value === 'string' ? [prefix + key] : keys(value, `${prefix}${key}.`),
  );
}

const SUFFIX = /_(zero|one|two|few|many|other)$/;

/** The plural keys of a table, base key to the forms it has. */
function plurals(table: Table): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const key of keys(table)) {
    const form = SUFFIX.exec(key)?.[1];
    if (!form) continue;
    const base = key.slice(0, -form.length - 1);
    found.set(base, [...(found.get(base) ?? []), form]);
  }
  return found;
}

describe('plural strings', () => {
  it('reads every area table', () => {
    expect(tables.length).toBeGreaterThan(15);
    expect(tables.map((table) => table.name)).toContain('templates');
  });

  it('gives every Hebrew plural key its one, two and other forms', () => {
    const missing = tables.flatMap(({ name, he: table }) =>
      [...plurals(table)]
        .filter(([, forms]) => [...forms].sort().join() !== 'one,other,two')
        .map(([base, forms]) => `${name}:${base} (${forms.join(', ')})`),
    );
    expect(missing).toEqual([]);
  });

  it('gives every English plural key its one and other forms', () => {
    const missing = tables.flatMap(({ name, en: table }) =>
      [...plurals(table)]
        .filter(([, forms]) => !forms.includes('one') || !forms.includes('other'))
        .map(([base]) => `${name}:${base}`),
    );
    expect(missing).toEqual([]);
  });

  it('never shows a key for any count, in either language', () => {
    const shown: string[] = [];
    for (const { name, he: heTable, en: enTable } of tables) {
      const ns = `plural-check-${name}`;
      registerMessages(ns, { he: heTable, en: enTable });
      // The plural keys, and every plain key that shows a count.
      const counted = keys(heTable).filter((key) => {
        const text = key
          .split('.')
          .reduce<Table | string | undefined>(
            (node, part) => (typeof node === 'object' ? node[part] : undefined),
            heTable,
          );
        return !SUFFIX.test(key) && typeof text === 'string' && text.includes('{{count}}');
      });
      for (const base of [...plurals(heTable).keys(), ...counted]) {
        for (const lng of ['he', 'en']) {
          for (const count of [0, 1, 2, 3, 10, 11, 20, 100]) {
            const text = i18n.t(`${ns}:${base}`, { lng, count });
            if (text === base || text.endsWith(base)) shown.push(`${lng} ${name}:${base} ${count}`);
          }
        }
      }
    }
    expect(shown).toEqual([]);
  });
});
