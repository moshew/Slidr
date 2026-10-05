/**
 * What the fidelity guard promises (SPEC 5.9, ADR-017), asked a second time by someone else.
 *
 * Every test converts a small HTML slide with the engine and its guard, as
 * `slide_create_from_html` does, and then looks again with a comparison of its own: the source
 * is drawn once more in the engine's sandbox, the converted slide is drawn with the real
 * renderer, both are pictured through the browser, and the DOM of both is measured. A slide
 * the engine calls faithful has to pass that second look too; what the model cannot hold has
 * to have stayed `html`, and what comes back has to be a slide the model accepts.
 *
 * The cases are slides the guard once let through (the bug hunt of 2026-10-04, `import.md`).
 * They are examples of what is measured, not a list the engine knows: nothing in the engine
 * names any of them.
 */
import {
  createDeck,
  Element as ElementSchema,
  plainText,
  Slide,
  type Deck,
  type TextElement,
} from '@slidr/model';
import { beforeAll, describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { mountSlide, startConversion, type ConversionResult } from './engine';
import { convertHtml, loadHtml } from './service';
import { testHost, testImage, withAssets } from './testing';

const host = testHost();
const FULL = { x: 0, y: 0, width: 1920, height: 1080 };

async function pixels(blob: Blob): Promise<ImageData> {
  const bitmap = await createImageBitmap(blob, { colorSpaceConversion: 'none' });
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

const frames = () =>
  new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done())));

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Found {
  box: Box;
  colour: string;
}

/** Every text node under a root, shadow trees (where `html` elements are drawn) included. */
function textNodes(root: Node, out: Text[] = []): Text[] {
  for (const child of Array.from(root.childNodes)) {
    if (child.nodeType === 3) out.push(child as Text);
    else if (child.nodeType === 1) {
      const shadow = (child as Element).shadowRoot;
      if (shadow) textNodes(shadow, out);
      textNodes(child, out);
    }
  }
  return out;
}

/** Where the first occurrence of each needle is drawn, and in which colour. */
function find(root: Node, needles: readonly string[]): Record<string, Found | undefined> {
  const out: Record<string, Found | undefined> = {};
  for (const needle of needles) {
    for (const node of textNodes(root)) {
      const at = node.data.indexOf(needle);
      if (at < 0 || !node.parentElement) continue;
      const doc = node.ownerDocument;
      const range = doc.createRange();
      range.setStart(node, at);
      range.setEnd(node, at + needle.length);
      const r = range.getBoundingClientRect();
      // Text that is in the DOM and takes no room is not what the needle looks for.
      if (r.width === 0 || r.height === 0) continue;
      out[needle] = {
        box: {
          x: Math.round(r.left),
          y: Math.round(r.top),
          w: Math.round(r.width),
          h: Math.round(r.height),
        },
        colour: doc.defaultView!.getComputedStyle(node.parentElement).color,
      };
      break;
    }
  }
  return out;
}

interface Seen {
  picture: ImageData;
  found: Record<string, Found | undefined>;
  /** The list markers the renderer drew (none for the source, whose markers are the browser's). */
  markers: string[];
}

async function seeSource(html: string, deck: Deck, needles: readonly string[]): Promise<Seen> {
  const loaded = await loadHtml(html, deck, host, deck.size);
  try {
    await frames();
    const found = find(loaded.root.ownerDocument.body, needles);
    return { picture: await pixels(await host.capture(FULL)), found, markers: [] };
  } finally {
    loaded.dispose();
  }
}

async function seeSlide(deck: Deck, slide: Slide, needles: readonly string[]): Promise<Seen> {
  const mounted = await mountSlide(deck, slide, host, {
    origin: { x: 0, y: 0 },
    viewScale: 1,
    k: 1,
    offX: 0,
    offY: 0,
  });
  try {
    await frames();
    const found = find(mounted.root, needles);
    const markers = Array.from(mounted.root.querySelectorAll('[data-slidr-marker]'), (marker) =>
      (marker.textContent ?? '').trim(),
    );
    return { picture: await pixels(await host.capture(FULL)), found, markers };
  } finally {
    mounted.dispose();
  }
}

