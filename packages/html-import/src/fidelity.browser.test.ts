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
import { testHost, withAssets } from './testing';

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

const PARA =
  'position:absolute;left:160px;top:200px;width:1500px;margin:0;font:400 40px/1.5 Arial;color:#111';

beforeAll(async () => {
  await page.viewport(1920, 1080);
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
