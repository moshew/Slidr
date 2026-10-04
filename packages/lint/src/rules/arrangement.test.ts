import { createElement, richText, type Element, type Frame } from '@slidr/model';
import { describe, expect, it } from 'vitest';
import { check, fixed, span, text as measuredText } from '../testing';

const card = (id: string, frame: Frame) => createElement.shape({ id, frame });
const words = (id: string, frame: Frame) =>
  createElement.text({ id, frame, content: richText('Card text') });
const frames = (slide: { elements: Element[] }) =>
  Object.fromEntries(slide.elements.map((e) => [e.id, e.frame]));

describe('L09: edges that nearly line up', () => {
  it('reports left edges 1 to 6px apart, and says where to align them', () => {
    const elements = [
      card('e_a', { x: 96, y: 200, w: 500, h: 200 }),
      card('e_b', { x: 96, y: 440, w: 620, h: 200 }),
      card('e_c', { x: 100, y: 700, w: 700, h: 200 }),
    ];
    const [finding, ...rest] = check('L09', elements);
    expect(rest).toEqual([]);
    expect(finding).toMatchObject({ severity: 'warning', elementIds: ['e_a', 'e_b', 'e_c'] });
    expect(finding?.message).toBe(
      'The left edges of "e_a", "e_b", "e_c" nearly line up (x = 96, 96, 100): within 6px of each other, and not equal. Align them at x = 96.',
    );
    const after = fixed(elements, finding);
    expect(frames(after).e_c).toEqual({ x: 96, y: 700, w: 700, h: 200 });
    expect(check('L09', after.elements)).toEqual([]);
  });

  it('accepts edges that are equal, and edges that are plainly apart', () => {
    expect(
      check('L09', [
        card('e_a', { x: 96, y: 200, w: 500, h: 200 }),
        card('e_b', { x: 96.4, y: 440, w: 300, h: 200 }),
        card('e_c', { x: 104, y: 700, w: 700, h: 100 }),
      ]),
    ).toEqual([]);
  });

  it('leaves alone a slip of less than a pixel', () => {
    // What rendering leaves between two text boxes that were meant to share an edge.
    expect(
      check('L09', [
        card('e_a', { x: 96, y: 200, w: 500, h: 200 }),
        card('e_b', { x: 96.8, y: 440, w: 300, h: 200 }),
      ]),
    ).toEqual([]);
    expect(
      check('L09', [
        card('e_a', { x: 96, y: 200, w: 500, h: 200 }),
        card('e_b', { x: 97, y: 440, w: 300, h: 200 }),
      ]),
    ).toHaveLength(1);
  });

  it('reports one cause once: rows that are each off by the same distance', () => {
    // Two cards side by side; everything in the second sits 3px lower, as under a border.
    const row = (n: number, y: number) => [
      card(`e_left${n}`, { x: 96, y, w: 400, h: 60 }),
      card(`e_right${n}`, { x: 1000, y: y + 3, w: 400, h: 60 }),
    ];
    const elements = [...row(1, 200), ...row(2, 340), ...row(3, 480)];
    const [finding, ...rest] = check('L09', elements);
    expect(rest).toEqual([]);
    expect(finding?.elementIds).toEqual([
      'e_left1',
      'e_right1',
      'e_left2',
      'e_right2',
      'e_left3',
      'e_right3',
    ]);
    expect(finding?.message).toBe(
      'The top edges of 3 sets of objects nearly line up, each set off by the same distance (the first: "e_left1", "e_right1" at y = 200, 203): within 6px of each other, and not equal. Align each set; the first at y = 200.',
    );
    // One fix lines up every row.
    const after = fixed(elements, finding);
    expect(check('L09', after.elements)).toEqual([]);
    expect([1, 2, 3].map((n) => frames(after)[`e_right${n}`]?.y)).toEqual([200, 340, 480]);
  });

  it('between equals, takes the value that sits on the 8px unit', () => {
    const elements = [
      card('e_a', { x: 99, y: 200, w: 300, h: 200 }),
      card('e_b', { x: 96, y: 440, w: 500, h: 200 }),
    ];
    const [finding] = check('L09', elements);
    expect(finding?.message).toMatch(/Align them at x = 96\.$/);
    expect(frames(fixed(elements, finding)).e_a?.x).toBe(96);
  });

  it('resizes instead of moving when the other edge is already lined up', () => {
    // Two boxes that share a left edge, and whose right edges are 4px apart.
    const elements = [
      card('e_a', { x: 96, y: 200, w: 800, h: 200 }),
      card('e_b', { x: 96, y: 440, w: 800, h: 200 }),
      card('e_c', { x: 96, y: 700, w: 804, h: 200 }),
    ];
    const [finding] = check('L09', elements);
    expect(finding?.message).toMatch(/^The right edges/);
    const after = fixed(elements, finding);
    expect(frames(after).e_c).toEqual({ x: 96, y: 700, w: 800, h: 200 });
    expect(check('L09', after.elements)).toEqual([]);
  });

  it('moves what sits on a card along with the card', () => {
    const elements = [
      card('e_a', { x: 96, y: 200, w: 500, h: 300 }),
      card('e_b', { x: 99, y: 560, w: 520, h: 300 }),
      words('e_b_text', { x: 131, y: 592, w: 400, h: 60 }),
    ];
    const [finding] = check('L09', elements);
    const after = frames(fixed(elements, finding));
    expect(after.e_b?.x).toBe(96);
    expect(after.e_b_text?.x).toBe(128);
  });

  it('compares tops and bottoms too, once for one slip, and leaves lines and turned elements out', () => {
    const elements: Element[] = [
      card('e_a', { x: 96, y: 300, w: 400, h: 200 }),
      card('e_b', { x: 600, y: 303, w: 400, h: 200 }),
      createElement.line({
        id: 'e_line',
        frame: { x: 96, y: 301, w: 900, h: 0 },
        points: [
          { x: 0, y: 0 },
          { x: 900, y: 0 },
        ],
      }),
      { ...card('e_turned', { x: 1200, y: 302, w: 300, h: 200 }), rotation: 20 },
    ];
    // One box 3px lower than its neighbour is off at its top and at its bottom: one finding.
    const findings = check('L09', elements);
    expect(findings.map((f) => f.message.slice(0, 16))).toEqual(['The top edges of']);
    expect(findings[0]?.elementIds).toEqual(['e_a', 'e_b']);
    // A box that is 3px taller as well is off by another distance at its bottom: two.
    const taller = [elements[0]!, card('e_b', { x: 600, y: 303, w: 400, h: 203 })];
    expect(check('L09', taller).map((f) => f.message.slice(0, 16))).toEqual([
      'The top edges of',
      'The bottom edges',
    ]);
  });
});

