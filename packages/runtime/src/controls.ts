import { slideDirection } from './direction';
import { CLIP_TOGGLE_SELECTOR } from './media';
import type { Player } from './player';

/**
 * Navigation by keyboard, click, swipe, URL hash and full screen (EXP-04, PRS-01), a black or
 * white screen and a jump to a slide by its number (PRS-04). It is apart from the player because
 * each host decides what drives its show: an exported file binds all of it, the editor's preview
 * binds none.
 */
export interface ControlOptions {
  /** The element clicks and swipes are taken from, and which goes full screen. */
  viewport: HTMLElement;
  keyboard?: boolean;
  /**
   * What the F key does. Default: the viewport goes full screen through the browser. A host whose
   * window is the screen (the app's present mode) passes its own, or `false` for nothing.
   */
  fullscreen?: (() => void) | false;
  /** Click to advance, and links of elements (`data-link-kind`). */
  pointer?: boolean;
  swipe?: boolean;
  /** Keeps `#<slide number>` in the address, and follows it. */
  hash?: boolean;
}

/**
 * What takes a click or a key for itself. A video, and the mark of a sound without controls,
 * play and pause on a click (the player does that): the click is not a step of the show.
 */
const INTERACTIVE = `a[href], button, input, textarea, select, summary, label, iframe, video[controls], audio[controls], [contenteditable], [data-slidr-control], ${CLIP_TOGGLE_SELECTOR}`;

const NEXT_KEYS = new Set(['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter', 'n']);
const PREV_KEYS = new Set(['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace', 'p']);
/** B or a full stop blanks the screen to black, W or a comma to white, as in other programs. */
const BLANK_KEYS = new Map<string, 'black' | 'white'>([
  ['b', 'black'],
  ['.', 'black'],
  ['w', 'white'],
  [',', 'white'],
]);
/** Pressed on the way to another key; never a command by themselves. */
const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'AltGraph']);

/** A swipe is at least this long, in CSS pixels, and mostly horizontal. */
const SWIPE_DISTANCE = 50;

/** A typed slide number is forgotten when nothing follows it for this long. */
const NUMBER_TIMEOUT = 2500;

/** Above the slides and whatever plays on them. */
const BLANK_STYLE = 'position:absolute;inset:0;z-index:2147483646;';
const NUMBER_STYLE =
  'position:absolute;left:50%;bottom:6%;z-index:2147483647;transform:translateX(-50%);' +
  'padding:8px 18px;border-radius:10px;background:rgba(0,0,0,0.72);color:#fff;' +
  'font:600 22px/1.3 system-ui,sans-serif;font-variant-numeric:tabular-nums;' +
  'direction:ltr;pointer-events:none;';

/**
 * The key of an event as the tables above name it. A letter is taken from the physical key, so
 * N, P, F, B and W work on a Hebrew layout too, where those keys type other letters.
 */
function keyOf(event: KeyboardEvent): string {
  if (/^[a-z]$/i.test(event.key)) return event.key.toLowerCase();
  // A full stop or a comma is itself wherever the layout puts it.
  if (BLANK_KEYS.has(event.key)) return event.key;
  const physical = /^Key([A-Z])$/.exec(event.code)?.[1];
  return physical ? physical.toLowerCase() : event.key;
}

/** The elements an event passed through, into shadow roots too: `html` elements live in one. */
function pathOf(event: Event): Element[] {
  return event.composedPath().filter((node): node is Element => node instanceof Element);
}

export function toggleFullscreen(viewport: HTMLElement): void {
  const doc = viewport.ownerDocument;
  // Refused without a user gesture, or inside a frame that may not: the show goes on as it is.
  if (doc.fullscreenElement) doc.exitFullscreen().catch(() => undefined);
  else viewport.requestFullscreen().catch(() => undefined);
}

