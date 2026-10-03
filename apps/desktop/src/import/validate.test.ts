import { createDeck, createElement, createSlide, type AssetMeta, type Deck } from '@slidr/model';
import { describe, expect, it } from 'vitest';
import { checkCapture, checkPicture, checkText } from './validate';

/*
 * What the import page returns is checked before it reaches the deck (SPEC 13.3): the imported
 * file's scripts share that page with the engine and can make it answer anything.
 */

const HASH = 'a'.repeat(64);
const asset: AssetMeta = {
  id: HASH,
  file: `${HASH}.png`,
  mime: 'image/png',
  kind: 'image',
  bytes: 10,
  origin: 'import',
};

function capture(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    slide: createSlide({
      id: 's_captured',
      elements: [
        createElement.text({
          id: 'e_text',
          frame: { x: 0, y: 0, w: 100, h: 50 },
          content: { paragraphs: [] },
        }),
        createElement.html({
          id: 'e_html',
          frame: { x: 0, y: 60, w: 100, h: 50 },
          markup: '<b>x</b>',
        }),
      ],
    }),
    assets: [asset],
    editability: 0.5,
    textEditability: 1,
    notes: ['Kept as HTML (element e_html): a pseudo-element.'],
    guard: { faithful: true, exact: false, rounds: 2, wholeSlide: false, diffPixels: 12 },
    source: { width: 1280, height: 720 },
    ms: 420,
    ...over,
  };
}

const deck = (): Deck =>
  createDeck({
    lang: 'he',
    slides: [
      createSlide({
        id: 's_mine',
        elements: [
          createElement.text({
            id: 'e_mine',
            frame: { x: 0, y: 0, w: 10, h: 10 },
            content: { paragraphs: [] },
          }),
        ],
      }),
    ],
  });

