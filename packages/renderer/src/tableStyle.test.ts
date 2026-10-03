import {
  createElement,
  richText,
  type Stroke,
  type TableCell,
  type TableElement,
} from '@slidr/model';
import { createBaseTheme, type Paragraph } from '@slidr/model';
import { describe, expect, it } from 'vitest';
import { paragraphStyle } from './text';
import {
  cellLook,
  cellTextDefaults,
  tableEdges,
  tableLayout,
  tableStyle,
  tableStyles,
} from './tableStyle';

const ink = (width: number): Stroke => ({ color: { value: '#000000' }, width });
const NO_STYLE = { headerRow: false, bandedRows: false, firstColumn: false };

function table(
  init: Partial<TableElement> = {},
  make: (r: number, c: number) => Partial<TableCell> = () => ({}),
): TableElement {
  const rows = init.rows ?? [100, 100, 100];
  const cols = init.cols ?? [200, 200];
  return createElement.table({
    frame: { x: 0, y: 0, w: 400, h: 300 },
    rows,
    cols,
    dir: 'ltr',
    cells: rows.map((_, r) =>
      cols.map((_, c) => ({ content: richText(`${r}${c}`), ...make(r, c) })),
    ),
    ...init,
  });
}

const sum = (values: readonly number[]) => values.reduce((a, b) => a + b, 0);

