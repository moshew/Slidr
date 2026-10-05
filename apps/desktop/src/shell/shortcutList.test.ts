import { describe, expect, it } from 'vitest';
import { en } from '../i18n/en';
import { he } from '../i18n/he';
import type { ShortcutDefinition } from './registry';
import { shortcutSections } from './registry';
import { mapRows, verdict } from './shortcutList';

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
      bindings: [{ keys: 'Ctrl+F', shortcut: 'find.open' }],
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

  it('draws the key the user gave a shortcut, and remembers the one it came with', () => {
    const group = shortcut({
      id: 'x.group',
      keys: 'Ctrl+G',
      label: 'keys.group',
      section: 'arrange',
    });
    const save = shortcut({ id: 'x.save', keys: 'Ctrl+S', label: 'keys.save', section: 'file' });
    const rows = mapRows([group, save], { 'x.group': 'ctrl+shift+k', 'x.save': '' });
    expect(rows.find((row) => row.id === 'x.group')).toMatchObject({
      keys: ['Ctrl+Shift+K'],
      bindings: [{ keys: 'Ctrl+Shift+K', shortcut: 'x.group', original: 'Ctrl+G' }],
    });
    // A shortcut left without a key is still a line of the map, with nothing to search by.
    expect(rows.find((row) => row.id === 'x.save')).toMatchObject({
      keys: [],
      bindings: [{ keys: '', shortcut: 'x.save', original: 'Ctrl+S' }],
    });
  });

  it('says which keys stay what they are, and why', () => {
    const rows = mapRows(
      [
        shortcut({ id: 'text.bold', keys: 'Ctrl+B', label: 'text:shortcut.bold', section: 'text' }),
        shortcut({ id: 'shell.undo', keys: 'Ctrl+Z', label: 'keys.undo', section: 'edit' }),
        shortcut({ id: 'x.leave', keys: 'Escape', label: 'keys.leaveGroup', section: 'arrange' }),
      ],
      // A key written by hand for a shortcut that keeps its own is not drawn, and does not act.
      { 'text.bold': 'ctrl+q' },
    );
    const fixedOf = (id: string) => rows.find((row) => row.id === id)?.bindings.map((b) => b.fixed);
    expect(rows.find((row) => row.id === 'text.bold')?.bindings).toEqual([
      { keys: 'Ctrl+B', shortcut: 'text.bold', fixed: 'text' },
    ]);
    expect(fixedOf('shell.undo')).toEqual(['text']);
    // A named key without Ctrl or Alt, also when an area registered it.
    expect(fixedOf('x.leave')).toEqual(['control']);
    expect(fixedOf('edit.copy')).toEqual(['control']);
    expect(fixedOf('table.type')).toEqual(['control', 'control']);
    expect(fixedOf('present.black')).toEqual(['show', 'show']);
  });

  it('lists "duplicate the slides" with the key of the shortcut that does it', () => {
    const duplicate = shortcut({
      id: 'arrange.duplicate',
      keys: 'Ctrl+D',
      label: 'keys.duplicate',
      section: 'edit',
    });
    const before = mapRows([duplicate]).find((row) => row.id === 'slides.duplicate');
    expect(before?.bindings).toEqual([{ keys: 'Ctrl+D', shortcut: 'arrange.duplicate' }]);
    const after = mapRows([duplicate], { 'arrange.duplicate': 'ctrl+j' });
    expect(after.find((row) => row.id === 'slides.duplicate')?.keys).toEqual(['Ctrl+J']);
    // Without the registration the line is the key as it is written here, and it is fixed.
    expect(mapRows([]).find((row) => row.id === 'slides.duplicate')?.bindings).toEqual([
      { keys: 'Ctrl+D', fixed: 'control' },
    ]);
  });
});

