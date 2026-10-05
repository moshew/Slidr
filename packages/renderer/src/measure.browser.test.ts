import {
  createDeck,
  createElement,
  createSlide,
  richText,
  type AssetMeta,
  type Deck,
  type Element,
  type Slide,
} from '@slidr/model';
import { expect, test } from 'vitest';
import { measureSlide, type SlideMeasurements } from './measure';
import { renderSlideOffscreen } from './offscreen';

/** A test picture drawn on a canvas, as a data URL: no binary files (as the reference deck). */
function picture(draw: (g: CanvasRenderingContext2D) => void): string {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 360;
  const g = canvas.getContext('2d')!;
  draw(g);
  return canvas.toDataURL('image/png');
}

const PALE = 'a'.repeat(64);
const SPLIT = 'b'.repeat(64);
const pictures: Record<string, () => string> = {
  // One flat, pale colour.
  [PALE]: () =>
    picture((g) => {
      g.fillStyle = 'rgb(240, 236, 220)';
      g.fillRect(0, 0, 640, 360);
    }),
  // Dark on the left half, pale on the right half.
  [SPLIT]: () =>
    picture((g) => {
      g.fillStyle = 'rgb(20, 30, 40)';
      g.fillRect(0, 0, 320, 360);
      g.fillStyle = 'rgb(240, 236, 220)';
      g.fillRect(320, 0, 320, 360);
    }),
};
const urls = new Map<string, string>();
const resolveAsset = (asset: AssetMeta) => {
  if (!urls.has(asset.id)) urls.set(asset.id, pictures[asset.id]!());
  return urls.get(asset.id);
};

function deckOf(slide: Slide, lang = 'en'): Deck {
  const deck = createDeck({ lang, slides: [slide] });
  for (const id of Object.keys(pictures)) {
    deck.assets[id] = {
      id,
      file: `${id}.png`,
      mime: 'image/png',
      kind: 'image',
      bytes: 1,
      origin: 'upload',
      width: 640,
      height: 360,
    };
  }
  return deck;
}

async function measured(
  elements: Element[],
  init: Partial<Slide> = {},
  lang = 'en',
): Promise<SlideMeasurements['elements']> {
  const slide = createSlide({ id: 's_1', ...init, elements });
  const rendered = await renderSlideOffscreen({ deck: deckOf(slide, lang), slide, resolveAsset });
  try {
    return (await measureSlide(rendered.root)).elements;
  } finally {
    rendered.dispose();
  }
}

const white = { color: { value: '#ffffff' } };
const near = (rgb: readonly number[], to: readonly number[], by = 6) =>
  rgb.every((c, i) => Math.abs(c - to[i]!) <= by);

test('boxes are where the elements are drawn: rotated, inside groups, grown, and not hidden', async () => {
  const m = await measured([
    createElement.shape({
      id: 'e_turned',
      frame: { x: 100, y: 100, w: 400, h: 200 },
      rotation: 90,
    }),
    createElement.group({
      id: 'e_group',
      frame: { x: 1000, y: 500, w: 400, h: 300 },
      children: [createElement.shape({ id: 'e_child', frame: { x: 40, y: 60, w: 100, h: 80 } })],
    }),
    createElement.text({
      id: 'e_grows',
      frame: { x: 100, y: 600, w: 300, h: 40 },
      autoFit: 'growHeight',
      content: richText('This box became much taller than its frame, which is one line high.'),
    }),
    {
      ...createElement.shape({ id: 'e_hidden', frame: { x: 0, y: 0, w: 10, h: 10 } }),
      hidden: true,
    },
  ]);
  expect(m.e_turned?.box).toEqual({ x: 200, y: 0, w: 200, h: 400 });
  expect(m.e_group?.box).toEqual({ x: 1000, y: 500, w: 400, h: 300 });
  expect(m.e_child?.box).toEqual({ x: 1040, y: 560, w: 100, h: 80 });
  expect(m.e_grows?.box.h).toBeGreaterThan(100);
  expect(m.e_grows?.text?.overflow).toEqual({ x: 0, y: 0 });
  expect(m.e_hidden).toBeUndefined();
  expect(m.e_turned?.text).toBeUndefined();
});