interface Looked {
  result: ConversionResult;
  source: Seen;
  converted: Seen;
}

/**
 * Converts the slide, holds the result to what every conversion owes (a slide the model
 * accepts, which the engine itself calls faithful), and looks at both sides again.
 */
async function look(
  html: string,
  lang: 'he' | 'en',
  needles: readonly string[] = [],
): Promise<Looked> {
  const deck = createDeck({ lang });
  const result = await convertHtml(html, deck, host, deck.size);
  expect(Slide.safeParse(result.slide).error?.issues).toBeUndefined();
  expect(result.guard.faithful).toBe(true);
  const source = await seeSource(html, deck, needles);
  const converted = await seeSlide(withAssets(deck, result.assets), result.slide, needles);
  return { result, source, converted };
}

const texts = (result: ConversionResult) =>
  result.slide.elements.filter((element): element is TextElement => element.type === 'text');
const types = (result: ConversionResult) => result.slide.elements.map((element) => element.type);

type Tone = (r: number, g: number, b: number) => boolean;
const luminance = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;
const dark: Tone = (r, g, b) => luminance(r, g, b) < 110;
const red: Tone = (r, g, b) => r > 150 && g < 100 && b < 100;

/** How many pixels of a box have the tone. */
function ink(picture: ImageData, box: Box, tone: Tone): number {
  let count = 0;
  for (let y = Math.max(0, box.y); y < Math.min(picture.height, box.y + box.h); y++) {
    for (let x = Math.max(0, box.x); x < Math.min(picture.width, box.x + box.w); x++) {
      const i = (y * picture.width + x) * 4;
      if (tone(picture.data[i]!, picture.data[i + 1]!, picture.data[i + 2]!)) count++;
    }
  }
  return count;
}

/**
 * The same ink in both pictures, give or take the edges of glyphs: the converted slide shows
 * what the source showed there. `least` guards against a probe that looks at nothing.
 */
function expectSameInk(looked: Looked, box: Box, tone: Tone, least = 1): void {
  const source = ink(looked.source.picture, box, tone);
  const converted = ink(looked.converted.picture, box, tone);
  expect(source).toBeGreaterThanOrEqual(least);
  expect(Math.abs(converted - source)).toBeLessThanOrEqual(Math.max(12, 0.1 * source));
}

const PARA =
  'position:absolute;left:160px;top:200px;width:1500px;margin:0;font:400 40px/1.5 Arial;color:#111';
const HEBREW =
  'ההנהלה אישרה השבוע את תוכנית העבודה לשנה הבאה, והיא כוללת הרחבה של צוות הפיתוח, פתיחה של שני סניפים חדשים בצפון ובדרום, השקעה גדולה בהכשרת עובדים ושדרוג מלא של מערכות המידע הישנות';
const ENGLISH =
  'Revenue grew by a third while costs stayed flat, and the new product line reached break-even two quarters early. The team shipped four releases, opened two offices and signed the largest contract in the history of the company, with a renewal already agreed for next year.';

beforeAll(async () => {
  await page.viewport(1920, 1080);
});

