import { createElement, richText } from '@slidr/model';
import { describe, expect, it } from 'vitest';
import { check, text } from '../testing';

const frame = { x: 160, y: 340, w: 800, h: 300 };
const overflowing = (x: number, y: number, scale = 1) => ({
  box: frame,
  text: text(frame, { overflow: { x, y }, scale }),
});

describe('L01: text that overflows its box', () => {
  it('reports how far the text runs past its box and what fixes it', () => {
    const body = createElement.text({
      id: 'e_body',
      frame,
      content: richText('Three goals for the quarter', { dir: 'ltr' }),
    });
    expect(check('L01', [body], { e_body: overflowing(0, 86) })).toEqual([
      {
        rule: 'L01',
        severity: 'error',
        slideId: 's_1',
        elementIds: ['e_body'],
        message:
          'The text is 86px taller than its box (frame.h is 300). Shorten the text, make the frame taller, or set autoFit to "shrink".',
      },
    ]);
  });

  it('allows a pixel of rounding and no more', () => {
    const body = createElement.text({ id: 'e_body', frame, content: richText('שלוש המטרות') });
    expect(check('L01', [body])).toEqual([]);
    expect(check('L01', [body], { e_body: overflowing(1, 1) })).toEqual([]);
    expect(check('L01', [body], { e_body: overflowing(0, 1.2) })).toHaveLength(1);
    expect(check('L01', [body], { e_body: overflowing(1.2, 0) })).toHaveLength(1);
  });

  it('says so when shrink has gone as far as it goes', () => {
    const body = createElement.text({
      id: 'e_body',
      frame,
      autoFit: 'shrink',
      content: richText('טקסט ארוך מאוד', { dir: 'rtl' }),
    });
    const [finding] = check('L01', [body], { e_body: overflowing(0, 40, 0.25) });
    expect(finding?.message).toBe(
      'The text is 40px taller than its box (frame.h is 300). autoFit "shrink" already scaled it to 25%, the smallest it goes. Shorten the text or enlarge the frame.',
    );
  });

  it('names wrap for one-line text that is too wide', () => {
    const line = createElement.text({
      id: 'e_line',
      frame,
      wrap: false,
      content: richText('שורה אחת שלעולם לא נשברת', { dir: 'rtl' }),
    });
    const [finding] = check('L01', [line], { e_line: overflowing(24, 0) });
    expect(finding?.message).toBe(
      'The text is 24px wider than its box (frame.w is 800): wrap is off, so each paragraph stays on one line. Widen the frame, shorten the text, or set wrap to true.',
    );
  });

  it('covers text inside a shape and a table that outgrew its frame', () => {
    const card = createElement.shape({ id: 'e_card', frame, content: richText('A long label') });
    const table = createElement.table({
      id: 'e_table',
      frame,
      rows: [150, 150],
      cols: [400, 400],
      dir: 'ltr',
      cells: [
        ['Quarter', 'Revenue'],
        ['Q3', '1.2M'],
      ].map((row) => row.map((cell) => ({ content: richText(cell) }))),
    });
    const findings = check('L01', [card, table], {
      e_card: overflowing(0, 12),
      e_table: overflowing(0, 64),
    });
    expect(findings.map((f) => f.message)).toEqual([
      'The text inside the shape is 12px taller than the shape (frame is 800x300). Shorten the text, enlarge the shape, or use a smaller text size.',
      'The table is 64px taller than its frame (frame.h is 300): its rows grew to hold their text. Make the frame taller, shorten the cell text, or use a smaller text size.',
    ]);
  });
});
