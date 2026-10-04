import { CommandBus, createDeck, createSlide, type Background } from '@slidr/model';
import { describe, expect, it } from 'vitest';
import { MAX_CHART_COLORS, paletteCommands, variantCommands } from './themeLook';

const solid = (value: string): Background => ({
  fill: { kind: 'solid', color: { value } },
});
const DARK = solid('#101010');
const ACCENT = solid('#ff3366');

function setup() {
  const deck = createDeck({
    slides: [
      createSlide({ id: 's_dark', background: DARK }),
      createSlide({ id: 's_own', background: solid('#00ff00') }),
      createSlide({ id: 's_plain' }),
    ],
  });
  const bus = new CommandBus(
    {
      ...deck,
      theme: {
        ...deck.theme,
        backgroundVariants: [DARK, ACCENT],
        colors: { ...deck.theme.colors, chart: ['#111111', '#222222'] },
      },
    },
    { validate: true },
  );
  return bus;
}

describe('a variant of the theme background', () => {
  it('changes with the slides that picked it, in one undo step', () => {
    const bus = setup();
    const next = solid('#202020');
    bus.batch(variantCommands(bus.deck, 0, next), { label: 'Background' });
    expect(bus.deck.theme.backgroundVariants).toEqual([next, ACCENT]);
    expect(bus.deck.slides.map((s) => s.background)).toEqual([next, solid('#00ff00'), undefined]);
    expect(bus.undoStack).toHaveLength(1);
    bus.undo();
    expect(bus.deck.theme.backgroundVariants).toEqual([DARK, ACCENT]);
    expect(bus.deck.slides[0]!.background).toEqual(DARK);
    bus.redo();
    expect(bus.deck.slides[0]!.background).toEqual(next);
  });

  it('is added after the others, and removed without taking it from the slides', () => {
    const bus = setup();
    const added = solid('#abcdef');
    bus.batch(variantCommands(bus.deck, 2, added));
    expect(bus.deck.theme.backgroundVariants).toEqual([DARK, ACCENT, added]);
    bus.batch(variantCommands(bus.deck, 0, null));
    expect(bus.deck.theme.backgroundVariants).toEqual([ACCENT, added]);
    // The slide keeps the background it showed, now as its own.
    expect(bus.deck.slides[0]!.background).toEqual(DARK);
  });

  it('sends nothing when nothing changes', () => {
    const bus = setup();
    expect(variantCommands(bus.deck, 1, ACCENT)).toEqual([]);
  });
});

describe('the chart palette', () => {
  it('takes a colour changed, added and removed, each one undo step', () => {
    const bus = setup();
    bus.batch(paletteCommands(bus.deck, 1, '#333333'));
    bus.batch(paletteCommands(bus.deck, 2, '#444444'));
    bus.batch(paletteCommands(bus.deck, 0, null));
    expect(bus.deck.theme.colors.chart).toEqual(['#333333', '#444444']);
    // The other colours of the theme are not touched.
    expect(bus.deck.theme.colors.primary).toBe(setup().deck.theme.colors.primary);
    expect(bus.undoStack).toHaveLength(3);
    bus.undo();
    bus.undo();
    bus.undo();
    expect(bus.deck.theme.colors.chart).toEqual(['#111111', '#222222']);
  });

  it('keeps one colour at least, and no more than the most it takes', () => {
    const bus = setup();
    bus.batch(paletteCommands(bus.deck, 0, null));
    expect(paletteCommands(bus.deck, 0, null)).toEqual([]);
    while (bus.deck.theme.colors.chart.length < MAX_CHART_COLORS) {
      bus.batch(paletteCommands(bus.deck, bus.deck.theme.colors.chart.length, '#555555'));
    }
    expect(paletteCommands(bus.deck, MAX_CHART_COLORS, '#666666')).toEqual([]);
  });
});
