/**
 * A chart and a table on every built-in template (WG7-T10). A template styles neither: a chart
 * takes its colours from the theme's chart palette and its text from the theme's text colours,
 * and a table fills its header row with the primary colour. So each template is looked at with
 * both: the chart slide of its own sample as columns, as lines and as a ring, and its table
 * slide, one row a template, in `test-results/design/templates/chart-table.<lang>.png`; what the
 * design check says of them goes to `chart-table.findings.json` beside it.
 */
import type { ChartType, Deck } from '@slidr/model';
import { builtInSamples, builtInTemplates, sampleDeck } from '@slidr/templates/builtin';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { commands } from 'vitest/browser';
import { brief, errors, LANGUAGES, lint, prepare, sheet, type SheetCell } from './acceptance';

const KINDS: ChartType[] = ['column', 'line', 'donut'];

/** Every finding of the run, warnings and notes too, by `<template>.<lang>`. */
const seen: Record<string, string[]> = {};

beforeAll(prepare);

afterAll(async () => {
  // In a hook the path is taken from the root of the repository.
  await commands.writeFile(
    'apps/desktop/test-results/design/templates/chart-table.findings.json',
    JSON.stringify(seen, null, 2),
  );
});

/** The sample deck with its chart drawn as another kind of chart. */
function withChart(deck: Deck, slideId: string, chartType: ChartType): Deck {
  return {
    ...deck,
    slides: deck.slides.map((slide) =>
      slide.id === slideId
        ? {
            ...slide,
            elements: slide.elements.map((element) =>
              element.type === 'chart' ? { ...element, chartType } : element,
            ),
          }
        : slide,
    ),
  };
}

test.each(LANGUAGES)(
  'a chart and a table read on every built-in template, in $lang',
  { timeout: 600_000 },
  async ({ lang, dir }) => {
    const cells: SheetCell[] = [];
    const found: string[] = [];
    for (const template of builtInTemplates()) {
      const id = template.theme.id;
      const sample = sampleDeck(template, builtInSamples[id]![lang], { lang, dir });
      const slideOf = (archetype: string) =>
        sample.slides.find(
          (slide) =>
            template.layouts.find((layout) => layout.id === slide.layoutId)?.archetype ===
            archetype,
        )!;
      const chart = slideOf('chart');
      const decks = [
        ...KINDS.map((kind) => ({ deck: withChart(sample, chart.id, kind), slideId: chart.id })),
        { deck: sample, slideId: slideOf('table').id },
      ];
      const lines: string[] = [];
      for (const [i, { deck, slideId }] of decks.entries()) {
        const findings = await lint.lint(deck, [slideId], 'all');
        const what = KINDS[i] ?? 'table';
        lines.push(...findings.map((f) => `${what} (${f.severity}) ${brief(f, deck)}`));
        found.push(...errors(findings).map((f) => `${id} ${what}: ${brief(f, deck)}`));
        cells.push({ deck, slide: deck.slides.find((slide) => slide.id === slideId)! });
      }
      seen[`${id}.${lang}`] = lines;
    }
    await sheet(cells, `chart-table.${lang}`);
    expect(found).toEqual([]);
  },
);
