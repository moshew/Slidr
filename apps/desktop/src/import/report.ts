/**
 * The import report (SPEC 13.3 step 7, IMP-11), computed from what the app holds: the deck, the
 * record the app kept of every captured slide, the requests the isolated page was refused, and
 * the turns of the chat. Nothing in it is taken from the agent's own account.
 */
import type { Deck } from '@slidr/model';
import type { ChatEntry } from '../agent/transcript';
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
  /** What the agent's turns took, as the harness reported them. */
  durationMs: number;
  /** As the harness reported it; null when it could not say for some turn. */
  costUsd: number | null;
  turns: number;
  blocked: string[];
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

export function buildReport(
  state: ImportState,
  deck: Deck,
  entries: readonly ChatEntry[],
): ImportReport {
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
      rebuilt: captured.size > 0 && !slide.elements.some((element) => captured.has(element.id)),
    });
  });
  const measured = rows.filter((row) => !row.rebuilt);
  let durationMs = 0;
  let costUsd: number | null = 0;
  let turns = 0;
  for (const entry of entries) {
    if (entry.type !== 'assistant' || entry.outcome === undefined) continue;
    turns++;
    durationMs += entry.durationMs ?? 0;
    costUsd = costUsd === null || entry.costUsd == null ? null : costUsd + entry.costUsd;
  }
  return {
    rows,
    measured: measured.length,
    faithful: measured.filter((row) => row.faithful).length,
    approximate: measured.filter((row) => !row.exact).length,
    medianEditability: median(measured.map((row) => row.editability)),
    medianTextEditability: median(measured.map((row) => row.textEditability)),
    wholeHtml: measured.filter((row) => row.wholeSlideHtml).length,
    durationMs,
    costUsd: turns === 0 ? null : costUsd,
    turns,
    blocked: state.blocked,
  };
}