describe('text reads in the order the source drew it', () => {
  /** Whether `a` is drawn left of `b`. */
  const leftOf = (seen: Seen, a: string, b: string) => seen.found[a]!.box.x < seen.found[b]!.box.x;

  // A part the source lays out in a direction of its own, in a paragraph long enough for a few
  // glyphs that changed places to be a small share of its pixels. The two pieces named are
  // drawn in one order in the source and in the other by a paragraph of plain runs.
  const reordered: [string, 'he' | 'en', string, string, string][] = [
    [
      'a term with signs (C++) in a Hebrew sentence',
      'he',
      `<p style="${PARA}">${HEBREW}, ויתקיים קורס <span dir="ltr">C++</span> לכל העובדים.</p>`,
      'C',
      '++',
    ],
    [
      'a range of hours in a Hebrew sentence',
      'he',
      `<p style="${PARA}">${HEBREW}, בין השעות <span dir="ltr">10:00 - 12:00</span> בחדר הישיבות.</p>`,
      '10:',
      '12:',
    ],
    [
      'a phone number in a Hebrew sentence',
      'he',
      `<p style="${PARA}">${HEBREW}, בטלפון <span dir="ltr">+972-3-1234567</span> בכל יום.</p>`,
      '+',
      '972',
    ],
    [
      'a temperature below zero in a Hebrew sentence',
      'he',
      `<p style="${PARA}">${HEBREW}, בטמפרטורה של <span dir="ltr">-5°C</span> בלילה.</p>`,
      '-',
      '5',
    ],
    [
      'a range of prices in a bdi, in a Hebrew sentence',
      'he',
      `<p style="${PARA}">${HEBREW}, במחיר של <bdi>$1,200 - $1,500</bdi> לחודש.</p>`,
      '200',
      '500',
    ],
    [
      'a Hebrew word with its mark in an English sentence',
      'en',
      `<p style="${PARA}">${ENGLISH} The Hebrew greeting <span dir="rtl">שלום!</span> opens every meeting.</p>`,
      '!',
      'ש',
    ],
    [
      'letters a bdo turns round, in an English sentence',
      'en',
      `<p style="${PARA}">${ENGLISH} Mirror writing: <bdo dir="rtl">ABC</bdo> is how it reads.</p>`,
      'A',
      'C',
    ],
  ];

  for (const [name, lang, html, a, b] of reordered) {
    it(`keeps ${name} as the source drew it`, async () => {
      const { result, source, converted } = await look(html, lang, [a, b]);
      expect(leftOf(converted, a, b)).toBe(leftOf(source, a, b));
      expect(converted.found[a]!.box.x).toBeCloseTo(source.found[a]!.box.x, -1);
      // A run has no direction of its own to give: the paragraph stays the source's markup.
      expect(types(result)).toEqual(['html']);
      expect(result.notes.join('\n')).toMatch(/text that reads in another order/);
    });
  }

  it('keeps as text a part whose own direction changes nothing', async () => {
    // An English name in a Hebrew sentence reads the same with the isolation and without.
    const { result, source, converted } = await look(
      `<p style="${PARA}">${HEBREW}, בעזרת <span dir="ltr">Slidr</span> וגם <bdi>Claude</bdi> בכל יום.</p>`,
      'he',
      ['Slidr', 'Claude'],
    );
    expect(types(result)).toEqual(['text']);
    expect(result.editability).toBe(1);
    expect(converted.found.Slidr!.box).toEqual(source.found.Slidr!.box);
    expect(converted.found.Claude!.box).toEqual(source.found.Claude!.box);
  });

  it('reads text that is all inside one isolate as a paragraph of its direction', async () => {
    // A figure alone in its box, written the correct way in a right-to-left deck.
    const { result, source, converted } = await look(
      `<p style="${PARA}"><b><span dir="ltr">-5°C</span></b></p>
       <p style="${PARA};top:400px;text-align:center"><bdi>$1,200 - $1,500</bdi></p>`,
      'he',
      ['-', '5°C', '200', '500'],
    );
    expect(types(result)).toEqual(['text', 'text']);
    const [figure, range] = texts(result).map((text) => text.content.paragraphs[0]!);
    // On the right of its box, where the right-to-left block put it, reading left to right.
    expect(figure).toMatchObject({ dir: 'ltr', align: 'end' });
    expect(range).toMatchObject({ dir: 'ltr', align: 'center' });
    for (const needle of ['-', '5°C', '200', '500']) {
      expect(converted.found[needle]!.box).toEqual(source.found[needle]!.box);
    }
    expect(leftOf(converted, '-', '5°C')).toBe(true);
    expect(leftOf(converted, '200', '500')).toBe(true);
  });

  it('holds a table whose cells wrap their figures in a direction, and not one that mixes', async () => {
    const table = (cell: string) => `<style>
      table{position:absolute;left:160px;top:200px;width:1200px;border-collapse:collapse;font:400 28px/1.4 Arial;color:#111}
      td{padding:16px 20px;border:1px solid #999}
    </style><table><tr><td>שינוי בהכנסות</td><td>${cell}</td></tr><tr><td>שינוי בהוצאות</td><td><span dir="ltr">-2%</span></td></tr></table>`;
    const whole = await look(table('<span dir="ltr">+4%</span>'), 'he', ['+', '4%']);
    expect(types(whole.result)).toEqual(['table']);
    expect(leftOf(whole.converted, '+', '4%')).toBe(leftOf(whole.source, '+', '4%'));
    expect(whole.converted.found['+']!.box.x).toBeCloseTo(whole.source.found['+']!.box.x, -1);

    // A sign that would change sides: the cell cannot be told by its lines, so the table stays
    // html rather than show "4%+".
    const mixed = await look(table('עלייה של <span dir="ltr">+4%</span>'), 'he', ['+', '4%']);
    expect(types(mixed.result)).toEqual(['html']);
    expect(leftOf(mixed.converted, '+', '4%')).toBe(leftOf(mixed.source, '+', '4%'));
  });
});

