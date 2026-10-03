import {
  createDeck,
  createElement,
  createSlide,
  richText,
  type Stroke,
  type TableCell,
  type TableElement,
} from '@slidr/model';
import { expect, test } from 'vitest';
import { renderSlideOffscreen } from './offscreen';
import { tableStyles } from './tableStyle';

// The geometry of a table in a real layout engine (WG6, ADR-033): the outer borders inside the
// frame, every inner line where the model says, and rows that grow with their text.

const ink = (width: number): Stroke => ({ color: { value: '#000000' }, width });
const cell = (text: string, extra: Partial<TableCell> = {}): TableCell => ({
  content: richText(text),
  ...extra,
});

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface Drawn {
  /** The table, relative to its frame. */
  table: Box;
  /** The cells by "row,col", relative to the frame, from border middle to border middle. */
  cells: Record<string, Box>;
  rows: number[];
}

async function draw(table: TableElement, lang = 'en'): Promise<Drawn> {
  const slide = createSlide({ elements: [table] });
  const deck = createDeck({ lang, slides: [slide] });
  const offscreen = await renderSlideOffscreen({ deck, slide });
  try {
    const host = offscreen.root.querySelector<HTMLElement>(`[data-element-id="${table.id}"]`)!;
    const frame = host.getBoundingClientRect();
    const rel = (r: DOMRect): Box => ({
      left: r.left - frame.left,
      top: r.top - frame.top,
      right: r.right - frame.left,
      bottom: r.bottom - frame.top,
    });
    const cells: Record<string, Box> = {};
    for (const td of host.querySelectorAll<HTMLElement>('td')) {
      cells[`${td.dataset.row},${td.dataset.col}`] = rel(td.getBoundingClientRect());
    }
    return {
      table: rel(host.querySelector('table')!.getBoundingClientRect()),
      cells,
      rows: Array.from(host.querySelectorAll('tr'), (tr) => tr.getBoundingClientRect().height),
    };
  } finally {
    offscreen.dispose();
  }
}

const grid = (rows: number, cols: number, make: (r: number, c: number) => TableCell) =>
  Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => make(r, c)));

/** A table whose every edge has a border of its own width, to tell the edges apart. */
function outlined(dir: 'ltr' | 'rtl', frame = { x: 100, y: 80, w: 900, h: 400 }): TableElement {
  const rows = 4;
  const cols = 3;
  return createElement.table({
    id: 'e_table',
    frame,
    rows: [100, 100, 100, 100],
    cols: [200, 300, 400],
    dir,
    style: { headerRow: false, bandedRows: false, firstColumn: false },
    cells: grid(rows, cols, (r, c) =>
      cell('x', {
        borders: {
          ...(r === 0 ? { top: ink(6) } : {}),
          bottom: r === rows - 1 ? ink(4) : ink(2),
          // Screen sides: the left edge of the table is column 0 only when it reads left to right.
          ...((dir === 'ltr' ? c === 0 : c === cols - 1) ? { left: ink(8) } : {}),
          ...((dir === 'ltr' ? c === cols - 1 : c === 0) ? { right: ink(2) } : {}),
        },
      }),
    ),
  });
}

test('the outer borders are inside the frame, and the inner lines on the grid of the model', async () => {
  const { table, cells } = await draw(outlined('ltr'));
  // The table's box is the frame: nothing is drawn past it.
  expect(table.left).toBeCloseTo(0, 1);
  expect(table.top).toBeCloseTo(0, 1);
  expect(table.right).toBeCloseTo(900, 1);
  expect(table.bottom).toBeCloseTo(400, 1);
  // Inner lines: at the sums of the rows and the columns.
  expect(cells['0,0']!.bottom).toBeCloseTo(100, 1);
  expect(cells['1,0']!.bottom).toBeCloseTo(200, 1);
  expect(cells['2,0']!.bottom).toBeCloseTo(300, 1);
  expect(cells['0,0']!.right).toBeCloseTo(200, 1);
  expect(cells['0,1']!.right).toBeCloseTo(500, 1);
  // The outer cells start half a border in: the border itself reaches the edge of the frame.
  expect(cells['0,0']!.top).toBeCloseTo(3, 1);
  expect(cells['0,0']!.left).toBeCloseTo(4, 1);
  expect(cells['3,2']!.bottom).toBeCloseTo(398, 1);
  expect(cells['3,2']!.right).toBeCloseTo(899, 1);
});

