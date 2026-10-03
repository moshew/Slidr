import {
  createElement,
  richText,
  type Archetype,
  type Background,
  type Element,
  type Layout,
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
    expect(
      check(
        'L16',
        [title],
        {},
        {
          slide: { layoutId: 'l_1' },
          deck: { layouts: [layoutOf('fullImage', photo)] },
        },
      ),
    ).toEqual([]);
    // The slide's own background wins over its layout's.
    expect(
      check(
        'L16',
        [title],
        {},
        {
          slide: { layoutId: 'l_1', background: gradient },
          deck: { layouts: [layoutOf('fullImage', photo)] },
        },
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

  it('does not count the decorations of the layout', () => {
    expect(
      check(
        'L16',
        [title],
        {},
        {
          slide: { layoutId: 'l_1' },
          deck: { layouts: [layoutOf('hero')] },
        },
      ),
    ).toHaveLength(1);
  });

  it('leaves an empty slide to L07', () => {
    expect(check('L16', [])).toEqual([]);
  });
});
