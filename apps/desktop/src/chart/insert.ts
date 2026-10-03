import {
  createElement,
  findSlide,
  type ChartElement,
  type ChartType,
  type Deck,
  type Frame,
} from '@slidr/model';
import { i18n } from '../i18n';
// By file, not through the shell's index: a plain function, and the index loads the app.
import { focusStage } from '../shell/stageDom';
import type { ChartData, SeriesName } from './data';
import type { ChartEditor } from './target';

/* Inserting a chart (row A "Chart", CHT-01). */

/** The slide's safe margin (SPEC 9.1): a new chart stays inside it. */
const MARGIN = 96;
/** A new chart is this large, as long as it fits the slide. */
const WIDTH = 1100;
const HEIGHT = 620;
/** A new chart that would sit exactly on another element is put this far down and across. */
const CASCADE = 32;

/** Where a new chart goes: in the middle of the slide. */
export function chartFrame(deck: Deck): Frame {
  const { size } = deck;
  const w = Math.min(WIDTH, size.w - 2 * MARGIN);
  const h = Math.min(HEIGHT, size.h - 2 * MARGIN);
  return { x: Math.round((size.w - w) / 2), y: Math.round((size.h - h) / 2), w, h };
}

/**
 * The language the labels of a chart are written in: the deck's, not the UI's. A chart made in a
 * Hebrew deck says "סדרה 1" also when the app is in English. The app has strings in two
 * languages; a deck in any other gets the English ones.
 */
const labelLanguage = (lang: string) => (lang.toLowerCase().startsWith('he') ? 'he' : 'en');

/** The name a series has until it is given one, in the language of the deck. */
export function seriesNames(lang: string): SeriesName {
  const lng = labelLanguage(lang);
  return (n) => i18n.t('chart:sample.series', { n, lng });
}

const numbered = (count: number) => Array.from({ length: count }, (_, i) => i + 1);

/** A few round numbers, so that a new chart looks like a chart. */
const SAMPLE: Record<'bars' | 'slices' | 'points' | 'spokes', number[][]> = {
  bars: [
    [42, 55, 48, 70],
    [28, 34, 45, 52],
  ],
  slices: [[40, 28, 20, 12]],
  points: [
    [12, 19, 15, 25, 22, 30],
    [8, 11, 17, 14, 21, 19],
  ],
  spokes: [
    [70, 55, 80, 60, 75],
    [50, 70, 60, 75, 55],
  ],
};

const sampleOf = (chartType: ChartType): number[][] => {
  if (chartType === 'pie' || chartType === 'donut') return SAMPLE.slices;
  if (chartType === 'scatter') return SAMPLE.points;
  return chartType === 'radar' ? SAMPLE.spokes : SAMPLE.bars;
};

/**
 * What a new chart of a type shows until its own data is typed or pasted: a little sample data
 * that suits the type, with labels in the language of the deck. The x values of a scatter chart
 * are numbers, which no language writes differently.
 */
export function sampleData(chartType: ChartType, lang: string): ChartData {
  const lng = labelLanguage(lang);
  const values = sampleOf(chartType);
  const rows = numbered(values[0]?.length ?? 0);
  const name = seriesNames(lang);
  return {
    categories:
      chartType === 'scatter'
        ? rows.map(String)
        : rows.map((n) => i18n.t('chart:sample.category', { n, lng })),
    series: values.map((series, i) => ({ name: name(i + 1), values: series })),
  };
}

/**
 * Adds a chart of a type to the current slide, in the middle of it, with sample data, and selects
 * it. Adding it is one undo step.
 */
export function insertChart(editor: ChartEditor, chartType: ChartType): ChartElement | undefined {
  const { bus, selection } = editor;
  const slide = findSlide(bus.deck, selection.getState().currentSlideId ?? '');
  if (!slide) return undefined;
  const frame = chartFrame(bus.deck);
  while (slide.elements.some((e) => e.frame.x === frame.x && e.frame.y === frame.y)) {
    frame.x += CASCADE;
    frame.y += CASCADE;
  }
  const chart = createElement.chart({
    frame,
    chartType,
    data: sampleData(chartType, bus.deck.meta.lang),
  });
  bus.dispatch(
    { type: 'element.add', slideId: slide.id, element: chart },
    { label: i18n.t('chart:history.insert') },
  );
  selection.getState().selectElements([chart.id]);
  // The keyboard goes to the Stage, so Enter, Delete and the arrows act on the new chart rather
  // than on the row A button. The gallery is still open when this runs: focus that leaves a
  // popover closes it, and then the popover does not take the focus back to its button.
  focusStage();
  return chart;
}