test('text: where the glyphs are, in both directions, and how far they run past the box', async () => {
  const frame = { x: 200, y: 200, w: 800, h: 100 };
  const long = 'A sentence long enough to need a second and a third line in a box this narrow.';
  const m = await measured([
    createElement.text({ id: 'e_en', frame, content: richText('Three goals', { dir: 'ltr' }) }),
    createElement.text({ id: 'e_he', frame, content: richText('שלוש המטרות', { dir: 'rtl' }) }),
    createElement.text({
      id: 'e_tall',
      frame: { x: 200, y: 500, w: 400, h: 60 },
      content: richText(long, { dir: 'ltr' }),
    }),
    createElement.text({
      id: 'e_wide',
      frame: { x: 200, y: 800, w: 300, h: 60 },
      wrap: false,
      content: richText(long, { dir: 'ltr' }),
    }),
    createElement.text({
      id: 'e_wide_he',
      frame: { x: 1400, y: 800, w: 300, h: 60 },
      wrap: false,
      content: richText('שורה אחת ארוכה מאוד שלעולם לא נשברת, ולכן היא יוצאת מהתיבה שלה', {
        dir: 'rtl',
      }),
    }),
  ]);
  const en = m.e_en!.text!;
  const he = m.e_he!.text!;
  // One line of body text (30px at 1.45), from the start side of the box.
  expect(en.ink.x).toBeCloseTo(200, 0);
  expect(en.ink.x + en.ink.w).toBeLessThan(500);
  expect(he.ink.x + he.ink.w).toBeCloseTo(1000, 0);
  expect(he.ink.x).toBeGreaterThan(700);
  for (const text of [en, he]) {
    // Within the one line, 43.5px high: as tall as the font's glyphs, and never taller than the line.
    expect(text.ink.y).toBeGreaterThanOrEqual(200);
    expect(text.ink.y + text.ink.h).toBeLessThanOrEqual(244);
    expect(text.ink.h).toBeGreaterThan(30);
    expect(text.overflow).toEqual({ x: 0, y: 0 });
    expect(text.scale).toBe(1);
    expect(text.spans.map((s) => [s.color, s.alpha, s.fontSize])).toEqual([[[21, 23, 26], 1, 30]]);
  }

  const tall = m.e_tall!.text!;
  expect(tall.overflow.x).toBe(0);
  expect(tall.overflow.y).toBeGreaterThan(60);
  // Three lines where one fits: the glyphs go on below the box.
  expect(tall.ink.y + tall.ink.h).toBeGreaterThan(560 + tall.overflow.y - 12);
  expect(tall.ink.y + tall.ink.h).toBeLessThanOrEqual(560 + tall.overflow.y + 1);
  const wide = m.e_wide!.text!;
  expect(wide.overflow.y).toBe(0);
  expect(wide.overflow.x).toBeGreaterThan(300);
  // One line that runs on past the box, and the ink says so.
  expect(Math.abs(wide.ink.w - (300 + wide.overflow.x))).toBeLessThan(2);
  // In Hebrew it starts at the right of the box and runs out on the left.
  const wideHe = m.e_wide_he!.text!;
  expect(wideHe.overflow.x).toBeGreaterThan(100);
  expect(wideHe.ink.x + wideHe.ink.w).toBeCloseTo(1700, 0);
  expect(Math.abs(1400 - wideHe.ink.x - wideHe.overflow.x)).toBeLessThan(2);
});

test('the space a wrapped line ends in hangs past the box and is not ink', async () => {
  const hebrew = 'שלוש מטרות לרבעון הבא שכל אחת מהן נמדדת במספר אחד ברור ולא ביותר';
  const english = 'Three goals for the next quarter, each one measured by a single clear number';
  const box = (id: string, y: number, text: string, dir: 'rtl' | 'ltr', align: 'start' | 'end') =>
    createElement.text({
      id,
      frame: { x: 96, y, w: 1000, h: 320 },
      content: richText(text, { dir, align, styleRef: 'title' }),
    });
  const m = await measured([
    // Text set against the side it reads from: every wrapped line ends in a space at the far
    // edge of the box, which the browser lets hang outside it.
    box('e_he_end', 80, hebrew, 'rtl', 'end'),
    box('e_he_start', 400, hebrew, 'rtl', 'start'),
    box('e_en_end', 720, english, 'ltr', 'end'),
  ]);
  for (const id of ['e_he_end', 'e_he_start', 'e_en_end']) {
    const { ink } = m[id]!.text!;
    expect(ink.h, id).toBeGreaterThan(200);
    expect(ink.x, id).toBeGreaterThanOrEqual(95.5);
    expect(ink.x + ink.w, id).toBeLessThanOrEqual(1096.5);
  }
  // The lines still end where their last letter does.
  expect(m.e_he_end!.text!.ink.x).toBeCloseTo(96, 0);
  expect(m.e_he_start!.text!.ink.x + m.e_he_start!.text!.ink.w).toBeCloseTo(1096, 0);
  expect(m.e_en_end!.text!.ink.x + m.e_en_end!.text!.ink.w).toBeCloseTo(1096, 0);
});

