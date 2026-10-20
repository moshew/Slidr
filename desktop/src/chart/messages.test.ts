// @vitest-environment happy-dom
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ChartType } from '@slidr/model';
import { describe, expect, it } from 'vitest';
import { i18n } from '../i18n';
import { CHART_TYPES, typeIcons } from './icons';
import { en, he } from './messages';

/* The strings of the chart area (UI-05, PLAN 1.2): every one in Hebrew and in English. */

/** Every key of a string table, as `a.b.c`. */
function keys(table: object, prefix = ''): string[] {
  return Object.entries(table).flatMap(([key, value]) =>
    typeof value === 'string' ? [prefix + key] : keys(value as object, `${prefix}${key}.`),
  );
}

const dir = dirname(fileURLToPath(import.meta.url));
const sources = readdirSync(dir)
  .filter((name) => /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name))
  .map((name) => ({ name, text: readFileSync(join(dir, name), 'utf8') }));

describe('the strings of the chart area', () => {
  it('has the same keys in Hebrew and in English, none empty', () => {
    expect(keys(en).sort()).toEqual(keys(he).sort());
    for (const key of keys(he)) {
      for (const lng of ['he', 'en']) {
        const text = i18n.t(`chart:${key}`, { lng, n: 1, text: 'x' });
        expect(text, `${lng} ${key}`).not.toBe('');
        expect(text, `${lng} ${key}`).not.toContain(key);
      }
    }
  });

  it('says the Hebrew ones in Hebrew and the English ones in English', () => {
    const hebrew = /\p{Script=Hebrew}/u;
    for (const key of keys(he)) {
      expect(i18n.t(`chart:${key}`, { lng: 'he' }), key).toMatch(hebrew);
      expect(i18n.t(`chart:${key}`, { lng: 'en' }), key).not.toMatch(hebrew);
    }
  });

  it('has every key the area asks for', () => {
    const known = new Set(keys(he));
    const groups = Object.keys(he).join('|');
    // What is asked of `t(...)`: `t('legend.show')`, `t(round ? 'colors.slices' : 'colors.series')`,
    // and through i18n directly `i18n.t('chart:history.insert')`.
    const calls = sources.flatMap(({ text }) => [...text.matchAll(/\bt\(([^()]*)\)/g)]);
    const literal = /['"](?:chart:)?([a-zA-Z]+\.[a-zA-Z.]+)['"]/g;
    const used = calls.flatMap((call) =>
      [...(call[1] ?? '').matchAll(literal)].map((m) => m[1] ?? ''),
    );
    expect(used.length).toBeGreaterThan(40);
    expect(used.filter((key) => !known.has(key))).toEqual([]);
    // And the keys that are put together from a name: `types.${chartType}`, `history.${key}`.
    const built = new RegExp(`\`(?:chart:)?(${groups})\\.\\$\\{`, 'g');
    const prefixes = new Set(
      sources.flatMap(({ text }) => [...text.matchAll(built)].map((m) => m[1] ?? '')),
    );
    expect([...prefixes].sort()).toEqual(['axes', 'history', 'legend', 'types']);
  });

  it('uses every key it has', () => {
    const all = sources.map(({ text }) => text).join('\n');
    // Keys that are built from a name are used by their group (see above).
    const built = ['types.', 'history.', 'legend.', 'axes.'];
    const unused = keys(he).filter(
      (key) =>
        !built.some((prefix) => key.startsWith(prefix)) &&
        !all.includes(`'${key}'`) &&
        !all.includes(`'chart:${key}'`),
    );
    expect(unused).toEqual([]);
  });

  it('names every chart type, and has an icon for each', () => {
    expect([...CHART_TYPES].sort()).toEqual([...ChartType.options].sort());
    for (const type of ChartType.options) {
      expect(keys(he)).toContain(`types.${type}`);
      expect(typeIcons[type]).toBeDefined();
    }
  });

  it('has the history label of every action', () => {
    for (const key of keys(he.history)) {
      expect(i18n.t(`chart:history.${key}`, { lng: 'he' })).toBe(
        (he.history as Record<string, string>)[key],
      );
    }
  });
});
