import type { Frame, Stroke, TableElement } from '@slidr/model';
import { CELL_PADDING, cellLook, cellTextDefaults } from '@slidr/renderer';
import { emu } from '../units';
import { el } from '../xml';
import type { ExportContext } from './context';
import { fillXml, solidFillXml } from './drawing';
import type { PartWriter } from './elements';
import { paragraphsXml } from './text';

/*
 * A table as `a:tbl`. Each cell says its own fill, borders and text: what the table style of
 * the deck gives it is looked up as the renderer looks it up (`cellLook`), so the table does not
 * depend on PowerPoint's styles. Its style is "No Style, No Grid".
 */

const NO_STYLE = '{2D5ABB26-0587-4C30-8999-92F81FD0307C}';

function borderXml(tag: string, stroke: Stroke | undefined, alpha: number): string {
  if (!stroke || stroke.width <= 0) return el(tag, { w: 0 }, el('a:noFill'));
  return el(
    tag,
    { w: emu(stroke.width), cap: 'flat', cmpd: 'sng', algn: 'ctr' },
    solidFillXml(stroke.color, alpha),
    el('a:prstDash', {
      val: stroke.dash === 'dashed' ? 'dash' : stroke.dash === 'dotted' ? 'sysDot' : 'solid',
    }),
  );
}

export async function tableXml(
  e: TableElement,
  ctx: ExportContext,
  part: PartWriter,
  frame: Frame,
  alpha: number,
  id: number,
): Promise<string> {
  part.shapeIds?.set(e.id, { id, text: false });
  // Rows and columns as their share of the frame, as the renderer lays them out.
  const sum = (sizes: readonly number[]) => sizes.reduce((a, b) => a + b, 0) || 1;
  const colScale = frame.w / sum(e.cols);
  const rowScale = frame.h / sum(e.rows);
  // The columns as the screen shows them, left to right: a right-to-left table is written in
  // that order, which every application draws alike, and its text keeps its own direction.
  const C = e.cols.length;
  const rtl = e.dir === 'rtl';
  const logical = (v: number) => (rtl ? C - 1 - v : v);
  const origins = originsOf(e);
  const rows: string[] = [];
  for (let r = 0; r < e.rows.length; r++) {
    const cells: string[] = [];
    for (let v = 0; v < C; v++) {
      const at = origins[r]?.[logical(v)] ?? { r, c: logical(v) };
      const cell = e.cells[at.r]?.[at.c];
      if (!cell) continue;
      const colSpan = cell.colSpan ?? 1;
      const rowSpan = cell.rowSpan ?? 1;
      // The cell a span starts from is its top-left one on the screen; the others are covered.
      const left = rtl ? C - (at.c + colSpan) : at.c;
      const origin = at.r === r && left === v;
      const look = cellLook(e, at.r, at.c);
      const defaults = cellTextDefaults(e, at.r, at.c);
      const padding = cell.padding ?? CELL_PADDING;
      const box = {
        w: e.cols.slice(at.c, at.c + colSpan).reduce((a, b) => a + b, 0) * colScale,
        h: e.rows.slice(at.r, at.r + rowSpan).reduce((a, b) => a + b, 0) * rowScale,
      };
      const fill = look.fill
        ? await fillXml(look.fill, ctx, part.rels, box, alpha)
        : el('a:noFill');
      // The renderer's left and right are of the screen, as the columns here are.
      const tcPr = el(
        'a:tcPr',
        {
          marL: emu(padding.left),
          marR: emu(padding.right),
          marT: emu(padding.top),
          marB: emu(padding.bottom),
          anchor: cell.vAlign === 'middle' ? 'ctr' : cell.vAlign === 'bottom' ? 'b' : 't',
        },
        borderXml('a:lnL', look.borders.left, alpha),
        borderXml('a:lnR', look.borders.right, alpha),
        borderXml('a:lnT', look.borders.top, alpha),
        borderXml('a:lnB', look.borders.bottom, alpha),
        fill,
      );
      const body = el(
        'a:txBody',
        {},
        el('a:bodyPr'),
        el('a:lstStyle'),
        paragraphsXml(
          origin ? cell.content : undefined,
          ctx,
          {
            theme: ctx.deck.theme,
            dir: e.dir,
            alignTo: e.dir,
            lang: ctx.deck.meta.lang,
            alpha,
            ...(defaults.weight ? { weight: defaults.weight } : {}),
            ...(defaults.color ? { cssColor: defaults.color } : {}),
          },
          part.rels,
        ),
      );
      cells.push(
        el(
          'a:tc',
          {
            gridSpan: origin && colSpan > 1 ? colSpan : undefined,
            rowSpan: origin && rowSpan > 1 ? rowSpan : undefined,
            hMerge: !origin && v > left ? 1 : undefined,
            vMerge: !origin && r > at.r ? 1 : undefined,
          },
          body,
          tcPr,
        ),
      );
    }
    rows.push(el('a:tr', { h: emu(e.rows[r]! * rowScale) }, ...cells));
  }
  const screenCols = rtl ? [...e.cols].reverse() : e.cols;
  const grid = el(
    'a:tblGrid',
    {},
    ...screenCols.map((w) => el('a:gridCol', { w: emu(w * colScale) })),
  );
  const tbl = el(
    'a:tbl',
    {},
    el(
      'a:tblPr',
      {
        firstRow: e.style.headerRow ? 1 : undefined,
        bandRow: e.style.bandedRows ? 1 : undefined,
        firstCol: e.style.firstColumn ? 1 : undefined,
      },
      el('a:tableStyleId', {}, NO_STYLE),
    ),
    grid,
    ...rows,
  );
  return el(
    'p:graphicFrame',
    {},
    el(
      'p:nvGraphicFramePr',
      {},
      el('p:cNvPr', { id, name: e.name ?? `Table ${id - 1}`, hidden: e.hidden ? 1 : undefined }),
      el('p:cNvGraphicFramePr', {}, el('a:graphicFrameLocks', { noGrp: 1 })),
      el('p:nvPr'),
    ),
    el(
      'p:xfrm',
      { rot: undefined },
      el('a:off', { x: emu(frame.x), y: emu(frame.y) }),
      el('a:ext', { cx: emu(frame.w), cy: emu(frame.h) }),
    ),
    el(
      'a:graphic',
      {},
      el('a:graphicData', { uri: 'http://schemas.openxmlformats.org/drawingml/2006/table' }, tbl),
    ),
  );
}

/** The cell each cell of the grid belongs to: itself, or the cell whose span covers it. */
function originsOf(e: TableElement): { r: number; c: number }[][] {
  const out = e.rows.map((_, r) => e.cols.map((_, c) => ({ r, c })));
  e.cells.forEach((cells, r) =>
    cells.forEach((cell, c) => {
      if (cell.merged) return;
      for (let dr = 0; dr < (cell.rowSpan ?? 1); dr++) {
        for (let dc = 0; dc < (cell.colSpan ?? 1); dc++) {
          const row = out[r + dr];
          if (row && row[c + dc]) row[c + dc] = { r, c };
        }
      }
    }),
  );
  return out;
}
