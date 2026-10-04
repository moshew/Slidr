import { plainText, type Paragraph } from '@slidr/model';
import type { Problem, Rule } from '../rule';
import { drawnDirection, letterCount, proseOf, setText } from '../text';

/**
 * The direction a paragraph reads in, in a deck of a given direction: the deck's, unless the
 * text has letters and none of them is of that direction. It is the rule the app sets text by
 * (`text_set`, the templates' samples). Counting letters would not do: a Hebrew sentence about
 * software holds more Latin letters than Hebrew ones, and is a Hebrew sentence still. Undefined
 * for text without letters, which reads as a figure in either.
 */
export function readingDirection(text: string, deck: 'rtl' | 'ltr'): 'rtl' | 'ltr' | undefined {
  const { rtl, ltr } = letterCount(text);
  if (rtl + ltr === 0) return undefined;
  if (deck === 'rtl') return rtl > 0 ? 'rtl' : 'ltr';
  return ltr > 0 ? 'ltr' : 'rtl';
}

const NAME = { rtl: 'right to left', ltr: 'left to right' } as const;

/**
 * L15: a paragraph laid out against the direction of its own text. A Hebrew sentence that opens
 * with an English term is still a Hebrew sentence; set to follow its first letter, it is laid
 * out left to right, and its punctuation and its numbers land on the wrong side. The fix states
 * the direction on the paragraph. Text boxes and text in shapes; cells of a table take their
 * sides from the table.
 */
export const L15: Rule = {
  id: 'L15',
  severity: 'warning',
  agent: false,
  check({ deck, slide, items }) {
    const problems: Problem[] = [];
    for (const { element } of items) {
      const prose = proseOf(element);
      if (!prose) continue;
      const wrong = new Map<Paragraph, 'rtl' | 'ltr'>();
      for (const paragraph of prose.paragraphs) {
        const text = plainText({ paragraphs: [paragraph] });
        const reads = readingDirection(text, deck.meta.dir);
        if (reads && drawnDirection(paragraph.dir, text, deck.meta.dir) !== reads) {
          wrong.set(paragraph, reads);
        }
      }
      if (wrong.size === 0) continue;
      const [first, reads] = [...wrong][0]!;
      const sample = plainText({ paragraphs: [first] }).slice(0, 40);
      const content = {
        paragraphs: prose.paragraphs.map((p) => (wrong.has(p) ? { ...p, dir: wrong.get(p)! } : p)),
      };
      problems.push({
        elementIds: [element.id],
        message: `${wrong.size === 1 ? 'A paragraph' : `${wrong.size} paragraphs`} here ${wrong.size === 1 ? 'is' : 'are'} laid out ${NAME[reads === 'rtl' ? 'ltr' : 'rtl']} while the text reads ${NAME[reads]} ("${sample}"). Set the direction of the paragraph to "${reads}".`,
        fix: [setText(slide.id, element.id, content)],
      });
    }
    return problems;
  },
};
