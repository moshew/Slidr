import type { CellRange } from '@slidr/model';

/*
 * Tables on the clipboard (TBL-06, SEC-06). What Excel, Google Sheets, Word or a web page put
 * there is read into a grid of plain strings, and a range of cells goes out as TSV and as an HTML
 * table. Nothing of the clipboard's markup reaches the document: a string has no room for it.
 *
 * The look of the source (fonts, colours, widths) is dropped on purpose: a pasted table takes the
 * style of the deck. Only its shape is kept: the texts, the merged areas and the direction.
 */

export interface PastedGrid {
  /** Rectangular: every row has the same number of cells. Cell text may contain '\n'. */
  cells: string[][];
  /** Merged areas of the source (HTML only), to reproduce in a new table. */
  merges: CellRange[];
  /** The direction the source table declares (`dir` attribute or CSS `direction`), when it does. */
  dir?: 'rtl' | 'ltr';
  source: 'html' | 'tsv' | 'csv';
}

// ---------------------------------------------------------------------------------------------
// HTML

/** Elements whose content is not text of the page. */
const SKIPPED = new Set([
  'script',
  'style',
  'head',
  'title',
  'meta',
  'link',
  'base',
  'noscript',
  'template',
  'iframe',
  'frame',
  'frameset',
  'object',
  'embed',
  'applet',
  'svg',
  'math',
  'canvas',
  'video',
  'audio',
  'img',
  'picture',
  'source',
  'input',
  'textarea',
  'select',
  'button',
]);

/** Elements that start a line of their own inside a cell. */
const BLOCKS = new Set([
  'address',
  'article',
  'aside',
  'blockquote',
  'center',
  'dd',
  'div',
  'dl',
  'dt',
  'figcaption',
  'figure',
  'footer',
  'form',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'hr',
  'li',
  'main',
  'nav',
  'ol',
  'p',
  'pre',
  'section',
  'table',
  'tbody',
  'tfoot',
  'thead',
  'tr',
  'ul',
]);

/** White space as markup has it, the non-breaking space included: Excel fills empty cells with it. */
const SPACE = /[ \t\n\r\f\xA0]+/g;

/** No browser lets a cell span more columns than this. */
const MAX_COLSPAN = 1000;

/**
 * The text of a cell. `<br>` and the edges of blocks are line breaks; any other run of white
 * space is one space, because Excel and Word wrap the HTML source inside long cells. Lines are
 * trimmed, and empty lines at the start and the end are dropped.
 */
function textOf(cell: Element): string {
  const lines: string[] = [];
  let line = '';
  // Blocks that follow one another make no empty lines between them; a `<br>` always ends a line.
  // A block that holds only a non-breaking space is a line: that is Word's empty paragraph.
  const edge = () => {
    if (/[^ \t\n\r\f]/.test(line)) lines.push(line);
    line = '';
  };
  const visit = (node: Node): void => {
    if (node.nodeType === 3) {
      line += node.nodeValue ?? '';
      return;
    }
    // Comments (`<!--StartFragment-->`, Office's conditional blocks) are not text.
    if (node.nodeType !== 1) return;
    const el = node as Element;
    const tag = el.localName.toLowerCase();
    if (SKIPPED.has(tag)) return;
    if (tag === 'br') {
      lines.push(line);
      line = '';
      return;
    }
    const block = BLOCKS.has(tag);
    if (block) edge();
    // The cells of a table inside the cell stay apart.
    else if (tag === 'td' || tag === 'th') line += ' ';
    el.childNodes.forEach(visit);
    if (block) edge();
  };
  cell.childNodes.forEach(visit);
  edge();

  const tidy = lines.map((text) => text.replace(SPACE, ' ').trim());
  let start = 0;
  let end = tidy.length;
  while (start < end && tidy[start] === '') start++;
  while (end > start && tidy[end - 1] === '') end--;
  return tidy.slice(start, end).join('\n');
}

/** A `colspan` or a `rowspan`: 1 unless the attribute asks for more, and never more than `max`. */
function spanAttribute(cell: Element, name: 'colspan' | 'rowspan', max: number): number {
  const value = Number.parseInt(cell.getAttribute(name) ?? '', 10);
  return value > 1 ? Math.min(value, max) : 1;
}

