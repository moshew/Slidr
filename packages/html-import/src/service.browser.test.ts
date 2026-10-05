/**
 * The conversion service behind the Deck API's HTML tools (ADR-011), called the way the app
 * will call it: through `createDeckApi`, over a command bus that validates every command.
 */
import { createDeckApi, startTurn, type SessionScope, type ToolResult } from '@slidr/agent-tools';
import {
  allElementIds,
  CommandBus,
  createDeck,
  createElement,
  createSlide,
  findElementInDeck,
  findSlide,
  plainText,
  richText,
  type Deck,
} from '@slidr/model';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { createConversionService } from './service';
import { testHost, testImage } from './testing';

const SLIDE =
  'position:relative;width:1920px;height:1080px;overflow:hidden;font-family:Arial,sans-serif';

function setup(deck: Deck = createDeck({ lang: 'en' }), scope: SessionScope = { kind: 'deck' }) {
  const host = testHost();
  const bus = new CommandBus(deck, { validate: true });
  const api = createDeckApi(bus, { conversion: createConversionService(host) });
  const call = (name: string, input: unknown, as: SessionScope = scope) =>
    api.call(startTurn('session', as), name, input);
  return { bus, call, host };
}

async function ok(pending: Promise<ToolResult>): Promise<Record<string, unknown>> {
  const result = await pending;
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
  return result.data;
}

beforeAll(async () => {
  await page.viewport(1920, 1080);
});

describe('slide_create_from_html and slide_replace_from_html', () => {
  it('adds a converted slide with its assets, as one undo step', async () => {
    const { bus, call } = setup();
    const png = testImage(320, 200);
    const data = await ok(
      call('slide_create_from_html', {
        name: 'Welcome',
        html: `<div style="${SLIDE};background:#0f172a;color:#fff">
          <h1 style="position:absolute;left:120px;top:120px;margin:0;font-size:90px;line-height:1.1">Welcome</h1>
          <img src="${png}" style="position:absolute;left:120px;top:320px;width:480px;height:300px">
        </div>`,
      }),
    );
    expect(data).toMatchObject({ editability: 1, notes: [], deck: ['assets'] });
    const slide = findSlide(bus.deck, data.slideId as string)!;
    expect(slide.name).toBe('Welcome');
    expect(slide.elements.map((e) => e.type)).toEqual(['text', 'image']);
    expect(slide.background?.fill).toEqual({ kind: 'solid', color: { value: '#0f172a' } });
    // The picture was stored through the host and registered before the slide that uses it.
    const image = slide.elements[1]!;
    expect(image.type === 'image' && bus.deck.assets[image.assetId!]).toMatchObject({
      kind: 'image',
      width: 320,
    });
    expect(data.created).toEqual([slide.id, ...slide.elements.map((e) => e.id)]);

    expect(bus.undoStack).toHaveLength(1);
    bus.undo();
    expect(bus.deck.slides).toHaveLength(0);
  });

  it('replaces the content of a slide in a slide session', async () => {
    const { bus, call } = setup();
    const first = await ok(
      call('slide_create_from_html', {
        html: `<div style="${SLIDE}"><p style="font-size:40px">Before</p></div>`,
      }),
    );
    const slideId = first.slideId as string;
    const before = findSlide(bus.deck, slideId)!.elements.map((e) => e.id);
    const data = await ok(
      call(
        'slide_replace_from_html',
        {
          slideId,
          html: `<div style="${SLIDE};background:#fee2e2"><p style="font-size:40px">After</p></div>`,
        },
        { kind: 'slide', slideId },
      ),
    );
    const slide = findSlide(bus.deck, slideId)!;
    expect(slide.elements.map((e) => (e.type === 'text' ? plainText(e.content) : e.type))).toEqual([
      'After',
    ]);
    expect(slide.background?.fill).toEqual({ kind: 'solid', color: { value: '#fee2e2' } });
    expect(data.removed).toEqual(before);
  });

  it('keeps HTML with scripts whole, in a sandboxed frame, and says so', async () => {
    const { bus, call } = setup();
    const data = await ok(
      call('slide_create_from_html', {
        html: `<style>canvas { width: 600px; height: 300px }</style><canvas id="c"></canvas><script>document.getElementById('c').getContext('2d').fillRect(0, 0, 50, 50)</script>`,
      }),
    );
    const slide = findSlide(bus.deck, data.slideId as string)!;
    expect(slide.elements).toHaveLength(1);
    expect(slide.elements[0]).toMatchObject({
      type: 'html',
      hasScripts: true,
      frame: { x: 0, y: 0, w: 1920, h: 1080 },
      natural: { w: 1920, h: 1080 },
    });
    const [kept] = slide.elements;
    expect(kept?.type === 'html' && kept.markup).toContain('<script>');
    expect(data.editability).toBe(0);
    expect((data.notes as string[])[0]).toMatch(/has scripts/);
  });

  it('tells the agent what it could not use', async () => {
    const { call } = setup();
    const data = await ok(
      call('slide_create_from_html', {
        html: `<link rel="stylesheet" href="https://example.com/theme.css">
          <div style="${SLIDE}" data-archetype="poster">
            <p style="font-size:40px;color:var(--color-brand)" data-role="headline">Text</p>
            <img src="https://example.com/photo.png" style="width:300px;height:200px" data-asset="missing">
            <i data-icon="lucide:rocket"></i>
          </div>`,
      }),
    );
    const notes = (data.notes as string[]).join('\n');
    expect(notes).toMatch(/linked stylesheet was ignored/);
    expect(notes).toMatch(/data-archetype="poster" is not an archetype/);
    expect(notes).toMatch(/data-role="headline" is not a role/);
    expect(notes).toMatch(/data-asset="missing" is not an asset of the deck/);
    expect(notes).toMatch(/var\(--color-brand\) is not a theme variable/);
  });

  it('runs conversions one at a time, in the order asked', async () => {
    const { bus, call } = setup();
    const html = (word: string) =>
      `<div style="${SLIDE}"><p style="font-size:60px;margin:100px">${word}</p></div>`;
    const [a, b] = await Promise.all([
      ok(call('slide_create_from_html', { html: html('First') })),
      ok(call('slide_create_from_html', { html: html('Second') })),
    ]);
    expect(a.editability).toBe(1);
    expect(b.editability).toBe(1);
    expect(bus.deck.slides).toHaveLength(2);
  });
});

