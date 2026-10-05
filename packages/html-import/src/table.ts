/**
 * A rendered table as a table element (ADR-005: a table taken apart into boxes and text
 * loses its collapsed borders and its vertical alignment, so it needs a real table). A table
 * is recognised by what the browser computed, `display: table` with rows and cells under it,
 * not by its tags: a grid of `div`s laid out as a table converts the same way.
 */
import {
  createElement,
  type Deck,
  type Frame,
  type Paragraph,
  type Stroke,
  type TableCell,
  type TableElement,
} from '@slidr/model';
import { alphaOf, px, round } from './css';
import {
  composedChildren,
  neverRendered,
  ownPaint,
  pseudoKind,
  styleOf,
  subtreeHidden,
  textLines,
} from './measure';
import { hasAnyText, isPureInline, lineHeightPx, readTextBlock, type TextTheme } from './text';

export interface TableContext {
  deck: Deck;
  text: TextTheme;
  /** CSS px of the table -> slide px, and -> screen px. */
  kl: number;
  vl: number;
  toFrame(rect: { left: number; top: number; width: number; height: number }): Frame;
  nextId(): string;
}

const ROW_GROUPS = new Set(['table-row-group', 'table-header-group', 'table-footer-group']);

function shown(el: Element): boolean {
  return !neverRendered(el) && !subtreeHidden(styleOf(el));
}

/** The sorted positions of grid lines, merging those that are the same line. */
function gridLines(values: number[]): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const lines: number[] = [];
  for (const v of sorted)
    if (lines.length === 0 || v - lines[lines.length - 1]! > 0.75) lines.push(v);
  return lines;
}

function lineIndex(lines: readonly number[], value: number): number {
  let best = 0;
  for (let i = 1; i < lines.length; i++) {
    if (Math.abs(lines[i]! - value) < Math.abs(lines[best]! - value)) best = i;
  }
  return best;
}

