import { useSyncExternalStore } from 'react';

/*
 * The ring of a surface that draws its own focus: the Stage and the Filmstrip (DSN-08). Both
 * take the focus by script when they are pressed, and a browser's own rule for showing a ring
 * (`:focus-visible`) has nothing to go by then. So the rule is kept here: the ring shows while
 * the surface has the focus and the keyboard is what the user is working with, which is from
 * the first key pressed until the next press of the pointer. A surface that got the focus from
 * a press shows no ring, and shows one as soon as keys follow.
 */

/** Keys that are held with a press of the pointer, and so say nothing about the keyboard. */
const MODIFIERS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'AltGraph', 'CapsLock', 'OS', 'Fn']);

let inUse = false;
const listeners = new Set<() => void>();
let listening = false;

function set(next: boolean): void {
  if (inUse === next) return;
  inUse = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  if (!listening) {
    listening = true;
    // In the capture phase, so the answer is ready before any handler of the key or the press.
    window.addEventListener('keydown', (event) => !MODIFIERS.has(event.key) && set(true), true);
    window.addEventListener('pointerdown', () => set(false), true);
  }
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** True from a key press until the next press of the pointer. */
export function useKeyboardInUse(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => inUse,
    () => false,
  );
}