describe('L10: uneven gaps in a row or in a column', () => {
  const row = (xs: number[], y = 300) =>
    xs.map((x, i) => card(`e_${i + 1}`, { x, y, w: 400, h: 300 }));

  it('reports a row of three whose gaps differ, with the gaps', () => {
    const elements = row([96, 520, 951]);
    const [finding] = check('L10', elements);
    expect(finding).toMatchObject({ severity: 'warning', elementIds: ['e_1', 'e_2', 'e_3'] });
    expect(finding?.message).toBe(
      '"e_1", "e_2", "e_3" stand in a row with gaps of 24, 31px between them. Space them evenly, 27.5px apart.',
    );
  });

  it('spreads the middle ones evenly, and keeps the first and the last where they are', () => {
    const elements = row([96, 520, 944, 1380]);
    const [finding] = check('L10', elements);
    const after = fixed(elements, finding);
    expect(Object.values(frames(after)).map((f) => f.x)).toEqual([96, 524, 952, 1380]);
    expect(check('L10', after.elements)).toEqual([]);
  });

  it('carries the text of each card with it, and does not report the texts as a row of their own', () => {
    const xs = [96, 520, 951];
    const elements = [
      ...row(xs),
      ...xs.map((x, i) => words(`e_${i + 1}_text`, { x: x + 32, y: 332, w: 336, h: 60 })),
    ];
    const findings = check('L10', elements);
    expect(findings).toHaveLength(1);
    const after = frames(fixed(elements, findings[0]));
    expect(after.e_2?.x).toBe(523.5);
    expect(after.e_2_text?.x).toBe(555.5);
  });

  it('accepts even gaps, two objects, and a wide gap that parts two groups', () => {
    expect(check('L10', row([96, 520, 944]))).toEqual([]);
    expect(check('L10', row([96, 530]))).toEqual([]);
    expect(check('L10', row([96, 520, 1300]))).toEqual([]);
  });

  it('accepts objects that overlap: they are not spaced at all', () => {
    expect(check('L10', row([96, 400, 900]))).toEqual([]);
  });

  it('reads a column the same way', () => {
    const elements = [100, 260, 440].map((y, i) =>
      card(`e_${i + 1}`, { x: 96, y, w: 800, h: 140 }),
    );
    const [finding] = check('L10', elements);
    expect(finding?.message).toMatch(/stand in a column with gaps of 20, 40px/);
    const after = fixed(elements, finding);
    expect(Object.values(frames(after)).map((f) => f.y)).toEqual([100, 270, 440]);
  });
});

