import type { SlideMeasurements } from '@slidr/lint';
import {
  CommandBus,
  createDeck,
  createElement,
  createSlide,
  richText,
  updateElement,
  type Deck,
  type Element,
  type Slide,
} from '@slidr/model';
import { describe, expect, it, vi } from 'vitest';
import { DesignCheck } from './check';

/** What a render of unrotated elements at the top of a slide measures: every box is its frame. */
function measured(slide: Slide): SlideMeasurements {
  const elements: Record<string, SlideMeasurements['elements'][string]> = {};
  for (const element of slide.elements) {
    const box = element.frame;
    elements[element.id] =
      element.type === 'text'
        ? {
            box,
            text: {
              ink: box,
              overflow: { x: 0, y: 0 },
              scale: 1,
              spans: [{ color: [21, 23, 26], alpha: 1, fontSize: 30, backdrop: [[255, 255, 255]] }],
            },
          }
        : { box };
  }
  return { elements };
}

const card = (id: string, x: number, y = 260): Element =>
  createElement.shape({ id, frame: { x, y, w: 544, h: 640 } });

/** Two slides of three cards: the first is in order, the second has a card 3px low and 7px off. */
function deck(): Deck {
  return createDeck({
    lang: 'en',
    slides: [
      createSlide({
        id: 's_fine',
        elements: [card('e_1', 96), card('e_2', 688), card('e_3', 1280)],
      }),
      createSlide({
        id: 's_off',
        elements: [
          card('e_a', 96),
          card('e_b', 681, 262),
          card('e_c', 1280),
          createElement.text({
            id: 'e_note',
            frame: { x: 96, y: 910, w: 900, h: 60 },
            content: richText('A coloured note', { marks: { color: { value: '#ff7a00' } } }),
          }),
        ],
      }),
    ],
  });
}

function setup(start = deck()) {
  const bus = new CommandBus(start, { validate: true });
  const measure = vi.fn((_: Deck, slide: Slide) => Promise.resolve(measured(slide)));
  return { bus, measure, check: new DesignCheck(bus, measure, { rest: 0 }) };
}

const rules = (check: DesignCheck) =>
  check.state.getState().findings.map((f) => `${f.slideId} ${f.rule}`);

describe('the design check of the open deck', () => {
  it('finds what every rule finds, on every slide, and says which deck it is of', async () => {
    const { bus, check } = setup();
    expect(check.state.getState()).toMatchObject({ pending: true, deck: null });
    await check.check();
    expect(rules(check)).toEqual(['s_off L09', 's_off L10', 's_off L11']);
    expect(check.state.getState()).toMatchObject({ pending: false, failed: false, deck: bus.deck });
    expect(check.current).toBe(true);
  });

  it('measures a slide again only when something it is drawn from changed', async () => {
    const { bus, check, measure } = setup();
    await check.check();
    expect(measure).toHaveBeenCalledTimes(2);
    bus.dispatch(updateElement('s_off', 'e_b', { frame: { x: 681, y: 260, w: 544, h: 640 } }));
    expect(check.current).toBe(false);
    await check.check();
    expect(measure).toHaveBeenCalledTimes(3);
    expect(measure.mock.calls[2]![1].id).toBe('s_off');
    expect(rules(check)).toEqual(['s_off L10', 's_off L11']);
    // A change of the theme redraws every slide.
    bus.dispatch({ type: 'theme.update', patch: { radius: 4 } });
    await check.check();
    expect(measure).toHaveBeenCalledTimes(5);
  });

  it('follows the deck once it is watched', async () => {
    const { bus, check } = setup();
    const stop = check.watch();
    await vi.waitFor(() => expect(check.state.getState().pending).toBe(false));
    expect(rules(check)).toHaveLength(3);
    bus.dispatch({ type: 'element.remove', slideId: 's_off', elementIds: ['e_note'] });
    expect(check.state.getState().pending).toBe(true);
    await vi.waitFor(() => expect(rules(check)).toEqual(['s_off L09', 's_off L10']));
    stop();
    bus.undo();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(rules(check)).toEqual(['s_off L09', 's_off L10']);
  });

  it('fixes one finding as one step, and not once the deck has moved on', async () => {
    const { bus, check } = setup();
    const [near] = await check.check();
    expect(check.fix(near!, 'Fix')).toBe(true);
    expect(bus.undoStack).toHaveLength(1);
    expect(bus.undoStack[0]).toMatchObject({ label: 'Fix' });
    // The finding was of the deck before the fix: its commands are not for this one.
    expect(check.fix(near!, 'Fix')).toBe(false);
    expect(bus.undoStack).toHaveLength(1);
    await check.check();
    expect(rules(check)).toEqual(['s_off L10', 's_off L11']);
  });

  it('fixes all errors and warnings as one step, and leaves what is only information', async () => {
    const start = deck();
    const { bus, check } = setup(start);
    expect(await check.fixAll('Fix all')).toBe(2);
    expect(rules(check)).toEqual(['s_off L11']);
    expect(bus.undoStack).toHaveLength(1);
    expect(bus.deck.slides[1]!.elements.map((e) => [e.frame.x, e.frame.y])).toEqual([
      [96, 260],
      [688, 260],
      [1280, 260],
      [96, 910],
    ]);
    bus.undo();
    expect(bus.deck).toEqual(start);
    // Nothing left to fix: no step is added.
    bus.redo();
    expect(await check.fixAll('Fix all')).toBe(0);
    expect(bus.undoStack).toHaveLength(1);
  });

  it('fixes all of one slide only, when asked for a slide', async () => {
    const { bus, check } = setup();
    expect(await check.fixAll('Fix all', 's_fine')).toBe(0);
    expect(bus.undoStack).toHaveLength(0);
    expect(await check.fixAll('Fix all', 's_off')).toBe(2);
  });

  it('says so when the check cannot run, and tries again when the deck changes', async () => {
    const { bus, check, measure } = setup();
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    measure.mockRejectedValueOnce(new Error('no layout'));
    await check.check();
    expect(check.state.getState()).toMatchObject({ failed: true, pending: false });
    // The same deck is not tried in a loop.
    await check.check();
    expect(measure).toHaveBeenCalledTimes(1);
    bus.dispatch({ type: 'theme.update', patch: { radius: 4 } });
    await check.check();
    expect(check.state.getState()).toMatchObject({ failed: false, deck: bus.deck });
    quiet.mockRestore();
  });
});
