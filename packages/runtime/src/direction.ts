import type { FlowDirection } from './types';

export type Dir = 'ltr' | 'rtl';

/** A step along the screen axes: x grows to the right, y grows downwards. */
export interface Vec {
  x: -1 | 0 | 1;
  y: -1 | 0 | 1;
}

/**
 * The way something travels on screen. `start` and `end` follow the reading direction, so they
 * flip in an RTL slide (SPEC 5.6): `start` is leftwards in LTR and rightwards in RTL.
 */
export function travel(direction: FlowDirection, dir: Dir): Vec {
  switch (direction) {
    case 'up':
      return { x: 0, y: -1 };
    case 'down':
      return { x: 0, y: 1 };
    case 'start':
      return { x: dir === 'rtl' ? 1 : -1, y: 0 };
    case 'end':
      return { x: dir === 'rtl' ? -1 : 1, y: 0 };
  }
}

/** The reading direction of a slide: the renderer writes it on the slide root. */
export function directionOf(element: Element): Dir {
  const own = element.closest('[dir]')?.getAttribute('dir');
  if (own === 'rtl' || own === 'ltr') return own;
  return getComputedStyle(element).direction === 'rtl' ? 'rtl' : 'ltr';
}

/**
 * The reading direction of a slide given its wrapper. It is the rendered slide inside that says:
 * the page around a show may read the other way, as a Hebrew deck does in an English window.
 */
export function slideDirection(slide: Element): Dir {
  return directionOf(slide.querySelector('[data-slide-id]') ?? slide);
}

/** A CSS easing function, or `ease` when the browser does not accept the string. */
export function safeEasing(easing: string): string {
  if (typeof CSS === 'undefined' || typeof CSS.supports !== 'function') return easing;
  return CSS.supports('animation-timing-function', easing) ? easing : 'ease';
}