/**
 * The direction a table is laid out in, when the markup says: by CSS `direction` or the `dir`
 * attribute, on the table or on what contains it (direction is inherited: Word puts it on a
 * `div` around the table as well).
 */
function declaredDirection(table: Element): 'rtl' | 'ltr' | undefined {
  for (let el: Element | null = table; el; el = el.parentElement) {
    // CSS wins over the attribute, as in a browser.
    const style = /(?:^|;)\s*direction\s*:\s*(rtl|ltr)\b/i.exec(el.getAttribute('style') ?? '');
    const value = (style?.[1] ?? el.getAttribute('dir') ?? '').trim().toLowerCase();
    if (value === 'rtl' || value === 'ltr') return value;
  }
  return undefined;
}

/**
 * The first <table> of clipboard HTML (Excel, Google Sheets, Word, a web page). Undefined when
 * there is none. A cell that spans rows or columns gives its text at its first cell, '' for the
 * cells it covers, and an entry in `merges`.
 */
export function gridFromHtml(html: string): PastedGrid | undefined {
  // A detached document: nothing in it loads or runs, and it is only read (see ../text/paste.ts).
  const table = new DOMParser().parseFromString(html, 'text/html').querySelector('table');
  if (!table) return undefined;
  // The rows of this table, in document order, and not those of a table inside one of its cells.
  const rows = Array.from(table.querySelectorAll('tr')).filter(
    (row) => row.closest('table') === table,
  );

  const texts: string[][] = rows.map(() => []);
  const taken: boolean[][] = rows.map(() => []);
  const merges: CellRange[] = [];
  let width = 0;
  rows.forEach((tr, row) => {
    let col = 0;
    for (const cell of Array.from(tr.children)) {
      const tag = cell.localName.toLowerCase();
      if (tag !== 'td' && tag !== 'th') continue;
      // Past the cells that a `rowspan` above reaches into.
      while (taken[row]?.[col]) col++;
      const rowSpan = spanAttribute(cell, 'rowspan', rows.length - row);
      let colSpan = spanAttribute(cell, 'colspan', MAX_COLSPAN);
      // Malformed markup can ask for a span over a cell that is taken: it ends before it.
      for (let c = col + 1; c < col + colSpan; c++) {
        if (taken[row]?.[c]) colSpan = c - col;
      }
      texts[row]![col] = textOf(cell);
      for (let r = row; r < row + rowSpan; r++) {
        for (let c = col; c < col + colSpan; c++) taken[r]![c] = true;
      }
      if (rowSpan > 1 || colSpan > 1) {
        merges.push({ row0: row, col0: col, row1: row + rowSpan - 1, col1: col + colSpan - 1 });
      }
      col += colSpan;
      width = Math.max(width, col);
    }
  });
  if (width === 0) return undefined;

  const dir = declaredDirection(table);
  return {
    cells: texts.map((row) => Array.from({ length: width }, (_, col) => row[col] ?? '')),
    merges,
    ...(dir ? { dir } : {}),
    source: 'html',
  };
}

// ---------------------------------------------------------------------------------------------
// Delimited text

/**
 * Where the quoted field that opens at `open` closes, or -1 when the quote does not open one: a
 * closing quote is followed by a delimiter, a line break or the end of the text. So `5" pipe`
 * and a lone `"` in a cell are text, as Excel writes them.
 */
function quotedEnd(text: string, open: number, delimiter: string): number {
  for (let i = open + 1; i < text.length; i++) {
    if (text[i] !== '"') continue;
    const after = text[i + 1];
    if (after === '"') {
      i++;
      continue;
    }
    const closes = after === undefined || after === delimiter || after === '\n' || after === '\r';
    return closes ? i : -1;
  }
  return -1;
}

/**
 * The records of delimited text, as in RFC 4180: a field in double quotes may hold the delimiter,
 * line breaks and doubled quotes. `\r\n`, `\n` and `\r` end a record; the line break that ends
 * the text opens no record.
 */
