import {
  CommandBus,
  createDeck,
  createElement,
  createSlide,
  updateElement,
  type Accent,
  type ElementPatch,
  type Fill,
  type ShapeElement,
} from '@slidr/model';
import { describe, expect, it } from 'vitest';
import {
  ACCENT_SIZE,
  accentChoices,
  canFollowCorners,
  choiceOf,
  cornersPatch,
  fillPatch,
  followsCorners,
  hasRoundCorners,
  MAX_ACCENT_SIZE,
  newAccent,
  sideOf,
  sidePatch,
  sizePatch,
  takesAccent,
} from './accent';

const frame = { x: 0, y: 0, w: 400, h: 200 };

const shape = (preset: string, extra: Partial<Parameters<typeof createElement.shape>[0]> = {}) =>
  createElement.shape({ frame, geometry: { kind: 'preset', preset }, ...extra });

const surface: Fill = { kind: 'solid', color: { token: 'surface' } };
const gradient: Fill = {
  kind: 'linear',
  angle: 90,
  stops: [
    { color: { token: 'primary' }, at: 0 },
    { color: { token: 'secondary' }, at: 1 },
  ],
};
const stripe: Accent = {
  side: 'top',
  size: 12,
  fill: { kind: 'solid', color: { value: '#e5484d' } },
};

/** Applies a patch through the real command, so an invalid one fails the test. */
function apply(element: ShapeElement, patch: ElementPatch): ShapeElement {
  const slide = createSlide({ id: 's1', elements: [element] });
  const bus = new CommandBus(createDeck({ slides: [slide] }), { validate: true });
  bus.dispatch(updateElement('s1', element.id, patch));
  return bus.deck.slides[0]?.elements[0] as ShapeElement;
}

describe('which shapes take an accent', () => {
  it('is the ones the renderer draws as a box', () => {
    for (const preset of ['rect', 'roundRect', 'ellipse']) {
      expect(takesAccent(shape(preset)), preset).toBe(true);
    }
    expect(takesAccent(shape('star5'))).toBe(false);
    expect(takesAccent(shape('arrowRight'))).toBe(false);
    const path = createElement.shape({
      frame,
      geometry: { kind: 'path', d: 'M0 0H10V10z', viewBox: { w: 10, h: 10 } },
    });
    expect(takesAccent(path)).toBe(false);
  });
});

describe('the side of an accent, as the deck reads', () => {
  it('keeps top and bottom whichever way the deck reads', () => {
    for (const dir of ['rtl', 'ltr'] as const) {
      expect(sideOf('top', dir)).toBe('top');
      expect(sideOf('bottom', dir)).toBe('bottom');
      expect(choiceOf({ ...stripe, side: 'bottom' }, dir)).toBe('bottom');
    }
  });

  it('puts the start on the right of a right-to-left deck and on the left of the other', () => {
    expect(sideOf('start', 'rtl')).toBe('right');
    expect(sideOf('end', 'rtl')).toBe('left');
    expect(sideOf('start', 'ltr')).toBe('left');
    expect(sideOf('end', 'ltr')).toBe('right');
  });

  it('reads a stored side back as the choice that wrote it', () => {
    for (const dir of ['rtl', 'ltr'] as const) {
      for (const choice of ['top', 'bottom', 'start', 'end'] as const) {
        expect(choiceOf({ ...stripe, side: sideOf(choice, dir) }, dir)).toBe(choice);
      }
    }
    expect(choiceOf(undefined, 'rtl')).toBe('none');
  });

  it('lays the two sides out so that the right one is on the right', () => {
    // A control in a right-to-left UI lays its first choice on the right.
    const onTheRight = (deck: 'rtl' | 'ltr', ui: 'rtl' | 'ltr') => {
      const sides = accentChoices(deck, ui).slice(3);
      return ui === 'rtl' ? sides[0] : sides[1];
    };
    for (const deck of ['rtl', 'ltr'] as const) {
      for (const ui of ['rtl', 'ltr'] as const) {
        const choices = accentChoices(deck, ui);
        expect(choices.slice(0, 3)).toEqual(['none', 'top', 'bottom']);
        expect([...choices].sort()).toEqual(['bottom', 'end', 'none', 'start', 'top']);
        const choice = onTheRight(deck, ui) as 'start' | 'end';
        expect(sideOf(choice, deck), `${deck} deck, ${ui} UI`).toBe('right');
      }
    }
  });
});