describe('what comes back is a slide the model accepts', () => {
  it('holds a figure centred with `line-height: 0` as text, where the source drew it', async () => {
    const { result, source, converted } = await look(
      `<div style="position:absolute;left:200px;top:300px;width:120px;height:120px;border-radius:50%;background:#246;display:flex;align-items:center;justify-content:center"><span style="font:700 48px Arial;line-height:0;color:#fff">7</span></div>`,
      'en',
      ['7'],
    );
    // A single line sits the same under any line height once its box is where the glyphs
    // were: the figure stays editable, with no height of nothing written into the model.
    expect(types(result)).toEqual(['shape', 'text']);
    const [figure] = texts(result);
    expect(plainText(figure!.content)).toBe('7');
    expect(figure!.content.paragraphs[0]!.lineHeight ?? 1).toBeGreaterThan(0);
    expect(converted.found['7']!.box).toEqual(source.found['7']!.box);
  });

  it('leaves out a part of the text that has no size, and keeps the rest in place', async () => {
    const { result, source, converted } = await look(
      `<p style="${PARA}">Visible words <span style="font-size:0">hidden words</span> and more visible words.</p>`,
      'en',
      ['Visible', 'more'],
    );
    expect(types(result)).toEqual(['text']);
    const text = plainText(texts(result)[0]!.content);
    expect(text).toContain('Visible words');
    expect(text).toContain('and more visible words.');
    expect(text).not.toContain('hidden');
    // The spaces on both sides of the hidden part are drawn in the source, and here.
    expect(converted.found.more!.box).toEqual(source.found.more!.box);
  });

  it('rounds a font weight that is not a whole number, as a variable font takes', async () => {
    const { result } = await look(
      `<p style="${PARA};font-weight:450.5">Visible words in a weight between two named ones.</p>`,
      'en',
    );
    expect(types(result)).toEqual(['text']);
    const weight = texts(result)[0]!.content.paragraphs[0]!.runs[0]!.marks?.weight;
    expect(Number.isInteger(weight)).toBe(true);
    expect(Math.abs(weight! - 450.5)).toBeLessThanOrEqual(0.5);
  });

  it('puts back as html whatever was proposed that the schema refuses', async () => {
    // Nothing known makes the walk propose such an element any more; the guard does not rest
    // on that. A proposal is spoiled by hand here, the way a field of tomorrow might be.
    const deck = createDeck({ lang: 'en' });
    const loaded = await loadHtml(
      `<p style="${PARA}">A paragraph the walk reads as text.</p><p style="${PARA};top:400px">And one more, which is left alone.</p>`,
      deck,
      host,
      deck.size,
    );
    try {
      const conversion = await startConversion(loaded.root, {
        deck,
        host,
        foreign: false,
        behind: 'slide',
      });
      try {
        const first = conversion.proposal.items[0]!.element as TextElement;
        first.content.paragraphs[0]!.lineHeight = 0;
        expect(ElementSchema.safeParse(first).success).toBe(false);
        const result = conversion.result(await conversion.guard());
        expect(Slide.safeParse(result.slide).error?.issues).toBeUndefined();
        expect(result.guard.faithful).toBe(true);
        expect(types(result)).toEqual(['html', 'text']);
        expect(result.notes.join('\n')).toMatch(
          /Kept as HTML \(element [^)]+\): text the model cannot hold\./,
        );
      } finally {
        conversion.dispose();
      }
    } finally {
      loaded.dispose();
    }
  });
});