/** The table under `el`, or undefined when the model's table cannot be it. */
export function readTable(el: Element, ctx: TableContext): TableElement | undefined {
  const { kl, vl, text } = ctx;
  const tableCs = styleOf(el);
  const collapsed = tableCs.borderCollapse === 'collapse';
  // The renderer's table has collapsed borders and no room between its cells.
  if (!collapsed && (px(tableCs.borderSpacing) > 0 || ownPaint(tableCs).border)) return undefined;
  if (pseudoKind(el, '::before') || pseudoKind(el, '::after')) return undefined;
  // The table's own box (a picture behind it, a frame or a shadow around it) is not a field of
  // the model's table. A plain colour behind collapsed cells is: it shows through every cell
  // that has no colour of its own, so it is those cells' fill.
  const tablePaint = ownPaint(tableCs);
  if (tablePaint.shadow || tableCs.backgroundImage !== 'none') return undefined;
  const behind = tablePaint.background ? tableCs.backgroundColor : undefined;
  if (behind && (!collapsed || px(tableCs.borderTopLeftRadius) > 0)) return undefined;

  const rows: Element[] = [];
  for (const child of composedChildren(el).filter(shown)) {
    const display = styleOf(child).display;
    if (display === 'table-row') rows.push(child);
    else if (ROW_GROUPS.has(display)) {
      for (const row of composedChildren(child).filter(shown)) {
        if (styleOf(row).display !== 'table-row') return undefined;
        rows.push(row);
      }
    } else if (display !== 'table-column' && display !== 'table-column-group') return undefined;
  }
  if (rows.length === 0) return undefined;

  interface Measured {
    cell: Element;
    row: Element;
    rect: DOMRect;
    cs: CSSStyleDeclaration;
  }
  const measured: Measured[] = [];
  for (const row of rows) {
    for (const cell of composedChildren(row).filter(shown)) {
      const cs = styleOf(cell);
      if (cs.display !== 'table-cell') return undefined;
      measured.push({ cell, row, rect: cell.getBoundingClientRect(), cs });
    }
  }
  if (measured.length === 0) return undefined;

  const xs = gridLines(measured.flatMap((m) => [m.rect.left, m.rect.right]));
  const ys = gridLines(measured.flatMap((m) => [m.rect.top, m.rect.bottom]));
  const columns = xs.length - 1;
  const lines = ys.length - 1;
  if (columns < 1 || lines < 1) return undefined;

  const rtl = tableCs.direction === 'rtl';
  const toSlide = kl / vl;

  const cells: TableCell[][] = Array.from({ length: lines }, () =>
    Array.from({ length: columns }, (): TableCell => ({
      content: { paragraphs: [] },
      merged: true,
    })),
  );
  // Which places of the grid a measured cell lies over: its own, and those its spans cover.
  const covered = Array.from({ length: lines }, () => new Array<boolean>(columns).fill(false));
  const stroke = (
    cell: Element,
    cs: CSSStyleDeclaration,
    side: 'Top' | 'Right' | 'Bottom' | 'Left',
  ): Stroke | undefined => {
    const width = px(cs[`border${side}Width`]);
    const style = cs[`border${side}Style`];
    const color = cs[`border${side}Color`];
    if (width <= 0 || style === 'none' || style === 'hidden' || alphaOf(color) === 0)
      return undefined;
    if (style !== 'solid' && style !== 'dashed' && style !== 'dotted') return undefined;
    return {
      color: text.color(color, cell, `border-${side.toLowerCase()}-color`),
      width: round(width * kl),
      ...(style === 'solid' ? {} : { dash: style }),
    };
  };

  for (const { cell, row, rect, cs } of measured) {
    const c0 = lineIndex(xs, rect.left);
    const c1 = lineIndex(xs, rect.right);
    const r0 = lineIndex(ys, rect.top);
    const r1 = lineIndex(ys, rect.bottom);
    if (c1 <= c0 || r1 <= r0) return undefined;
    if (
      cs.backgroundImage !== 'none' ||
      pseudoKind(cell, '::before') === 'box' ||
      pseudoKind(cell, '::after') === 'box'
    ) {
      return undefined;
    }

    const paragraphs: Paragraph[] = [];
    const read = (block: Element, style: CSSStyleDeclaration): boolean => {
      const blockLines = textLines(block);
      if (blockLines.length === 0) return true;
      const first = blockLines[0]!;
      const last = blockLines[blockLines.length - 1]!;
      // A row is as tall as its text, so a cell's text needs the height of its line as the
      // source drew it. Several lines give it by their spacing. One line of `line-height:
      // normal` gives it by its own box, which is the height the font asks for; left unsaid,
      // the theme's line height would stand in and every row would come out taller.
      const pitch =
        blockLines.length > 1
          ? ((last.top - first.top) / (blockLines.length - 1)) * toSlide
          : lineHeightPx(style) === undefined
            ? (first.bottom - first.top) * toSlide
            : undefined;
      const found = readTextBlock(block, block, style, kl, pitch, undefined, text);
      if ('unsupported' in found) return found.unsupported === 'no visible text';
      if (Object.keys(found.css).length > 0) return false;
      paragraphs.push(found.paragraph);
      return true;
    };
    if (hasAnyText(cell)) {
      if (isPureInline(cell)) {
        if (!read(cell, cs)) return undefined;
      } else {
        // Blocks of text stacked in the cell: one paragraph each. Anything else is not a table cell.
        for (const block of composedChildren(cell).filter(shown)) {
          const style = styleOf(block);
          if (ownPaint(style).any || !isPureInline(block) || !read(block, style)) return undefined;
        }
      }
    } else if (composedChildren(cell).some(shown)) return undefined;

    // A cell without a colour of its own shows its row's.
    const own = alphaOf(cs.backgroundColor) > 0;
    const ofRow = styleOf(row).backgroundColor;
    const background = own ? cs.backgroundColor : alphaOf(ofRow) > 0 || !behind ? ofRow : behind;
    // A colour that only tints what is behind it would need both; the model's cell has one fill.
    if (behind && alphaOf(background) < 1 && background !== behind) return undefined;
    const top = stroke(cell, cs, 'Top');
    const right = stroke(cell, cs, 'Right');
    const bottom = stroke(cell, cs, 'Bottom');
    const left = stroke(cell, cs, 'Left');
    const align = cs.verticalAlign;
    const column = rtl ? columns - c1 : c0;
    for (let r = r0; r < r1; r++) {
      for (let c = column; c < column + (c1 - c0); c++) {
        // Two cells over one place is not a grid the model's table can hold.
        if (covered[r]![c]) return undefined;
        covered[r]![c] = true;
      }
    }
    cells[r0]![column] = {
      content: { paragraphs },
      ...(r1 - r0 > 1 ? { rowSpan: r1 - r0 } : {}),
      ...(c1 - c0 > 1 ? { colSpan: c1 - c0 } : {}),
      ...(alphaOf(background) > 0
        ? {
            fill: {
              kind: 'solid',
              color: text.color(
                background,
                own ? cell : background === behind ? el : row,
                'background-color',
              ),
            },
          }
        : {}),
      // Always given, even when empty: without it the renderer draws its default rule.
      borders: {
        ...(top ? { top } : {}),
        ...(right ? { right } : {}),
        ...(bottom ? { bottom } : {}),
        ...(left ? { left } : {}),
      },
      vAlign: align === 'middle' ? 'middle' : align === 'bottom' ? 'bottom' : 'top',
      padding: {
        top: round(px(cs.paddingTop) * kl),
        right: round(px(cs.paddingRight) * kl),
        bottom: round(px(cs.paddingBottom) * kl),
        left: round(px(cs.paddingLeft) * kl),
      },
    };
  }

  // A place no cell lies over (a row that is short of cells) is an empty cell of its own, not
  // one that another cell covers: `merged` without a cell that spans over it is not a table.
  for (let r = 0; r < lines; r++) {
    for (let c = 0; c < columns; c++) {
      if (covered[r]![c]) continue;
      cells[r]![c] = {
        content: { paragraphs: [] },
        borders: {},
        ...(behind
          ? { fill: { kind: 'solid', color: text.color(behind, el, 'background-color') } }
          : {}),
      };
    }
  }

  // A cell's box runs from the middle of one collapsed border to the middle of the next, and
  // the table's own box also holds the outer halves of the borders around it. The renderer
  // draws those borders inside the frame (`tableLayout`): the frame is the table's own box, and
  // the first and the last row and column reach its edges.
  const outer = el.getBoundingClientRect();
  const gridX = [outer.left, ...xs.slice(1, -1), outer.right];
  const gridY = [outer.top, ...ys.slice(1, -1), outer.bottom];
  const widths = gridX.slice(1).map((x, i) => round((x - gridX[i]!) * toSlide));
  const heights = gridY.slice(1).map((y, i) => round((y - gridY[i]!) * toSlide));
  const frame = ctx.toFrame({
    left: outer.left,
    top: outer.top,
    width: outer.width,
    height: outer.height,
  });
  // A column the browser fitted exactly to its text must not come out a hair narrower and wrap it.
  frame.w = round(frame.w + 0.1);
  return createElement.table({
    id: ctx.nextId(),
    frame,
    rows: heights,
    cols: rtl ? widths.reverse() : widths,
    cells,
    dir: rtl ? 'rtl' : 'ltr',
    style: { headerRow: false, bandedRows: false, firstColumn: false },
  });
}
