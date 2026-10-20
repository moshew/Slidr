/*
 * A key press as a combination, written the way the shortcut registry writes one (`ctrl+shift+g`):
 * for the shell's listener, for the shortcut map when it asks for a new key, and for the text
 * editor, which matches its own keys the same way. Nothing here knows the app.
 */

/** Keys that are the same key on every layout, by their physical place. */
const PHYSICAL: Record<string, string> = {
  BracketLeft: '[',
  BracketRight: ']',
  Slash: '/',
  Backslash: '\\',
  Equal: '=',
  Minus: '-',
  // The plus and the minus of the number pad are the plus and the minus: Ctrl with either zooms,
  // as Ctrl with the key marked `+ =` does.
  NumpadAdd: '=',
  NumpadSubtract: '-',
};

/**
 * The key of a shortcut. With a Hebrew layout `event.key` is a Hebrew letter (and the brackets
 * swap), so the physical key decides; with a Latin layout the letter itself does (Ctrl+Z on
 * AZERTY too).
 */
function shortcutKey(event: KeyboardEvent): string {
  const physical = PHYSICAL[event.code];
  if (physical) return physical;
  // The space bar reports a space, which a combination cannot be written with.
  if (event.code === 'Space') return 'space';
  const key = event.key.toLowerCase();
  if (/^[a-z0-9]$/.test(key)) return key;
  const letter = /^(?:Key|Digit)(.)$/.exec(event.code)?.[1];
  return letter ? letter.toLowerCase() : key;
}

/** The combination as the registry writes it: `ctrl+shift+g`. */
export function eventKeys(event: KeyboardEvent): string {
  return [
    ...(event.ctrlKey ? ['ctrl'] : []),
    ...(event.altKey ? ['alt'] : []),
    ...(event.shiftKey ? ['shift'] : []),
    shortcutKey(event),
  ].join('+');
}
