/**
 * The reference decks through the real conversion engine and the real lint, in the engine
 * WebView2 uses. This is a measurement more than a test: IMP-06 asks for 95% editability for
 * HTML written by the conventions, and these decks are the first HTML of that kind that was
 * designed rather than written to exercise the engine. What is asserted is only what must hold
 * whatever the numbers are; the numbers go to `test-results/templates/reference-report.json`,
 * from which `docs/reference-decks/scripts/build.mjs` writes the index page.
 */
import type { LintFinding } from '@slidr/agent-tools';
import { createConversionService } from '@slidr/html-import';
import { testHost } from '@slidr/html-import/testing';
import { createDeck, walkElements, type Deck, type Slide } from '@slidr/model';
import { builtInThemes } from '@slidr/templates/builtin';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { commands, page } from 'vitest/browser';
import { registerBuiltinFonts } from '../fonts';
import { createLintService } from '../lint/deckLint';
import { pictureAssets, pictureUrl } from './pictures';
import { referenceDecks, type ReferenceDeck } from './referenceDecks';

interface SlideReport {
  id: string;
  archetype: string;
  title: string;
  /** Share of the content items that became regular elements. */
  editability: number;
  /** Elements by type, nested ones included. */
  elements: Record<string, number>;
  /** What the slide's own background is filled with, when it has one. */
  background?: string;
  notes: string[];
  lint: Pick<LintFinding, 'rule' | 'severity' | 'message'>[];
  ms: number;
}

interface DeckReport {
  id: string;
  template: string;
  dir: string;
  slides: SlideReport[];
}

// `VITE_REFERENCE_DECK=zerem` measures one deck, while it is being written.
const only = (import.meta.env.VITE_REFERENCE_DECK as string | undefined)?.split(',');
const decks = referenceDecks().filter((deck) => !only || only.includes(deck.id));
const report: DeckReport[] = [];

function countTypes(slide: Slide): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const element of walkElements(slide.elements)) {
    counts[element.type] = (counts[element.type] ?? 0) + 1;
  }
  return counts;
}

beforeAll(async () => {
  await page.viewport(1920, 1080);
  registerBuiltinFonts();
});

afterAll(async () => {
  // In a hook the path is taken from the root of the repository.
  await commands.writeFile(
    `apps/desktop/test-results/templates/reference-report${only ? `.${only.join('-')}` : ''}.json`,
    JSON.stringify({ decks: report }, null, 2),
  );
});

async function measure(reference: ReferenceDeck): Promise<DeckReport> {
  const host = { ...testHost(), resolveAsset: pictureUrl };
  const conversion = createConversionService(host);
  const lint = createLintService(pictureUrl);
  const theme = builtInThemes[reference.template];
  if (!theme) throw new Error(`no theme for "${reference.template}"`);
  const empty: Deck = {
    ...createDeck({ lang: reference.lang, dir: reference.dir, theme }),
    assets: pictureAssets,
  };

  const slides: SlideReport[] = [];
  for (const source of reference.slides) {
    const started = performance.now();
    const converted = await conversion.htmlToSlide(empty, { html: source.html });
    const ms = Math.round(performance.now() - started);
    const deck: Deck = { ...empty, slides: [converted.slide] };
    const findings = await lint.lint(deck, [converted.slide.id], 'all');
    expect(converted.slide.archetype, `${reference.id} ${source.id}`).toBe(source.archetype);
    slides.push({
      id: source.id,
      archetype: source.archetype,
      title: source.title,
      editability: converted.editability,
      elements: countTypes(converted.slide),
      ...(converted.slide.background ? { background: converted.slide.background.fill.kind } : {}),
      notes: converted.notes,
      lint: findings.map(({ rule, severity, message }) => ({ rule, severity, message })),
      ms,
    });
  }
  return { id: reference.id, template: reference.template, dir: reference.dir, slides };
}

describe('the reference decks, converted and linted', () => {
  test('there are decks to measure', () => {
    expect(decks.length).toBeGreaterThan(0);
  });

  for (const reference of decks) {
    test(`${reference.id}: every slide becomes a slide of the model`, { timeout: 240_000 }, async () => {
      const measured = await measure(reference);
      report.push(measured);
      expect(measured.slides).toHaveLength(reference.slides.length);
      for (const slide of measured.slides) {
        const total = Object.values(slide.elements).reduce((a, b) => a + b, 0);
        expect(total, `${reference.id} ${slide.id}`).toBeGreaterThan(0);
      }
    });
  }
});