describe('a new key for a shortcut', () => {
  const group = shortcut({
    id: 'x.group',
    keys: 'Ctrl+G',
    label: 'keys.group',
    section: 'arrange',
  });
  const save = shortcut({ id: 'x.save', keys: 'Ctrl+S', label: 'keys.save', inText: true });
  const insert = shortcut({ id: 'x.insert', keys: 'T', label: 'keys.new' });
  const bold = shortcut({ id: 'text.bold', keys: 'Ctrl+B', label: 'text:shortcut.bold' });
  const crop = shortcut({ id: 'x.crop.leave', keys: 'Escape' });
  const all = [group, save, insert, bold, crop];
  const ask = (which: ShortcutDefinition, keys: string, user = {}) =>
    verdict(which, keys, all, user);

  it('is free when nobody answers to it, and the same when it is the one it has', () => {
    expect(ask(group, 'Ctrl+Shift+K')).toEqual({ kind: 'free' });
    expect(ask(group, 'ctrl+g')).toEqual({ kind: 'same' });
    expect(ask(group, 'F8')).toEqual({ kind: 'free' });
    expect(ask(group, 'Ctrl+Alt+Enter')).toEqual({ kind: 'free' });
  });

  it('names the shortcut that has the key, before anything moves', () => {
    expect(ask(group, 'Ctrl+S')).toEqual({ kind: 'taken', by: [save] });
    // The key a shortcut came with is free once the user moved that shortcut away.
    expect(ask(group, 'Ctrl+S', { 'x.save': 'ctrl+alt+s' })).toEqual({ kind: 'free' });
    expect(ask(group, 'Ctrl+Alt+S', { 'x.save': 'ctrl+alt+s' })).toEqual({
      kind: 'taken',
      by: [save],
    });
  });

  it('does not give away a key a control reads itself', () => {
    expect(ask(group, 'Ctrl+C')).toEqual({ kind: 'fixed', label: 'keys.copy' });
    expect(ask(group, 'Ctrl+ArrowLeft')).toEqual({ kind: 'fixed', label: 'keys.resize' });
    expect(ask(group, 'Shift+F10')).toEqual({ kind: 'fixed', label: 'keys.menu' });
    expect(ask(group, 'Delete')).toEqual({ kind: 'fixed', label: 'keys.delete' });
    expect(ask(group, 'F2')).toEqual({ kind: 'fixed', label: 'keys.typeCell' });
  });

  it("does not give away a key of the text editor's, or of a shortcut nobody named", () => {
    expect(ask(group, 'Ctrl+B')).toEqual({ kind: 'fixed', label: 'text:shortcut.bold' });
    expect(ask(group, 'Escape')).toMatchObject({ kind: 'fixed' });
  });

  it('turns back a key no shortcut can have', () => {
    for (const keys of ['PageDown', 'Shift+Home', 'Ctrl+Escape', 'Alt+F4', 'Ctrl+;', 'Ctrl+']) {
      expect(ask(group, keys), keys).toEqual({ kind: 'unusable', why: 'key' });
    }
  });

  it('keeps a key that types for a shortcut that stays out of text', () => {
    expect(ask(insert, 'R')).toEqual({ kind: 'free' });
    expect(ask(insert, 'Shift+R')).toEqual({ kind: 'free' });
    expect(ask(save, 'S')).toEqual({ kind: 'unusable', why: 'typing' });
    expect(ask(save, 'Shift+2')).toEqual({ kind: 'unusable', why: 'typing' });
    expect(ask(save, 'F9')).toEqual({ kind: 'free' });
    expect(ask(save, 'Alt+S')).toEqual({ kind: 'free' });
  });

  it('asks only who has the key when a shortcut goes back to the one it came with', () => {
    const user = { 'x.group': 'ctrl+j', 'x.insert': 'ctrl+g' };
    expect(verdict(group, 'Ctrl+G', all, user, { restore: true })).toEqual({
      kind: 'taken',
      by: [insert],
    });
    expect(verdict(insert, 'T', all, user, { restore: true })).toEqual({ kind: 'free' });
  });
});
