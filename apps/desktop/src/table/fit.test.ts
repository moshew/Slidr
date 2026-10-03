import {
  CommandBus,
  createDeck,
  createElement,
  createSlide,
  newTable,
  TableElement,
  type Stroke,
} from '@slidr/model';
import { tableLayout } from '@slidr/renderer';
import { describe, expect, it } from 'vitest';
import { fittedRows, writeTable } from './fit';

const ink = (width: number): Stroke => ({ color: { value: '#000000' }, width });

function table(): TableElement {
  return newTable({
    id: 'e_table',
    rows: 3,
    cols: 2,
    frame: { x: 100, y: 100, w: 600, h: 240 },
    dir: 'ltr',
    style: { headerRow: false },
  });
}

/** The rows of a table as the Stage would measure them: whole pixels (`offsetHeight`). */
const drawn = (t: TableElement) => tableLayout(t).rows.map(Math.round);

describe('fittedRows', () => {
  it('leaves a table alone whose rows are drawn as the model says', () => {
    const t = table();
    expect(fittedRows(t, drawn(t))).toBeUndefined();
    // Half a pixel of rounding is not growth.
    expect(fittedRows(t, [80, 80.5, 79.6])).toBeUndefined();
    // Rows of another table: nothing to go by.
    expect(fittedRows(t, [80, 80])).toBeUndefined();
  });

  it('writes the height of a row that is drawn taller, and the frame with it', () => {
    const t = table();
    const patch = fittedRows(t, [80, 131, 80]);
    const next = TableElement.parse({ ...t, ...patch });
    expect(next.rows[1]).toBeCloseTo(131, 1);
    expect(next.rows[0]).toBeCloseTo(80, 1);
    expect(next.frame).toMatchObject({ x: 100, y: 100, w: 600 });
    expect(next.frame.h).toBeCloseTo(291, 1);
    // What is drawn from the new model is what was measured: fitting again changes nothing.
    expect(fittedRows(next, [80, 131, 80])).toBeUndefined();
  });

  it('never makes a row shorter', () => {
    const t = table();
    const patch = fittedRows(t, [60, 131, 80]);
    const next = TableElement.parse({ ...t, ...patch });
    expect(next.rows[0]).toBeCloseTo(80, 1);
  });

  it('counts the halves of the outer borders that the outer rows give up', () => {
    const base = table();
    const t: TableElement = {
      ...base,
      cells: base.cells.map((row, r) =>
        row.map((cell) => ({
          ...cell,
          borders: { ...(r === 0 ? { top: ink(6) } : {}), ...(r === 2 ? { bottom: ink(4) } : {}) },
        })),
      ),
    };
    // The first row is drawn 3 short of the model's 80, the last one 2 short.
    expect(tableLayout(t).rows).toEqual([77, 80, 78]);
    expect(fittedRows(t, [77, 80, 78])).toBeUndefined();
    const next = TableElement.parse({ ...t, ...fittedRows(t, [100, 80, 78]) });
    expect(next.rows[0]).toBeCloseTo(103, 1);
    expect(next.frame.h).toBeCloseTo(263, 1);
    expect(tableLayout(next).rows[0]).toBeCloseTo(100, 1);
  });

  it('fits a table whose frame was stretched without its rows', () => {
    const t = { ...table(), frame: { x: 100, y: 100, w: 600, h: 480 } };
    // The rule under the last row is the table's bottom edge: that row is drawn half of it short.
    expect(tableLayout(t).rows).toEqual([160, 160, 159.5]);
    const next = TableElement.parse({ ...t, ...fittedRows(t, [160, 200, 160]) });
    expect(next.rows).toEqual([160, 200, 160]);
    expect(next.frame.h).toBe(520);
  });
});

describe('writeTable', () => {
  it('writes a patch as one undo step, and an empty one as none', () => {
    const t = table();
    const slide = createSlide({ id: 's1', elements: [t] });
    const bus = new CommandBus(createDeck({ slides: [slide] }));
    writeTable(bus, 's1', t.id, {}, { label: 'Nothing' });
    expect(bus.undoStack).toHaveLength(0);
    writeTable(bus, 's1', t.id, fittedRows(t, [80, 131, 80])!, { label: 'Fit' });
    expect(bus.undoStack).toHaveLength(1);
    bus.undo();
    expect(bus.deck.slides[0]!.elements[0]).toEqual(t);
  });

  it('keeps the group around a table fitted when the table grows', () => {
    const t = { ...table(), frame: { x: 0, y: 0, w: 600, h: 240 } };
    const group = createElement.group({
      id: 'e_group',
      frame: { x: 100, y: 100, w: 600, h: 240 },
      children: [t],
    });
    const bus = new CommandBus(
      createDeck({ slides: [createSlide({ id: 's1', elements: [group] })] }),
    );
    writeTable(bus, 's1', t.id, fittedRows(t, [80, 131, 80])!, { txId: 'tx_fit' });
    const after = bus.deck.slides[0]!.elements[0]!;
    expect(after.frame.h).toBeCloseTo(291, 1);
    expect(bus.undoStack).toHaveLength(1);
  });
});
