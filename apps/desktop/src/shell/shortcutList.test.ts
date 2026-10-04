import { describe, expect, it } from 'vitest';
import { en } from '../i18n/en';
import { he } from '../i18n/he';
import type { ShortcutDefinition } from './registry';
import { shortcutSections } from './registry';
import { mapRows } from './shortcutList';

const run = () => true;
const shortcut = (extra: Partial<ShortcutDefinition> & { id: string; keys: string }) =>
  ({ run, ...extra }) satisfies ShortcutDefinition;

describe('the lines of the shortcut map', () => {
  it('lists a shortcut that names itself, under its own heading', () => {
    const rows = mapRows([
      shortcut({ id: 'find.open', keys: 'ctrl+f', label: 'find:shortcut.open', section: 'edit' }),
    ]);
    expect(rows.find((row) => row.id === 'find.open')).toEqual({
      id: 'find.open',
      section: 'edit',
      label: 'find:shortcut.open',
      keys: ['Ctrl+F'],
    });
  });

  it('leaves out a registered shortcut that has no label', () => {
    expect(mapRows([shortcut({ id: 'x.secret', keys: 'Ctrl+Q' })]).map((r) => r.id)).not.toContain(
      'x.secret',
    );
  });

  it('puts two keys that do one thing on one line', () => {
    const rows = mapRows([
      shortcut({ id: 'edit.redo.y', keys: 'Ctrl+Y', label: 'keys.redo', section: 'edit' }),
      shortcut({ id: 'edit.redo.z', keys: 'Ctrl+Shift+Z', label: 'keys.redo', section: 'edit' }),
    ]);
    const redo = rows.filter((row) => row.label === 'keys.redo');
    expect(redo).toHaveLength(1);
    expect(redo[0]!.keys).toEqual(['Ctrl+Y', 'Ctrl+Shift+Z']);
  });

  it('goes section by section, the registered shortcuts of a section before the handled keys', () => {
    const rows = mapRows([
      shortcut({
        id: 'present.fromStart',
        keys: 'F5',
        label: 'keys.presentStart',
        section: 'present',
      }),
      shortcut({ id: 'edit.undo', keys: 'Ctrl+Z', label: 'keys.undo', section: 'edit' }),
    ]);
    const order = rows.map((row) => shortcutSections.indexOf(row.section));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    const edit = rows.filter((row) => row.section === 'edit').map((row) => row.id);
    expect(edit[0]).toBe('edit.undo');
    expect(edit).toContain('edit.copy');
  });

  it("opens a section with the shell's own shortcuts, whichever area registered first", () => {
    const rows = mapRows([
      shortcut({ id: 'find.open', keys: 'Ctrl+F', label: 'find:shortcut.open', section: 'edit' }),
      shortcut({ id: 'shell.undo', keys: 'Ctrl+Z', label: 'keys.undo', section: 'edit' }),
    ]);
    const edit = rows.filter((row) => row.section === 'edit').map((row) => row.id);
    expect(edit.slice(0, 2)).toEqual(['shell.undo', 'find.open']);
  });

  it('has a string in both languages for every line and every word it shows', () => {
    const rows = mapRows([]);
    const words = new Set<string>();
    for (const row of rows) {
      const key = row.label.replace(/^keys\./, '');
      expect(he.keys, row.label).toHaveProperty(key);
      expect(en.keys, row.label).toHaveProperty(key);
      for (const keys of row.keys) {
        for (const [, word] of keys.matchAll(/\{(\w+)\}/g)) words.add(word!);
      }
    }
    for (const word of words) {
      expect(he.keys.words).toHaveProperty(word);
      expect(en.keys.words).toHaveProperty(word);
    }
    for (const section of shortcutSections) expect(he.keys.sections).toHaveProperty(section);
  });
});