describe('element_convert', () => {
  const KEPT = `<div style="${SLIDE};background:#fff">
    <div data-keep-html data-name="card" style="position:absolute;left:400px;top:300px;width:600px;height:240px;background:#1e3a8a;border-radius:20px">
      <p style="position:absolute;left:40px;top:40px;margin:0;font-size:48px;line-height:1.2;color:#fff">Inside the card</p>
    </div>
  </div>`;

  async function withHtmlElement(scope?: (slideId: string, elementId: string) => SessionScope) {
    const { bus, call } = setup();
    const data = await ok(call('slide_create_from_html', { html: KEPT }));
    const slideId = data.slideId as string;
    const element = findSlide(bus.deck, slideId)!.elements[0]!;
    expect(element).toMatchObject({
      type: 'html',
      name: 'card',
      frame: { x: 400, y: 300, w: 600, h: 240 },
    });
    const as = scope?.(slideId, element.id) ?? { kind: 'deck' as const };
    return { bus, slideId, element, call: (name: string, input: unknown) => call(name, input, as) };
  }

  it('takes an html element apart into regular elements, where it was', async () => {
    const { bus, call, slideId, element } = await withHtmlElement();
    const data = await ok(call('element_convert', { elementId: element.id, to: 'elements' }));
    expect(data.editability).toBe(1);
    const slide = findSlide(bus.deck, slideId)!;
    expect(slide.elements.map((e) => e.id)).toEqual(data.elementIds);
    // The card and the text on it are a group, as a converted slide has them (ADR-073), under
    // the name the html element had.
    const [card, ...others] = slide.elements;
    expect(others).toEqual([]);
    expect(card).toMatchObject({
      type: 'group',
      name: 'card',
      frame: { x: 400, y: 300, w: 600, h: 240 },
    });
    const [box, text] = card?.type === 'group' ? card.children : [];
    expect(box).toMatchObject({
      type: 'shape',
      frame: { x: 0, y: 0, w: 600, h: 240 },
      fill: { kind: 'solid', color: { value: '#1e3a8a' } },
      effects: { radius: 20 },
    });
    expect(text).toMatchObject({ type: 'text', frame: { x: 40 } });
    expect(text?.type === 'text' && plainText(text.content)).toBe('Inside the card');
    expect(text!.frame.y).toBeGreaterThan(30);
    expect(text!.frame.y).toBeLessThan(50);
  });

  it('in an object session keeps one element under the same id: a group of the parts', async () => {
    const { bus, call, element } = await withHtmlElement((slideId, elementId) => ({
      kind: 'object',
      slideId,
      elementIds: [elementId],
    }));
    const data = await ok(call('element_convert', { elementId: element.id, to: 'elements' }));
    expect(data.elementIds).toEqual([element.id]);
    const group = findElementInDeck(bus.deck, element.id)!.element;
    expect(group).toMatchObject({
      type: 'group',
      name: 'card',
      frame: { x: 400, y: 300, w: 600, h: 240 },
    });
    expect(group.type === 'group' && group.children.map((c) => [c.type, c.frame.x])).toEqual([
      ['shape', 0],
      ['text', 40],
    ]);
  });

  it('turns a regular element into an html element that draws the same', async () => {
    const { bus, call, slideId, element } = await withHtmlElement();
    const parts = await ok(call('element_convert', { elementId: element.id, to: 'elements' }));
    /** The text on the card: the second child of the group the card became. */
    const onCard = () => {
      const card = findSlide(bus.deck, slideId)!.elements[0]!;
      expect((parts.elementIds as string[])[0]).toBe(card.id);
      return (card.type === 'group' ? card.children : [])[1]!;
    };
    const textId = onCard().id;
    const before = findElementInDeck(bus.deck, textId)!.element;
    const data = await ok(call('element_convert', { elementId: textId, to: 'html' }));
    expect(data.editability).toBe(0);
    const html = onCard();
    expect(html).toMatchObject({
      type: 'html',
      hasScripts: false,
      frame: before.frame,
      natural: { w: before.frame.w, h: before.frame.h },
    });
    expect(html.type === 'html' && html.markup).toContain('Inside the card');
    // And back again: the text is where it was, to a fraction of a pixel.
    const again = await ok(call('element_convert', { elementId: html.id, to: 'elements' }));
    const text = findElementInDeck(bus.deck, (again.elementIds as string[])[0]!)!.element;
    expect(text.type).toBe('text');
    expect(Math.abs(text.frame.x - before.frame.x)).toBeLessThan(0.5);
    expect(Math.abs(text.frame.y - before.frame.y)).toBeLessThan(0.5);
  });

  it('gives the html element an id that nothing in the deck has, inside a group either', async () => {
    const TAKEN = 'e_00000000';
    const deck = createDeck({
      lang: 'en',
      slides: [
        createSlide({
          id: 's_1',
          elements: [
            // A card as a converted slide has it: the box that holds the id is inside a group.
            createElement.group({
              id: 'e_card',
              frame: { x: 400, y: 300, w: 600, h: 240 },
              children: [
                createElement.shape({ id: TAKEN, frame: { x: 0, y: 0, w: 600, h: 240 } }),
                createElement.text({
                  id: 'e_words',
                  frame: { x: 40, y: 40, w: 400, h: 60 },
                  content: richText('Inside the card'),
                }),
              ],
            }),
            createElement.text({
              id: 'e_alone',
              frame: { x: 400, y: 600, w: 600, h: 60 },
              content: richText('Beside the card'),
            }),
          ],
        }),
      ],
    });
    const service = createConversionService(testHost());
    // What ids are drawn from gives the id of the box for a good while, and only then another.
    let drawn = 0;
    const random = vi.spyOn(Math, 'random').mockImplementation(() => (drawn++ < 2000 ? 0 : 0.5));
    try {
      const { elements } = await service.convertElement(deck, {
        slideId: 's_1',
        elementId: 'e_alone',
        to: 'html',
      });
      expect(elements).toHaveLength(1);
      expect(elements[0]).toMatchObject({ type: 'html' });
      expect(elements[0]!.id).not.toBe(TAKEN);
      expect(allElementIds(deck).has(elements[0]!.id)).toBe(false);
    } finally {
      random.mockRestore();
    }
  });

  it('refuses what cannot be converted, with a reason', async () => {
    const { call, element, bus, slideId } = await withHtmlElement();
    const parts = await ok(call('element_convert', { elementId: element.id, to: 'elements' }));
    const card = findSlide(bus.deck, slideId)!.elements[0]!;
    const shapeId = (card.type === 'group' ? card.children : [])[0]!.id;
    const result = await call('element_convert', { elementId: shapeId, to: 'elements' });
    expect(result).toMatchObject({ ok: false, error: { code: 'failed' } });
    expect(!result.ok && result.error.message).toMatch(/is a shape, not html/);
    // Nothing changed.
    expect(findSlide(bus.deck, slideId)!.elements.map((e) => e.id)).toEqual(parts.elementIds);
  });
});
