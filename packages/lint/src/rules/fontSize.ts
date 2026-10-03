import type { Rule } from '../rule';

/** The smallest text that reads from the back of a room, in slide pixels (SPEC 9.1). */
export const MIN_FONT_SIZE = 24;

/** One decimal: a size scaled by `shrink` is rarely whole. */
function px(size: number): string {
  return `${Math.round(size * 10) / 10}px`;
}

/** L04: text drawn smaller than 24px, after `shrink` and after an `html` element's scaling. */
export const L04: Rule = {
  id: 'L04',
  severity: 'warning',
  agent: true,
  check({ items }) {
    return items.flatMap(({ element, measure }) => {
      const text = measure.text;
      if (!text || text.spans.length === 0) return [];
      const smallest = Math.min(...text.spans.map((span) => span.fontSize));
      if (Math.round(smallest * 10) / 10 >= MIN_FONT_SIZE) return [];
      const fix =
        text.scale < 1
          ? `autoFit "shrink" scaled the text to ${Math.round(text.scale * 100)}% to fit its box: shorten the text or enlarge the frame.`
          : `Make it ${MIN_FONT_SIZE}px or larger.`;
      return [
        {
          elementIds: [element.id],
          message: `The smallest text here is drawn at ${px(smallest)}; the minimum readable size is ${MIN_FONT_SIZE}px. ${fix}`,
        },
      ];
    });
  },
};
