// By file, not through the shell's index: the index loads the Stage, which loads the editor.
import { eventKeys } from '../shell/eventKeys';

/*
 * The keys of the commands the slide's text editor runs itself: bold, italic, underline, the
 * direction of the paragraph, undo and redo. The editor handles them, and not the shell's
 * shortcuts, which stay out of text: there the browser has an undo and a bold of its own to keep
 * away, and the command must act on the editor's selection in the same key press.
 *
 * Which key each command is on is asked here at every key press. The editor comes with the keys
 * of SPEC Appendix A; the app points the question at the user's keys (`text/register.tsx`), so a
 * shortcut the user moved in the shortcut map moves in the text too.
 */

export type EditorCommand = 'bold' | 'italic' | 'underline' | 'direction' | 'undo' | 'redo';

/** For each command, the combinations it answers to, written as `eventKeys` writes a key press. */
export type EditorKeys = Readonly<Record<EditorCommand, readonly string[]>>;

export const DEFAULT_EDITOR_KEYS: EditorKeys = {
  bold: ['ctrl+b'],
  italic: ['ctrl+i'],
  underline: ['ctrl+u'],
  direction: ['ctrl+shift+x'],
  undo: ['ctrl+z'],
  redo: ['ctrl+y', 'ctrl+shift+z'],
};

const COMMANDS = Object.keys(DEFAULT_EDITOR_KEYS) as EditorCommand[];

let read: () => EditorKeys = () => DEFAULT_EDITOR_KEYS;

/** Says where the keys are read from; `null` puts back the keys the editor comes with. */
export function setEditorKeys(source: (() => EditorKeys) | null): void {
  read = source ?? (() => DEFAULT_EDITOR_KEYS);
}

/** A key that types when it is pressed alone: a command on it would take the letter from the text. */
const TYPES = /^(?:shift\+)?(?:.|space|enter|tab|backspace|delete)$/;

/**
 * The command a key press is, or null when it is none of them. A character typed with AltGr,
 * which Windows reports with Ctrl and Alt, is text; and so is every key that types, whatever a
 * settings file says about it.
 */
export function editorCommand(event: KeyboardEvent): EditorCommand | null {
  if (event.metaKey || event.getModifierState('AltGraph')) return null;
  const keys = eventKeys(event);
  if (TYPES.test(keys)) return null;
  const now = read();
  return COMMANDS.find((command) => now[command].includes(keys)) ?? null;
}
