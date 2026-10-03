import type { Frame, HtmlElement, ShapeElement } from '@slidr/model';
import { area } from './geometry';

/** A shape thinner than this is a rule or an accent bar, not a picture. */
const MIN_SHAPE_SIDE = 24;

/**
 * A shape that reads as a visual of its own (QG-04): it is drawn, neither side is a hairline,
 * and it is smaller than half the slide. That leaves out what a shape is when it is not content:
 * a divider or accent bar (thin), a background panel (half the slide or more), and an outline
 * with nothing to draw. Cards, diagram nodes, badges and arrows count. Sizes are the frame's,
 * so a rotated bar stays a bar.
 */
export function isMeaningfulShape(shape: ShapeElement, slide: Frame): boolean {
  const drawn = shape.fill.kind !== 'none' || (shape.stroke?.width ?? 0) > 0;
  const { w, h } = shape.frame;
  return drawn && shape.opacity > 0 && Math.min(w, h) >= MIN_SHAPE_SIDE && w * h < area(slide) / 2;
}

/** Whether free HTML draws something besides text. Its markup is all the model knows of it. */
export function htmlHasVisual(element: HtmlElement): boolean {
  return element.hasScripts || /<(img|svg|canvas|video|picture|table)\b/i.test(element.markup);
}
