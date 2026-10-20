import { CONTENT_TYPE, NS, REL } from '../opc';
import { el, esc, XML_HEADER } from '../xml';
import { writeZip } from '../zip';

/*
 * The workbook a chart keeps its data in. PowerPoint draws a chart from the values the chart part
 * caches, and opens this workbook when its data is edited ("Edit Data"), so it holds the same
 * table: the categories down column A, a series in each column after it, its name on row 1.
 */

const SHEET = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const OFFICE_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

/** The column letters of a column from 0: A, B, ..., Z, AA. */
export function columnName(index: number): string {
  let name = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  }
  return name;
}

export type Cell = string | number | null;

/** A workbook of one sheet, `Sheet1`, of the rows given. */
export async function workbook(
  rows: readonly (readonly Cell[])[],
): Promise<Uint8Array<ArrayBuffer>> {
  const encoder = new TextEncoder();
  const sheetRows = rows.map((cells, r) =>
    el(
      'row',
      { r: r + 1 },
      ...cells.map((cell, c) => {
        const ref = `${columnName(c)}${r + 1}`;
        if (cell === null || cell === '') return undefined;
        if (typeof cell === 'number') return el('c', { r: ref }, `<v>${cell}</v>`);
        return el(
          'c',
          { r: ref, t: 'inlineStr' },
          `<is><t xml:space="preserve">${esc(cell)}</t></is>`,
        );
      }),
    ),
  );
  const files = [
    {
      name: '[Content_Types].xml',
      xml: el(
        'Types',
        { xmlns: NS.types },
        el('Default', {
          Extension: 'rels',
          ContentType: 'application/vnd.openxmlformats-package.relationships+xml',
        }),
        el('Default', { Extension: 'xml', ContentType: 'application/xml' }),
        el('Override', {
          PartName: '/xl/workbook.xml',
          ContentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml',
        }),
        el('Override', {
          PartName: '/xl/worksheets/sheet1.xml',
          ContentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml',
        }),
      ),
    },
    {
      name: '_rels/.rels',
      xml: el(
        'Relationships',
        { xmlns: NS.rels },
        el('Relationship', { Id: 'rId1', Type: REL.officeDocument, Target: 'xl/workbook.xml' }),
      ),
    },
    {
      name: 'xl/workbook.xml',
      xml: el(
        'workbook',
        { xmlns: SHEET, 'xmlns:r': OFFICE_REL },
        el('sheets', {}, el('sheet', { name: 'Sheet1', sheetId: 1, 'r:id': 'rId1' })),
      ),
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      xml: el(
        'Relationships',
        { xmlns: NS.rels },
        el('Relationship', {
          Id: 'rId1',
          Type: `${OFFICE_REL}/worksheet`,
          Target: 'worksheets/sheet1.xml',
        }),
      ),
    },
    {
      name: 'xl/worksheets/sheet1.xml',
      xml: el('worksheet', { xmlns: SHEET }, el('sheetData', {}, ...sheetRows)),
    },
  ];
  return writeZip(files.map((f) => ({ name: f.name, data: encoder.encode(XML_HEADER + f.xml) })));
}

export const WORKBOOK_TYPE = CONTENT_TYPE.xlsx;
