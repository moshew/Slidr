/*
 * Keys of the Stage's own shortcuts, read the way the shell reads every shortcut
 * (`shell/shortcuts.ts`): a Latin letter by the letter itself, so Ctrl+A on an AZERTY keyboard
 * is the key marked A, where QWERTY has Q; a key that types another script (Hebrew) by its
 * place on the keyboard. A character typed with AltGr, which Windows reports with Ctrl and Alt,
 * is text and never a shortcut.
 */

type KeyEventLike = Pick<
  KeyboardEvent,
  'key' | 'code' | 'ctrlKey' | 'metaKey' | 'altKey' | 'getModifierState'
>;

/** The key was typed with AltGr: a character of the layout, such as `ą` or `€`. */
export function withAltGraph(event: KeyEventLike): boolean {
  return event.getModifierState('AltGraph');
}

/** Ctrl (Cmd on a Mac) and a letter, `a` to `z`, on any layout. */
export function isCtrlLetter(event: KeyEventLike, letter: string): boolean {
  if (!(event.ctrlKey || event.metaKey) || withAltGraph(event)) return false;
  const key = event.key.toLowerCase();
  if (/^[a-z]$/.test(key)) return key === letter;
  return event.code === `Key${letter.toUpperCase()}`;
}
