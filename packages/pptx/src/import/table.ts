import { createElement, type Element, type Fill, type Stroke, type TableCell } from '@slidr/model';
import { attr, boolAttr, child, children, intAttr, parseXml, type XmlElement } from '../xml';
import { readFill, readOutline } from './drawing';
import type { PartContext } from './shapes';
import {
  readParagraphs,
  withMargin,
  type LevelProps,
  type ListStyle,
  type TextContext,
} from './text';

/*
 * A table: its grid, its merged cells, and the look of each cell as PowerPoint draws it, its
 * table style applied part by part (the whole table, the bands, the first column, the header
 * row) and the cell's own properties over it. The model's own table styles are switched off,
 * so the table looks as it did.
 */

type Side = 'left' | 'right' | 'top' | 'bottom';

interface StylePart {
  fill?: XmlElement;
  /** `left`, `right`, `top`, `bottom`, `insideH`, `insideV`. */
  borders: Record<string, XmlElement | undefined>;
  bold?: boolean;
  color?: XmlElement;
}

function readStylePart(el: XmlElement | undefined, ctx: PartContext): StylePart | undefined {
  if (!el) return undefined;
  const tcStyle = child(el, 'a:tcStyle');
  const tcTx = child(el, 'a:tcTxStyle');
  const borders: StylePart['borders'] = {};
  for (const b of children(child(tcStyle, 'a:tcBdr'))) {
    const side = b.name.replace(/^a:/, '');
    const ln = child(b, 'a:ln');
    if (ln) borders[side] = ln;
    else {
      const ref = child(b, 'a:lnRef');
      const idx = intAttr(ref, 'idx') ?? 0;
      const themed = idx > 0 ? ctx.importer.theme.lines[idx - 1] : undefined;
      if (themed) {
        // The reference's colour stands in for the theme line's placeholder colour.
        const color = children(ref)[0];
        borders[side] = {
          ...themed,
          children: [
            ...themed.children.filter((c) => typeof c === 'string' || !c.name.endsWith('Fill')),
            ...(color ? [{ name: 'a:solidFill', attrs: {}, children: [color] }] : []),
          ],
        };
      }
    }
  }
  let fill = child(child(tcStyle, 'a:fill'), 'a:solidFill', 'a:noFill', 'a:gradFill', 'a:pattFill');
  const fillRef = child(tcStyle, 'a:fillRef');
  if (!fill && fillRef) {
    const color = children(fillRef)[0];
    if (color) fill = { name: 'a:solidFill', attrs: {}, children: [color] };
  }
  const color =
    children(tcTx).find((c) => c.name.endsWith('Clr')) ??
    child(child(tcTx, 'a:fontRef'), 'a:schemeClr');
  const b = attr(tcTx, 'b');
  return {
    ...(fill ? { fill } : {}),
    borders,
    ...(b === 'on' ? { bold: true } : b === 'off' ? { bold: false } : {}),
    ...(color ? { color } : {}),
  };
}

/**
 * PowerPoint's own table styles that a file names without saying what they are: the medium
 * style of a new table in an accent of the theme, and the two with no style.
 */
function builtinStyle(id: string): XmlElement | undefined {
  const line = (w: number, color: string) =>
    `<a:ln w="${w}" cmpd="sng"><a:solidFill><a:schemeClr val="${color}"/></a:solidFill></a:ln>`;
  const fill = (color: string, tint?: number) =>
    `<a:fill><a:solidFill><a:schemeClr val="${color}">${tint ? `<a:tint val="${tint}"/>` : ''}</a:schemeClr></a:solidFill></a:fill>`;
  const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"';
  const medium = (accent: string) =>
    `<a:tblStyle ${NS} styleId="${id}">` +
    `<a:wholeTbl><a:tcTxStyle><a:schemeClr val="dk1"/></a:tcTxStyle><a:tcStyle><a:tcBdr>` +
    ['left', 'right', 'top', 'bottom', 'insideH', 'insideV']
      .map((side) => `<a:${side}>${line(12700, 'lt1')}</a:${side}>`)
      .join('') +
    `</a:tcBdr>${fill(accent, 20000)}</a:tcStyle></a:wholeTbl>` +
    `<a:band1H><a:tcStyle><a:tcBdr/>${fill(accent, 40000)}</a:tcStyle></a:band1H>` +
    `<a:band1V><a:tcStyle><a:tcBdr/>${fill(accent, 40000)}</a:tcStyle></a:band1V>` +
    ['lastCol', 'firstCol']
      .map(
        (part) =>
          `<a:${part}><a:tcTxStyle b="on"><a:schemeClr val="lt1"/></a:tcTxStyle><a:tcStyle><a:tcBdr/>${fill(accent)}</a:tcStyle></a:${part}>`,
      )
      .join('') +
    `<a:lastRow><a:tcTxStyle b="on"><a:schemeClr val="lt1"/></a:tcTxStyle><a:tcStyle><a:tcBdr><a:top>${line(38100, 'lt1')}</a:top></a:tcBdr>${fill(accent)}</a:tcStyle></a:lastRow>` +
    `<a:firstRow><a:tcTxStyle b="on"><a:schemeClr val="lt1"/></a:tcTxStyle><a:tcStyle><a:tcBdr><a:bottom>${line(38100, 'lt1')}</a:bottom></a:tcBdr>${fill(accent)}</a:tcStyle></a:firstRow>` +
    `</a:tblStyle>`;
  const grid =
    `<a:tblStyle ${NS} styleId="${id}"><a:wholeTbl><a:tcStyle><a:tcBdr>` +
    ['left', 'right', 'top', 'bottom', 'insideH', 'insideV']
      .map((side) => `<a:${side}>${line(12700, 'tx1')}</a:${side}>`)
      .join('') +
    `</a:tcBdr></a:tcStyle></a:wholeTbl></a:tblStyle>`;
  const known: Record<string, string> = {
    '{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}': medium('accent1'),
    '{073A0DAA-6AF3-43AB-8588-CEC1D06C72B9}': medium('dk1'),
    '{5940675A-B579-460E-94D1-54222C63F5DA}': grid,
    '{2D5ABB26-0587-4C30-8999-92F81FD0307C}': `<a:tblStyle ${NS} styleId="${id}"/>`,
  };
  const xml = known[id.toUpperCase()];
  return xml ? parseXml(xml) : undefined;
}

