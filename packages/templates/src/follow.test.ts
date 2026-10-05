import {
  CommandBus,
  createElement,
  createSlide,
  findElementInDeck,
  richText,
  type Deck,
  type Element,
  type ShapeElement,
  type TableElement,
} from '@slidr/model';
import { describe, expect, it } from 'vitest';
import { applyTemplate, deckFromTemplate } from './deck';
import { nightTemplate, paperTemplate } from './fixtures';
import { linkCssToTheme } from './follow';

const box = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });

/** A glow as the conversion keeps one: the CSS the browser computed, with a clear end. */
const glowOf = (colour: string) =>
  `radial-gradient(circle, ${colour} 0%, rgba(0, 0, 0, 0) 70%) 0% 0% / auto repeat`;

// The colours of the `paper` fixture, as a browser writes them.
const PAPER = {
  /** `color-mix(in srgb, var(--color-primary) 30%, transparent)`: #b4432e. */
  primaryGlow: 'color(srgb 0.705882 0.262745 0.180392 / 0.3)',
  secondary: 'rgb(46, 93, 107)',
  accent: 'rgb(217, 164, 65)',
};

describe('linkCssToTheme', () => {
  const { theme } = paperTemplate();

  it("writes a colour of the theme as the theme's variable, as translucent as it was", () => {
    expect(linkCssToTheme(glowOf(PAPER.primaryGlow), theme)).toBe(
      glowOf('color-mix(in srgb, var(--color-primary) 30%, transparent)'),
    );
    expect(linkCssToTheme(`linear-gradient(${PAPER.secondary}, ${PAPER.accent})`, theme)).toBe(
      'linear-gradient(var(--color-secondary), var(--color-accent))',
    );
  });

  it('leaves a colour that is not of the theme, and what is already a variable', () => {
    const own = glowOf('rgb(10, 200, 30)');
    expect(linkCssToTheme(own, theme)).toBe(own);
    const linked = glowOf('color-mix(in srgb, var(--color-primary) 30%, transparent)');
    expect(linkCssToTheme(linked, theme)).toBe(linked);
  });

  it('leaves the clear end of a glow, whatever the theme calls black', () => {
    const black = { ...theme, colors: { ...theme.colors, text: '#000000' } };
    expect(linkCssToTheme(glowOf('rgb(0, 0, 0)'), black)).toBe(glowOf('var(--color-text)'));
    expect(linkCssToTheme('rgba(0, 0, 0, 0)', black)).toBe('rgba(0, 0, 0, 0)');
  });
});

