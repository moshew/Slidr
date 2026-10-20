import {
  findElementInDeck,
  findSlide,
  updateElement,
  withRowHeights,
  type CommandBus,
  type DispatchOptions,
  type ElementPatch,
  type TableElement,
  type TablePatch,
} from '@slidr/model';
import { tableEdges, tableLayout } from '@slidr/renderer';
// By file, not through the shell's index: these are plain functions, and the index loads the app.
import { stageElement } from '../shell/stageDom';
import { refitPatches } from '../stage/groups';
import { indexElements } from '../stage/space';

/*
 * Writing a table to the model, and keeping its rows as tall as they are drawn.
 *
 * The height of a row is a minimum, as in every table: a row whose text needs more is drawn
 * taller, and the table with it (`TableView`). The model has to say the same, or the frame, the
 * handles and the cell selection would sit on a table that is not there. So after a change that
 * can make text taller (typing, a font size, a narrower column) the rows are measured where the
 * Stage draws them and the heights are written back, in the undo step of that change: the same
 * idea as a text box that grows with its text (ADR-012). Rows only grow this way; making a row
 * shorter is the user's (drag its line).
 */

/** A row counts as taller than the model says from this much, in slide pixels. */
const SLACK = 0.75;

/**
 * The patch that makes the model's rows as tall as the rows are drawn, or undefined when no row is
 * drawn taller than the model says. `drawn` are the heights of the `<tr>`s, in slide pixels.
 */
export function fittedRows(table: TableElement, drawn: readonly number[]): TablePatch | undefined {
  const expected = tableLayout(table).rows;
  if (drawn.length !== expected.length) return undefined;
  if (!drawn.some((height, r) => height > (expected[r] as number) + SLACK)) return undefined;
  // A row of the model reaches the edge of the frame; the drawn one stops half a border short.
  const edges = tableEdges(table);
  const last = drawn.length - 1;
  const heights = drawn.map((height, r) => {
    const grown = height > (expected[r] as number) + SLACK ? height : (expected[r] as number);
    return grown + (r === 0 ? edges.top / 2 : 0) + (r === last ? edges.bottom / 2 : 0);
  });
  return withRowHeights(table, heights);
}

/**
 * Changes a table as one command, or as one batch when it sits in groups: a table that changes
 * size takes the frames of the groups around it along (ADR-016).
 */
export function writeTable(
  bus: CommandBus,
  slideId: string,
  elementId: string,
  patch: TablePatch,
  options: DispatchOptions,
): void {
  // An operation that had nothing to change gives an empty patch.
  if (Object.keys(patch).length === 0) return;
  const slide = findSlide(bus.deck, slideId);
  const path = (slide && indexElements(slide.elements).get(elementId)?.path) || [];
  // The refit also places the table anew inside the group whose frame it moved.
  const patches = refitPatches(patch.frame ? path : [], new Map([[elementId, patch]]));
  bus.batch(
    [...patches].map(([id, p]) => updateElement(slideId, id, p as ElementPatch)),
    options,
  );
}

/**
 * Measures the rows of a table on the Stage once it has been drawn, and writes the heights of the
 * rows that grew, in the transaction `txId`. Measured again when a font the change asked for has
 * loaded. A table that is not on the Stage is left alone.
 */
export function fitRows(bus: CommandBus, elementId: string, txId: string): void {
  const measure = () => {
    const found = findElementInDeck(bus.deck, elementId);
    const dom = stageElement(elementId);
    if (!found || found.element.type !== 'table' || !dom) return;
    // With reduced motion the UI makes every change of a style a transition of a millisecond
    // (`theme.css`), and while one runs the table is laid out as it was before the change.
    for (const motion of dom.getAnimations({ subtree: true })) {
      if (motion instanceof CSSTransition) motion.finish();
    }
    // `offsetHeight` is the laid-out height in slide pixels, whatever the zoom and the rotation.
    const rows = dom.querySelectorAll<HTMLElement>(':scope > table > tbody > tr');
    const patch = fittedRows(
      found.element,
      Array.from(rows, (row) => row.offsetHeight),
    );
    if (patch) writeTable(bus, found.slide.id, elementId, patch, { txId });
  };
  requestAnimationFrame(() => {
    measure();
    if (document.fonts.status === 'loading') void document.fonts.ready.then(measure);
  });
}
