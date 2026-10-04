import type { ConversionService, ElementConversion } from '@slidr/agent-tools';
import {
  CommandBus,
  createDeck,
  createElement,
  createSlide,
  type AssetMeta,
  type Element,
  type HtmlElement,
} from '@slidr/model';
import { describe, expect, it } from 'vitest';
import { decompose, decomposeBlock, originOf, previewRegion, replaceCommands } from './decompose';

const html = (extra: Partial<HtmlElement> = {}): HtmlElement =>
  createElement.html({
    id: 'h1',
    frame: { x: 400, y: 260, w: 900, h: 420 },
    markup: '<p>Text</p>',
    hasScripts: false,
    natural: { w: 900, h: 420 },
    ...extra,
  });

const text = (id: string, x: number): Element =>
  createElement.text({
    id,
    frame: { x, y: 300, w: 300, h: 80 },
    content: { paragraphs: [{ dir: 'auto', align: 'start', runs: [{ text: id }] }] },
  });

const picture: AssetMeta = {
  id: 'a1',
  file: 'a1.png',
  mime: 'image/png',
  kind: 'image',
  bytes: 10,
  origin: 'import',
};

/** A conversion that answers with the given parts, and remembers what it was asked. */
function fakeConversion(result: Partial<ElementConversion>) {
  const asked: unknown[] = [];
  const service: ConversionService = {
    htmlToSlide: () => Promise.reject(new Error('not used')),
    convertElement: (_deck, request) => {
      asked.push(request);
      return Promise.resolve({ elements: [], assets: [], editability: 1, notes: [], ...result });
    },
  };
  return { service, asked };
}

describe('what cannot be decomposed', () => {
  it('is an element with scripts, a mirrored one, and one stretched unevenly', () => {
    expect(decomposeBlock(html())).toBeUndefined();
    expect(decomposeBlock(html({ hasScripts: true }))).toBe('scripts');
    expect(decomposeBlock(html({ flipV: true }))).toBe('mirrored');
    expect(decomposeBlock(html({ frame: { x: 0, y: 0, w: 900, h: 300 } }))).toBe('stretched');
    // Scaled evenly, text can follow.
    expect(decomposeBlock(html({ frame: { x: 0, y: 0, w: 450, h: 210 } }))).toBeUndefined();
  });
});

describe('putting the parts in the element’s place', () => {
  it('is one change that undo takes back whole: the assets, the removal and the parts in order', () => {
    const under = text('under', 100);
    const over = text('over', 1500);
    const deck = createDeck({
      slides: [createSlide({ id: 's1', elements: [under, html(), over] })],
    });
    const parts = [text('p1', 420), text('p2', 760)];
    const bus = new CommandBus(deck, { validate: true });
    bus.batch(replaceCommands(deck, 's1', 'h1', { elements: parts, assets: [picture] }));
    expect(bus.deck.slides[0]!.elements.map((element) => element.id)).toEqual([
      'under',
      'p1',
      'p2',
      'over',
    ]);
    expect(bus.deck.assets.a1).toEqual(picture);
    expect(bus.undoStack).toHaveLength(1);
    bus.undo();
    expect(bus.deck.slides[0]!.elements.map((element) => element.id)).toEqual([
      'under',
      'h1',
      'over',
    ]);
    expect(bus.deck.assets.a1).toBeUndefined();
    bus.redo();
    expect(bus.deck.slides[0]!.elements.map((element) => element.id)).toEqual([
      'under',
      'p1',
      'p2',
      'over',
    ]);
  });

  it('keeps the parts in the group the element was in', () => {
    const group = createElement.group({
      id: 'g1',
      frame: { x: 200, y: 100, w: 1000, h: 600 },
      children: [html({ frame: { x: 50, y: 40, w: 900, h: 420 } })],
    });
    const deck = createDeck({ slides: [createSlide({ id: 's1', elements: [group] })] });
    const bus = new CommandBus(deck, { validate: true });
    bus.batch(replaceCommands(deck, 's1', 'h1', { elements: [text('p1', 60)], assets: [] }));
    const [after] = bus.deck.slides[0]!.elements;
    expect(after?.type === 'group' && after.children.map((child) => child.id)).toEqual(['p1']);
    expect(originOf(deck.slides[0]!, 'h1')).toEqual({ x: 200, y: 100 });
  });

  it('is nothing for an element that is no longer there', () => {
    const deck = createDeck({ slides: [createSlide({ id: 's1', elements: [] })] });
    expect(replaceCommands(deck, 's1', 'h1', { elements: [text('p1', 0)], assets: [] })).toEqual(
      [],
    );
  });
});

describe('decompose', () => {
  const deck = createDeck({ slides: [createSlide({ id: 's1', elements: [html()] })] });

  it('asks for a forced conversion and changes nothing', async () => {
    const parts = [text('p1', 420), html({ id: 'kept' })];
    const { service, asked } = fakeConversion({
      elements: parts,
      differences: [{ elementId: 'p1', kind: 'look', detail: 'looks different (9 of 90 pixels)' }],
    });
    const result = await decompose(service, deck, 's1', 'h1');
    expect(asked).toEqual([{ slideId: 's1', elementId: 'h1', to: 'elements', force: true }]);
    expect(deck.slides[0]!.elements.map((element) => element.id)).toEqual(['h1']);
    expect(result.after.slides[0]!.elements.map((element) => element.id)).toEqual(['p1', 'kept']);
    expect(result.counts).toEqual([
      ['text', 1],
      ['html', 1],
    ]);
    expect(result.keptHtml).toBe(1);
    expect(result.unchanged).toBe(false);
    expect(result.differences).toHaveLength(1);
  });

  it('says when nothing came apart', async () => {
    const { service } = fakeConversion({ elements: [html({ id: 'same' })] });
    expect((await decompose(service, deck, 's1', 'h1')).unchanged).toBe(true);
  });
});

describe('the region the preview shows', () => {
  const slide = { w: 1920, h: 1080 };

  it('holds the element with room around it, at the proportions asked for', () => {
    const region = previewRegion({ x: 400, y: 260, w: 900, h: 420 }, 0, slide, 16 / 9);
    expect(region.w / region.h).toBeCloseTo(16 / 9, 5);
    expect(region.x).toBeLessThan(400);
    expect(region.y).toBeLessThan(260);
    expect(region.x + region.w).toBeGreaterThan(1300);
    expect(region.y + region.h).toBeGreaterThan(680);
  });

  it('never leaves the slide, and is the whole slide for an element as large as it', () => {
    const corner = previewRegion({ x: 0, y: 0, w: 300, h: 200 }, 0, slide, 16 / 9);
    expect(corner.x).toBe(0);
    expect(corner.y).toBe(0);
    const whole = previewRegion({ x: 0, y: 0, w: 1920, h: 1080 }, 0, slide, 16 / 9);
    expect(whole).toEqual({ x: 0, y: 0, w: 1920, h: 1080 });
  });

  it('makes room for a turned element', () => {
    const straight = previewRegion({ x: 800, y: 300, w: 400, h: 100 }, 0, slide, 16 / 9);
    const turned = previewRegion({ x: 800, y: 300, w: 400, h: 100 }, 90, slide, 16 / 9);
    expect(turned.h).toBeGreaterThan(straight.h);
  });
});
