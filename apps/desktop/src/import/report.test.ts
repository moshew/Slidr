import { CommandBus, createDeck, createElement, createSlide } from '@slidr/model';
import { describe, expect, it } from 'vitest';
import type { ChatEntry } from '../agent/transcript';
import { buildReport, median } from './report';
import type { ImportState, SlideRecord } from './session';

/*
 * The import report is built from what the app holds (SPEC 13.3 step 7, IMP-11), not from what
 * the agent says about its own work.
 */

const record = (over: Partial<SlideRecord> = {}): SlideRecord => ({
  faithful: true,
  exact: true,
  wholeSlideHtml: false,
  editability: 1,
  textEditability: 1,
  kept: [],
  source: { width: 1280, height: 720 },
  elementIds: [],
  ...over,
});

const state = (records: Record<string, SlideRecord>, blocked: string[] = []): ImportState => ({
  file: 'deck.html',
  deckId: 'd_1',
  open: true,
  kept: true,
  stale: false,
  startedAt: 0,
  planned: null,
  phase: 'idle',
  records,
  blocked,
});

const turn = (costUsd: number | null, durationMs: number, done = true): ChatEntry => ({
  type: 'assistant',
  id: `m_${durationMs}`,
  at: '2026-10-03T20:00:00.000Z',
  parts: [],
  ...(done ? { outcome: 'completed' as const, costUsd, durationMs } : {}),
});

describe('median', () => {
  it('is the middle value, or the mean of the two middle ones', () => {
    expect(median([])).toBeNull();
    expect(median([0.4])).toBe(0.4);
    expect(median([1, 0, 0.8])).toBe(0.8);
    expect(median([1, 0.5, 0, 0.7])).toBeCloseTo(0.6);
  });
});

describe('buildReport', () => {
  it('lists the imported slides that are in the deck, in the order of the deck', () => {
    const deck = createDeck({
      lang: 'he',
      slides: [
        createSlide({ id: 's_c', name: 'Third captured' }),
        createSlide({ id: 's_mine' }),
        createSlide({ id: 's_a' }),
      ],
    });
    const report = buildReport(
      state({
        s_a: record({ editability: 0.5, textEditability: 0.9, kept: ['a pseudo-element'] }),
        s_deleted: record({ faithful: false }),
        s_c: record({ faithful: false, exact: false, wholeSlideHtml: true, editability: 0 }),
      }),
      deck,
      [],
    );
    expect(report.rows.map((row) => [row.number, row.slideId, row.name])).toEqual([
      [1, 's_c', 'Third captured'],
      [3, 's_a', undefined],
    ]);
    expect(report).toMatchObject({
      faithful: 1,
      approximate: 1,
      wholeHtml: 1,
      medianEditability: 0.25,
      medianTextEditability: 0.95,
    });
  });

  it('leaves a slide that was redesigned since its capture out of the figures', () => {
    const kept = createSlide({ id: 's_kept' });
    const redone = createSlide({ id: 's_redone' });
    const deck = createDeck({ lang: 'he', slides: [kept, redone] });
    const report = buildReport(
      state({
        s_kept: record({ editability: 0.6, elementIds: [] }),
        // Captured as one HTML element that failed the guard; nothing of it is on the slide now.
        s_redone: record({
          faithful: false,
          wholeSlideHtml: true,
          editability: 0,
          elementIds: ['e_gone'],
        }),
      }),
      deck,
      [],
    );
    expect(report.rows.map((row) => row.rebuilt)).toEqual([false, true]);
    expect(report).toMatchObject({
      measured: 1,
      faithful: 1,
      wholeHtml: 0,
      medianEditability: 0.6,
    });
  });

  it('still counts a slide whose captured elements were grouped', () => {
    const title = createElement.text({
      id: 'e_title',
      frame: { x: 100, y: 100, w: 600, h: 80 },
      content: { paragraphs: [] },
    });
    const card = createElement.shape({
      id: 'e_card',
      frame: { x: 100, y: 240, w: 600, h: 300 },
      geometry: { kind: 'preset', preset: 'rect' },
      fill: { kind: 'solid', color: { value: '#eeeeee' } },
    });
    const deck = createDeck({
      lang: 'en',
      slides: [createSlide({ id: 's_imported', elements: [title, card] })],
    });
    const imported = state({ s_imported: record({ elementIds: ['e_title', 'e_card'] }) });
    expect(buildReport(imported, deck, []).measured).toBe(1);

    // The user selects both and groups them, then puts that group in another: what was
    // captured is still on the slide, however deep.
    const bus = new CommandBus(deck, { validate: true });
    bus.dispatch({
      type: 'element.group',
      slideId: 's_imported',
      elementIds: ['e_title', 'e_card'],
      groupId: 'e_group',
    });
    bus.dispatch({
      type: 'element.group',
      slideId: 's_imported',
      elementIds: ['e_group'],
      groupId: 'e_outer',
    });
    const grouped = buildReport(imported, bus.deck, []);
    expect(grouped.rows[0]?.rebuilt).toBe(false);
    expect(grouped).toMatchObject({ measured: 1, faithful: 1 });

    // With everything that was captured deleted, the group gone with it, it is a rebuilt slide.
    bus.dispatch({ type: 'element.remove', slideId: 's_imported', elementIds: ['e_outer'] });
    expect(buildReport(imported, bus.deck, []).rows[0]?.rebuilt).toBe(true);
  });

  it('adds up the time and the cost of the turns that ended, as the harness reported them', () => {
    const deck = createDeck({ lang: 'he', slides: [createSlide({ id: 's_a' })] });
    const entries: ChatEntry[] = [
      { type: 'user', id: 'm_u', at: '2026-10-03T20:00:00.000Z', text: 'import it' },
      turn(0.25, 60_000),
      turn(0.5, 30_000),
      turn(null, 0, false),
    ];
    expect(buildReport(state({ s_a: record() }), deck, entries)).toMatchObject({
      turns: 2,
      durationMs: 90_000,
      costUsd: 0.75,
    });
    // A turn the harness could not price leaves the total unknown rather than too low.
    expect(buildReport(state({}), deck, [turn(0.25, 1000), turn(null, 1000)]).costUsd).toBeNull();
    expect(buildReport(state({}), deck, []).costUsd).toBeNull();
  });

  it('carries what the isolated page was refused', () => {
    const deck = createDeck({ lang: 'he', slides: [createSlide()] });
    const blocked = ['https://fonts.googleapis.com/css2?family=Heebo'];
    expect(buildReport(state({}, blocked), deck, [])).toMatchObject({
      rows: [],
      medianEditability: null,
      blocked,
    });
  });
});
