/**
 * The import report (SPEC 13.3 step 7, IMP-11), computed from what the app holds: the deck, the
 * record the app kept of every captured slide, the requests the isolated page was refused, and
 * the turns of the chat. Nothing in it is taken from the agent's own account.
 */
import type { Deck, Element } from '@slidr/model';
import type { ImportState, SlideRecord } from './session';

export interface ReportRow extends SlideRecord {
  slideId: string;
  /** The slide's place in the deck, from 1. */
  number: number;
  name?: string;
  /**
   * Nothing the capture put on the slide is on it any more: it was redesigned since, by the
   * agent or by hand, and the measurements are of what it replaced.
   */
  rebuilt: boolean;
}

export interface ImportReport {
  /** The imported slides that are still in the deck, in deck order. */
  rows: ReportRow[];
  /** Slides that still hold what was captured; the figures below are about these. */
  measured: number;
  faithful: number;
  /** Slides that were compared through a scale, and so only approximately. */
  approximate: number;
  /** Median share of the content that became regular elements; null without slides. */
  medianEditability: number | null;
  medianTextEditability: number | null;
  /** Slides that are one `html` element. */
  wholeHtml: number;
  blocked: string[];
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

/**
 * Whether any of the elements, or anything inside a group among them, is one of `ids`. A
 * captured element that the user grouped is still on the slide, a level down.
 */
function holdsAny(elements: readonly Element[], ids: ReadonlySet<string>): boolean {
  return elements.some(
    (element) =>
      ids.has(element.id) || (element.type === 'group' && holdsAny(element.children, ids)),
  );
}

export function buildReport(state: ImportState, deck: Deck): ImportReport {
  const rows: ReportRow[] = [];
  deck.slides.forEach((slide, index) => {
    const record = state.records[slide.id];
    if (!record) return;
    const captured = new Set(record.elementIds);
    rows.push({
      ...record,
      slideId: slide.id,
      number: index + 1,
      ...(slide.name ? { name: slide.name } : {}),
      rebuilt: captured.size > 0 && !holdsAny(slide.elements, captured),
    });
  });
  const measured = rows.filter((row) => !row.rebuilt);
  return {
    rows,
    measured: measured.length,
    faithful: measured.filter((row) => row.faithful).length,
    approximate: measured.filter((row) => !row.exact).length,
    medianEditability: median(measured.map((row) => row.editability)),
    medianTextEditability: median(measured.map((row) => row.textEditability)),
    wholeHtml: measured.filter((row) => row.wholeSlideHtml).length,
    blocked: state.blocked,
  };
}
