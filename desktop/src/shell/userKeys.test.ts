import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { pageSettings, replaceSection, useSettings } from '../settings';
import { registries, shortcutsFor, type ShortcutDefinition } from './registry';
import {
  changeKeys,
  drawnKeys,
  fixedReason,
  keysNow,
  keysOf,
  resetKeys,
  shortcutsOn,
  shownKeys,
  userKeys,
} from './userKeys';

/*
 * The user's own keys (WG3-T07): a shortcut answers to the key the user gave it, the settings
 * file holds only what the user changed, and a hint that names a key shows where it went.
 */

const run = () => true;
const group: ShortcutDefinition = { id: 't.group', keys: 'Ctrl+G', label: 'keys.group', run };
const save: ShortcutDefinition = { id: 't.save', keys: 'Ctrl+S', label: 'keys.save', run };
const paste: ShortcutDefinition = { id: 't.paste', keys: 'Ctrl+Alt+V', label: 'keys.paste', run };
const paint: ShortcutDefinition = { id: 't.paint', keys: 'ctrl+alt+v', label: 'keys.copy', run };
const bold: ShortcutDefinition = { id: 'text.bold', keys: 'Ctrl+B', label: 'keys.cut', run };
/** A key a control reads itself: registered without a name, it is not the user's to move. */
const leave: ShortcutDefinition = { id: 't.leave', keys: 'Escape', run };

/** The section as the settings file holds it. */
const stored = async () => (await pageSettings.read()).shortcuts;

beforeEach(() => {
  registries.shortcuts.setState({ items: [group, save, paste, paint, bold, leave] });
});

afterEach(async () => {
  registries.shortcuts.setState({ items: [] });
  await replaceSection('shortcuts', null);
});

describe('the key a shortcut answers to', () => {
  it('is the one it was registered with until the user gives it another', async () => {
    expect(keysOf(group)).toBe('ctrl+g');
    expect(shortcutsOn('Ctrl+G')).toEqual([group]);

    await changeKeys({ 't.group': 'Ctrl+Shift+K' });
    expect(keysOf(group)).toBe('ctrl+shift+k');
    expect(shortcutsOn('ctrl+shift+k')).toEqual([group]);
    // The key it came with is nobody's now; the registry still says where it came from.
    expect(shortcutsOn('Ctrl+G')).toEqual([]);
    expect(shortcutsFor('Ctrl+G')).toEqual([group]);
  });

  it('asks the latest registration of a combination first', async () => {
    expect(shortcutsOn('Ctrl+Alt+V')).toEqual([paint, paste]);
    // Also when the user is the one who put two shortcuts on one key.
    await changeKeys({ 't.save': 'ctrl+g' });
    expect(shortcutsOn('Ctrl+G')).toEqual([save, group]);
  });

  it('is none for a shortcut the user left without a key', async () => {
    await changeKeys({ 't.group': '' });
    expect(keysOf(group)).toBe('');
    expect(shortcutsOn('Ctrl+G')).toEqual([]);
    expect(shortcutsOn('')).toEqual([]);
  });

  it('stays what it is for a shortcut that keeps its key', async () => {
    expect(fixedReason(leave)).toBe('control');
    expect(fixedReason({ id: 't.enter', keys: 'Enter', label: 'keys.editText' })).toBe('control');
    expect(fixedReason({ id: 't.toolbar', keys: 'Alt+F10', label: 'keys.menu' })).toBeNull();
    expect(fixedReason(group)).toBeNull();
    // The keys the text editor answers itself are the user's to move like any other.
    expect(fixedReason(bold)).toBeNull();
    expect(fixedReason({ id: 'shell.redo.Ctrl+Y', keys: 'Ctrl+Y', label: 'keys.redo' })).toBeNull();
    // A key written into the settings file by hand does not move a shortcut that keeps its own.
    await replaceSection('shortcuts', { keys: { 't.leave': 'ctrl+q' } });
    expect(keysOf(leave)).toBe('escape');
    expect(shortcutsOn('Ctrl+Q')).toEqual([]);
    expect(shortcutsOn('Escape')).toEqual([leave]);
  });

  it('is told to a control that runs the command itself, as the text editor does', async () => {
    const isBold = (id: string) => id === 'text.bold';
    expect(keysNow(isBold)).toEqual(['ctrl+b']);
    await changeKeys({ 'text.bold': 'Ctrl+J' });
    expect(keysNow(isBold)).toEqual(['ctrl+j']);
    // Several shortcuts of one command, each with its key; one left without a key gives none.
    expect(keysNow((id) => id === 't.paste' || id === 't.paint')).toEqual([
      'ctrl+alt+v',
      'ctrl+alt+v',
    ]);
    await changeKeys({ 'text.bold': '' });
    expect(keysNow(isBold)).toEqual([]);
    expect(keysNow((id) => id === 'nobody')).toEqual([]);
  });
});

