import { slideDirection } from './direction';
import type { Player } from './player';

/**
 * Navigation by keyboard, click, swipe, URL hash and full screen (EXP-04, PRS-01). It is apart
 * from the player because each host decides what drives its show: an exported file binds all of
 * it, the editor's preview binds none.
 */
export interface ControlOptions {
  /** The element clicks and swipes are taken from, and which goes full screen. */
  viewport: HTMLElement;
  keyboard?: boolean;
  /** Click to advance, and links of elements (`data-link-kind`). */
  pointer?: boolean;
  swipe?: boolean;
  /** Keeps `#<slide number>` in the address, and follows it. */
  hash?: boolean;
}

/** What takes a click or a key for itself. */
const INTERACTIVE =
  'a[href], button, input, textarea, select, summary, label, iframe, video[controls], audio[controls], [contenteditable], [data-slidr-control]';

const NEXT_KEYS = new Set(['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter', 'n', 'N']);
const PREV_KEYS = new Set(['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace', 'p', 'P']);

/** A swipe is at least this long, in CSS pixels, and mostly horizontal. */
const SWIPE_DISTANCE = 50;

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

  if (on.keyboard) {
    listen<KeyboardEvent>(doc, 'keydown', (event) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      if (pathOf(event).some((el) => el.matches(INTERACTIVE))) return;
      // Right and down are always forwards, as in other presentation programs and on a clicker.
      if (NEXT_KEYS.has(event.key)) player.next();
      else if (PREV_KEYS.has(event.key)) player.prev();
      else if (event.key === 'Home') player.goTo(firstSlide());
      else if (event.key === 'End') player.goTo(lastSlide());
      else if (event.key === 'f' || event.key === 'F') toggleFullscreen(viewport);
      else return;
      event.preventDefault();
    });
  }

  let swipedAt = 0;
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
