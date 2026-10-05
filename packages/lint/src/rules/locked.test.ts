import { createElement, richText, type Element } from '@slidr/model';
import { describe, expect, it } from 'vitest';
import type { ElementMeasure, Rgb } from '../measure';
import { check, fixed, span, text, WHITE } from '../testing';

/**
 * A locked element is left alone by everything in the app (ARR-04), and by the fixes of the
 * design check: the finding stays, and carries no fix that would move, resize or recolour what
 * the user locked. "Fix all" runs the same fixes, so it leaves the element alone too.
 */

const byId = (slide: { elements: Element[] }, id: string) =>
  slide.elements.find((element) => element.id === id)!;
const lock = <E extends Element>(element: E): E => ({ ...element, locked: true });

describe('a finding on a locked element has no fix', () => {
  const frame = { x: 160, y: 340, w: 800, h: 100 };
  const grey: Rgb = [0xbb, 0xbb, 0xbb];
  const cases: [rule: string, element: Element, measured: Record<string, ElementMeasure>][] = [
    [
      'L01',
      createElement.text({ id: 'e_1', frame, content: richText('Three goals') }),
      { e_1: { box: frame, text: text(frame, { overflow: { x: 0, y: 86 } }) } },
    ],
    [
      'L02',
      createElement.text({
        id: 'e_1',
        frame: { x: 1400, y: 1000, w: 554, h: 92 },
        content: richText('Plan'),
      }),
      {},
    ],
    [
      'L03',
      createElement.text({
        id: 'e_1',
        frame: { x: 20, y: 600, w: 700, h: 60 },
        content: richText('A note that sits in the margin of the slide'),
      }),
      {},
    ],
    [
      'L04',
      createElement.text({
        id: 'e_1',
        frame,
        content: richText('A note', { marks: { size: 18 } }),
      }),
      { e_1: { box: frame, text: text(frame, { spans: [span({ fontSize: 18 })] }) } },
    ],
    [
      'L05',
      createElement.text({
        id: 'e_1',
        frame,
        content: richText('Hello world', { marks: { color: { value: '#bbbbbb' } } }),
      }),
      {
        e_1: {
          box: frame,
          text: text(frame, { spans: [span({ color: grey, backdrop: [WHITE] })] }),
        },
      },
    ],
    [
      'L15',
      createElement.text({
        id: 'e_1',
        frame,
        content: richText('המשפט הזה כתוב בעברית.', { dir: 'ltr' }),
      }),
      {},
    ],
  ];

  it.each(cases)('%s', (rule, element, measured) => {
    // Unlocked, the rule knows how to put it right.
    const [open] = check(rule, [element], measured);
    expect(open?.fix?.length).toBeGreaterThan(0);
    // Locked, the finding is the same finding, and nothing offers to change the element.
    const [held] = check(rule, [lock(element)], measured);
    expect(held).toEqual({ ...open, fix: undefined });
    expect(held).not.toHaveProperty('fix');
  });

  it('nor has one on an element inside a locked group', () => {
    const note = createElement.text({
      id: 'e_in',
      frame: { x: 20, y: 80, w: 700, h: 60 },
      content: richText('Text of a group that sits in the margin'),
    });
    const group = (locked: boolean) =>
      createElement.group({
        id: 'e_group',
        frame: { x: 0, y: 900, w: 800, h: 160 },
        children: [note],
        ...(locked ? { locked } : {}),
      });
    expect(check('L03', [group(false)])[0]?.fix).toBeDefined();
    const [held] = check('L03', [group(true)]);
    expect(held?.elementIds).toEqual(['e_in']);
    expect(held).not.toHaveProperty('fix');
  });
});

describe('objects that are arranged around a locked one', () => {
  const card = (id: string, x: number, y: number) =>
    createElement.shape({ id, frame: { x, y, w: 400, h: 260 } });

  it('L09: a locked card that sits 3px low is reported, and nothing is moved to meet it', () => {
    const cards = (locked: boolean) => [
      card('e_1', 96, 200),
      locked ? lock(card('e_2', 520, 203)) : card('e_2', 520, 203),
      card('e_3', 944, 200),
    ];
    const [open] = check('L09', cards(false));
    expect(byId(fixed(cards(false), open), 'e_2').frame.y).toBe(200);
    const [held] = check('L09', cards(true));
    expect(held?.elementIds).toEqual(open?.elementIds);
    expect(held).not.toHaveProperty('fix');
  });

  it('L09: a locked text on a card that moves stays where it was locked', () => {
    const label = (locked: boolean) => {
      const element = createElement.text({
        id: 'e_label',
        frame: { x: 540, y: 240, w: 360, h: 60 },
        content: richText('On the second card'),
      });
      return locked ? lock(element) : element;
    };
    const cards = (locked: boolean) => [
      card('e_1', 96, 200),
      card('e_2', 520, 203),
      card('e_3', 944, 200),
      label(locked),
    ];
    // Unlocked, what sits on the card goes with it.
    const loose = fixed(cards(false), check('L09', cards(false))[0]);
    expect(byId(loose, 'e_2').frame.y).toBe(200);
    expect(byId(loose, 'e_label').frame.y).toBe(237);
    // Locked, the card is lined up and the text is not touched.
    const held = fixed(cards(true), check('L09', cards(true))[0]);
    expect(byId(held, 'e_2').frame.y).toBe(200);
    expect(byId(held, 'e_label')).toEqual(label(true));
  });

  it('L10: a row whose even spacing would move a locked card has no fix', () => {
    const row = (locked: boolean) => [
      card('e_1', 96, 300),
      locked ? lock(card('e_2', 520, 300)) : card('e_2', 520, 300),
      card('e_3', 951, 300),
      card('e_4', 1400, 300),
    ];
    const [open] = check('L10', row(false));
    expect(open?.fix).toBeDefined();
    const [held] = check('L10', row(true));
    expect(held?.message).toBe(open?.message);
    expect(held).not.toHaveProperty('fix');
  });
});

describe('L11: a colour of its own on a locked element', () => {
  const tinted = (id: string, y: number) =>
    createElement.text({
      id,
      frame: { x: 160, y, w: 800, h: 100 },
      content: richText('Our brand', { marks: { color: { value: '#3366ff' } } }),
    });
  const colour = (element: Element) =>
    element.type === 'text' ? element.content.paragraphs[0]!.runs[0]!.marks?.color : undefined;

  it('stays, while the other elements of the finding are put right', () => {
    const elements = [tinted('e_free', 300), lock(tinted('e_held', 500))];
    const [finding] = check('L11', elements);
    expect(finding?.elementIds).toEqual(['e_free', 'e_held']);
    const after = fixed(elements, finding);
    expect(colour(byId(after, 'e_free'))).toEqual({ token: 'primary' });
    expect(byId(after, 'e_held')).toEqual(elements[1]);
    // What is left is the locked one, and that has no fix.
    const [left] = check('L11', after.elements);
    expect(left?.elementIds).toEqual(['e_held']);
    expect(left).not.toHaveProperty('fix');
  });
});
