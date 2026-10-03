import {
  createElement,
  richText,
  type Archetype,
  type Background,
  type Element,
  type Layout,
  type Slide,
} from '@slidr/model';
import { describe, expect, it } from 'vitest';
import { check } from '../testing';

const title = createElement.text({
  id: 'e_title',
  frame: { x: 160, y: 140, w: 1600, h: 160 },
  content: richText('שלוש המטרות', { dir: 'rtl', styleRef: 'title' }),
});
const box = { x: 1000, y: 340, w: 760, h: 500 };
const withVisual = (element: Element) => check('L16', [title, element]);

const layoutOf = (archetype: Archetype, background?: Background): Layout => ({
  id: 'l_1',
  name: 'Layout',
  archetype,
  ...(background ? { background } : {}),
  placeholders: [],
  decorations: [createElement.shape({ id: 'e_layout_blob', frame: box })],
});

describe('L16: a slide without a visual element', () => {
  it('reports a slide that is text alone', () => {
    expect(check('L16', [title])).toEqual([
      {
        rule: 'L16',
        severity: 'warning',
        slideId: 's_1',
        elementIds: [],
        message:
          'The slide has no visual element: no image, chart, icon, table or shape that carries the message, only text. Add one. If the slide is meant to be text alone, set its archetype to "quote", "section" or "bigNumber".',
      },
    ]);
  });

  it('is satisfied by an image, an icon, a chart, a table or a video', () => {
    const visuals: Element[] = [
      createElement.image({ id: 'e_v', frame: box, assetId: 'a'.repeat(64) }),
      // Waiting for its picture: it is still where the picture goes.
      createElement.image({ id: 'e_v', frame: box, prompt: 'A calm lake at dawn' }),
      createElement.svg({ id: 'e_v', frame: box, markup: '<svg viewBox="0 0 24 24"/>' }),
      createElement.chart({
        id: 'e_v',
        frame: box,
        chartType: 'column',
        data: { categories: ['Q1'], series: [{ name: '2026', values: [3] }] },
      }),
      createElement.table({
        id: 'e_v',
        frame: box,
        rows: [100],
        cols: [760],
        dir: 'rtl',
        cells: [[{ content: richText('רבעון') }]],
      }),
      createElement.video({ id: 'e_v', frame: box, assetId: 'b'.repeat(64) }),
    ];
    for (const visual of visuals) expect(withVisual(visual), visual.type).toEqual([]);
  });

  it('counts a shape only when it is a visual of its own', () => {
    const shape = (
      frame: typeof box,
      rest: Partial<Parameters<typeof createElement.shape>[0]> = {},
    ) => createElement.shape({ id: 'e_shape', frame, ...rest });
    // A card, a diagram node, an outlined box.
    expect(withVisual(shape(box))).toEqual([]);
    expect(withVisual(shape({ x: 300, y: 500, w: 24, h: 24 }))).toEqual([]);
    expect(
      withVisual(
        shape(box, { fill: { kind: 'none' }, stroke: { color: { token: 'text' }, width: 2 } }),
      ),
    ).toEqual([]);
    // An accent bar, a hairline, a panel of half the slide, a shape that draws nothing.
    expect(withVisual(shape({ x: 160, y: 100, w: 120, h: 8 }))).toHaveLength(1);
    expect(withVisual(shape({ x: 160, y: 100, w: 23, h: 400 }))).toHaveLength(1);
    expect(withVisual(shape({ x: 0, y: 0, w: 960, h: 1080 }))).toHaveLength(1);
    expect(withVisual(shape(box, { fill: { kind: 'none' } }))).toHaveLength(1);
    expect(withVisual(shape(box, { opacity: 0 }))).toHaveLength(1);
  });

  it('does not count a line, or a visual that is off the slide', () => {
    const line = createElement.line({
      id: 'e_line',
      frame: { x: 160, y: 320, w: 1600, h: 0 },
      points: [
        { x: 0, y: 0 },
        { x: 1600, y: 0 },
      ],
    });
    expect(withVisual(line)).toHaveLength(1);
    const lost = createElement.image({ id: 'e_lost', frame: { ...box, x: 2000 } });
    expect(withVisual(lost)).toHaveLength(1);
  });

  it('looks into free HTML for something that is not text', () => {
    const html = (markup: string, hasScripts = false) =>
      createElement.html({ id: 'e_html', frame: box, markup, hasScripts });
    expect(withVisual(html('<p>Only <b>text</b></p>'))).toHaveLength(1);
    expect(withVisual(html('<div class="card"><img data-asset="x" alt=""></div>'))).toEqual([]);
    expect(withVisual(html('<svg viewBox="0 0 24 24"></svg>'))).toEqual([]);
    expect(withVisual(html('<div id="chart"></div>', true))).toEqual([]);
    // A painted box is a card or a bar, whether the paint is inline or in a style block.
    expect(withVisual(html('<div style="background: var(--color-primary)">Plan</div>'))).toEqual(
      [],
    );
    expect(
      withVisual(html('<style>.card { box-shadow: var(--shadow) }</style><p class="card">A</p>')),
    ).toEqual([]);
    expect(
      withVisual(html('<p style="color: red; border-radius: 8px">Only text</p>')),
    ).toHaveLength(1);
  });

  it('counts a photo behind the slide, from the slide, its layout or the theme', () => {
    const photo: Background = { fill: { kind: 'image', assetId: 'c'.repeat(64), fit: 'cover' } };
    const gradient: Background = {
      fill: {
        kind: 'linear',
        angle: 135,
        stops: [
          { color: { token: 'primary' }, at: 0 },
          { color: { token: 'accent' }, at: 1 },
        ],
      },
    };
    expect(check('L16', [title], {}, { slide: { background: photo } })).toEqual([]);
    expect(check('L16', [title], {}, { slide: { background: gradient } })).toHaveLength(1);
    // A photo over a slide that has a colour of its own: the conversion writes it as the overlay.
    const over: Background = {
      fill: { kind: 'solid', color: { token: 'bg' } },
      overlay: photo.fill,
    };
    expect(check('L16', [title], {}, { slide: { background: over } })).toEqual([]);
    expect(
      check('L16', [title], {}, { slide: { background: { ...gradient, overlay: gradient.fill } } }),
    ).toHaveLength(1);
    const photoLayout = { ...layoutOf('fullImage', photo), decorations: [] };
    expect(
      check('L16', [title], {}, { slide: { layoutId: 'l_1' }, deck: { layouts: [photoLayout] } }),
    ).toEqual([]);
    // The slide's own background wins over its layout's.
    expect(
      check(
        'L16',
        [title],
        {},
        { slide: { layoutId: 'l_1', background: gradient }, deck: { layouts: [photoLayout] } },
      ),
    ).toHaveLength(1);
  });

  it('lets quote, section and big-number slides be text alone', () => {
    for (const archetype of ['quote', 'section', 'bigNumber'] as const) {
      expect(check('L16', [title], {}, { slide: { archetype } }), archetype).toEqual([]);
      expect(
        check(
          'L16',
          [title],
          {},
          {
            slide: { layoutId: 'l_1' },
            deck: { layouts: [layoutOf(archetype)] },
          },
        ),
        archetype,
      ).toEqual([]);
    }
    for (const archetype of ['hero', 'closing', 'cards', 'blank'] as const) {
      expect(check('L16', [title], {}, { slide: { archetype } }), archetype).toHaveLength(1);
    }
  });

  describe('the decorations of the layout', () => {
    const on = (decorations: Element[], slide: Partial<Slide> = {}) =>
      check(
        'L16',
        [title],
        {},
        {
          slide: { layoutId: 'l_1', ...slide },
          deck: { layouts: [{ ...layoutOf('cards'), decorations }] },
        },
      );
    const card = createElement.shape({ id: 'd_card', frame: box });

    it('count: a slide that fills a layout has the visual the template drew', () => {
      expect(on([card])).toEqual([]);
      expect(
        on([createElement.svg({ id: 'd_icon', frame: box, markup: '<svg viewBox="0 0 24 24"/>' })]),
      ).toEqual([]);
      // Inside a group a decoration is where the group puts it.
      const far = createElement.group({
        id: 'd_group',
        frame: { x: 2400, y: 0, w: 800, h: 600 },
        children: [card],
      });
      expect(on([far])).toHaveLength(1);
    });

    it('count by the same measure as the elements of the slide', () => {
      // A rule, a panel, a label, and a card that is switched off.
      expect(on([createElement.shape({ id: 'd_rule', frame: { ...box, h: 2 } })])).toHaveLength(1);
      expect(
        on([createElement.shape({ id: 'd_panel', frame: { x: 0, y: 0, w: 1920, h: 1080 } })]),
      ).toHaveLength(1);
      expect(
        on([createElement.text({ id: 'd_label', frame: box, content: richText('01') })]),
      ).toHaveLength(1);
      expect(on([{ ...card, hidden: true }])).toHaveLength(1);
    });

    it('leave out the logo, which is on every slide', () => {
      const logo = createElement.svg({
        id: 'd_logo',
        frame: { x: 96, y: 80, w: 56, h: 56 },
        markup: '<svg viewBox="0 0 24 24"/>',
        role: 'logo',
      });
      expect(on([logo])).toHaveLength(1);
    });

    it('are not there for a slide that does not sit on the layout', () => {
      expect(
        check('L16', [title], {}, { deck: { layouts: [{ ...layoutOf('cards') }] } }),
      ).toHaveLength(1);
    });
  });

  it('counts a group of bars as one drawing, on the slide and in its layout', () => {
    const bar = (id: string, y: number) =>
      createElement.shape({ id, frame: { x: 0, y, w: 300, h: 14 } });
    const bars = (ids: string[]) =>
      createElement.group({
        id: `${ids[0]}_group`,
        frame: { x: 1000, y: 300, w: 300, h: 400 },
        children: ids.map((id, i) => bar(id, i * 60)),
      });
    // Each bar alone is an accent bar, and two of them are a rule and a bar.
    expect(withVisual(bar('e_bar', 400))).toHaveLength(1);
    expect(withVisual(bars(['e_a', 'e_b']))).toHaveLength(1);
    expect(withVisual(bars(['e_a', 'e_b', 'e_c']))).toEqual([]);
    expect(
      check(
        'L16',
        [title],
        {},
        {
          slide: { layoutId: 'l_1' },
          deck: {
            layouts: [{ ...layoutOf('hero'), decorations: [bars(['d_a', 'd_b', 'd_c'])] }],
          },
        },
      ),
    ).toEqual([]);
    // A group that holds words is not a drawing: its parts are judged one by one.
    const captioned = createElement.group({
      id: 'e_captioned',
      frame: { x: 1000, y: 300, w: 300, h: 400 },
      children: [
        bar('e_a', 0),
        bar('e_b', 60),
        bar('e_c', 120),
        createElement.text({
          id: 'e_caption',
          frame: { x: 0, y: 200, w: 300, h: 40 },
          content: richText('Events'),
        }),
      ],
    });
    expect(withVisual(captioned)).toHaveLength(1);
  });

  it('leaves an empty slide to L07', () => {
    expect(check('L16', [])).toEqual([]);
  });
});
