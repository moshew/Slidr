import { describe, expect, it } from 'vitest';
import { isCtrlLetter, withAltGraph } from './keys';

/** A key as a layout reports it: what it types, where it is, and the modifiers held. */
const press = (
  key: string,
  code: string,
  mods: { ctrl?: boolean; alt?: boolean; altGraph?: boolean } = {},
) => ({
  key,
  code,
  ctrlKey: Boolean(mods.ctrl),
  metaKey: false,
  altKey: Boolean(mods.alt),
  getModifierState: (name: string) => name === 'AltGraph' && Boolean(mods.altGraph),
});

describe('a Ctrl shortcut of the Stage', () => {
  it('is the letter on a Latin layout: Ctrl+A on AZERTY is the key marked A', () => {
    // AZERTY: the key marked A is where QWERTY has Q.
    expect(isCtrlLetter(press('a', 'KeyQ', { ctrl: true }), 'a')).toBe(true);
    expect(isCtrlLetter(press('q', 'KeyA', { ctrl: true }), 'a')).toBe(false);
    // QWERTY.
    expect(isCtrlLetter(press('a', 'KeyA', { ctrl: true }), 'a')).toBe(true);
  });

  it('is the place of the key on a layout of another script', () => {
    expect(isCtrlLetter(press('ש', 'KeyA', { ctrl: true }), 'a')).toBe(true);
  });

  it('needs Ctrl, and a character typed with AltGr is not one', () => {
    expect(isCtrlLetter(press('a', 'KeyA'), 'a')).toBe(false);
    // Polish: AltGr+A types ą, and Windows reports Ctrl and Alt with it.
    const ogonek = press('ą', 'KeyA', { ctrl: true, alt: true, altGraph: true });
    expect(isCtrlLetter(ogonek, 'a')).toBe(false);
    expect(withAltGraph(ogonek)).toBe(true);
  });
});
