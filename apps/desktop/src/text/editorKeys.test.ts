// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_EDITOR_KEYS, editorCommand, setEditorKeys } from './editorKeys';

/** A key press as a layout reports it. */
function press(init: KeyboardEventInit & { altGraph?: boolean }): KeyboardEvent {
  const event = new KeyboardEvent('keydown', init);
  // happy-dom has no modifier state to ask.
  Object.defineProperty(event, 'getModifierState', {
    value: (name: string) => name === 'AltGraph' && Boolean(init.altGraph),
  });
  return event;
}

afterEach(() => setEditorKeys(null));

describe('the keys of the text editor', () => {
  it('are the keys of SPEC Appendix A until the app says otherwise', () => {
    expect(editorCommand(press({ key: 'b', code: 'KeyB', ctrlKey: true }))).toBe('bold');
    expect(editorCommand(press({ key: 'i', code: 'KeyI', ctrlKey: true }))).toBe('italic');
    expect(editorCommand(press({ key: 'u', code: 'KeyU', ctrlKey: true }))).toBe('underline');
    expect(editorCommand(press({ key: 'X', code: 'KeyX', ctrlKey: true, shiftKey: true }))).toBe(
      'direction',
    );
    expect(editorCommand(press({ key: 'z', code: 'KeyZ', ctrlKey: true }))).toBe('undo');
    expect(editorCommand(press({ key: 'y', code: 'KeyY', ctrlKey: true }))).toBe('redo');
    expect(editorCommand(press({ key: 'Z', code: 'KeyZ', ctrlKey: true, shiftKey: true }))).toBe(
      'redo',
    );
    expect(editorCommand(press({ key: 'x', code: 'KeyX', ctrlKey: true }))).toBeNull();
    expect(editorCommand(press({ key: 'b', code: 'KeyB' }))).toBeNull();
  });

  it('are read as the shell reads a shortcut: by the letter, and by the place on a Hebrew layout', () => {
    // A Hebrew layout types נ on the key of B.
    expect(editorCommand(press({ key: 'נ', code: 'KeyB', ctrlKey: true }))).toBe('bold');
    // QWERTZ: the key marked Z is where QWERTY has Y.
    expect(editorCommand(press({ key: 'z', code: 'KeyY', ctrlKey: true }))).toBe('undo');
    expect(editorCommand(press({ key: 'y', code: 'KeyZ', ctrlKey: true }))).toBe('redo');
    // A letter typed with AltGr, which reports Ctrl and Alt, is text.
    setEditorKeys(() => ({ ...DEFAULT_EDITOR_KEYS, bold: ['ctrl+alt+b'] }));
    const typed = { key: 'ב', code: 'KeyB', ctrlKey: true, altKey: true };
    expect(editorCommand(press(typed))).toBe('bold');
    expect(editorCommand(press({ ...typed, altGraph: true }))).toBeNull();
  });

  it("follow the user's keys, asked at every press", () => {
    let keys = { ...DEFAULT_EDITOR_KEYS, bold: ['ctrl+j'], undo: ['f9'], redo: [] as string[] };
    setEditorKeys(() => keys);
    expect(editorCommand(press({ key: 'j', code: 'KeyJ', ctrlKey: true }))).toBe('bold');
    // The key the command came with is no longer its key, and a command left without a key
    // answers to none.
    expect(editorCommand(press({ key: 'b', code: 'KeyB', ctrlKey: true }))).toBeNull();
    expect(editorCommand(press({ key: 'F9', code: 'F9' }))).toBe('undo');
    expect(editorCommand(press({ key: 'z', code: 'KeyZ', ctrlKey: true }))).toBeNull();
    expect(editorCommand(press({ key: 'y', code: 'KeyY', ctrlKey: true }))).toBeNull();
    keys = { ...keys, bold: ['ctrl+b'] };
    expect(editorCommand(press({ key: 'b', code: 'KeyB', ctrlKey: true }))).toBe('bold');
  });

  it('never take a key that types, whatever the settings say', () => {
    setEditorKeys(() => ({
      ...DEFAULT_EDITOR_KEYS,
      bold: ['b', 'shift+b', 'space', 'enter'],
      undo: ['backspace'],
    }));
    expect(editorCommand(press({ key: 'b', code: 'KeyB' }))).toBeNull();
    expect(editorCommand(press({ key: 'B', code: 'KeyB', shiftKey: true }))).toBeNull();
    expect(editorCommand(press({ key: ' ', code: 'Space' }))).toBeNull();
    expect(editorCommand(press({ key: 'Enter', code: 'Enter' }))).toBeNull();
    expect(editorCommand(press({ key: 'Backspace', code: 'Backspace' }))).toBeNull();
  });
});
