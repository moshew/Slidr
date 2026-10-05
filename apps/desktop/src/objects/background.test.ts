import {
  CommandBus,
  createBaseTheme,
  createDeck,
  createSlide,
  type Background,
  type Layout,
} from '@slidr/model';
import { describe, expect, it } from 'vitest';
import {
  applyToAllCommands,
  inheritedBackground,
  shownBackground,
  variantIndex,
  withAdjust,
  withFill,
} from './background';

const photo: Background = {
  fill: { kind: 'image', assetId: 'a1', fit: 'cover' },
  blur: 12,
  dim: 0.4,
  overlay: { kind: 'solid', color: { value: 'black', alpha: 0.2 } },
};
const accent: Background = { fill: { kind: 'solid', color: { token: 'accent' } } };
const dark: Layout = {
  id: 'l_dark',
  name: 'Dark',
  archetype: 'section',
  background: { fill: { kind: 'solid', color: { token: 'text' } } },
  placeholders: [],
  decorations: [],
};

function deckOf(...slides: Parameters<typeof createSlide>[0][]) {
  return createDeck({
    layouts: [dark],
    slides: slides.map((slide, i) => createSlide({ id: `s${i + 1}`, ...slide })),
  });
}

describe('what a slide shows', () => {
  it('is its own background, then its layout, then the theme', () => {
    const deck = deckOf({}, { layoutId: 'l_dark' }, { layoutId: 'l_dark', background: accent });
    const [plain, laidOut, own] = deck.slides;
    expect(shownBackground(deck, plain!)).toBe(deck.theme.background);
    expect(shownBackground(deck, laidOut!)).toBe(dark.background);
    expect(shownBackground(deck, own!)).toBe(accent);
    expect(inheritedBackground(deck, own!)).toBe(dark.background);
  });

  it('recognises a variant of the theme', () => {
    // A theme with two variants, as a template has, or a plain deck the user gave a second one.
    const surface: Background = { fill: { kind: 'solid', color: { token: 'surface' } } };
    const deck = createDeck({
      theme: { ...createBaseTheme(), backgroundVariants: [surface, photo] },
      slides: [createSlide({ id: 's1' })],
    });
    expect(variantIndex(deck, surface)).toBe(0);
    expect(variantIndex(deck, { ...photo })).toBe(1);
    // A variant is the whole background: the same picture without its veil is not it.
    expect(variantIndex(deck, { fill: photo.fill })).toBe(-1);
    expect(variantIndex(deck, accent)).toBe(-1);
    expect(variantIndex(deck, undefined)).toBe(-1);
  });
});

describe('editing a background', () => {
  it('drops blur and dim with the photo, and keeps the overlay', () => {
    const solid = withFill(photo, { kind: 'solid', color: { token: 'bg' } });
    expect(solid).toEqual({
      fill: { kind: 'solid', color: { token: 'bg' } },
      overlay: photo.overlay,
    });
    const other = withFill(photo, { kind: 'image', assetId: 'a2', fit: 'contain' });
    expect(other).toMatchObject({ blur: 12, dim: 0.4 });
    expect(other.fill).toMatchObject({ assetId: 'a2' });
  });

  it('stores no blur and no dim as absent', () => {
    expect(withAdjust(photo, { blur: 0 })).not.toHaveProperty('blur');
    expect(withAdjust(photo, { blur: 0 })).toHaveProperty('dim', 0.4);
    expect(withAdjust(photo, { dim: 0 })).not.toHaveProperty('dim');
    expect(withAdjust(accent, { blur: 20, dim: 0.5 })).toEqual({ ...accent, blur: 20, dim: 0.5 });
  });
});

describe('apply to all slides', () => {
  it('makes the background the theme background and drops what the other slides had', () => {
    const deck = deckOf({ background: accent }, {}, { background: photo });
    const bus = new CommandBus(deck, { validate: true });
    bus.batch(applyToAllCommands(bus.deck, 's1'));

    expect(bus.deck.theme.background).toEqual(accent);
    for (const slide of bus.deck.slides) {
      expect(slide, slide.id).not.toHaveProperty('background');
      expect(shownBackground(bus.deck, slide)).toEqual(accent);
    }
    // A slide added afterwards shows it too.
    bus.dispatch({ type: 'slide.add', slide: createSlide({ id: 's9' }) });
    expect(shownBackground(bus.deck, bus.deck.slides.at(-1)!)).toEqual(accent);

    // One batch is one undo step: everything comes back at once.
    expect(bus.undoStack).toHaveLength(2);
    bus.undo();
    bus.undo();
    expect(bus.deck).toEqual(deck);
  });

  it('gives the background explicitly to a slide whose layout has its own', () => {
    const deck = deckOf({ background: accent }, { layoutId: 'l_dark' });
    const bus = new CommandBus(deck, { validate: true });
    bus.batch(applyToAllCommands(bus.deck, 's1'));
    expect(bus.deck.slides[1]?.background).toEqual(accent);
    expect(shownBackground(bus.deck, bus.deck.slides[1]!)).toEqual(accent);
  });

  it('spreads the theme background from a slide that has none of its own', () => {
    const deck = deckOf({}, { background: accent });
    const commands = applyToAllCommands(deck, 's1');
    // The theme already has it: only the other slide changes.
    expect(commands).toEqual([
      { type: 'slide.update', slideId: 's2', patch: { background: null } },
    ]);
  });

  it('has nothing to do when every slide already shows it', () => {
    expect(applyToAllCommands(deckOf({}, {}), 's1')).toEqual([]);
    expect(applyToAllCommands(deckOf({}), 'missing')).toEqual([]);
    const deck = deckOf({ background: accent }, {});
    const bus = new CommandBus(deck);
    bus.batch(applyToAllCommands(bus.deck, 's1'));
    expect(applyToAllCommands(bus.deck, 's1')).toEqual([]);
  });
});
