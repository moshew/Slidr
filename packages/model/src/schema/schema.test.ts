import { describe, expect, it } from 'vitest';
import { walkElements } from '../queries';
import { allElementsDeck, englishDeck, fixtureDecks, hebrewDeck, mixedDeck } from '../fixtures';
import { Color, Deck, Element, ElementType, Fill, SvgElement, TableElement } from './index';

describe('fixtures', () => {
  it.each(Object.entries(fixtureDecks))('%s is a valid deck', (_name, build) => {
    const result = Deck.safeParse(build());
    expect(result.error?.issues).toBeUndefined();
  });

  it('survives a JSON round trip unchanged', () => {
    for (const build of Object.values(fixtureDecks)) {
      const deck = build();
      expect(Deck.parse(JSON.parse(JSON.stringify(deck)))).toEqual(deck);
    }
  });

  it('are deterministic', () => {
    expect(hebrewDeck()).toEqual(hebrewDeck());
    expect(allElementsDeck()).toEqual(allElementsDeck());
  });

  it('cover every element type', () => {
    const types = new Set<string>();
    for (const slide of allElementsDeck().slides) {
      for (const element of walkElements(slide.elements)) types.add(element.type);
    }
    expect([...types].sort()).toEqual([...ElementType.options].sort());
  });

  it('cover both directions', () => {
    expect(hebrewDeck().meta.dir).toBe('rtl');
    expect(englishDeck().meta.dir).toBe('ltr');
    const dirs = mixedDeck().slides.flatMap((s) =>
      s.elements.flatMap((e) => (e.type === 'text' ? e.content.paragraphs.map((p) => p.dir) : [])),
    );
    expect(new Set(dirs)).toEqual(new Set(['auto', 'rtl', 'ltr']));
  });
});

describe('schema rules', () => {
  const textElement = () => allElementsDeck().slides[0]!.elements[0]!;

  it('rejects a field the model does not know', () => {
    expect(Element.safeParse({ ...textElement(), colour: 'red' }).success).toBe(false);
  });

  it('keeps unknown CSS in the passthrough field instead', () => {
    const element = { ...textElement(), css: { 'mix-blend-mode': 'multiply' } };
    expect(Element.safeParse(element).success).toBe(true);
  });

  it('accepts a colour as a token or as any CSS value, not both', () => {
    expect(Color.safeParse({ token: 'primary', alpha: 0.5 }).success).toBe(true);
    expect(Color.safeParse({ value: 'oklch(70% 0.1 200)' }).success).toBe(true);
    expect(Color.safeParse({ token: 'primary', value: '#fff' }).success).toBe(false);
    expect(Color.safeParse({ token: 'brand' }).success).toBe(false);
  });

  it('needs at least two stops for a gradient', () => {
    const stop = { color: { token: 'primary' }, at: 0 };
    expect(Fill.safeParse({ kind: 'linear', angle: 0, stops: [stop] }).success).toBe(false);
  });

  it('wants an svg element to have an asset or markup, exactly one', () => {
    const base = {
      id: 'e',
      type: 'svg',
      frame: { x: 0, y: 0, w: 1, h: 1 },
      rotation: 0,
      opacity: 1,
    };
    expect(SvgElement.safeParse(base).success).toBe(false);
    expect(SvgElement.safeParse({ ...base, markup: '<svg/>' }).success).toBe(true);
    expect(SvgElement.safeParse({ ...base, markup: '<svg/>', assetId: 'a' }).success).toBe(false);
  });

  it('wants table cells to form a rows x cols grid', () => {
    const table = allElementsDeck().slides[0]!.elements.find((e) => e.type === 'table')!;
    expect(TableElement.safeParse(table).success).toBe(true);
    expect(TableElement.safeParse({ ...table, rows: [80, 80] }).success).toBe(false);
  });

  it('validates elements nested in groups', () => {
    const group = allElementsDeck().slides[0]!.elements.find((e) => e.type === 'group')!;
    const broken = { ...group, children: [{ id: 'x', type: 'text' }] };
    expect(Element.safeParse(group).success).toBe(true);
    expect(Element.safeParse(broken).success).toBe(false);
  });

  it('takes an accent on one side of a shape, and room around its text', () => {
    const shape = allElementsDeck().slides[0]!.elements.find((e) => e.type === 'shape')!;
    const accent = { side: 'top', size: 8, fill: { kind: 'solid', color: { token: 'primary' } } };
    const padding = { top: 0, right: 4, bottom: 0, left: 4 };
    expect(Element.safeParse({ ...shape, accent, padding }).error?.issues).toBeUndefined();
    expect(Element.safeParse({ ...shape, accent: { ...accent, corners: 'follow' } }).success).toBe(
      true,
    );
    // A side is one of the four, and an accent has a thickness.
    expect(Element.safeParse({ ...shape, accent: { ...accent, side: 'start' } }).success).toBe(
      false,
    );
    expect(Element.safeParse({ ...shape, accent: { ...accent, size: 0 } }).success).toBe(false);
    expect(Element.safeParse({ ...shape, padding: { ...padding, left: -1 } }).success).toBe(false);
  });

  it('fixes the slide size', () => {
    expect(Deck.safeParse({ ...hebrewDeck(), size: { w: 1024, h: 768 } }).success).toBe(false);
  });
});