describe('what the eye compares', () => {
  const text = (id: string, frame: Frame, init: object = {}, styleRef: 'title' | 'body' = 'body') =>
    createElement.text({
      id,
      frame,
      content: richText('Lined up', { dir: 'ltr', styleRef }),
      ...init,
    });

  it('L09 leaves the ragged side of a text box alone: nobody sees where its frame ends', () => {
    const elements = [
      card('e_card', { x: 96, y: 200, w: 800, h: 300 }),
      // Its text starts with the card; its frame ends 4px before the card does.
      text('e_text', { x: 96, y: 540, w: 796, h: 60 }),
    ];
    expect(check('L09', elements)).toEqual([]);
    // Set against the far side, that edge is where its lines end, and it shows.
    const [finding] = check('L09', [
      elements[0]!,
      createElement.text({
        id: 'e_text',
        frame: { x: 96, y: 540, w: 796, h: 60 },
        content: richText('Lined up', { dir: 'ltr', align: 'end' }),
      }),
    ]);
    expect(finding?.message).toMatch(/^The right edges of "e_text", "e_card" nearly line up/);
  });

  it('L09 compares the tops of texts of one size, and never the top of a text with a box', () => {
    const drawnAt = (size: number, frame: Frame) => ({
      box: frame,
      text: measuredText(frame, { spans: [span({ fontSize: size })] }),
    });
    const title = { x: 96, y: 200, w: 800, h: 160 };
    const body = { x: 1000, y: 206, w: 700, h: 300 };
    const elements = [text('e_title', title, {}, 'title'), text('e_body', body)];
    // A large title set 6px above the small body beside it: what the eye sees is lined up.
    expect(
      check('L09', elements, { e_title: drawnAt(72, title), e_body: drawnAt(30, body) }),
    ).toEqual([]);
    // Two bodies 3px apart are a slip.
    expect(
      check('L09', elements, { e_title: drawnAt(30, title), e_body: drawnAt(30, body) }),
    ).toHaveLength(1);
    expect(check('L09', [card('e_card', { x: 96, y: 203, w: 400, h: 300 }), elements[1]!])).toEqual(
      [],
    );
  });

  it('L10 says nothing of a title, a subtitle and a body in a column: they are not peers', () => {
    expect(
      check('L10', [
        text('e_kicker', { x: 96, y: 80, w: 900, h: 34 }),
        text('e_title', { x: 96, y: 122, w: 900, h: 158 }),
        text('e_body', { x: 96, y: 330, w: 900, h: 400 }),
      ]),
    ).toEqual([]);
  });
});

describe('L10: gaps that are a pattern, and objects that are not peers', () => {
  it('accepts pairs: gaps that read the same from both ends part the objects into groups', () => {
    const column = [250, 388, 546, 684].map((y, i) =>
      card(`e_${i + 1}`, { x: 96, y, w: 496, h: 135 }),
    );
    expect(check('L10', column)).toEqual([]);
    // One gap out of step among four is a slip.
    const slipped = [250, 400, 550, 712].map((y, i) =>
      card(`e_${i + 1}`, { x: 96, y, w: 496, h: 135 }),
    );
    expect(check('L10', slipped)).toHaveLength(1);
  });

  it('accepts a picture, a card and a text of one size in a row: three kinds are not peers', () => {
    const frame = (x: number) => ({ x, y: 300, w: 400, h: 300 });
    expect(
      check('L10', [
        card('e_card', frame(96)),
        createElement.image({ id: 'e_photo', frame: frame(520), prompt: 'a ridge' }),
        words('e_text', frame(951)),
      ]),
    ).toEqual([]);
  });
});