describe('table styles', () => {
  it('has unique ids, and falls back to the first style', () => {
    const ids = tableStyles.map((style) => style.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(tableStyle(undefined)).toBe(tableStyles[0]);
    expect(tableStyle('nobody-knows')).toBe(tableStyles[0]);
    expect(tableStyle('grid').id).toBe('grid');
  });

  it('gives the header row, the banded rows and the first column their look', () => {
    const t = table({ style: { headerRow: true, bandedRows: true, firstColumn: true } });
    expect(cellLook(t, 0, 0).fill).toEqual({ kind: 'solid', color: { token: 'primary' } });
    expect(cellLook(t, 0, 0).text).toEqual({ color: 'var(--color-bg)', weight: 600 });
    // Bands count from the first body row: the second one is banded.
    expect(cellLook(t, 1, 1).fill).toBeUndefined();
    expect(cellLook(t, 2, 1).fill).toEqual({ kind: 'solid', color: { token: 'surface' } });
    expect(cellLook(t, 1, 0).text).toEqual({ weight: 600 });
    expect(cellLook(t, 1, 1).text).toEqual({});
    expect(cellTextDefaults(t, 0, 1)).toEqual({
      styleRef: 'body',
      wrap: true,
      alignTo: 'ltr',
      color: 'var(--color-bg)',
      weight: 600,
    });
  });

  it('switches each part off with the model', () => {
    const t = table({ style: NO_STYLE });
    expect(cellLook(t, 0, 0)).toMatchObject({ fill: undefined, text: {} });
    expect(cellLook(t, 2, 0).fill).toBeUndefined();
    // Without a header the bands start at the second row.
    const banded = table({ style: { ...NO_STYLE, bandedRows: true } });
    expect(cellLook(banded, 0, 0).fill).toBeUndefined();
    expect(cellLook(banded, 1, 0).fill).toBeDefined();
  });

  it('lets the fill and the borders of a cell win, with no side falling back to the style', () => {
    const own = { kind: 'solid', color: { value: '#ff0000' } } as const;
    const t = table({ style: { ...NO_STYLE, headerRow: true } }, (r, c) =>
      r === 0 && c === 0 ? { fill: own } : r === 1 && c === 0 ? { borders: { top: ink(3) } } : {},
    );
    // A header cell with a fill of its own is not on the header fill: plain text.
    expect(cellLook(t, 0, 0)).toMatchObject({ fill: own, text: {} });
    expect(cellLook(t, 1, 0).borders).toEqual({ top: ink(3) });
    expect(cellLook(t, 1, 1).borders.bottom).toBeDefined();
  });

  it('draws the lines of a style by where the cell is, on screen sides', () => {
    const boxed = { ...NO_STYLE, headerRow: true, styleId: 'boxed' };
    const ltr = table({ style: boxed });
    const outline = tableStyle('boxed').lines.outline;
    expect(cellLook(ltr, 0, 0).borders).toMatchObject({ top: outline, left: outline });
    expect(cellLook(ltr, 0, 1).borders.right).toEqual(outline);
    expect(cellLook(ltr, 2, 0).borders.bottom).toEqual(outline);
    expect(cellLook(ltr, 1, 0).borders.top).toBeUndefined();
    // In a right-to-left table the first column is on the right.
    const rtl = table({ style: boxed, dir: 'rtl' });
    expect(cellLook(rtl, 0, 0).borders.right).toEqual(outline);
    expect(cellLook(rtl, 0, 0).borders.left).toBeUndefined();
    expect(cellLook(rtl, 0, 1).borders.left).toEqual(outline);
  });

  it('takes a merged cell by the whole area it covers', () => {
    const t = table({ style: { ...NO_STYLE, styleId: 'boxed' } }, (r, c) =>
      r === 1 && c === 0 ? { rowSpan: 2, colSpan: 2 } : r >= 1 ? { merged: true } : {},
    );
    const outline = tableStyle('boxed').lines.outline;
    expect(cellLook(t, 1, 0).borders).toMatchObject({
      left: outline,
      right: outline,
      bottom: outline,
    });
  });
});

describe('text in a cell', () => {
  const theme = createBaseTheme();
  const paragraph = (extra: Partial<Paragraph>): Paragraph => ({
    dir: 'auto',
    align: 'start',
    runs: [{ text: 'Q1' }],
    ...extra,
  });
  const align = (p: Paragraph, alignTo?: 'rtl' | 'ltr') =>
    paragraphStyle(p, theme, { styleRef: 'body', wrap: true, alignTo }).textAlign;

  it('aligns a paragraph of no direction of its own by the direction of the table', () => {
    // "Q1" in a Hebrew table reads left to right, and sits where its column starts: on the right.
    expect(align(paragraph({}), 'rtl')).toBe('right');
    expect(align(paragraph({ align: 'end' }), 'rtl')).toBe('left');
    expect(align(paragraph({}), 'ltr')).toBe('left');
    expect(align(paragraph({ align: 'end' }), 'ltr')).toBe('right');
    expect(align(paragraph({ align: 'center' }), 'rtl')).toBe('center');
    expect(align(paragraph({ align: 'justify' }), 'rtl')).toBe('justify');
  });

  it('leaves a paragraph with a direction of its own, and text outside a table, as they are', () => {
    expect(align(paragraph({ dir: 'ltr' }), 'rtl')).toBe('start');
    expect(align(paragraph({ dir: 'rtl', align: 'end' }), 'ltr')).toBe('end');
    expect(align(paragraph({}))).toBe('start');
    expect(align(paragraph({ align: 'end' }))).toBe('end');
  });

  it('is told the direction of its table', () => {
    const rtl = table({ dir: 'rtl', style: NO_STYLE });
    expect(cellTextDefaults(rtl, 1, 0)).toEqual({ styleRef: 'body', wrap: true, alignTo: 'rtl' });
  });
});

describe('table layout', () => {
  it('finds the widest border on each edge of the table', () => {
    const t = table({ style: NO_STYLE }, (r, c) => ({
      borders: {
        ...(r === 0 ? { top: ink(c === 0 ? 6 : 2) } : {}),
        ...(r === 2 ? { bottom: ink(4) } : {}),
        ...(c === 0 ? { left: ink(r === 1 ? 8 : 0) } : {}),
        // An inner line is not an edge of the table.
        ...(c === 0 ? { right: ink(20) } : {}),
      },
    }));
    expect(tableEdges(t)).toEqual({ top: 6, right: 0, bottom: 4, left: 8 });
  });

  it('keeps the outer borders inside the frame: the outer rows and columns give up half', () => {
    const t = table({ style: NO_STYLE }, (r, c) => ({
      borders: {
        ...(r === 0 ? { top: ink(6) } : {}),
        ...(r === 2 ? { bottom: ink(4) } : {}),
        ...(c === 0 ? { left: ink(8) } : {}),
        ...(c === 1 ? { right: ink(2) } : {}),
      },
    }));
    const { rows, cols } = tableLayout(t);
    expect(rows).toEqual([97, 100, 98]);
    expect(cols).toEqual([196, 199]);
    // The table's box holds the outer halves too: together they are the frame.
    expect(sum(rows) + 3 + 2).toBe(300);
    expect(sum(cols) + 4 + 1).toBe(400);
    // Right to left, column 0 is on the right: these borders are now inner lines, and take nothing.
    expect(tableLayout({ ...t, dir: 'rtl' }).cols).toEqual([200, 200]);
    const rtl = table({ style: NO_STYLE, dir: 'rtl' }, (_, c) => ({
      borders: { ...(c === 1 ? { left: ink(8) } : {}), ...(c === 0 ? { right: ink(2) } : {}) },
    }));
    expect(tableLayout(rtl).cols).toEqual([199, 196]);
  });

  it('scales the sizes of the model to the frame', () => {
    const t = table({ frame: { x: 0, y: 0, w: 800, h: 150 }, style: NO_STYLE }, () => ({
      borders: {},
    }));
    expect(tableLayout(t)).toEqual({ rows: [50, 50, 50], cols: [400, 400] });
  });
});