describe('the settings file', () => {
  it('holds only what the user changed', async () => {
    await changeKeys({ 't.group': 'Ctrl+Shift+K', 't.save': '' });
    expect(await stored()).toEqual({ keys: { 't.group': 'ctrl+shift+k', 't.save': '' } });

    // Back on the key it came with, by name or by pressing that key again: not an entry.
    await changeKeys({ 't.group': 'ctrl+g' });
    expect(await stored()).toEqual({ keys: { 't.save': '' } });
    await changeKeys({ 't.save': null });
    expect(await stored()).toBeUndefined();
    expect(userKeys()).toEqual({});
  });

  it('is cleared of every key at once, and keeps what else its section holds', async () => {
    await replaceSection('shortcuts', { keys: { 't.group': 'ctrl+j' }, later: true });
    expect(keysOf(group)).toBe('ctrl+j');
    await resetKeys();
    expect(keysOf(group)).toBe('ctrl+g');
    expect(await stored()).toEqual({ later: true });
  });

  it('keeps the key of a shortcut nobody registered here', async () => {
    await changeKeys({ 'later.thing': 'Ctrl+J' });
    await changeKeys({ 't.group': 'Ctrl+K' });
    expect(await stored()).toEqual({ keys: { 'later.thing': 'ctrl+j', 't.group': 'ctrl+k' } });
  });

  it('is read with whatever is in it', () => {
    for (const broken of [null, 7, 'keys', [], { keys: 'ctrl+g' }, { keys: ['ctrl+g'] }]) {
      useSettings.setState({ sections: { shortcuts: broken } });
      expect(userKeys(), JSON.stringify(broken)).toEqual({});
    }
    useSettings.setState({
      sections: { shortcuts: { keys: { 't.group': 'Shift+Ctrl+J', x: 3 } } },
    });
    expect(userKeys()).toEqual({ 't.group': 'ctrl+shift+j' });
  });

  it('holds the new key as soon as it is given, before the file has it', () => {
    void changeKeys({ 't.group': 'Ctrl+J' });
    expect(shortcutsOn('Ctrl+J')).toEqual([group]);
  });
});

describe('a hint that names a key', () => {
  it('shows the key as it was written while the shortcut has it', () => {
    expect(shownKeys('Ctrl+G')).toBe('Ctrl+G');
    expect(shownKeys('Del')).toBe('Del');
  });

  it('shows where the user moved the shortcut, and nothing when it has no key', async () => {
    await changeKeys({ 't.group': 'ctrl+shift+k' });
    expect(shownKeys('Ctrl+G')).toBe('Ctrl+Shift+K');
    expect(shownKeys('ctrl+g')).toBe('Ctrl+Shift+K');
    // Another shortcut's hint is not touched, nor one that is not a registered key.
    expect(shownKeys('Ctrl+S')).toBe('Ctrl+S');
    expect(shownKeys('Enter')).toBe('Enter');
    await changeKeys({ 't.group': '' });
    expect(shownKeys('Ctrl+G')).toBe('');
  });

  it('follows the shortcut that moved, of two that came with one key', async () => {
    await changeKeys({ 't.paste': 'ctrl+alt+p' });
    expect(shownKeys('Ctrl+Alt+V')).toBe('Ctrl+Alt+P');
  });

  it('is not moved by a key the user gave another shortcut', async () => {
    // "Save" now answers to Ctrl+G; the hint of "group" still says Ctrl+G, which it also has.
    await changeKeys({ 't.save': 'ctrl+g' });
    expect(shownKeys('Ctrl+G')).toBe('Ctrl+G');
    expect(shownKeys('Ctrl+S')).toBe('Ctrl+G');
  });
});

describe('how a key is drawn', () => {
  it('writes the modifiers in one order, and the keys by the names on them', () => {
    expect(drawnKeys('shift+ctrl+g')).toBe('Ctrl+Shift+G');
    expect(drawnKeys('alt+f10')).toBe('Alt+F10');
    expect(drawnKeys('ctrl+arrowleft')).toBe('Ctrl+←');
    expect(drawnKeys('ctrl+space')).toBe('Ctrl+Space');
    expect(drawnKeys('ctrl+delete')).toBe('Ctrl+Del');
    expect(drawnKeys('escape')).toBe('Esc');
    expect(drawnKeys('')).toBe('');
  });
});
