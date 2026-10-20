import { useLayoutEffect, useState, useSyncExternalStore, type RefObject } from 'react';

function subscribeResize(onChange: () => void): () => void {
  window.addEventListener('resize', onChange);
  return () => window.removeEventListener('resize', onChange);
}

/** The window's inner width, kept current. */
export function useWindowWidth(): number {
  return useSyncExternalStore(subscribeResize, () => window.innerWidth);
}

/** An element's content-box size, kept current with a ResizeObserver. */
export function useElementSize(ref: RefObject<HTMLElement | null>): {
  width: number;
  height: number;
} {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () => {
      const { width, height } = element.getBoundingClientRect();
      setSize((s) => (s.width === width && s.height === height ? s : { width, height }));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

/** The air left around the card when the panel scrolls to show it, in pixels. */
const REVEAL_MARGIN = 16;

/**
 * Scrolls what the card scrolls in, and nothing else, until the card is in view; a card taller
 * than the view shows from its top. Not `scrollIntoView`, which also moves every clipped
 * ancestor it can, the shell's own regions among them.
 */
export function reveal(card: HTMLElement, smooth: boolean): void {
  const scroller = scrollerOf(card);
  if (!scroller) return;
  const view = scroller.getBoundingClientRect();
  const { top, bottom } = card.getBoundingClientRect();
  const down = bottom + REVEAL_MARGIN - view.bottom;
  const up = top - REVEAL_MARGIN - view.top;
  const by = down > 0 ? Math.min(down, up) : Math.min(up, 0);
  if (by !== 0) scroller.scrollBy({ top: by, behavior: smooth ? 'smooth' : 'auto' });
}

/** What an element scrolls in: the nearest of its ancestors that scrolls up and down. */
export function scrollerOf(element: HTMLElement): HTMLElement | null {
  let scroller = element.parentElement;
  while (scroller && !/auto|scroll/.test(getComputedStyle(scroller).overflowY)) {
    scroller = scroller.parentElement;
  }
  return scroller;
}
