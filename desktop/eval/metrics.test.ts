import type { LintFinding } from '@slidr/agent-tools';
import { createDeck, createElement, createSlide, richText, type Slide } from '@slidr/model';
import { describe, expect, it } from 'vitest';
import type { AssistantEntry, ChatEntry } from '../src/agent/transcript';
import {
  changedSlides,
  hasEmoji,
  isTitleAndBullets,
  scoreRequest,
  toolRecord,
  type ToolRecord,
} from './metrics';

const frame = { x: 96, y: 80, w: 800, h: 200 };

const text = (words: string) => createElement.text({ frame, content: richText(words) });

const list = (...items: string[]) =>
  createElement.text({
    frame,
    content: {
      paragraphs: items.map((item) => ({
        dir: 'auto' as const,
        align: 'start' as const,
        list: { kind: 'bullet' as const, level: 0 },
        runs: [{ text: item }],
      })),
    },
  });

const card = () => createElement.shape({ frame: { x: 96, y: 400, w: 400, h: 300 } });

const deckOf = (...slides: Slide[]) => createDeck({ lang: 'he', slides });

function assistant(entry: Partial<AssistantEntry>): AssistantEntry {
  return { type: 'assistant', id: 'm_1', at: '2026-10-03T18:00:00.000Z', parts: [], ...entry };
}

const finding = (
  slideId: string,
  rule: string,
  severity: LintFinding['severity'],
): LintFinding => ({
  rule,
  severity,
  slideId,
  elementIds: [],
  message: `${rule} on ${slideId}`,
});

const htmlWrite = (slideId: string, data: Record<string, unknown> = {}): ToolRecord => ({
  name: 'slide_create_from_html',
  input: { html: '<div></div>' },
  ok: true,
  data: { slideId, editability: 1, lint: [], ...data },
  ms: 500,
});

describe('a title and bullets on an empty background', () => {
  it('is a slide of text alone, with a list, on a flat background', () => {
    const slide = createSlide({ elements: [text('תוכנית'), list('ראשון', 'שני', 'שלישי')] });
    expect(isTitleAndBullets(deckOf(slide), slide)).toBe(true);
  });

  it('is not a slide with anything drawn besides text and lines', () => {
    const slide = createSlide({ elements: [text('תוכנית'), list('ראשון', 'שני'), card()] });
    expect(isTitleAndBullets(deckOf(slide), slide)).toBe(false);
  });

  it('is not a slide on a gradient or a picture', () => {
    const slide = createSlide({
      elements: [text('תוכנית'), list('ראשון', 'שני')],
      background: {
        fill: {
          kind: 'linear',
          angle: 135,
          stops: [
            { at: 0, color: { token: 'primary' } },
            { at: 1, color: { token: 'secondary' } },
          ],
        },
      },
    });
    expect(isTitleAndBullets(deckOf(slide), slide)).toBe(false);
  });

  it('is not a slide of text without a list: a quote, a section divider', () => {
    const slide = createSlide({ elements: [text('הקול של הלקוח'), text('פרק שני')] });
    expect(isTitleAndBullets(deckOf(slide), slide)).toBe(false);
  });
});

describe('emoji', () => {
  it('finds pictures and leaves text symbols alone', () => {
    expect(hasEmoji(`הצלחה ${String.fromCodePoint(0x1f680)}`)).toBe(true);
    expect(hasEmoji(`אזהרה ${String.fromCodePoint(0x26a0, 0xfe0f)}`)).toBe(true);
    expect(hasEmoji('Q3 → Q4 · 92% ✓ © 2026')).toBe(false);
  });
});

describe('the slides a request changed', () => {
  it('are the new ones and the ones that differ, not the ones left as they were', () => {
    const kept = createSlide({ id: 's_kept', elements: [text('נשאר')] });
    const edited = createSlide({ id: 's_edited', elements: [text('לפני')] });
    const before = deckOf(kept, edited);
    const after = deckOf(
      kept,
      { ...edited, name: 'אחרי' },
      createSlide({ id: 's_new', elements: [text('חדש')] }),
    );
    expect(changedSlides(before, after)).toEqual(['s_edited', 's_new']);
  });
});

