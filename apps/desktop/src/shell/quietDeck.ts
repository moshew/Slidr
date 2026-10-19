import type { Deck } from '@slidr/model';
import { useSyncExternalStore } from 'react';
import { useEditor, type Editor } from './editor';

/*
 * The deck as the views that draw whole slides follow it: the thumbnails of the Filmstrip and
 * the cards of the AI gallery. Drawing them again for every frame of a drag and every letter
 * typed cost more than the Stage itself. They follow at once whatever changes which slides there
 * are (one added, removed or moved) or what every slide is drawn with (the theme, the layouts,
 * the assets), and a change inside a slide as soon as it is one by itself; a run of changes, a
 * drag or typing, reaches them when the pointer is let go or when the changes pause.
 */

/** How long a run of changes pauses before the views follow it. */
const QUIET_MS = 300;
/** The same while a pointer is down and the gesture still goes on, held still. */
const HELD_MS = 1000;
/** After the pointer is let go: time for the gesture's last change to come in. */
const RELEASE_MS = 50;

/** The pointers that are down: while one is, a gesture may be under way. */
const pressed = new Set<number>();
/** Told when the last pointer that was down is let go. */
const releases = new Set<() => void>();
let tracking = false;

function trackPointers(): void {
  if (tracking || typeof window === 'undefined') return;
  tracking = true;
  const released = () => {
    for (const release of [...releases]) release();
  };
  // Captured on the window, before anything on the page can keep the event to itself.
  window.addEventListener('pointerdown', (event) => pressed.add(event.pointerId), true);
  const up = (event: PointerEvent) => {
    if (pressed.delete(event.pointerId) && pressed.size === 0) released();
  };
  window.addEventListener('pointerup', up, true);
  window.addEventListener('pointercancel', up, true);
  // A pointer let go outside the window is never reported: its gesture is over all the same.
  window.addEventListener('blur', () => {
    if (pressed.size === 0) return;
    pressed.clear();
    released();
  });
}

/** The two decks draw every slide alike and hold the same slides, in the same order. */
function sameFrame(a: Deck, b: Deck): boolean {
  const keys = Object.keys(a) as (keyof Deck)[];
  if (keys.length !== Object.keys(b).length) return false;
  if (!keys.every((key) => key === 'slides' || a[key] === b[key])) return false;
  return (
    a.slides.length === b.slides.length &&
    a.slides.every((slide, i) => slide.id === b.slides[i]?.id)
  );
}

interface QuietDeck {
  get: () => Deck;
  subscribe: (listener: () => void) => () => void;
}

const quietDecks = new WeakMap<Editor, QuietDeck>();

function quietDeckOf(editor: Editor): QuietDeck {
  const known = quietDecks.get(editor);
  if (known) return known;
  const listeners = new Set<() => void>();
  /** The deck the views show; undefined while none follows it, and the deck is the editor's. */
  let shown: Deck | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  /** A gesture is over and its changes are about to be shown. */
  let releasing = false;
  let lastChange = Number.NEGATIVE_INFINITY;
  let stop: (() => void) | undefined;

  const current = () => editor.deck.getState().deck;
  const show = () => {
    clearTimeout(timer);
    timer = undefined;
    releasing = false;
    const deck = current();
    if (!shown || deck === shown) return;
    shown = deck;
    for (const listener of [...listeners]) listener();
  };
  const showIn = (ms: number) => {
    clearTimeout(timer);
    timer = setTimeout(show, ms);
  };
  const onChange = () => {
    const deck = current();
    const now = performance.now();
    const alone = now - lastChange > QUIET_MS && pressed.size === 0;
    lastChange = now;
    if (!shown || deck === shown) return;
    if (alone || !sameFrame(deck, shown)) show();
    else if (!releasing) showIn(pressed.size > 0 ? HELD_MS : QUIET_MS);
  };
  const onRelease = () => {
    if (timer === undefined) return;
    releasing = true;
    showIn(RELEASE_MS);
  };

  const quiet: QuietDeck = {
    get: () => shown ?? current(),
    subscribe(listener) {
      listeners.add(listener);
      if (!stop) {
        trackPointers();
        shown = current();
        const unsubscribe = editor.deck.subscribe(onChange);
        releases.add(onRelease);
        stop = () => {
          unsubscribe();
          releases.delete(onRelease);
          clearTimeout(timer);
          timer = undefined;
          releasing = false;
          shown = undefined;
        };
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          stop?.();
          stop = undefined;
        }
      };
    },
  };
  quietDecks.set(editor, quiet);
  return quiet;
}

/**
 * The deck for a view that draws whole slides: the editor's deck, a moment behind it while a
 * gesture or typing goes on (see above). Which slides there are, and in what order, is always the
 * deck's own.
 */
export function useQuietDeck(): Deck {
  const quiet = quietDeckOf(useEditor());
  return useSyncExternalStore(quiet.subscribe, quiet.get);
}
