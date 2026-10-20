// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
// The three areas register their shortcuts when they load.
import '../ai/register';
import '../arrange/register';
import '../present/register';
import { en } from '../i18n/en';
import { he } from '../i18n/he';
import { shortcutsFor, type ShortcutDefinition } from './registry';
import { mapRows } from './shortcutList';

/*
 * The shortcuts of the areas that came before the shortcut map name themselves (ADR-060): the
 * map lists a shortcut by its own label and section, and a key with neither is not listed.
 */

const KEYS = [
  'Ctrl+D',
  'Ctrl+Alt+V',
  'Ctrl+G',
  'Ctrl+Shift+G',
  'Ctrl+Shift+]',
  'Ctrl+]',
  'Ctrl+[',
  'Ctrl+Shift+[',
  'Ctrl+M',
  'Ctrl+L',
  'F5',
  'Shift+F5',
];

describe('the shortcuts of arrange, present and the AI tools', () => {
  it('each carry a label and a section of the map', () => {
    const ours = KEYS.flatMap((keys) => shortcutsFor(keys)).filter(({ id }) =>
      /^(arrange|present|ai)\./.test(id),
    );
    expect(ours.map(({ id }) => id).sort()).toEqual(
      [
        'ai.focusChat',
        'arrange.duplicate',
        'arrange.group',
        'arrange.newSlide',
        'arrange.order.back',
        'arrange.order.backward',
        'arrange.order.forward',
        'arrange.order.front',
        'arrange.pasteStyle',
        'arrange.ungroup',
        'present.fromCurrent',
        'present.fromStart',
      ].sort(),
    );
    const unnamed = ours.filter(({ label, section }) => !label || !section).map(({ id }) => id);
    expect(unnamed).toEqual([]);
    for (const { label } of ours as Required<ShortcutDefinition>[]) {
      const key = label.replace(/^keys\./, '');
      expect(he.keys, label).toHaveProperty(key);
      expect(en.keys, label).toHaveProperty(key);
    }
    // The map lists them under the headings it listed them under before they named themselves.
    const rows = mapRows(ours);
    expect(rows.find((row) => row.id === 'arrange.group')).toMatchObject({
      section: 'arrange',
      label: 'keys.group',
      keys: ['Ctrl+G'],
    });
    expect(rows.find((row) => row.id === 'arrange.duplicate')?.section).toBe('edit');
    expect(rows.find((row) => row.id === 'arrange.newSlide')?.section).toBe('slides');
    expect(rows.find((row) => row.id === 'ai.focusChat')?.section).toBe('ai');
    expect(rows.find((row) => row.id === 'present.fromStart')?.section).toBe('present');
  });
});