describe('the score of a request', () => {
  const empty = createSlide({ id: 's_empty' });
  const first = createSlide({ id: 's_1', archetype: 'hero', elements: [text('פתיחה'), card()] });
  const second = createSlide({
    id: 's_2',
    elements: [text('נקודות'), list('ראשון', 'שני')],
  });
  const third = createSlide({
    id: 's_3',
    elements: [text('גרף'), createElement.html({ frame, markup: '<canvas></canvas>' })],
  });
  const before = deckOf(empty);
  const deck = deckOf(empty, first, second, third);

  const entries: ChatEntry[] = [
    { type: 'user', id: 'm_0', at: '2026-10-03T18:00:00.000Z', text: 'בנה מצגת' },
    assistant({
      outcome: 'completed',
      parts: [
        { type: 'gate', round: 1, unseen: ['s_3'], findings: [finding('s_2', 'L16', 'warning')] },
        { type: 'gate', round: 2, unseen: [], findings: [finding('s_2', 'L16', 'warning')] },
      ],
      remaining: { unseen: [], findings: [finding('s_2', 'L16', 'warning')] },
    }),
  ];
  const tools: ToolRecord[] = [
    htmlWrite('s_1'),
    htmlWrite('s_2', { lint: [finding('s_2', 'L16', 'warning')] }),
    htmlWrite('s_3', { editability: 0.5 }),
    { ...htmlWrite('s_3', { editability: 0 }), name: 'slide_replace_from_html' },
    toolRecord(
      'text_set',
      { elementId: 'e_gone' },
      { ok: false, error: { code: 'not_found', message: 'gone' } },
      3,
    ),
  ];
  const findings = [finding('s_2', 'L16', 'warning'), finding('s_empty', 'L07', 'warning')];
  const score = scoreRequest({ before, deck, entries, tools, findings });

  it('counts the lint findings of the finished deck by level and by rule', () => {
    expect(score.findings).toEqual({ error: 0, warning: 2, info: 0, byRule: { L16: 1, L07: 1 } });
    expect(score.slides[2]?.findings).toEqual([
      { rule: 'L16', severity: 'warning', message: 'L16 on s_2' },
    ]);
  });

  it('judges only the slides the request made, and passes those the first round did not name', () => {
    // The empty slide the deck started with was not touched: it is not the agent's.
    expect(score.gate.judged).toBe(3);
    expect(score.gate.passedFirstRound).toBe(1);
    expect(score.gate.rounds.map((round) => round.round)).toEqual([1, 2]);
    expect(score.gate.remaining).toBe(1);
  });

  it('knows a slide of a title and bullets, and how editable each slide is', () => {
    expect(score.titleAndBullets).toEqual(['s_2']);
    expect(score.slides.map((slide) => slide.editability)).toEqual([1, 1, 1, 0.5]);
    expect(score.editability).toBeCloseTo(0.875);
  });

  it('leaves a plain slide the request did not touch to the user', () => {
    const edit = scoreRequest({ before: deck, deck, entries: [], tools: [], findings: [] });
    expect(edit.slides[2]?.titleAndBullets).toBe(true);
    expect(edit.titleAndBullets).toEqual([]);
    expect(edit.gate.judged).toBe(0);

    // Reworded, not redesigned: the design check judges the slide, and its look is still the user's.
    const reworded = deckOf(empty, first, { ...second, name: 'קוצר' }, third);
    const shortened = scoreRequest({
      before: deck,
      deck: reworded,
      entries: [],
      tools: [],
      findings: [],
    });
    expect(shortened.gate.judged).toBe(1);
    expect(shortened.titleAndBullets).toEqual([]);
    // Written anew as HTML and still a title and bullets: that one is the agent's.
    const rewritten = scoreRequest({
      before: deck,
      deck: reworded,
      entries: [],
      tools: [{ ...htmlWrite('s_2'), name: 'slide_replace_from_html' }],
      findings: [],
    });
    expect(rewritten.titleAndBullets).toEqual(['s_2']);
  });

  it('follows the HTML writes: how many, how they converted, which came back clean', () => {
    expect(score.conversions).toEqual({
      writes: 4,
      partlyHtml: 2,
      wholeSlideHtml: 1,
      withFindings: 1,
    });
    expect(score.slides.map((slide) => [slide.writes, slide.cleanFirstWrite])).toEqual([
      [0, null],
      [1, true],
      [1, false],
      [2, true],
    ]);
    expect(score.toolErrors).toEqual([{ name: 'text_set', code: 'not_found', message: 'gone' }]);
  });

  it('counts the assistant turns', () => {
    expect(score.turns).toBe(1);
  });
});
