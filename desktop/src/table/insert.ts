import { findSlide, newTable, type Deck, type Frame, type TableElement } from '@slidr/model';
import { i18n } from '../i18n';
import type { Editor } from '../shell';
import { enterTable } from './session';

/* Inserting a table (row A "Table", TBL-01). */

/** The slide's safe margin (SPEC 9.1): a new table stays inside it. */
const MARGIN = 96;
/** The padding of a cell above and below its text (`TableView`). */
const CELL_PADDING = 24;
/** A column of a new table is about this wide, as long as the table fits the slide. */
const COLUMN = 240;
/** A new table is not narrower than this part of the slide's width. */
const MIN_WIDTH = 0.5;
/** A new table that would sit exactly on another element is put this far down and across. */
const CASCADE = 32;

/** Where a new table of this size goes: in the middle of the slide, rows one line of text tall. */
export function tableFrame(deck: Deck, rows: number, cols: number): Frame {
  const { size, theme } = deck;
  const body = theme.textStyles.body;
  const row = Math.ceil(body.size * body.lineHeight) + CELL_PADDING + 4;
  const w = Math.min(size.w - 2 * MARGIN, Math.max(size.w * MIN_WIDTH, cols * COLUMN));
  const h = Math.min(size.h - 2 * MARGIN, rows * row);
  return { x: Math.round((size.w - w) / 2), y: Math.round((size.h - h) / 2), w, h };
}

/**
 * Adds a table to the current slide and goes into its first cell, ready to type: Tab then moves
 * on, cell by cell. The table reads in the direction of the deck. Adding it is one undo step.
 */
export function insertTable(editor: Editor, rows: number, cols: number): TableElement | undefined {
  const { bus, selection } = editor;
  const slide = findSlide(bus.deck, selection.getState().currentSlideId ?? '');
  if (!slide) return undefined;
  const frame = tableFrame(bus.deck, rows, cols);
  while (slide.elements.some((e) => e.frame.x === frame.x && e.frame.y === frame.y)) {
    frame.x += CASCADE;
    frame.y += CASCADE;
  }
  const table = newTable({ rows, cols, frame, dir: bus.deck.meta.dir });
  bus.dispatch(
    { type: 'element.add', slideId: slide.id, element: table },
    { label: i18n.t('table:history.insert') },
  );
  enterTable(selection, table.id, { row: 0, col: 0 }, 'all');
  return table;
}