test('shrink: the scale it settled on, and the size the text is really drawn at', async () => {
  const m = await measured([
    createElement.text({
      id: 'e_shrunk',
      frame: { x: 200, y: 200, w: 420, h: 120 },
      autoFit: 'shrink',
      content: richText(
        'כיווץ שומר טקסט ארוך בתוך התיבה שלו: האותיות והמרווחים קטנים יחד, עד שהכול נכנס.',
        { dir: 'rtl' },
      ),
    }),
  ]);
  const text = m.e_shrunk!.text!;
  expect(text.scale).toBeGreaterThan(0.25);
  expect(text.scale).toBeLessThan(1);
  expect(text.overflow).toEqual({ x: 0, y: 0 });
  expect(text.spans[0]?.fontSize).toBeCloseTo(30 * text.scale, 3);
  expect(text.ink.h).toBeLessThanOrEqual(121);
});

test('a table overflows when its rows outgrow the frame, not because of a thick border', async () => {
  const table = (id: string, y: number, text: string) =>
    createElement.table({
      id,
      frame: { x: 100, y, w: 600, h: 160 },
      rows: [80, 80],
      cols: [300, 300],
      dir: 'ltr',
      cells: [
        [{ content: richText('Quarter') }, { content: richText('Revenue') }],
        [
          { content: richText(text) },
          {
            content: richText('1.2M'),
            borders: { bottom: { color: { token: 'primary' }, width: 8 } },
          },
        ],
      ],
    });
  const m = await measured([
    table('e_fits', 100, 'Q3'),
    table('e_grew', 500, 'A cell with far more text than one row of eighty pixels can hold'),
  ]);
  expect(m.e_fits?.text?.overflow).toEqual({ x: 0, y: 0 });
  expect(m.e_grew?.text?.overflow.y).toBeGreaterThan(40);
});

test('list markers take up room but are not text to judge; superscript counts at its line', async () => {
  const m = await measured([
    createElement.text({
      id: 'e_list',
      frame: { x: 200, y: 200, w: 800, h: 200 },
      content: {
        paragraphs: [
          {
            dir: 'ltr',
            align: 'start',
            list: { kind: 'bullet', level: 0, color: { value: '#ff0000' } },
            runs: [{ text: 'x' }, { text: '2', marks: { script: 'sup' } }],
          },
        ],
      },
    }),
  ]);
  const text = m.e_list!.text!;
  // The bullet sits in the indent, before the text.
  expect(text.ink.x).toBeCloseTo(200, 0);
  expect(text.spans.map((s) => [s.color, s.fontSize])).toEqual([[[21, 23, 26], 30]]);
});

