import { SLACK } from '../geometry';
import type { Item, Rule } from '../rule';

function percent(scale: number): string {
  return `${Math.round(scale * 100)}%`;
}

function describe({ element, measure }: Item): string | undefined {
  const text = measure.text;
  if (!text) return undefined;
  const x = Math.round(text.overflow.x);
  const y = Math.round(text.overflow.y);
  const tall = text.overflow.y > SLACK;
  const wide = text.overflow.x > SLACK;
  if (!tall && !wide) return undefined;
  const { w, h } = element.frame;

  if (element.type === 'table') {
    return `The table is ${y}px taller than its frame (frame.h is ${h}): its rows grew to hold their text. Make the frame taller, shorten the cell text, or use a smaller text size.`;
  }
  if (element.type === 'shape') {
    const by = tall ? `${y}px taller` : `${x}px wider`;
    return `The text inside the shape is ${by} than the shape (frame is ${w}x${h}). Shorten the text, enlarge the shape, or use a smaller text size.`;
  }
  if (element.type !== 'text') return undefined;
  if (!tall) {
    const fix =
      element.wrap === false
        ? 'wrap is off, so each paragraph stays on one line. Widen the frame, shorten the text, or set wrap to true.'
        : 'Widen the frame or shorten the text.';
    return `The text is ${x}px wider than its box (frame.w is ${w}): ${fix}`;
  }
  const fix =
    element.autoFit === 'shrink'
      ? `autoFit "shrink" already scaled it to ${percent(text.scale)}, the smallest it goes. Shorten the text or enlarge the frame.`
      : 'Shorten the text, make the frame taller, or set autoFit to "shrink".';
  return `The text is ${y}px taller than its box (frame.h is ${h}). ${fix}`;
}

/** L01: text that does not fit the box it is in, measured on the rendered slide. */
export const L01: Rule = {
  id: 'L01',
  severity: 'error',
  agent: true,
  check({ items }) {
    return items.flatMap((item) => {
      const message = describe(item);
      return message ? [{ elementIds: [item.element.id], message }] : [];
    });
  },
};
