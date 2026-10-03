import type { LintFinding, LintService, ToolResult } from '@slidr/agent-tools';
import { CommandBus, createDeck, createElement, createSlide, findSlide } from '@slidr/model';
import { describe, expect, it } from 'vitest';
import { holdsTurn, isClean, TurnWatch } from './qualityGate';

const finding = (
  rule: string,
  severity: LintFinding['severity'],
  slideId = 's_1',
): LintFinding => ({
  rule,
  severity,
  slideId,
  elementIds: [],
  message: rule,
});

/** Lint by slide name: `L01+L07` names the rules found on the slide. */
const lint: LintService = {
  lint: (deck, slideIds) =>
    Promise.resolve(
      slideIds.flatMap((slideId) =>
        (findSlide(deck, slideId)?.name ?? '')
          .split('+')
          .filter((rule) => /^L\d\d$/.test(rule))
          .map((rule) =>
            finding(
              rule,
              ['L01', 'L02', 'L05', 'L06'].includes(rule) ? 'error' : 'warning',
              slideId,
            ),
          ),
      ),
    ),
};

/** A bus whose changes all count as the turn's. */
function turn(name?: string) {
  const bus = new CommandBus(
    createDeck({ slides: [createSlide({ id: 's_1', ...(name ? { name } : {}) })] }),
  );
  const watch = new TurnWatch();
  bus.subscribe((event) => watch.changed(event));
  return { bus, watch };
}

const picture = (slideId: string): ToolResult => ({
  ok: true,
  data: { slideId },
  images: [{ mimeType: 'image/png', data: 'AAAA' }],
});

const box = () => createElement.shape({ frame: { x: 0, y: 0, w: 100, h: 100 } });

describe('what holds a turn', () => {
  it('is every error, and the three warnings the agent has to answer for', () => {
    const held = ['L01', 'L02', 'L05', 'L06'].map((rule) => finding(rule, 'error'));
    const demanded = ['L07', 'L13', 'L16'].map((rule) => finding(rule, 'warning'));
    const advice = ['L03', 'L04'].map((rule) => finding(rule, 'warning'));
    expect([...held, ...demanded].every(holdsTurn)).toBe(true);
    expect(advice.some(holdsTurn)).toBe(false);
  });
});

describe('looking (QG-01)', () => {
  it('asks for a look after a change to what the slide shows, and a picture answers it', async () => {
    const { bus, watch } = turn();
    expect(watch.touched).toBe(false);
    bus.dispatch({ type: 'element.add', slideId: 's_1', element: box() });
    expect(watch.touched).toBe(true);
    expect(await watch.review(bus.deck, { lint, canLook: true })).toEqual({
      unseen: ['s_1'],
      findings: [],
    });
    watch.noteResult(picture('s_1'), watch.mark());
    expect(isClean(await watch.review(bus.deck, { lint, canLook: true }))).toBe(true);

    // Changed again after the look: the picture is of an earlier slide.
    bus.dispatch({ type: 'element.add', slideId: 's_1', element: box() });
    expect((await watch.review(bus.deck, { lint, canLook: true })).unseen).toEqual(['s_1']);
  });

  it('does not count a picture taken before the change, or of another slide', async () => {
    const { bus, watch } = turn();
    const before = watch.mark();
    bus.dispatch({ type: 'element.add', slideId: 's_1', element: box() });
    // A render that was asked for before the write and answered after it.
    watch.noteResult(picture('s_1'), before);
    watch.noteResult(picture('s_other'), watch.mark());
    watch.noteResult({ ok: false, error: { code: 'failed', message: 'x' } }, watch.mark());
    watch.noteResult({ ok: true, data: { slideId: 's_1' }, images: [] }, watch.mark());
    expect((await watch.review(bus.deck, { lint, canLook: true })).unseen).toEqual(['s_1']);
  });

  it('asks for none after a change that leaves the picture as it was', async () => {
    const { bus, watch } = turn();
    bus.dispatch({
      type: 'slide.update',
      slideId: 's_1',
      patch: { notes: null, name: 'Intro', hidden: true },
    });
    expect(watch.touched).toBe(true);
    expect(isClean(await watch.review(bus.deck, { lint, canLook: true }))).toBe(true);
  });

  it('asks for none of a session that has no way to look, or of a slide that is gone', async () => {
    const { bus, watch } = turn();
    bus.dispatch({ type: 'slide.add', slide: createSlide({ id: 's_2' }), index: 1 });
    expect((await watch.review(bus.deck, { lint, canLook: false })).unseen).toEqual([]);
    expect((await watch.review(bus.deck, { lint, canLook: true })).unseen).toEqual(['s_2']);
    bus.dispatch({ type: 'slide.remove', slideIds: ['s_2'] });
    expect(isClean(await watch.review(bus.deck, { lint, canLook: true }))).toBe(true);
  });
});

describe('findings (QG-02, QG-03, QG-08)', () => {
  it('holds a slide the turn made to everything found on it', async () => {
    const { bus, watch } = turn();
    bus.dispatch({
      type: 'slide.add',
      slide: createSlide({ id: 's_2', name: 'L01+L04+L07' }),
      index: 1,
    });
    const report = await watch.review(bus.deck, { lint, canLook: false });
    expect(report.findings.map((f) => f.rule)).toEqual(['L01', 'L07']);
  });

  it('holds a slide that was there before only to what the turn brought', async () => {
    const { bus, watch } = turn('L05');
    bus.dispatch({ type: 'slide.update', slideId: 's_1', patch: { name: 'L05+L01' } });
    const report = await watch.review(bus.deck, { lint, canLook: false });
    expect(report.findings.map((f) => f.rule)).toEqual(['L01']);
    // The slide as it was is remembered from the first change, not from the latest.
    bus.dispatch({ type: 'slide.update', slideId: 's_1', patch: { name: 'L05+L06' } });
    const later = await watch.review(bus.deck, { lint, canLook: false });
    expect(later.findings.map((f) => f.rule)).toEqual(['L06']);
  });

  it('holds nothing when the app cannot lint', async () => {
    const { bus, watch } = turn();
    bus.dispatch({ type: 'slide.update', slideId: 's_1', patch: { name: 'L01' } });
    expect(isClean(await watch.review(bus.deck, { canLook: false }))).toBe(true);
    const failing: LintService = { lint: () => Promise.reject(new Error('no layout engine')) };
    const error = console.error;
    console.error = () => undefined;
    try {
      expect(isClean(await watch.review(bus.deck, { lint: failing, canLook: false }))).toBe(true);
    } finally {
      console.error = error;
    }
  });

  it('takes on the slides of an earlier turn, unseen and without a past', async () => {
    const bus = new CommandBus(createDeck({ slides: [createSlide({ id: 's_1', name: 'L02' })] }));
    const watch = new TurnWatch();
    watch.adopt(['s_1', 's_gone']);
    expect(await watch.review(bus.deck, { lint, canLook: true })).toEqual({
      unseen: ['s_1'],
      findings: [expect.objectContaining({ rule: 'L02', slideId: 's_1' })],
    });
  });
});