describe('a link is kept on whatever stands for the linked element', () => {
  const REPORT = { kind: 'url', target: 'https://example.com/report' };

  it('on a picture inside a link', async () => {
    const { result } = await look(
      `<a href="https://example.com/report" style="position:absolute;left:200px;top:200px;display:block;width:640px;height:400px"><img src="${testImage(640, 400)}" style="display:block;width:640px;height:400px"></a>`,
      'en',
    );
    expect(types(result)).toEqual(['image']);
    expect(result.slide.elements[0]!.link).toEqual(REPORT);
  });

  it('on the box of a card that is a link, as on the text in it', async () => {
    const { result } = await look(
      `<a href="https://example.com/report" style="position:absolute;left:200px;top:200px;display:block;width:640px;height:300px;box-sizing:border-box;padding:40px;background:#e8eef8;border-radius:24px;text-decoration:none;font:400 36px/1.4 Arial;color:#123">Read the whole report</a>`,
      'en',
    );
    expect(types(result)).toEqual(['shape', 'text']);
    const [card, label] = result.slide.elements;
    expect(card!.link).toEqual(REPORT);
    // Text holds a link on its runs, where the editor's text tools read and write it.
    expect(label!.link).toBeUndefined();
    expect(texts(result)[0]!.content.paragraphs[0]!.runs[0]!.marks?.link).toBe(REPORT.target);
  });

  it('on a region inside a link that stays html, and on nothing outside the link', async () => {
    const { result } = await look(
      `<a href="https://example.com/report" style="position:absolute;left:200px;top:200px;display:block;width:400px;height:200px"><div data-keep-html style="width:400px;height:200px;background:#246"></div></a>
       <div style="position:absolute;left:800px;top:200px;width:400px;height:200px;background:#642"></div>`,
      'en',
    );
    expect(types(result)).toEqual(['html', 'shape']);
    const [kept, beside] = result.slide.elements;
    expect(kept!.link).toEqual(REPORT);
    expect(beside!.link).toBeUndefined();
  });
});

