// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Editor } from './editor';
import { registries, type ShortcutDefinition } from './registry';
import { eventKeys, useShellShortcuts } from './shortcuts';
import { useShell } from './store';

/*
 * The shell's key listener and the user's keys (WG3-T07): the keys are read from the settings
 * file when the window comes up, and no shortcut answers before they are known.
 */

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke, isTauri: () => true }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Keys({ editor }: { editor: Editor }) {
  useShellShortcuts(editor);
  return null;
}

const editor = {} as Editor;
let root: Root;
let host: HTMLElement;

const press = (init: KeyboardEventInit) => {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  // happy-dom has no modifier state to ask; no key here is typed with AltGr.
  Object.defineProperty(event, 'getModifierState', { value: () => false });
  window.dispatchEvent(event);
  return event;
};

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  // The editor, not the welcome screen, where only the File commands answer.
  useShell.setState({ welcome: false });
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  registries.shortcuts.setState({ items: [] });
});

describe('the keys of the shell', () => {
  it('reads a key press the same way on every layout', () => {
    const keys = (init: KeyboardEventInit) => eventKeys(new KeyboardEvent('keydown', init));
    expect(keys({ key: 'g', code: 'KeyG', ctrlKey: true, shiftKey: true })).toBe('ctrl+shift+g');
    // A Hebrew layout reports its own letter: the place of the key decides.
    expect(keys({ key: 'ע', code: 'KeyG', ctrlKey: true })).toBe('ctrl+g');
    expect(keys({ key: ' ', code: 'Space', ctrlKey: true })).toBe('ctrl+space');
    expect(keys({ key: 'F8', code: 'F8' })).toBe('f8');
    // "Ctrl and plus": the key marked `+ =`, with Shift or without, and the number pad's plus.
    expect(keys({ key: '=', code: 'Equal', ctrlKey: true })).toBe('ctrl+=');
    expect(keys({ key: '+', code: 'Equal', ctrlKey: true, shiftKey: true })).toBe('ctrl+shift+=');
    expect(keys({ key: '+', code: 'NumpadAdd', ctrlKey: true })).toBe('ctrl+=');
    expect(keys({ key: '-', code: 'NumpadSubtract', ctrlKey: true })).toBe('ctrl+-');
  });

  it("answers no shortcut until the user's keys were read, and then by the user's keys", async () => {
    const run = vi.fn(() => true);
    const group: ShortcutDefinition = { id: 't.group', keys: 'Ctrl+G', label: 'keys.group', run };
    registries.shortcuts.setState({ items: [group] });

    // The settings file is on its way: the core has not answered yet.
    let answer: (sections: unknown) => void = () => undefined;
    invoke.mockImplementation((command: string) =>
      command === 'settings_read'
        ? new Promise((resolve) => (answer = resolve))
        : Promise.resolve([]),
    );
    act(() => root.render(<Keys editor={editor} />));

    // The key the shortcut came with, pressed before the answer: the user moved it elsewhere,
    // and the app does not know that yet. Nothing runs.
    press({ key: 'g', code: 'KeyG', ctrlKey: true });
    expect(run).not.toHaveBeenCalled();

    await vi.waitFor(() => expect(invoke).toHaveBeenCalledWith('settings_read', undefined));
    press({ key: 'g', code: 'KeyG', ctrlKey: true });
    expect(run).not.toHaveBeenCalled();

    await act(async () => {
      answer({ shortcuts: { keys: { 't.group': 'ctrl+shift+k' } } });
      await Promise.resolve();
    });
    await vi.waitFor(() => {
      press({ key: 'k', code: 'KeyK', ctrlKey: true, shiftKey: true });
      expect(run).toHaveBeenCalledTimes(1);
    });
    // The key it came with is not its key any more.
    const old = press({ key: 'g', code: 'KeyG', ctrlKey: true });
    expect(run).toHaveBeenCalledTimes(1);
    expect(old.defaultPrevented).toBe(false);
  });
});
