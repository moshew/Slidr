import { createElement, richText, type Element, type Frame, type Layout } from '@slidr/model';
import { describe, expect, it } from 'vitest';
import { check, text } from '../testing';

const body = (frame: Frame) =>
  createElement.text({ id: 'e_body', frame, content: richText('Three goals') });

describe('L07: content that covers too little of the slide', () => {
  it('reports the share covered and the bounding box of the content', () => {
    // A Hebrew title and three short bullets: the glyphs hug the right side.
    const title = createElement.text({
      id: 'e_title',
      frame: { x: 160, y: 140, w: 1600, h: 160 },
      content: richText('שלוש המטרות', { dir: 'rtl', styleRef: 'title' }),
    });
    const bullets = createElement.text({
      id: 'e_bullets',
      frame: { x: 160, y: 340, w: 1600, h: 600 },
      content: richText('להשיק את העורך החדש\nלקצר את זמן הטעינה בחצי', { dir: 'rtl' }),
    });
    expect(
      check('L07', [title, bullets], {
        e_title: { box: title.frame, text: text({ x: 1314, y: 140, w: 446, h: 80 }) },
        e_bullets: { box: bullets.frame, text: text({ x: 1340, y: 340, w: 420, h: 126 }) },
      }),
    ).toEqual([
      {
        rule: 'L07',
        severity: 'warning',
        slideId: 's_1',
        elementIds: [],
        message:
          'The content covers 9% of the content area: its bounding box is x 1314..1760, y 140..466, and at least 60% of the content area (the 1728x920px inside the safe margins) is required. Enlarge or spread out the content, or add a visual element, so the slide is filled.',
      },
    ]);
  });

  it('draws the line at 60%', () => {
    // 60% of the 920px height of the content area is 552px.
    expect(check('L07', [body({ x: 96, y: 80, w: 1728, h: 552 })])).toEqual([]);
    const [finding] = check('L07', [body({ x: 96, y: 80, w: 1728, h: 551 })]);
    expect(finding?.message).toMatch(/^The content covers 59% of the content area/);
  });

  it('takes the box around all the content, however empty it is inside', () => {
    const corners = [
      createElement.text({
        id: 'e_a',
        frame: { x: 96, y: 80, w: 300, h: 60 },
        content: richText('Top left'),
      }),
      createElement.text({
        id: 'e_b',
        frame: { x: 1524, y: 940, w: 300, h: 60 },
        content: richText('Bottom right'),
      }),
    ];
    expect(check('L07', corners)).toEqual([]);
  });

  it('counts only what is inside the margins', () => {
    const photo = createElement.image({
      id: 'e_photo',
      frame: { x: -20, y: -20, w: 1960, h: 1120 },
    });
    expect(check('L07', [photo])).toEqual([]);
    const strip = createElement.image({ id: 'e_strip', frame: { x: 0, y: 0, w: 1920, h: 80 } });
    expect(check('L07', [strip])[0]?.message).toMatch(/^The content covers 0%/);
  });

  it('does not count rules, bars and background panels', () => {
    const small = body({ x: 160, y: 140, w: 400, h: 100 });
    const decoration = [
      createElement.line({
        id: 'e_rule',
        frame: { x: 96, y: 990, w: 1728, h: 0 },
        points: [
          { x: 0, y: 0 },
          { x: 1728, y: 0 },
        ],
      }),
      createElement.shape({ id: 'e_bar', frame: { x: 96, y: 80, w: 1728, h: 8 } }),
      createElement.shape({ id: 'e_panel', frame: { x: 0, y: 0, w: 1920, h: 1080 } }),
    ];
    expect(check('L07', [...decoration, small])[0]?.message).toMatch(/^The content covers 2%/);
  });

  it('counts a card by its box and the text of a panel by its glyphs', () => {
    const card = createElement.shape({
      id: 'e_card',
      frame: { x: 96, y: 80, w: 1728, h: 560 },
      content: richText('Card'),
    });
    expect(
      check('L07', [card], {
        e_card: { box: card.frame, text: text({ x: 860, y: 340, w: 200, h: 40 }) },
      }),
    ).toEqual([]);
    const panel = createElement.shape({
      id: 'e_panel',
      frame: { x: 0, y: 0, w: 1920, h: 1080 },
      content: richText('Panel'),
    });
    expect(
      check('L07', [panel], {
        e_panel: { box: panel.frame, text: text({ x: 860, y: 520, w: 200, h: 40 }) },
      }),
    ).toHaveLength(1);
  });

  it('counts what the layout of the slide draws around the content', () => {
    // A section divider: the title on one side, the template's colour field on the other.
    const title = body({ x: 1100, y: 380, w: 724, h: 240 });
    const layout = (decorations: Element[]): Layout => ({
      id: 'l_1',
      name: 'Section',
      archetype: 'section',
      placeholders: [],
      decorations,
    });
    const on = (decorations: Element[]) =>
      check(
        'L07',
        [title],
        {},
        { slide: { layoutId: 'l_1' }, deck: { layouts: [layout(decorations)] } },
      );
    expect(on([])[0]?.message).toMatch(/^The content covers 10%/);
    const field = createElement.shape({ id: 'd_field', frame: { x: 0, y: 0, w: 640, h: 1080 } });
    expect(on([field])).toEqual([]);
    // A rule, the logo and a panel behind everything fill nothing, as on the slide itself.
    const rule = createElement.shape({ id: 'd_rule', frame: { x: 96, y: 940, w: 1728, h: 1 } });
    const logo = createElement.svg({
      id: 'd_logo',
      frame: { x: 96, y: 80, w: 56, h: 56 },
      markup: '<svg viewBox="0 0 24 24"/>',
      role: 'logo',
    });
    const panel = createElement.shape({ id: 'd_panel', frame: { x: 0, y: 0, w: 1920, h: 1080 } });
    expect(on([rule, logo, panel])[0]?.message).toMatch(/^The content covers 10%/);
    // A pattern of bars is one drawing, by the box around the bars.
    const stream = createElement.group({
      id: 'd_stream',
      frame: { x: 0, y: 0, w: 860, h: 1080 },
      children: [150, 486, 906].map((y, i) =>
        createElement.shape({ id: `d_lane_${i}`, frame: { x: 40 + i * 200, y, w: 300, h: 14 } }),
      ),
    });
    expect(on([stream])).toEqual([]);
    // The layout alone is not content: an empty slide on it is still empty.
    expect(
      check('L07', [], {}, { slide: { layoutId: 'l_1' }, deck: { layouts: [layout([field])] } }),
    ).toHaveLength(1);
  });

  it('takes a photo behind the slide as content that fills it', () => {
    const caption = body({ x: 160, y: 760, w: 600, h: 120 });
    const fill = { kind: 'image', assetId: 'c'.repeat(64), fit: 'cover' } as const;
    expect(check('L07', [caption])).toHaveLength(1);
    expect(check('L07', [caption], {}, { slide: { background: { fill } } })).toEqual([]);
    // The conversion writes a photo over a coloured slide as the overlay.
    const overlay = { fill: { kind: 'solid', color: { token: 'bg' } }, overlay: fill } as const;
    expect(check('L07', [caption], {}, { slide: { background: overlay } })).toEqual([]);
    // A photo with nothing written on it is still an empty slide.
    expect(check('L07', [], {}, { slide: { background: { fill } } })).toHaveLength(1);
  });

  it('says so when the slide is empty', () => {
    expect(check('L07', [])[0]?.message).toBe(
      'The slide has no content; at least 60% of the content area (the 1728x920px inside the safe margins) is required. Fill the slide.',
    );
  });
});