function records(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let i = 0;
  while (i <= text.length) {
    const close = text[i] === '"' ? quotedEnd(text, i, delimiter) : -1;
    if (close >= 0) {
      row.push(text.slice(i + 1, close).replaceAll('""', '"'));
      i = close + 1;
    } else {
      const start = i;
      while (i < text.length && text[i] !== delimiter && text[i] !== '\n' && text[i] !== '\r') i++;
      row.push(text.slice(start, i));
    }
    if (text[i] === delimiter) {
      i++;
      continue;
    }
    rows.push(row);
    row = [];
    if (text[i] === '\r' && text[i + 1] === '\n') i++;
    i++;
    if (i >= text.length) break;
  }
  return rows;
}

/** A record that is an empty line, not a row of empty cells. */
const isEmptyLine = (row: readonly string[]): boolean => row.length === 1 && row[0]?.trim() === '';

function rectangular(rows: string[][], source: 'tsv' | 'csv'): PastedGrid {
  const width = rows.reduce((widest, row) => Math.max(widest, row.length), 0);
  return {
    cells: rows.map((row) => Array.from({ length: width }, (_, col) => row[col] ?? '')),
    merges: [],
    source,
  };
}

/**
 * Delimited text. Tabs make it TSV (what Excel puts in text/plain). Otherwise CSV with ';' or
 * ',' when the text looks like a table: at least two columns in every non-empty line and the
 * same count in all of them, and at least two lines unless `force`. Quoted fields
 * ("a ""b"" c", with delimiters and line breaks inside) as in RFC 4180, for both. Undefined
 * when the text is not tabular.
 */
export function gridFromText(
  text: string,
  options: { force?: boolean } = {},
): PastedGrid | undefined {
  // A file read as text may start with a byte order mark.
  const source = text.startsWith(String.fromCodePoint(0xfeff)) ? text.slice(1) : text;
  if (source.includes('\t')) {
    const rows = records(source, '\t');
    // Empty lines at the end are not rows; one between rows is a row of empty cells.
    while (rows.length > 0 && isEmptyLine(rows[rows.length - 1] ?? [])) rows.pop();
    return rows.length > 0 ? rectangular(rows, 'tsv') : undefined;
  }
  // A semicolon rarely appears in data, a comma often does (1,5 in a list split by semicolons).
  for (const delimiter of [';', ',']) {
    const rows = records(source, delimiter).filter((row) => !isEmptyLine(row));
    const width = rows[0]?.length ?? 0;
    const tabular =
      width >= 2 &&
      rows.length >= (options.force ? 1 : 2) &&
      rows.every((row) => row.length === width);
    if (tabular) return rectangular(rows, 'csv');
  }
  return undefined;
}

/**
 * What a paste holds as a table: the HTML table when there is one, else the text. `force` is for
 * a paste into a selected table, where any delimited text is taken (see `gridFromText`).
 */
export function clipboardGrid(
  data: { html?: string; text?: string },
  options: { force?: boolean } = {},
): PastedGrid | undefined {
  return (
    (data.html ? gridFromHtml(data.html) : undefined) ??
    (data.text ? gridFromText(data.text, options) : undefined)
  );
}

// ---------------------------------------------------------------------------------------------
// Copying out

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/**
 * A range as TSV for text/plain and as an HTML <table> for text/html (copying cells out to
 * Excel). Cells with tabs, quotes or line breaks are quoted in the TSV; the HTML is escaped, and
 * a line break in a cell is a `<br>`.
 */
export function gridToClipboard(
  cells: readonly (readonly string[])[],
  dir: 'rtl' | 'ltr',
): { text: string; html: string } {
  const field = (cell: string) =>
    /["\t\n\r]/.test(cell) ? `"${cell.replaceAll('"', '""')}"` : cell;
  const td = (cell: string) => `<td>${escapeHtml(cell).replace(/\r\n?|\n/g, '<br>')}</td>`;
  return {
    // Rows end as Excel ends them; a line break inside a cell is a bare `\n`.
    text: cells.map((row) => row.map(field).join('\t')).join('\r\n'),
    html: `<table dir="${dir}"><tbody>${cells
      .map((row) => `<tr>${row.map(td).join('')}</tr>`)
      .join('')}</tbody></table>`,
  };
}