describe('checkCapture', () => {
  it('takes a well-formed capture and says what the guard found', () => {
    const slide = checkCapture(capture(), deck());
    expect(slide).toMatchObject({
      editability: 0.5,
      textEditability: 1,
      faithful: true,
      exact: false,
      wholeSlideHtml: false,
      source: { width: 1280, height: 720 },
      notes: ['Kept as HTML (element e_html): a pseudo-element.'],
    });
    expect(slide.slide.id).toBe('s_captured');
    expect(slide.assets).toEqual([asset]);
  });

  it('refuses what is not a slide of the model', () => {
    const bad: Record<string, unknown>[] = [
      capture({ slide: { id: 's_x' } }),
      capture({ slide: { ...(capture().slide as object), surprise: true } }),
      capture({
        slide: createSlide({
          id: 's_x',
          elements: [{ type: 'text', id: 'e_x' } as never],
        }),
      }),
      capture({ editability: 2 }),
      capture({ editability: Number.NaN }),
      capture({ notes: 'not a list' }),
      capture({ guard: { faithful: 'yes' } }),
      capture({ source: { width: 0, height: 720 } }),
      capture({ assets: [{ ...asset, kind: 'program' }] }),
    ];
    for (const value of bad) {
      expect(() => checkCapture(value, deck())).toThrow(/not a valid slide/);
    }
    expect(() => checkCapture(null, deck())).toThrow(/not a valid slide/);
    expect(() => checkCapture('<script>', deck())).toThrow(/not a valid slide/);
  });

  it('refuses an asset that is not a file the app stored under its hash', () => {
    for (const file of [
      '../deck.json',
      '..\\..\\deck.json',
      `sub/${HASH}.png`,
      `${'b'.repeat(64)}.png`,
      `${HASH}.png.exe`,
      'C:/Windows/win.ini',
    ]) {
      expect(() => checkCapture(capture({ assets: [{ ...asset, file }] }), deck())).toThrow(
        /an asset the app did not store/,
      );
    }
  });

  it('refuses ids that are taken in the deck or repeated in the slide', () => {
    const clash = createSlide({
      id: 's_captured',
      elements: [
        createElement.text({
          id: 'e_mine',
          frame: { x: 0, y: 0, w: 10, h: 10 },
          content: { paragraphs: [] },
        }),
      ],
    });
    expect(() => checkCapture(capture({ slide: clash }), deck())).toThrow(/already in use/);
    const twice = createSlide({
      id: 's_captured',
      elements: [
        createElement.group({
          id: 'e_group',
          frame: { x: 0, y: 0, w: 10, h: 10 },
          children: [
            createElement.text({
              id: 'e_a',
              frame: { x: 0, y: 0, w: 5, h: 5 },
              content: { paragraphs: [] },
            }),
          ],
        }),
        createElement.text({
          id: 'e_a',
          frame: { x: 0, y: 0, w: 10, h: 10 },
          content: { paragraphs: [] },
        }),
      ],
    });
    expect(() => checkCapture(capture({ slide: twice }), deck())).toThrow(/already in use/);
  });

  it('gives the slide a free id when the page chose one the deck has', () => {
    const slide = createSlide({ id: 's_mine', elements: [] });
    const checked = checkCapture(capture({ slide }), deck());
    expect(checked.slide.id).not.toBe('s_mine');
    expect(checked.slide.id).toMatch(/^s_/);
  });

  it('never lets an imported slide run scripts, hide itself or lean on a layout', () => {
    const slide = {
      ...createSlide({
        id: 's_captured',
        elements: [
          createElement.html({
            id: 'e_html',
            frame: { x: 0, y: 0, w: 10, h: 10 },
            markup: '<script>parent.steal()</script>',
            hasScripts: true,
          }),
          createElement.group({
            id: 'e_group',
            frame: { x: 0, y: 0, w: 10, h: 10 },
            children: [
              createElement.html({
                id: 'e_inner',
                frame: { x: 0, y: 0, w: 5, h: 5 },
                markup: '<i>y</i>',
                hasScripts: true,
              }),
            ],
          }),
        ],
      }),
      hidden: true,
      layoutId: 'l_nowhere',
    };
    const checked = checkCapture(capture({ slide }), deck()).slide;
    expect(checked.hidden).toBeUndefined();
    expect(checked.layoutId).toBeUndefined();
    const [html, group] = checked.elements;
    expect(html).toMatchObject({ type: 'html', hasScripts: false });
    expect(group).toMatchObject({ type: 'group', children: [{ hasScripts: false }] });
  });

  it('marks every asset as imported, whatever the page said, and bounds the notes', () => {
    const checked = checkCapture(
      capture({
        assets: [{ ...asset, origin: 'upload' }],
        notes: Array.from({ length: 500 }, () => 'x'.repeat(5000)),
      }),
      deck(),
    );
    expect(checked.assets[0]!.origin).toBe('import');
    expect(checked.notes).toHaveLength(60);
    expect(checked.notes[0]).toHaveLength(600);
  });
});

describe('the other answers of the page', () => {
  it('are text of a bounded length', () => {
    expect(checkText('body [10x10]')).toBe('body [10x10]');
    expect(checkText({ a: 1 })).toBe('{"a":1}');
    expect(checkText(undefined)).toBe('null');
    expect(checkText('x'.repeat(100), 10)).toBe(`${'x'.repeat(10)}…`);
  });

  it('or a PNG in base64 with a sane size', () => {
    const picture = { data: 'iVBORw0KGgo=', width: 800, height: 450 };
    expect(checkPicture(picture)).toEqual(picture);
    for (const bad of [
      null,
      { ...picture, data: '<svg onload=alert(1)>' },
      { ...picture, width: 0 },
      { ...picture, height: 100_000 },
      { ...picture, width: 1.5 },
      { data: picture.data },
    ]) {
      expect(() => checkPicture(bad)).toThrow(/did not return a picture/);
    }
  });
});