test('backdrop: the colours really under the text, with the text itself left out', async () => {
  const label = (id: string, x: number, y: number) =>
    createElement.text({
      id,
      frame: { x, y, w: 600, h: 80 },
      content: richText('White text', { dir: 'ltr', styleRef: 'heading', marks: white }),
    });
  const m = await measured(
    [
      label('e_on_background', 100, 100),
      createElement.image({
        id: 'e_pale',
        frame: { x: 1000, y: 60, w: 800, h: 200 },
        assetId: PALE,
      }),
      label('e_on_image', 1100, 100),
      createElement.shape({
        id: 'e_fade',
        frame: { x: 100, y: 400, w: 600, h: 80 },
        fill: {
          kind: 'linear',
          angle: 90,
          stops: [
            { color: { value: '#000000' }, at: 0 },
            { color: { value: '#ffffff' }, at: 1 },
          ],
        },
      }),
      createElement.text({
        id: 'e_on_gradient',
        frame: { x: 100, y: 400, w: 600, h: 80 },
        content: richText('A line across the whole gradient', {
          dir: 'ltr',
          align: 'justify',
          marks: white,
        }),
      }),
      createElement.shape({
        id: 'e_veil',
        frame: { x: 1000, y: 400, w: 800, h: 200 },
        fill: { kind: 'solid', color: { value: '#000000', alpha: 0.5 } },
      }),
      createElement.text({
        id: 'e_on_veil',
        frame: { x: 1100, y: 440, w: 600, h: 80 },
        opacity: 0.5,
        content: richText('Half', {
          dir: 'ltr',
          marks: { color: { value: '#ffffff', alpha: 0.5 } },
        }),
      }),
    ],
    { background: { fill: { kind: 'solid', color: { value: '#2f5bea' } } } },
  );

  const onBackground = m.e_on_background!.text!.spans[0]!;
  expect(onBackground.color).toEqual([255, 255, 255]);
  expect(onBackground.backdrop.length).toBeGreaterThan(4);
  expect(onBackground.backdrop.every((c) => near(c, [47, 91, 234]))).toBe(true);

  const onImage = m.e_on_image!.text!.spans[0]!;
  expect(onImage.backdrop.every((c) => near(c, [240, 236, 220]))).toBe(true);

  // From black on the left to white on the right, under the one line of text.
  const greys = m.e_on_gradient!.text!.spans[0]!.backdrop.map((c) => c[0]);
  expect(Math.min(...greys)).toBeLessThan(60);
  expect(Math.max(...greys)).toBeGreaterThan(160);

  // Black at 50% over the blue slide; the glyphs at half of half.
  const onVeil = m.e_on_veil!.text!.spans[0]!;
  expect(onVeil.alpha).toBeCloseTo(0.25, 2);
  expect(onVeil.backdrop.every((c) => near(c, [24, 46, 117]))).toBe(true);
});

test('backdrop: a photo behind the slide, with its dimming, and a picture set from CSS', async () => {
  const label = (id: string, x: number) =>
    createElement.text({
      id,
      frame: { x, y: 500, w: 500, h: 80 },
      content: richText('White text', { dir: 'ltr', marks: white }),
    });
  const m = await measured([label('e_left', 200), label('e_right', 1200)], {
    background: { fill: { kind: 'image', assetId: SPLIT, fit: 'cover' }, dim: 0.5 },
  });
  // The dark half and the pale half, each under half a black veil.
  expect(m.e_left!.text!.spans[0]!.backdrop.every((c) => near(c, [10, 15, 20]))).toBe(true);
  expect(m.e_right!.text!.spans[0]!.backdrop.every((c) => near(c, [120, 118, 110]))).toBe(true);
});

test('backdrop: what cannot be read is left unjudged, not guessed', async () => {
  const label = (id: string, y: number) =>
    createElement.text({
      id,
      frame: { x: 200, y, w: 500, h: 80 },
      content: richText('Text', { dir: 'ltr' }),
    });
  const m = await measured([
    createElement.html({
      id: 'e_html',
      frame: { x: 100, y: 100, w: 800, h: 300 },
      markup:
        '<div style="height:100%;background:#102030;color:#fff;font-size:40px">Free HTML</div>',
    }),
    label('e_over_html', 200),
    label('e_clear', 600),
  ]);
  expect(m.e_over_html!.text!.spans[0]!.backdrop).toEqual([]);
  expect(m.e_clear!.text!.spans[0]!.backdrop.length).toBeGreaterThan(0);
  // The text inside the HTML is measured, at the size it is drawn; what is under it is not.
  const html = m.e_html!.text!;
  expect(html.spans.map((s) => [s.color, s.fontSize, s.backdrop])).toEqual([
    [[255, 255, 255], 40, []],
  ]);
  expect(html.ink.x).toBeCloseTo(100, 0);
});

test('backdrop: the picture of an svg element is under the text, with its own stylesheet only', async () => {
  const label = (id: string, x: number) =>
    createElement.text({
      id,
      frame: { x, y: 200, w: 300, h: 80 },
      content: richText('Text', { dir: 'ltr' }),
    });
  // An `svg` element draws in a shadow root, which a copy of the slide does not take along.
  const m = await measured([
    createElement.svg({
      id: 'e_plain',
      frame: { x: 100, y: 100, w: 400, h: 300 },
      markup:
        '<svg viewBox="0 0 10 10" preserveAspectRatio="none"><rect width="10" height="10" fill="rgb(16, 32, 48)"/></svg>',
    }),
    createElement.svg({
      id: 'e_styled',
      frame: { x: 700, y: 100, w: 400, h: 300 },
      markup:
        '<svg viewBox="0 0 10 10" preserveAspectRatio="none"><style>rect { fill: rgb(200, 30, 30) }</style><rect width="10" height="10"/></svg>',
    }),
    label('e_over_plain', 150),
    label('e_over_styled', 750),
  ]);
  const under = (id: string) => m[id]!.text!.spans[0]!.backdrop;
  expect(under('e_over_plain').length).toBeGreaterThan(0);
  // The rule of the second picture colours its own rectangle, and not the first one's.
  expect(under('e_over_plain').every((c) => near(c, [16, 32, 48]))).toBe(true);
  expect(under('e_over_styled').every((c) => near(c, [200, 30, 30]))).toBe(true);
});