describe('a new accent', () => {
  it('is thin, in the theme primary, and cut by the corners', () => {
    const accent = newAccent('top', shape('rect', { fill: surface }));
    expect(accent).toEqual({
      side: 'top',
      size: ACCENT_SIZE,
      fill: { kind: 'solid', color: { token: 'primary' } },
    });
    expect(followsCorners(accent)).toBe(false);
  });

  it('takes the theme accent colour on a box that is itself primary, where it would not show', () => {
    // A shape of the library is filled with the primary colour.
    expect(newAccent('left', shape('rect')).fill).toEqual({
      kind: 'solid',
      color: { token: 'accent' },
    });
    // A primary that is not the whole colour of the box is not in the way.
    expect(newAccent('left', shape('rect', { fill: gradient })).fill).toEqual({
      kind: 'solid',
      color: { token: 'primary' },
    });
  });
});

describe('sidePatch', () => {
  it('gives a shape without an accent a new one on the chosen side', () => {
    const box = shape('roundRect', { fill: surface });
    const next = apply(box, sidePatch(box, 'start', 'rtl'));
    expect(next.accent).toEqual({ ...newAccent('right', box), side: 'right' });
    expect(apply(box, sidePatch(box, 'start', 'ltr')).accent?.side).toBe('left');
  });

  it('moves the accent a shape has, with its colour, its thickness and its corners', () => {
    const box = shape('rect', { fill: surface, accent: { ...stripe, corners: 'follow' } });
    expect(apply(box, sidePatch(box, 'bottom', 'rtl')).accent).toEqual({
      ...stripe,
      corners: 'follow',
      side: 'bottom',
    });
  });

  it('takes the accent away with "none", field and all', () => {
    const box = shape('rect', { fill: surface, accent: stripe });
    expect(sidePatch(box, 'none', 'rtl')).toEqual({ accent: null });
    expect(apply(box, sidePatch(box, 'none', 'rtl'))).not.toHaveProperty('accent');
  });

  it('brings back the accent that was just taken away, on the side now chosen', () => {
    const bare = shape('rect', { fill: surface });
    expect(apply(bare, sidePatch(bare, 'end', 'rtl', stripe)).accent).toEqual({
      ...stripe,
      side: 'left',
    });
  });
});

describe('thickness, colour and corners', () => {
  it('keeps the thickness between one pixel and the most the controls offer', () => {
    const box = shape('rect', { fill: surface, accent: stripe });
    expect(apply(box, sizePatch(stripe, 24)).accent).toEqual({ ...stripe, size: 24 });
    expect(apply(box, sizePatch(stripe, 0)).accent?.size).toBe(1);
    expect(apply(box, sizePatch(stripe, 999)).accent?.size).toBe(MAX_ACCENT_SIZE);
  });

  it('changes the colour and leaves the rest', () => {
    const box = shape('rect', { fill: surface, accent: { ...stripe, corners: 'follow' } });
    const blue: Fill = { kind: 'solid', color: { token: 'secondary' } };
    expect(apply(box, fillPatch({ ...stripe, corners: 'follow' }, blue)).accent).toEqual({
      ...stripe,
      corners: 'follow',
      fill: blue,
    });
  });

  it('stores a gradient as cut by the corners: only one colour goes around them', () => {
    const around: Accent = { ...stripe, corners: 'follow' };
    const box = shape('rect', { fill: surface, accent: around });
    const next = apply(box, fillPatch(around, gradient)).accent;
    expect(next).toEqual({ ...stripe, fill: gradient });
    expect(next).not.toHaveProperty('corners');
    expect(canFollowCorners(next!)).toBe(false);
    // Asking for it changes nothing while the fill is a gradient.
    expect(apply(box, cornersPatch(next!, true)).accent).toEqual(next);
  });

  it('goes around the corners and back; cut is stored as no word at all', () => {
    const box = shape('roundRect', { fill: surface, accent: stripe });
    const around = apply(box, cornersPatch(stripe, true)).accent!;
    expect(around).toEqual({ ...stripe, corners: 'follow' });
    expect(followsCorners(around)).toBe(true);
    const back = apply(box, cornersPatch(around, false)).accent!;
    expect(back).toEqual(stripe);
    expect(followsCorners(back)).toBe(false);
    // One that says `cut` in so many words is stored the same way.
    expect(cornersPatch({ ...stripe, corners: 'cut' }, false)).toEqual({ accent: stripe });
  });
});

describe('hasRoundCorners', () => {
  it('is true where the box is rounded, and only there', () => {
    expect(hasRoundCorners(shape('rect'))).toBe(false);
    expect(hasRoundCorners(shape('rect', { effects: { radius: 16 } }))).toBe(true);
    expect(hasRoundCorners(shape('roundRect'))).toBe(true);
    expect(
      hasRoundCorners(
        createElement.shape({
          frame,
          geometry: { kind: 'preset', preset: 'roundRect', adjust: [0] },
        }),
      ),
    ).toBe(false);
    expect(hasRoundCorners(shape('ellipse'))).toBe(true);
    // A star has corners, and no sides for an accent to be on.
    expect(hasRoundCorners(shape('star5'))).toBe(false);
  });
});
