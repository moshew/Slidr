import type { LintFinding, SlideMeasurements } from '@slidr/lint';
import {
  CommandBus,
  createDeck,
  createElement,
  createSlide,
  refitCommands,
  richText,
  updateElement,
  walkElements,
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
    const fixing = check.fix(near!, 'Fix');
    // The fix itself is applied at once: the button answers before anything is measured again.
    expect(bus.undoStack).toHaveLength(1);
    expect(await fixing).toBe(true);
    expect(bus.undoStack).toHaveLength(1);
    expect(bus.undoStack[0]).toMatchObject({ label: 'Fix' });
    // The finding was of the deck before the fix: its commands are not for this one.
    expect(await check.fix(near!, 'Fix')).toBe(false);
    expect(bus.undoStack).toHaveLength(1);
    await check.check();
    expect(rules(check)).toEqual(['s_off L10', 's_off L11']);
  });

  describe('a fix that opens an error', () => {
    /**
     * A footnote as a render measures it: at 18px its two lines fill a box of 60; set at a
     * readable 24px they need 95, and shrunk to fit they are drawn smaller again.
     */
    const NEEDS = 95;
    const note = (init: Partial<Parameters<typeof createElement.text>[0]> = {}) =>
      createElement.text({
        id: 'e_note',
        frame: { x: 200, y: 200, w: 620, h: 60 },
        content: richText('A footnote of two lines, set small', { marks: { size: 18 } }),
        ...init,
      });
    function rendered(slide: Slide): SlideMeasurements {
      const out = measured(slide);
      for (const element of slide.elements) {
        const text = out.elements[element.id]?.text;
        if (element.type !== 'text' || !text) continue;
        const size = element.content.paragraphs[0]!.runs[0]!.marks?.size ?? 30;
        if (size < 24) text.spans = [{ ...text.spans[0]!, fontSize: size }];
        if (size !== 24) continue;
        const room = element.frame.h;
        const shrunk = element.autoFit === 'shrink' && room < NEEDS;
        text.scale = shrunk ? room / NEEDS : 1;
        text.overflow = { x: 0, y: shrunk ? 0 : Math.max(0, NEEDS - room) };
        text.spans = [{ ...text.spans[0]!, fontSize: 24 * text.scale }];
      }
      return out;
    }
    /** What is found on elements: a slide this bare has findings about the slide as a whole too. */
    const onElements = (findings: readonly LintFinding[]) =>
      findings.filter((f) => f.elementIds.length > 0);
    const brief = (findings: readonly LintFinding[]) =>
      onElements(findings).map((f) => `${f.rule} ${f.severity}`);
    function on(elements: Element[]) {
      const start = createDeck({ lang: 'en', slides: [createSlide({ id: 's_1', elements })] });
      const bus = new CommandBus(start, { validate: true });
      const check = new DesignCheck(bus, (_, slide) => Promise.resolve(rendered(slide)), {
        rest: 0,
      });
      const found = async () => brief(await check.check());
      const box = () => bus.deck.slides[0]!.elements.find((e) => e.id === 'e_note')!;
      return { start, bus, check, found, box };
    }

    it('goes on to fix it, in the same step: small text made readable gets the box it needs', async () => {
      const { start, bus, check, found, box } = on([note()]);
      expect(await found()).toEqual(['L04 warning']);
      const [small] = onElements(await check.check());
      expect(await check.fix(small!, 'Fix')).toBe(true);
      // Alone, the fix of the size leaves the text 35px taller than its box: an error in place
      // of the warning. The box was made taller for it.
      expect(await found()).toEqual([]);
      expect(box().frame.h).toBe(NEEDS);
      expect(bus.undoStack).toHaveLength(1);
      bus.undo();
      expect(bus.deck).toEqual(start);
    });

    it('shrinks the text to its box where the box has no room to grow, and leaves no error', async () => {
      const under = createElement.text({
        id: 'e_under',
        frame: { x: 200, y: 270, w: 620, h: 60 },
        content: richText('The line right under the footnote'),
      });
      const { bus, check, found, box } = on([note(), under]);
      const [small] = onElements(await check.check());
      await check.fix(small!, 'Fix');
      expect(box()).toMatchObject({ autoFit: 'shrink', frame: { h: 60 } });
      // What is left is the warning that text of this length has no room at a readable size.
      expect(await found()).toEqual(['L04 warning']);
      expect(onElements(await check.check())[0]).not.toHaveProperty('fix');
      expect(bus.undoStack).toHaveLength(1);
    });

    it('leaves alone an error that was there before: the user asked for one finding', async () => {
      // The same footnote, already too tall for its box before anything was fixed.
      const tall = note({
        content: richText('A footnote of two lines, set small', { marks: { size: 24 } }),
      });
      const pale = createElement.text({
        id: 'e_pale',
        frame: { x: 200, y: 600, w: 620, h: 60 },
        content: richText('המשפט הזה כתוב בעברית.', { dir: 'ltr' }),
      });
      const { check, found } = on([tall, pale]);
      expect(await found()).toEqual(['L01 error', 'L15 warning']);
      const turned = (await check.check()).find((f) => f.rule === 'L15')!;
      await check.fix(turned, 'Fix');
      expect(await found()).toEqual(['L01 error']);
    });

    it('is fixed by "fix all" whatever the order: a finding that comes back gets its new fix', async () => {
      // Too small and too tall at once: the box is fitted first, then the size is raised, and
      // the box no longer fits. Before, the second fix of the box was never tried.
      const crowded = note({ frame: { x: 200, y: 200, w: 620, h: 40 } });
      const measure = (_: Deck, slide: Slide) => {
        const out = rendered(slide);
        const element = slide.elements[0]!;
        const text = out.elements[element.id]!.text!;
        // At 18px the two lines need 60, and the box is 40.
        if (text.spans[0]!.fontSize === 18) {
          text.overflow = { x: 0, y: Math.max(0, 60 - element.frame.h) };
        }
        return Promise.resolve(out);
      };
      const start = createDeck({
        lang: 'en',
        slides: [createSlide({ id: 's_1', elements: [crowded] })],
      });
      const bus = new CommandBus(start, { validate: true });
      const check = new DesignCheck(bus, measure, { rest: 0 });
      expect(brief(await check.check())).toEqual(['L01 error', 'L04 warning']);
      expect(await check.fixAll('Fix all')).toBe(3);
      expect(brief(await check.check())).toEqual([]);
      expect(bus.deck.slides[0]!.elements[0]!.frame.h).toBe(NEEDS);
      expect(bus.undoStack).toHaveLength(1);
      const settled = bus.deck;
      expect(await check.fixAll('Fix all')).toBe(0);
      expect(bus.deck).toBe(settled);
    });
  });

  describe('a fix of an element inside a group', () => {
    /** The two lines of the card's text need this much; its box is 60 tall. */
    const NEEDS = 95;
    /** What a render measures of a card: each part where its group puts it on the slide. */
    function rendered(slide: Slide): SlideMeasurements {
      const elements: SlideMeasurements['elements'] = {};
      const visit = (list: readonly Element[], dx: number, dy: number) => {
        for (const element of list) {
          const box = { ...element.frame, x: element.frame.x + dx, y: element.frame.y + dy };
          elements[element.id] = { box };
          if (element.type === 'group') visit(element.children, box.x, box.y);
          if (element.type !== 'text') continue;
          elements[element.id]!.text = {
            ink: box,
            overflow: { x: 0, y: Math.max(0, NEEDS - box.h) },
            scale: 1,
            spans: [{ color: [21, 23, 26], alpha: 1, fontSize: 30, backdrop: [[255, 255, 255]] }],
          };
        }
      };
      visit(slide.elements, 0, 0);
      return { elements };
    }
    /** A card as the conversion makes one: the box, then the text on it, near its lower edge. */
    function card() {
      const group = createElement.group({
        id: 'e_card',
        frame: { x: 200, y: 200, w: 620, h: 160 },
        children: [
          createElement.shape({ id: 'e_box', frame: { x: 0, y: 0, w: 620, h: 160 } }),
          createElement.text({
            id: 'e_text',
            frame: { x: 40, y: 100, w: 540, h: 60 },
            content: richText('Two lines of text in a box that holds one'),
          }),
        ],
      });
      const start = createDeck({
        lang: 'en',
        slides: [createSlide({ id: 's_1', elements: [group] })],
      });
      const bus = new CommandBus(start, { validate: true });
      const check = new DesignCheck(bus, (_, slide) => Promise.resolve(rendered(slide)), {
        rest: 0,
      });
      const tall = async () => (await check.check()).find((f) => f.rule === 'L01');
      return { start, bus, check, tall };
    }
    const frames = (bus: CommandBus) =>
      Object.fromEntries(
        [...walkElements(bus.deck.slides[0]!.elements)].map((e) => [e.id, e.frame]),
      );

    it('leaves the group the box around its children, in the step of the fix', async () => {
      const { start, bus, check, tall } = card();
      const overflow = await tall();
      expect(overflow).toMatchObject({ elementIds: ['e_text'] });
      expect(await check.fix(overflow!, 'Fix')).toBe(true);
      // The text was made taller where it stands, 35px past the lower edge of the card: the
      // group takes the new bounds of what is in it, and nothing else moved.
      expect(frames(bus)).toEqual({
        e_card: { x: 200, y: 200, w: 620, h: 195 },
        e_box: { x: 0, y: 0, w: 620, h: 160 },
        e_text: { x: 40, y: 100, w: 540, h: NEEDS },
      });
      expect(refitCommands(bus.deck.slides[0]!)).toEqual([]);
      expect(await tall()).toBeUndefined();
      expect(bus.undoStack).toHaveLength(1);
      bus.undo();
      expect(bus.deck).toEqual(start);
    });

    it('does the same for every fix of "fix all"', async () => {
      const { start, bus, check } = card();
      expect(await check.fixAll('Fix all')).toBeGreaterThan(0);
      expect(frames(bus).e_text).toMatchObject({ h: NEEDS });
      expect(refitCommands(bus.deck.slides[0]!)).toEqual([]);
      expect(bus.undoStack).toHaveLength(1);
      bus.undo();
      expect(bus.deck).toEqual(start);
    });
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