/** Binds the controls and returns the way to unbind them. */
export function bindControls(player: Player, options: ControlOptions): () => void {
  const { viewport } = options;
  const doc = viewport.ownerDocument;
  const view = doc.defaultView;
  const on = { keyboard: true, pointer: true, swipe: true, hash: true, ...options };
  const undo: (() => void)[] = [];
  const listen = <T extends Event>(
    target: EventTarget,
    type: string,
    handler: (event: T) => void,
  ) => {
    target.addEventListener(type, handler as EventListener);
    undo.push(() => target.removeEventListener(type, handler as EventListener));
  };
  const lastSlide = () => {
    for (let i = player.slides.length - 1; i >= 0; i--) if (!player.slides[i]?.hidden) return i;
    return 0;
  };
  const firstSlide = () =>
    Math.max(
      player.slides.findIndex((s) => !s.hidden),
      0,
    );

  // ---- A black or a white screen over the show (PRS-04) ----

  let blank: HTMLElement | undefined;
  /** Covers the show, or uncovers it when called without a colour. */
  const setBlank = (colour?: 'black' | 'white') => {
    if (!colour) {
      blank?.remove();
      blank = undefined;
      return;
    }
    if (!blank) {
      blank = doc.createElement('div');
      // A click on it is not a click on what lies under it.
      blank.dataset.slidrBlank = '';
      viewport.append(blank);
    }
    blank.dataset.slidrBlank = colour;
    blank.style.cssText = `${BLANK_STYLE}background:${colour === 'black' ? '#000' : '#fff'};`;
  };
  undo.push(() => setBlank());

  // ---- A slide number, typed and confirmed with Enter (PRS-04) ----

  let typed = '';
  let typedTimer: ReturnType<typeof setTimeout> | undefined;
  let typedLabel: HTMLElement | undefined;
  const setTyped = (digits: string) => {
    typed = digits;
    if (typedTimer !== undefined) clearTimeout(typedTimer);
    typedTimer = undefined;
    if (!digits) {
      typedLabel?.remove();
      typedLabel = undefined;
      return;
    }
    if (!typedLabel) {
      typedLabel = doc.createElement('div');
      typedLabel.dataset.slidrGoto = '';
      typedLabel.style.cssText = NUMBER_STYLE;
      viewport.append(typedLabel);
    }
    typedLabel.textContent = `${digits} / ${player.slides.length}`;
    typedTimer = setTimeout(() => setTyped(''), NUMBER_TIMEOUT);
  };
  undo.push(() => setTyped(''));

  if (on.keyboard) {
    listen<KeyboardEvent>(doc, 'keydown', (event) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      if (MODIFIER_KEYS.has(event.key)) return;
      if (pathOf(event).some((el) => el.matches(INTERACTIVE))) return;
      const key = keyOf(event);
      const colour = BLANK_KEYS.get(key);
      if (blank) {
        // The same key, or any other, brings the show back; the other colour's key switches.
        setBlank(colour && colour !== blank.dataset.slidrBlank ? colour : undefined);
      } else if (colour) {
        setTyped('');
        setBlank(colour);
      } else if (/^\d$/.test(key)) {
        // No deck has more slides than four digits count.
        setTyped((typed + key).slice(-4));
      } else if (key === 'Enter' && typed) {
        const to = Number(typed) - 1;
        setTyped('');
        // By number a hidden slide is reachable too, as by a link.
        if (to >= 0 && to < player.slides.length) player.goTo(to);
      } else if (key === 'Escape' && typed) {
        setTyped('');
      } else {
        setTyped('');
        // Right and down are always forwards, as in other presentation programs and on a clicker.
        if (NEXT_KEYS.has(key)) player.next();
        else if (PREV_KEYS.has(key)) player.prev();
        else if (key === 'Home') player.goTo(firstSlide());
        else if (key === 'End') player.goTo(lastSlide());
        else if (key === 'f' && on.fullscreen !== false) {
          if (on.fullscreen) on.fullscreen();
          else toggleFullscreen(viewport);
        } else return;
      }
      event.preventDefault();
    });
  }

  // Not 0: event times count from the page's load, and a click in its first half second is one.
  let swipedAt = -Infinity;
  if (on.swipe) {
    let down: { x: number; y: number; id: number } | undefined;
    // Horizontal drags are ours; vertical ones and pinches stay with the browser.
    viewport.style.touchAction = 'pan-y pinch-zoom';
    undo.push(() => (viewport.style.touchAction = ''));
    listen<PointerEvent>(viewport, 'pointerdown', (event) => {
      down =
        event.pointerType === 'mouse'
          ? undefined
          : { x: event.clientX, y: event.clientY, id: event.pointerId };
    });
    listen<PointerEvent>(viewport, 'pointerup', (event) => {
      if (!down || down.id !== event.pointerId) return;
      const dx = event.clientX - down.x;
      const dy = event.clientY - down.y;
      down = undefined;
      if (Math.abs(dx) < SWIPE_DISTANCE || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      swipedAt = event.timeStamp;
      if (blank) return setBlank();
      // Pages turn against the reading direction: forwards is a swipe towards the start.
      const shown = player.slides[player.state.slide]?.el ?? viewport;
      const towardsStart = slideDirection(shown) === 'rtl' ? dx > 0 : dx < 0;
      if (towardsStart) player.next();
      else player.prev();
    });
    listen(viewport, 'pointercancel', () => (down = undefined));
  }

  if (on.pointer) {
    listen<MouseEvent>(viewport, 'click', (event) => {
      if (event.defaultPrevented || event.button !== 0) return;
      // The click that ends a swipe is not another step.
      if (event.timeStamp - swipedAt < 500) return;
      // A click on a blank screen brings the show back, and is not a step either.
      if (blank) return setBlank();
      const path = pathOf(event);
      if (path.some((el) => el.matches(INTERACTIVE))) return;
      const linked = path.find((el) => el.hasAttribute('data-link-kind'));
      if (linked) {
        const target = linked.getAttribute('data-link-target') ?? '';
        if (linked.getAttribute('data-link-kind') === 'slide') {
          const to = player.slides.findIndex((s) => s.id === target);
          if (to !== -1) player.goTo(to);
        } else view?.open(target, '_blank', 'noopener');
        return;
      }
      // Dragging to select text ends in a click too.
      if (view?.getSelection()?.isCollapsed === false) return;
      if (player.slides[player.state.slide]?.transition?.advance.onClick === false) return;
      player.next();
    });
  }

  if (on.hash && view) {
    const fromHash = (): number | undefined => {
      const n = Number(/^#(\d+)$/.exec(view.location.hash)?.[1]);
      return n >= 1 && n <= player.slides.length ? n - 1 : undefined;
    };
    const initial = fromHash();
    if (initial !== undefined && initial !== player.state.slide) player.goTo(initial);
    undo.push(
      player.subscribe(({ slide }) => {
        if (fromHash() === slide) return;
        try {
          view.history.replaceState(view.history.state, '', `#${slide + 1}`);
        } catch {
          // A document without an address of its own (`srcdoc`) has no hash to keep.
        }
      }),
    );
    listen(view, 'hashchange', () => {
      const to = fromHash();
      if (to !== undefined && to !== player.state.slide) player.goTo(to);
    });
  }

  return () => {
    for (const step of undo) step();
    undo.length = 0;
  };
}