describe('applyTemplate: what a slide holds of the theme as a copy', () => {
  const paper = paperTemplate();
  const night = nightTemplate();

  /** A deck on `paper` with one slide drawn freely, as the agent draws them: on no layout. */
  function freeDeck(elements: Element[], background?: Deck['slides'][number]['background']): Deck {
    const deck = deckFromTemplate(paper, { lang: 'he' });
    return {
      ...deck,
      slides: [createSlide({ id: 's_free', elements, ...(background ? { background } : {}) })],
    };
  }
  const switched = (deck: Deck, to = night) => {
    const bus = new CommandBus(deck, { validate: true });
    bus.batch(applyTemplate(deck, to));
    return bus;
  };
  const shape = (deck: Deck, id: string) => findElementInDeck(deck, id)!.element as ShapeElement;

  it('hands the colours inside a CSS fill to the theme, on a shape and behind the slide', () => {
    const deck = freeDeck(
      [
        createElement.shape({
          id: 'e_glow',
          frame: box(-200, -200, 800, 800),
          fill: { kind: 'css', value: glowOf(PAPER.primaryGlow) },
        }),
      ],
      { fill: { kind: 'css', value: `linear-gradient(${PAPER.secondary}, rgb(1, 2, 3))` } },
    );
    const after = switched(deck).deck;
    expect(shape(after, 'e_glow').fill).toEqual({
      kind: 'css',
      value: glowOf('color-mix(in srgb, var(--color-primary) 30%, transparent)'),
    });
    // A colour that was not the old theme's is the slide's own, and stays.
    expect(after.slides[0]!.background).toEqual({
      fill: { kind: 'css', value: 'linear-gradient(var(--color-secondary), rgb(1, 2, 3))' },
    });
  });

  it("gives a card with the old theme's corners and shadow the new theme's", () => {
    const deck = freeDeck([
      createElement.shape({
        id: 'e_card',
        frame: box(96, 300, 500, 300),
        effects: { radius: paper.theme.radius, shadow: { ...paper.theme.shadow } },
      }),
      // A pill is round by its own choice, and a shadow drawn by hand is the element's.
      createElement.shape({
        id: 'e_pill',
        frame: box(96, 700, 300, 80),
        effects: { radius: 40, shadow: { x: 0, y: 2, blur: 4, color: { value: '#000000' } } },
      }),
      createElement.group({
        id: 'e_group',
        frame: box(700, 300, 500, 300),
        children: [
          createElement.image({
            id: 'e_photo',
            frame: box(0, 0, 500, 300),
            effects: { radius: 8 },
          }),
        ],
      }),
    ]);
    const bus = switched(deck);
    expect(shape(bus.deck, 'e_card').effects).toEqual({
      radius: night.theme.radius,
      shadow: night.theme.shadow,
    });
    expect(shape(bus.deck, 'e_pill').effects).toEqual(shape(deck, 'e_pill').effects);
    expect(findElementInDeck(bus.deck, 'e_photo')!.element.effects).toEqual({ radius: 28 });

    // One step to undo, and the way back on the template is a way back for these too.
    const back = switched(bus.deck, paper).deck;
    expect(shape(back, 'e_card').effects).toEqual(shape(deck, 'e_card').effects);
    bus.undo();
    expect(bus.deck).toEqual(deck);
  });

  it('keeps square corners square on a template that draws them round, and the other way', () => {
    // No radius is no copy of anything: a band across the slide stays a band.
    const deck = freeDeck([createElement.shape({ id: 'e_band', frame: box(0, 900, 1920, 180) })]);
    expect(shape(switched(deck).deck, 'e_band').effects).toBeUndefined();

    // Round cards on a square template turn square, and are round again on the way back.
    const square = { ...night, theme: { ...night.theme, radius: 0 } };
    const cards = freeDeck([
      createElement.shape({ id: 'e_card', frame: box(96, 300, 500, 300), effects: { radius: 8 } }),
    ]);
    const onSquare = switched(cards, square).deck;
    expect(shape(onSquare, 'e_card').effects).toEqual({ radius: 0 });
    expect(shape(switched(onSquare, paper).deck, 'e_card').effects).toEqual({ radius: 8 });
  });

  it('reads the fills of the cells of a table', () => {
    const cell = (value?: string) => ({
      content: richText('תא'),
      ...(value ? { fill: { kind: 'css' as const, value } } : {}),
    });
    const deck = freeDeck([
      createElement.table({
        id: 'e_table',
        frame: box(96, 300, 800, 200),
        rows: [100, 100],
        cols: [400, 400],
        dir: 'rtl',
        cells: [
          [cell(`linear-gradient(90deg, ${PAPER.secondary}, ${PAPER.accent})`), cell()],
          [cell(), cell()],
        ],
      }),
    ]);
    const table = findElementInDeck(switched(deck).deck, 'e_table')!.element as TableElement;
    expect(table.cells[0]![0]!.fill).toEqual({
      kind: 'css',
      value: 'linear-gradient(90deg, var(--color-secondary), var(--color-accent))',
    });
    expect(table.cells[1]).toEqual((deck.slides[0]!.elements[0] as TableElement).cells[1]);
  });

  it('follows on the layouts the deck keeps through the switch', () => {
    // `night` has no timeline: the slide keeps the layout of `paper`, which stays in the deck.
    const deck = deckFromTemplate(paper, { lang: 'en', sample: true });
    const kept = deck.layouts.find((layout) => layout.id === 'l_paper_timeline')!;
    kept.decorations.push(
      createElement.shape({
        id: 'd_glow',
        frame: box(0, 0, 600, 600),
        fill: { kind: 'css', value: glowOf(PAPER.primaryGlow) },
        effects: { radius: 8 },
      }),
    );
    const after = switched(deck).deck.layouts.find((layout) => layout.id === kept.id)!;
    expect(after.decorations.find((d) => d.id === 'd_glow')).toMatchObject({
      fill: { value: glowOf('color-mix(in srgb, var(--color-primary) 30%, transparent)') },
      effects: { radius: 28 },
    });
  });

  it('changes nothing when the deck is switched to the theme it has', () => {
    const deck = freeDeck([
      createElement.shape({
        id: 'e_glow',
        frame: box(0, 0, 800, 800),
        fill: { kind: 'css', value: glowOf(PAPER.primaryGlow) },
      }),
    ]);
    expect(applyTemplate(deck, paper).filter((c) => c.type === 'element.update')).toEqual([]);
  });
});
