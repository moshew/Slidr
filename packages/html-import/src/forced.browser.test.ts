/**
 * A forced conversion (HTM-05): what the guard would have put back as html stays a regular
 * element, and the result says where it looks different.
 */
import { createDeck, createElement, createSlide, plainText, type Deck } from '@slidr/model';
import { beforeAll, describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { createConversionService } from './service';
import { testHost } from './testing';

const FRAME = { x: 300, y: 200, w: 800, h: 300 };
const TEXT = 'margin:0;font:48px/1.2 Arial,sans-serif;color:#111';

function setup(markup: string) {
  const element = createElement.html({
    frame: FRAME,
    markup,
    hasScripts: false,
    natural: { w: FRAME.w, h: FRAME.h },
  });
  const slide = createSlide({ elements: [element] });
  const deck: Deck = createDeck({ lang: 'en', slides: [slide] });
  const service = createConversionService(testHost());
  const convert = (force: boolean) =>
    service.convertElement(deck, {
      slideId: slide.id,
      elementId: element.id,
      to: 'elements',
      ...(force ? { force } : {}),
    });
  return { convert };
}

beforeAll(async () => {
  await page.viewport(1920, 1080);
});

describe('a forced conversion', () => {
  it('makes text of what the model cannot hold whole, and says that it looks different', async () => {
    const { convert } = setup(
      `<p style="${TEXT}">Solid and <span style="opacity:0.4">faded</span> words</p>`,
    );
    // Guarded, the block stays html: a translucent word has no field in the model.
    const guarded = await convert(false);
    expect(guarded.elements.map((e) => e.type)).toEqual(['html']);
    expect(guarded.differences).toBeUndefined();

    const forced = await convert(true);
    expect(forced.elements.map((e) => e.type)).toEqual(['text']);
    const [text] = forced.elements;
    expect(text?.type === 'text' && plainText(text.content)).toBe('Solid and faded words');
    expect(forced.editability).toBe(1);
    expect(forced.differences).toHaveLength(1);
    expect(forced.differences![0]).toMatchObject({ elementId: text!.id, kind: 'look' });
    expect(forced.differences![0]!.detail).toMatch(/^looks different/);
  });

  it('keeps text whose lines come out elsewhere, and says so', async () => {
    const { convert } = setup(
      `<pre style="${TEXT};font-family:Consolas,monospace">a\tb\tc\n  two  spaces</pre>`,
    );
    expect((await convert(false)).elements.map((e) => e.type)).toEqual(['html']);
    const forced = await convert(true);
    expect(forced.elements.map((e) => e.type)).toEqual(['text']);
    expect(forced.differences).toHaveLength(1);
    expect(forced.differences![0]).toMatchObject({
      elementId: forced.elements[0]!.id,
      kind: 'text',
    });
    expect(forced.differences![0]!.detail).toMatch(/line 1/);
  });

  it('places a difference no element owns on the slide', async () => {
    const { convert } = setup(
      `<p style="${TEXT}">A <u style="text-decoration-style:wavy;text-decoration-color:#dc2626">wavy</u> underline</p>`,
    );
    const forced = await convert(true);
    expect(forced.elements.map((e) => e.type)).toEqual(['text']);
    const region = forced.differences?.find((d) => d.kind === 'region');
    // The wave hangs under the first line, inside the element's frame.
    expect(region?.frame).toBeDefined();
    const { x, y, w, h } = region!.frame!;
    expect(x).toBeGreaterThanOrEqual(FRAME.x);
    expect(y).toBeGreaterThanOrEqual(FRAME.y);
    expect(x + w).toBeLessThanOrEqual(FRAME.x + FRAME.w);
    expect(y + h).toBeLessThanOrEqual(FRAME.y + FRAME.h);
  });

  it('reports nothing for HTML that converts as it is', async () => {
    const { convert } = setup(
      `<div style="position:relative;width:600px;height:240px;background:#1e3a8a;border-radius:20px">
        <p style="position:absolute;left:40px;top:40px;${TEXT};color:#fff">Inside the card</p>
      </div>`,
    );
    const forced = await convert(true);
    expect(forced.elements.map((e) => e.type)).toEqual(['shape', 'text']);
    expect(forced.differences).toEqual([]);
    expect(forced.notes).toEqual([]);
  });

  it('leaves as html what no element can stand for', async () => {
    const { convert } = setup(
      `<p style="${TEXT}">Above</p>
      <p style="${TEXT};width:500px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">One two three four five six seven eight nine ten eleven twelve thirteen</p>`,
    );
    const forced = await convert(true);
    expect(forced.elements.map((e) => e.type).sort()).toEqual(['html', 'text']);
    expect(forced.editability).toBeLessThan(1);
  });
});