describe('an element kept as html looks as it did among its siblings', () => {
  // Three cards that each stay html (they clip a decoration), and a look that the stylesheet
  // gives by position among the siblings.
  const cards = (extra: string) => `<style>
.row{position:absolute;left:120px;top:240px;display:flex;gap:40px}
.card{position:relative;width:520px;height:420px;background:#fff;border-radius:24px;overflow:hidden;padding:40px;box-sizing:border-box;font:400 28px/1.4 Arial;color:#222;box-shadow:0 0 0 1px #ccd}
.card .blob{position:absolute;right:-60px;bottom:-60px;width:200px;height:200px;border-radius:50%;background:#e8eef8}
.card h3{margin:0 0 16px;font:700 40px/1.2 Arial}
.card p{margin:0}
${extra}
</style>
<div class="row">
<div class="card"><div class="blob"></div><h3>Starter</h3><p>For a small team that is just getting started.</p></div>
<div class="card"><div class="blob"></div><h3>Growth</h3><p>For a company that grows from month to month.</p></div>
<div class="card"><div class="blob"></div><h3>Scale</h3><p>For an organisation with many teams and sites.</p></div>
</div>`;
  const TITLES = ['Starter', 'Growth', 'Scale'];
  const colours = (seen: Seen) => TITLES.map((title) => seen.found[title]?.colour);

  it('keeps a colour given with :nth-child', async () => {
    const { result, source, converted } = await look(
      cards(
        '.card:nth-child(1) h3{color:#c62828} .card:nth-child(2) h3{color:#1565c0} .card:nth-child(3) h3{color:#2e7d32}',
      ),
      'en',
      TITLES,
    );
    expect(colours(source)).toEqual(['rgb(198, 40, 40)', 'rgb(21, 101, 192)', 'rgb(46, 125, 50)']);
    expect(colours(converted)).toEqual(colours(source));
    expect(types(result)).toEqual(['html', 'html', 'html']);
  });

  it('keeps a colour given with a sibling combinator', async () => {
    const { source, converted } = await look(
      cards('.card h3{color:#c62828} .card + .card h3{color:#1565c0} .card ~ .card p{color:#555}'),
      'en',
      TITLES,
    );
    expect(colours(source)).toEqual(['rgb(198, 40, 40)', 'rgb(21, 101, 192)', 'rgb(21, 101, 192)']);
    expect(colours(converted)).toEqual(colours(source));
  });

  it('keeps a border given with :nth-child', async () => {
    const looked = await look(
      cards(
        '.card{border-top:6px solid #c62828} .card:nth-child(2){border-top-color:#1565c0} .card:nth-child(3){border-top-color:#2e7d32}',
      ),
      'en',
    );
    // The top border of the first card is red, and that of the second is not.
    expectSameInk(looked, { x: 200, y: 240, w: 400, h: 6 }, red, 2000);
    expect(ink(looked.converted.picture, { x: 760, y: 240, w: 400, h: 6 }, red)).toBe(0);
    expect(ink(looked.source.picture, { x: 760, y: 240, w: 400, h: 6 }, red)).toBe(0);
  });
});