test('a right-to-left table puts its first column on the right, on the same grid', async () => {
  const { table, cells } = await draw(outlined('rtl'));
  expect(table.left).toBeCloseTo(0, 1);
  expect(table.right).toBeCloseTo(900, 1);
  // Column 0 is 200 wide and on the right; the line after it is 200 from the right edge.
  expect(cells['0,0']!.right).toBeCloseTo(899, 1);
  expect(cells['0,0']!.left).toBeCloseTo(700, 1);
  expect(cells['0,1']!.left).toBeCloseTo(400, 1);
  expect(cells['0,2']!.left).toBeCloseTo(4, 1);
});

test('rows and columns scale with a frame that is not their sum', async () => {
  const { table, cells } = await draw(outlined('ltr', { x: 100, y: 80, w: 450, h: 800 }));
  expect(table.right).toBeCloseTo(450, 1);
  expect(table.bottom).toBeCloseTo(800, 1);
  expect(cells['0,0']!.right).toBeCloseTo(100, 1);
  expect(cells['0,1']!.right).toBeCloseTo(250, 1);
  expect(cells['0,0']!.bottom).toBeCloseTo(200, 1);
  expect(cells['2,0']!.bottom).toBeCloseTo(600, 1);
});

test('the rule under the last row of the default style stays inside the frame', async () => {
  const table = createElement.table({
    id: 'e_table',
    frame: { x: 60, y: 60, w: 900, h: 420 },
    rows: [84, 84, 84, 84, 84],
    cols: [300, 300, 300],
    dir: 'rtl',
    style: { headerRow: true, bandedRows: true, firstColumn: true },
    cells: grid(5, 3, (r, c) => cell(`${r}${c}`)),
  });
  const drawn = await draw(table, 'he');
  expect(drawn.table.bottom).toBeCloseTo(420, 1);
  expect(drawn.cells['4,0']!.bottom).toBeCloseTo(419.5, 1);
  expect(drawn.cells['3,0']!.bottom).toBeCloseTo(336, 1);
});

test('a row is at least as tall as its text, and the table grows with it', async () => {
  const table = createElement.table({
    id: 'e_table',
    frame: { x: 60, y: 60, w: 600, h: 160 },
    rows: [80, 80],
    cols: [300, 300],
    dir: 'ltr',
    style: { headerRow: false, bandedRows: false, firstColumn: false },
    cells: [
      [cell('one\ntwo\nthree', { borders: {} }), cell('', { borders: {} })],
      [cell('a', { borders: {} }), cell('b', { borders: {} })],
    ],
  });
  const { rows, table: box } = await draw(table);
  // Three lines of body text (30px at 1.45) and the cell's padding.
  expect(rows[0]).toBeGreaterThan(150);
  expect(rows[1]).toBeCloseTo(80, 1);
  expect(box.bottom).toBeCloseTo(rows[0]! + 80, 1);
});

test('a merged cell spans the grid lines of the cells it covers', async () => {
  const table = createElement.table({
    id: 'e_table',
    frame: { x: 0, y: 0, w: 600, h: 300 },
    rows: [100, 100, 100],
    cols: [100, 200, 300],
    dir: 'ltr',
    style: { headerRow: false, bandedRows: false, firstColumn: false },
    cells: [
      [cell('a', { borders: {} }), cell('b', { borders: {} }), cell('c', { borders: {} })],
      [
        cell('wide', { borders: {}, colSpan: 2, rowSpan: 2 }),
        cell('', { merged: true }),
        cell('d', { borders: {} }),
      ],
      [cell('', { merged: true }), cell('', { merged: true }), cell('e', { borders: {} })],
    ],
  });
  const { cells } = await draw(table);
  expect(cells['1,0']).toMatchObject({ left: 0, top: 100, right: 300, bottom: 300 });
  expect(cells['1,1']).toBeUndefined();
  expect(cells['2,2']).toMatchObject({ left: 300, top: 200, right: 600, bottom: 300 });
});

test('every table style keeps its lines inside the frame', async () => {
  for (const style of tableStyles) {
    const table = createElement.table({
      id: 'e_table',
      frame: { x: 40, y: 40, w: 800, h: 300 },
      rows: [100, 100, 100],
      cols: [400, 400],
      dir: 'ltr',
      style: { headerRow: true, bandedRows: true, firstColumn: true, styleId: style.id },
      cells: grid(3, 2, (r, c) => cell(`${r}${c}`)),
    });
    const drawn = await draw(table);
    expect(drawn.table, style.id).toMatchObject({ left: 0, top: 0 });
    expect(drawn.table.right, style.id).toBeCloseTo(800, 1);
    expect(drawn.table.bottom, style.id).toBeCloseTo(300, 1);
    expect(drawn.cells['0,0']!.bottom, style.id).toBeCloseTo(100, 1);
    expect(drawn.cells['0,0']!.right, style.id).toBeCloseTo(400, 1);
  }
});