/** The table style of an id, from the presentation's table styles, or PowerPoint's own. */
function styleOf(id: string | undefined, ctx: PartContext): Record<string, StylePart | undefined> {
  const styles = ctx.importer.tableStyles;
  const style = id
    ? (styles.find((s) => attr(s, 'styleId') === id) ?? builtinStyle(id))
    : undefined;
  if (!style) return {};
  const parts: Record<string, StylePart | undefined> = {};
  for (const name of [
    'wholeTbl',
    'band1H',
    'band2H',
    'band1V',
    'band2V',
    'firstCol',
    'lastCol',
    'firstRow',
    'lastRow',
  ]) {
    parts[name] = readStylePart(child(style, `a:${name}`), ctx);
  }
  return parts;
}

export function readTable(
  tbl: XmlElement | undefined,
  common: Omit<Element, 'type'> & { frame: Element['frame'] },
  ctx: PartContext,
): Element | undefined {
  if (!tbl) return undefined;
  const pxPerEmu = ctx.importer.pxPerEmu;
  const tblPr = child(tbl, 'a:tblPr');
  const cols = children(child(tbl, 'a:tblGrid'), 'a:gridCol').map((g) =>
    Math.max(1, Math.round((intAttr(g, 'w') ?? 914400) * pxPerEmu * 100) / 100),
  );
  const trs = children(tbl, 'a:tr');
  if (cols.length === 0 || trs.length === 0) return undefined;
  const rows = trs.map((tr) =>
    Math.max(1, Math.round((intAttr(tr, 'h') ?? 370840) * pxPerEmu * 100) / 100),
  );
  const flags = {
    firstRow: boolAttr(tblPr, 'firstRow') ?? false,
    lastRow: boolAttr(tblPr, 'lastRow') ?? false,
    firstCol: boolAttr(tblPr, 'firstCol') ?? false,
    lastCol: boolAttr(tblPr, 'lastCol') ?? false,
    bandRow: boolAttr(tblPr, 'bandRow') ?? false,
    bandCol: boolAttr(tblPr, 'bandCol') ?? false,
  };
  const style = styleOf(
    child(tblPr, 'a:tableStyleId') ? childText(child(tblPr, 'a:tableStyleId')) : undefined,
    ctx,
  );
  const R = rows.length;
  const C = cols.length;
  const picture = (b: { rId: string }) => ctx.pictures.get(b.rId);
  const cells: TableCell[][] = [];
  trs.forEach((tr, r) => {
    const row: TableCell[] = [];
    children(tr, 'a:tc')
      .slice(0, C)
      .forEach((tc, c) => {
        const merged = boolAttr(tc, 'hMerge') || boolAttr(tc, 'vMerge');
        // The parts of the style the cell is in, lowest first.
        const parts: { name: string; part: StylePart }[] = [];
        const add = (name: string) => {
          const part = style[name];
          if (part) parts.push({ name, part });
        };
        add('wholeTbl');
        const body = r - (flags.firstRow ? 1 : 0);
        const isBodyRow = !(flags.firstRow && r === 0) && !(flags.lastRow && r === R - 1);
        if (flags.bandRow && isBodyRow) add(body % 2 === 0 ? 'band1H' : 'band2H');
        if (flags.bandCol) add((c - (flags.firstCol ? 1 : 0)) % 2 === 0 ? 'band1V' : 'band2V');
        if (flags.firstCol && c === 0) add('firstCol');
        if (flags.lastCol && c === C - 1) add('lastCol');
        if (flags.firstRow && r === 0) add('firstRow');
        if (flags.lastRow && r === R - 1) add('lastRow');
        const tcPr = child(tc, 'a:tcPr');
        const rowSpan = intAttr(tc, 'rowSpan') ?? 1;
        const colSpan = intAttr(tc, 'gridSpan') ?? 1;
        const lastRow = r + rowSpan - 1 >= R - 1;
        const lastCol = c + colSpan - 1 >= C - 1;
        // Which line of a part of the style each side of the cell is: an edge of the part's
        // region (the table, a row, a column) or a line inside it.
        const edge: Record<Side, string> = {
          top: r === 0 ? 'top' : 'insideH',
          bottom: lastRow ? 'bottom' : 'insideH',
          left: c === 0 ? 'left' : 'insideV',
          right: lastCol ? 'right' : 'insideV',
        };
        const lineOf = (name: string, side: Side) => {
          const across = side === 'top' || side === 'bottom';
          const row = /H$|Row$/.test(name);
          const column = /V$|Col$/.test(name);
          if ((row && across) || (column && !across)) return side;
          return edge[side];
        };
        const borders: NonNullable<TableCell['borders']> = {};
        for (const side of ['top', 'right', 'bottom', 'left'] as Side[]) {
          let ln: XmlElement | undefined;
          for (const { name, part } of parts) ln = part.borders[lineOf(name, side)] ?? ln;
          const own = child(tcPr, `a:ln${side[0]!.toUpperCase()}`);
          if (own) ln = own;
          const stroke: Stroke | undefined = ln
            ? readOutline([ln], ctx.colors, pxPerEmu).stroke
            : undefined;
          if (stroke) borders[side] = stroke;
        }
        let fill: Fill | undefined;
        for (const { part } of parts)
          if (part.fill) fill = readFill(part.fill, ctx.colors, picture) ?? fill;
        const ownFill = children(tcPr).find((x) =>
          ['a:solidFill', 'a:noFill', 'a:gradFill', 'a:blipFill', 'a:pattFill'].includes(x.name),
        );
        if (ownFill) fill = readFill(ownFill, ctx.colors, picture);
        let bold: boolean | undefined;
        let color: XmlElement | undefined;
        for (const { part } of parts) {
          if (part.bold !== undefined) bold = part.bold;
          if (part.color) color = part.color;
        }
        // The style's text, under what the cell's runs say.
        const styleLevel: LevelProps = {
          run: {
            ...(bold !== undefined ? { b: bold } : {}),
            ...(color ? { fill: { name: 'a:solidFill', attrs: {}, children: [color] } } : {}),
          },
        };
        const styleList: ListStyle = Array.from({ length: 9 }, () => styleLevel);
        const tc2: TextContext = {
          colors: ctx.colors,
          theme: ctx.importer.theme,
          pxPerPt: pxPerEmu * 12700,
          link: (rId: string, action: string | undefined) =>
            ctx.importer.linkTarget(ctx.rels, rId, action),
          styleSize: (ref) => ctx.importer.deckTheme.textStyles[ref].size,
        };
        const inset = (name: string, fallback: number) =>
          Math.round((intAttr(tcPr, name) ?? fallback) * pxPerEmu * 100) / 100;
        const padding = {
          left: inset('marL', 91440),
          right: inset('marR', 91440),
          top: inset('marT', 45720),
          bottom: inset('marB', 45720),
        };
        const { content, margin } = readParagraphs(
          child(tc, 'a:txBody'),
          [...ctx.otherStyles, styleList],
          tc2,
          undefined,
          padding,
        );
        const anchor = attr(tcPr, 'anchor');
        const cell: TableCell = {
          content: merged ? { paragraphs: [] } : content,
          ...(rowSpan > 1 && !merged ? { rowSpan } : {}),
          ...(colSpan > 1 && !merged ? { colSpan } : {}),
          ...(merged ? { merged: true } : {}),
          ...(fill && fill.kind !== 'none' ? { fill } : { fill: { kind: 'none' } }),
          borders,
          ...(anchor === 'ctr'
            ? { vAlign: 'middle' as const }
            : anchor === 'b'
              ? { vAlign: 'bottom' as const }
              : {}),
          padding: withMargin(padding, margin),
        };
        row.push(cell);
      });
    while (row.length < C) row.push({ content: { paragraphs: [] }, merged: true });
    cells.push(row);
  });
  return createElement.table({
    ...common,
    rows,
    cols,
    cells,
    dir: boolAttr(tblPr, 'rtl') ? 'rtl' : 'ltr',
    style: { headerRow: false, bandedRows: false, firstColumn: false },
  });
}

function childText(el: XmlElement | undefined): string {
  return (el?.children ?? [])
    .filter((c): c is string => typeof c === 'string')
    .join('')
    .trim();
}