test('free HTML scaled to its frame is measured at the size it shows', async () => {
  const m = await measured([
    createElement.html({
      id: 'e_html',
      frame: { x: 100, y: 100, w: 300, h: 150 },
      natural: { w: 600, h: 300 },
      markup: '<p style="margin:0;font-size:40px">Scaled</p>',
    }),
  ]);
  expect(m.e_html!.text!.spans[0]?.fontSize).toBeCloseTo(20, 3);
  expect(m.e_html!.text!.ink.h).toBeLessThan(40);
});

test('a slide in a scaled container measures the same, in slide pixels', async () => {
  const slide = createSlide({
    id: 's_1',
    elements: [
      createElement.text({
        id: 'e_title',
        frame: { x: 200, y: 300, w: 800, h: 100 },
        content: richText('Three goals', { dir: 'ltr' }),
      }),
    ],
  });
  const deck = deckOf(slide);
  const direct = await renderSlideOffscreen({ deck, slide });
  const parent = document.createElement('div');
  parent.style.cssText =
    'position:fixed;left:40px;top:30px;transform:scale(0.5);transform-origin:0 0';
  document.body.append(parent);
  const scaled = await renderSlideOffscreen({ deck, slide }, { parent });
  try {
    expect(scaled.root.getBoundingClientRect().width).toBe(960);
    const a = (await measureSlide(direct.root)).elements.e_title!;
    const b = (await measureSlide(scaled.root)).elements.e_title!;
    expect(b.box).toEqual(a.box);
    expect(b.text!.ink.x).toBeCloseTo(a.text!.ink.x, 1);
    expect(b.text!.ink.w).toBeCloseTo(a.text!.ink.w, 1);
    expect(b.text!.spans[0]!.backdrop).toEqual(a.text!.spans[0]!.backdrop);
  } finally {
    direct.dispose();
    scaled.dispose();
    parent.remove();
  }
});

test('a chart: the text it draws is measured where it is, and judged against what is under it', async () => {
  const frame = { x: 200, y: 200, w: 1000, h: 600 };
  const m = await measured(
    [
      createElement.chart({
        id: 'e_chart',
        frame,
        chartType: 'column',
        data: {
          categories: ['Q1', 'Q2', 'Q3'],
          series: [
            { name: 'Hardware', values: [24, 26, 28] },
            { name: 'Subscription', values: [9, 11, 12] },
          ],
        },
      }),
    ],
    { background: { fill: { kind: 'solid', color: { value: '#101418' } } } },
  );
  const text = m.e_chart!.text!;
  // The labels of the axes and the legend, inside the chart's own box.
  expect(text.spans.length).toBeGreaterThan(0);
  expect(text.ink.x).toBeGreaterThanOrEqual(frame.x - 1);
  expect(text.ink.y).toBeGreaterThanOrEqual(frame.y - 1);
  expect(text.ink.x + text.ink.w).toBeLessThanOrEqual(frame.x + frame.w + 1);
  expect(text.ink.y + text.ink.h).toBeLessThanOrEqual(frame.y + frame.h + 1);
  expect(text.ink.w).toBeGreaterThan(400);
  expect(text.overflow).toEqual({ x: 0, y: 0 });
  // A chart sets its text in the theme's caption size, and in the theme's text colours.
  expect(Math.min(...text.spans.map((s) => s.fontSize))).toBe(22);
  // Under the labels is the dark slide: the labels themselves are not in the picture.
  const under = text.spans.flatMap((s) => s.backdrop);
  expect(under.length).toBeGreaterThan(4);
  const dark = under.filter((c) => near(c, [16, 20, 24], 10)).length;
  expect(dark / under.length).toBeGreaterThan(0.8);
});
