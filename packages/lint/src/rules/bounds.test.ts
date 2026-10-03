import { createElement, richText, type Frame } from '@slidr/model';
import { describe, expect, it } from 'vitest';
import { check, text } from '../testing';

const title = (frame: Frame, words = 'Plan for the fourth quarter') =>
  createElement.text({ id: 'e_title', frame, content: richText(words, { styleRef: 'title' }) });

/** A text box whose glyphs are at `ink`, inside a frame that may be larger. */
const inkAt = (frame: Frame, ink: Frame) => ({ e_title: { box: frame, text: text(ink) } });

describe('L02: an element that leaves the slide', () => {
  it('reports text whose glyphs are cut by the edge, with the sides and the distance', () => {
    const frame = { x: 1400, y: 1000, w: 554, h: 92 };
    expect(check('L02', [title(frame)])).toEqual([
      {
        rule: 'L02',
        severity: 'error',
        slideId: 's_1',
        elementIds: ['e_title'],
        message:
          'The text reaches 34px past the right edge and 12px past the bottom edge of the slide (it is at x 1400..1954, y 1000..1092; the slide is 1920x1080) and is cut off there. Move or resize it so all of it is on the slide.',
      },
    ]);
  });

  it('looks at the glyphs, not at the frame of a text box', () => {
    const frame = { x: -40, y: 100, w: 2000, h: 120 };
    const centred = { x: 500, y: 110, w: 920, h: 90 };
    expect(check('L02', [title(frame)], inkAt(frame, centred))).toEqual([]);
  });

  it('allows a pixel of rounding and no more', () => {
    const frame = { x: 0, y: 0, w: 1920, h: 200 };
    expect(check('L02', [title(frame)], inkAt(frame, { x: -1, y: 0, w: 1922, h: 100 }))).toEqual(
      [],
    );
    expect(
      check('L02', [title(frame)], inkAt(frame, { x: -1.5, y: 0, w: 600, h: 100 })),
    ).toHaveLength(1);
  });

  it('reports Hebrew text that starts at the right and runs out on the left', () => {
    const frame = { x: -80, y: 400, w: 900, h: 120 };
    const [finding] = check('L02', [title(frame, 'תוכנית עבודה לרבעון הרביעי')], undefined, {
      deck: { lang: 'he' },
    });
    expect(finding?.message).toMatch(/^The text reaches 80px past the left edge of the slide/);
  });

  it('lets images, shapes, lines and icons bleed past the edge', () => {
    const elements = [
      createElement.image({ id: 'e_photo', frame: { x: -20, y: -20, w: 1960, h: 1120 } }),
      createElement.shape({ id: 'e_blob', frame: { x: 1600, y: 700, w: 600, h: 600 } }),
      createElement.line({
        id: 'e_rule',
        frame: { x: -50, y: 540, w: 2020, h: 0 },
        points: [
          { x: 0, y: 0 },
          { x: 2020, y: 0 },
        ],
      }),
      createElement.svg({
        id: 'e_icon',
        frame: { x: 1880, y: 20, w: 96, h: 96 },
        markup: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/></svg>',
      }),
    ];
    expect(check('L02', elements)).toEqual([]);
  });

  it('keeps a table and a chart whole', () => {
    const chart = createElement.chart({
      id: 'e_chart',
      frame: { x: 1500, y: 300, w: 500, h: 400 },
      chartType: 'column',
      data: { categories: ['Q1'], series: [{ name: '2026', values: [3] }] },
    });
    const [finding] = check('L02', [chart]);
    expect(finding?.elementIds).toEqual(['e_chart']);
    expect(finding?.message).toMatch(/^The chart reaches 80px past the right edge of the slide/);
  });

  it('reports a table whose rows grew past the bottom of the slide', () => {
    const frame = { x: 200, y: 700, w: 1200, h: 300 };
    const table = createElement.table({
      id: 'e_table',
      frame,
      rows: [150, 150],
      cols: [600, 600],
      cells: [
        [{ content: richText('Plan') }, { content: richText('Price') }],
        [{ content: richText('Team') }, { content: richText('890') }],
      ],
      dir: 'ltr',
    });
    const grown = (y: number) => ({
      e_table: { box: frame, text: text(frame, { overflow: { x: 0, y } }) },
    });
    // The frame ends at 1000: rows that are 80px taller still end on the slide.
    expect(check('L02', [table], grown(80))).toEqual([]);
    const [finding] = check('L02', [table], grown(140));
    expect(finding?.elementIds).toEqual(['e_table']);
    expect(finding?.message).toMatch(
      /^The table reaches 60px past the bottom edge of the slide \(it is at x 200\.\.1400, y 700\.\.1140;/,
    );
  });

  it('reports any element that is entirely off the slide', () => {
    const elements = [
      createElement.image({ id: 'e_lost', frame: { x: 2000, y: 100, w: 400, h: 200 } }),
      createElement.shape({ id: 'e_edge', frame: { x: 1920, y: 100, w: 100, h: 100 } }),
      createElement.shape({ id: 'e_peeking', frame: { x: 1919, y: 100, w: 100, h: 100 } }),
      createElement.line({
        id: 'e_top_rule',
        frame: { x: 0, y: 0, w: 1920, h: 0 },
        points: [
          { x: 0, y: 0 },
          { x: 1920, y: 0 },
        ],
      }),
    ];
    const findings = check('L02', elements);
    expect(findings.map((f) => f.elementIds)).toEqual([['e_lost'], ['e_edge']]);
    expect(findings[0]?.message).toBe(
      'The image is entirely outside the slide (it is at x 2000..2400, y 100..300; the slide is 1920x1080), so nothing of it shows. Move it onto the slide or delete it.',
    );
  });

  it('uses the place on the slide of an element inside a group', () => {
    const group = createElement.group({
      id: 'e_group',
      frame: { x: 1700, y: 400, w: 400, h: 200 },
      children: [
        createElement.text({
          id: 'e_inside',
          frame: { x: 100, y: 20, w: 280, h: 60 },
          content: richText('Inside a group'),
        }),
      ],
    });
    const [finding] = check('L02', [group]);
    expect(finding?.elementIds).toEqual(['e_inside']);
    expect(finding?.message).toMatch(/160px past the right edge/);
  });
});

describe('L03: text outside the safe margins', () => {
  it('reports the side, the distance and the safe area', () => {
    const frame = { x: 50, y: 300, w: 850, h: 120 };
    expect(check('L03', [title(frame)])).toEqual([
      {
        rule: 'L03',
        severity: 'warning',
        slideId: 's_1',
        elementIds: ['e_title'],
        message:
          'The text reaches 46px past the left edge of the safe area (the text is at x 50..900, y 300..420; the safe area is x 96..1824, y 80..1000). Only backgrounds, images and decoration may go into the margins: move or resize the text.',
      },
    ]);
  });

  it('accepts text that fills the safe area exactly, give or take a pixel', () => {
    const safe = { x: 96, y: 80, w: 1728, h: 920 };
    expect(check('L03', [title(safe)])).toEqual([]);
    expect(check('L03', [title({ x: 95, y: 79, w: 1730, h: 922 })])).toEqual([]);
    expect(check('L03', [title({ x: 94, y: 80, w: 1000, h: 100 })])).toHaveLength(1);
    expect(check('L03', [title({ x: 96, y: 80, w: 1000, h: 922 })])).toHaveLength(1);
  });

  it('reports Hebrew text that hugs the right edge', () => {
    const frame = { x: 160, y: 40, w: 1680, h: 100 };
    const ink = { x: 619, y: 40, w: 1221, h: 79 };
    const [finding] = check('L03', [title(frame, 'רינדור טקסט: סגנונות')], inkAt(frame, ink), {
      deck: { lang: 'he' },
    });
    expect(finding?.message).toMatch(
      /^The text reaches 40px past the top edge and 16px past the right edge of the safe area/,
    );
  });

  it('looks at the glyphs: a frame in the margin with its text inside is fine', () => {
    const frame = { x: 0, y: 0, w: 1920, h: 300 };
    expect(check('L03', [title(frame)], inkAt(frame, { x: 400, y: 100, w: 1120, h: 90 }))).toEqual(
      [],
    );
  });

  it('leaves text that is off the slide to L02', () => {
    const frame = { x: 1400, y: 500, w: 600, h: 100 };
    expect(check('L03', [title(frame)])).toEqual([]);
    expect(check('L02', [title(frame)])).toHaveLength(1);
  });

  it('lets everything but text into the margins', () => {
    const elements = [
      createElement.image({ id: 'e_photo', frame: { x: 0, y: 0, w: 960, h: 1080 } }),
      createElement.shape({ id: 'e_bar', frame: { x: 0, y: 1040, w: 1920, h: 40 } }),
    ];
    expect(check('L03', elements)).toEqual([]);
  });

  it('covers the text of a shape and of free HTML', () => {
    const badge = createElement.shape({
      id: 'e_badge',
      frame: { x: 1700, y: 20, w: 200, h: 80 },
      content: richText('New'),
    });
    const html = createElement.html({
      id: 'e_html',
      frame: { x: 1440, y: 540, w: 400, h: 214 },
      markup: '<div class="badge">חדש <b>New</b></div>',
    });
    const findings = check('L03', [badge, html], {
      e_html: {
        box: html.frame,
        text: text({ x: 1696, y: 543, w: 144, h: 39 }),
      },
    });
    expect(findings.map((f) => f.elementIds)).toEqual([['e_badge'], ['e_html']]);
  });
});