describe('a difference that sits in one place of a long text', () => {
  it('is caught by the guard where the walk does not know what a part does', async () => {
    // Nothing reads a filter on a word (it is not a property of text), and the model has
    // nothing to say it with: here it takes the word off the page. The paragraph is long, so
    // the word is a small share of its pixels; it is the place the guard sees.
    const looked = await look(
      `<p style="${PARA}">${ENGLISH.replace('break-even', '<span style="filter:opacity(0)">break-even</span>')}</p>`,
      'en',
      ['break-even'],
    );
    const word = looked.source.found['break-even']!.box;
    expect(ink(looked.source.picture, word, dark)).toBe(0);
    expect(ink(looked.converted.picture, word, dark)).toBe(0);
    expect(types(looked.result)).toEqual(['html']);
    expect(looked.result.notes.join('\n')).toMatch(
      /text that looks different in one place \(\d+ blocks of/,
    );
  });
});

describe('a part of a text keeps a look the model has no field for', () => {
  const blue: Tone = (r, g, b) => b > 110 && r < 90;
  const part = (style: string, size = 40) =>
    `<p style="${PARA.replace('40px', `${size}px`)}">${ENGLISH.replace('break-even', `<span style="${style}">break-even</span>`)}</p>`;
  /** The reason the engine gave for keeping the paragraph as it was written. */
  const kept = (result: ConversionResult) => result.notes.find((note) => note.startsWith('Kept'));

  for (const size of [40, 18]) {
    it(`the colour of an underline, at ${size}px`, async () => {
      const looked = await look(
        part('text-decoration:underline;text-decoration-color:#e00000', size),
        'en',
        ['break-even'],
      );
      expectSameInk(looked, looked.source.found['break-even']!.box, red, 20);
      expect(types(looked.result)).toEqual(['html']);
      expect(kept(looked.result)).toMatch(/text the model cannot hold/);
    });

    it(`a line over a word, at ${size}px`, async () => {
      const looked = await look(part('text-decoration:overline', size), 'en', ['break-even']);
      const word = looked.source.found['break-even']!.box;
      // The line runs along the top of the letters' box: a strip around that edge.
      const strip = { x: word.x, y: word.y - 2, w: word.w, h: Math.round(size / 4) };
      expectSameInk(looked, strip, dark, 20);
      expect(types(looked.result)).toEqual(['html']);
    });

    it(`a fill colour of a word, at ${size}px, which is the colour of its run`, async () => {
      const looked = await look(part('-webkit-text-fill-color:#e00000', size), 'en', [
        'break-even',
      ]);
      expectSameInk(looked, looked.source.found['break-even']!.box, red, 100);
      // Glyphs are painted in the fill colour, and a run has a colour: this one the model holds.
      expect(types(looked.result)).toEqual(['text']);
      const run = texts(looked.result)[0]!.content.paragraphs[0]!.runs.find(
        (r) => r.text === 'break-even',
      );
      expect(run?.marks?.color).toEqual({ value: '#e00000' });
    });
  }

  it('a word in another colour than the line under its sentence', async () => {
    // The line is drawn in the colour of the box that asked for it, the sentence; an
    // underline mark on the red run would draw it red.
    const looked = await look(
      `<p style="${PARA};text-decoration:underline">${ENGLISH.replace('break-even', '<span style="color:#e00000">break-even</span>')}</p>`,
      'en',
      ['break-even'],
    );
    const word = looked.source.found['break-even']!.box;
    expectSameInk(looked, { x: word.x, y: word.y + word.h - 12, w: word.w, h: 12 }, dark, 100);
    expect(types(looked.result)).toEqual(['html']);
    expect(kept(looked.result)).toMatch(/text the model cannot hold/);
  });

  it('the colour of a first letter', async () => {
    const looked = await look(
      `<style>p{${PARA}} p::first-letter{color:#c00000}</style><p>${ENGLISH}</p>`,
      'en',
      ['Revenue'],
    );
    expectSameInk(looked, looked.source.found.Revenue!.box, red, 100);
    expect(types(looked.result)).toEqual(['html']);
  });

  it('a first line in another weight', async () => {
    const looked = await look(
      `<style>p{${PARA}} p::first-line{font-weight:700;color:#0d47a1}</style><p>${ENGLISH}</p>`,
      'en',
      ['Revenue', 'stayed'],
    );
    expectSameInk(looked, looked.source.found.Revenue!.box, blue, 100);
    expect(looked.converted.found.stayed!.box).toEqual(looked.source.found.stayed!.box);
    expect(types(looked.result)).toEqual(['html']);
  });

  it('a first letter styled on the block around the paragraph, whose first text it is', async () => {
    const looked = await look(
      `<style>article::first-letter{color:#c00000} p{margin:0;font:400 40px/1.5 Arial;color:#111}</style>
       <article style="position:absolute;left:160px;top:200px;width:1500px"><p>${ENGLISH}</p><p>A second paragraph, which no rule touches.</p></article>`,
      'en',
      ['Revenue'],
    );
    expectSameInk(looked, looked.source.found.Revenue!.box, red, 100);
    // The paragraph alone cannot carry a rule of the block around it (a copy of it stands in
    // an empty shell of that block, which has no first letter), so the guard widens to the
    // block: the whole of it stays as written.
    expect(types(looked.result)).toEqual(['html']);
    expect(looked.result.guard.faithful).toBe(true);
  });

  it('stays editable when the parts only use what marks can say', async () => {
    // The control: a colour, a weight, an underline of the text's own colour, a highlight.
    const looked = await look(
      `<p style="${PARA}">${ENGLISH.replace('break-even', '<span style="color:#e00000;font-weight:700;text-decoration:underline">break-even</span>').replace('four releases', '<mark style="background:#ffe082;color:inherit">four releases</mark>')}</p>`,
      'en',
      ['break-even'],
    );
    expect(types(looked.result)).toEqual(['text']);
    expect(looked.result.editability).toBe(1);
    expectSameInk(looked, looked.source.found['break-even']!.box, red, 100);
  });
});
