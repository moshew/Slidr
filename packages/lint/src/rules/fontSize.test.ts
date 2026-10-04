import { createElement, richText } from '@slidr/model';
import { describe, expect, it } from 'vitest';
import { check, span, text } from '../testing';

const frame = { x: 160, y: 700, w: 800, h: 100 };
const note = createElement.text({
  id: 'e_note',
  frame,
  content: richText('מקור: סקר לקוחות 2026', { dir: 'rtl', styleRef: 'caption' }),
});
const drawnAt = (sizes: number[], scale = 1) => ({
  e_note: {
    box: frame,
    text: text(frame, { scale, spans: sizes.map((fontSize) => span({ fontSize })) }),
  },
});

describe('L04: text smaller than 24px', () => {
  it('reports the size the text is drawn at', () => {
    expect(check('L04', [note], drawnAt([22]))).toMatchObject([
      {
        rule: 'L04',
        severity: 'warning',
        slideId: 's_1',
        elementIds: ['e_note'],
        message:
          'The smallest text here is drawn at 22px; the minimum readable size is 24px. Make it 24px or larger.',
      },
    ]);
  });

  it('draws the line at 24px, to a tenth of a pixel', () => {
    expect(check('L04', [note], drawnAt([24]))).toEqual([]);
    expect(check('L04', [note], drawnAt([23.96]))).toEqual([]);
    expect(check('L04', [note], drawnAt([23.9]))).toHaveLength(1);
  });

  it('goes by the smallest text of the element', () => {
    const [finding] = check('L04', [note], drawnAt([72, 30, 18]));
    expect(finding?.message).toMatch(/drawn at 18px/);
  });

  it('blames shrink when that is what made the text small', () => {
    const [finding] = check('L04', [note], drawnAt([18.3], 0.61));
    expect(finding?.message).toBe(
      'The smallest text here is drawn at 18.3px; the minimum readable size is 24px. autoFit "shrink" scaled the text to 61% to fit its box: shorten the text or enlarge the frame.',
    );
  });

  it('has nothing to say about an element without text', () => {
    expect(check('L04', [createElement.shape({ id: 'e_box', frame })])).toEqual([]);
  });
});
