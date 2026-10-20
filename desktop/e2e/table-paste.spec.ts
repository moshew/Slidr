import { expect, test, type Page } from '@playwright/test';
import type { Element, TableElement, TextElement } from '@slidr/model';
import { currentSlide, deck, openApp, pageProblems } from './objects-helpers';
import {
  addTable,
  cellOnStage,
  copy,
  editingId,
  expectSelection,
  oneUndoStep,
  paste,
  redo,
  selectCell,
  selectRange,
  selectTable,
  settled,
  stage,
  steps,
  table,
  tableOnStage,
  texts,
  typeInCell,
  typingCell,
  undo,
  type Clip,
} from './table-helpers';

/*
 * Tables on the clipboard (WG6-T04, TBL-06, SEC-06): a range copied in Excel, a table copied in
 * Word or on a web page, and delimited text are pasted into the selected table or as a new one;
 * the cells selected in a table are copied out as TSV and as an HTML table.
 *
 * The clipboard of the machine is shared with every other test run and with the person at the
 * keyboard, so these tests do not touch it: they hand the app the `paste`, `copy` and `cut`
 * events a browser would, with their own data. Everything from the event on is the real path.
 */

test.afterEach(({ page }) => {
  expect(pageProblems(page)).toEqual([]);
});

/* ---------------------------------------------------------------- what the sources put there */

const SALES = [
  ['מוצר', 'Q1', 'Q2', 'סה"כ'],
  ['תפוחים', '1,200', '1,350', '2,550'],
  ['אגסים', '980', '1,040', '2,020'],
];

/** The `text/html` of a range copied in Excel: a whole document, with its styles and its markers. */
const excelHtml = (
  grid: string[][],
  attributes = '',
) => `<html xmlns:v="urn:schemas-microsoft-com:vml"
xmlns:o="urn:schemas-microsoft-com:office:office"
xmlns:x="urn:schemas-microsoft-com:office:excel"
xmlns="http://www.w3.org/TR/REC-html40">

<head>
<meta http-equiv=Content-Type content="text/html; charset=utf-8">
<meta name=ProgId content=Excel.Sheet>
<meta name=Generator content="Microsoft Excel 15">
<link id=Main-File rel=Main-File
href="file:///C:/Users/user/AppData/Local/Temp/msohtmlclip1/01/clip.htm">
<link rel=File-List
href="file:///C:/Users/user/AppData/Local/Temp/msohtmlclip1/01/clip_filelist.xml">
<style>
<!--table
	{mso-displayed-decimal-separator:"\\.";
	mso-displayed-thousand-separator:"\\,";}
@page
	{margin:.75in .7in .75in .7in;
	mso-header-margin:.3in;
	mso-footer-margin:.3in;}
tr
	{mso-height-source:auto;}
col
	{mso-width-source:auto;}
br
	{mso-data-placement:same-cell;}
td
	{padding-top:1px;
	padding-right:1px;
	padding-left:1px;
	mso-ignore:padding;
	color:black;
	font-size:11.0pt;
	font-weight:400;
	font-style:normal;
	text-decoration:none;
	font-family:Calibri, sans-serif;
	mso-font-charset:0;
	mso-number-format:General;
	text-align:general;
	vertical-align:bottom;
	border:none;
	mso-background-source:auto;
	mso-pattern:auto;
	mso-protection:locked visible;
	white-space:nowrap;
	mso-rotate:0;}
.xl65
	{font-weight:700;
	font-family:Arial, sans-serif;
	mso-font-charset:177;}
.xl66
	{mso-number-format:"\\#\\,\\#\\#0";}
-->
</style>
</head>

<body link="#0563C1" vlink="#954F72">

<table border=0 cellpadding=0 cellspacing=0 width=${64 * grid[0]!.length} ${attributes}style='border-collapse:
 collapse;width:${48 * grid[0]!.length}pt'>
<!--StartFragment-->
 <col width=64 span=${grid[0]!.length} style='width:48pt'>
${grid
  .map(
    (line, r) => ` <tr height=20 style='height:15.0pt'>
${line
  .map(
    (text, c) =>
      `  <td ${c === 0 ? 'height=20 ' : ''}class=${r === 0 ? 'xl65' : 'xl66'}${
        /^[\d,]+$/.test(text) ? ' align=right' : ''
      } style='height:15.0pt'>${text.replaceAll('"', '&quot;')}</td>`,
  )
  .join('\n')}
 </tr>`,
  )
  .join('\n')}
<!--EndFragment-->
</table>

</body>

</html>
`;

/** The `text/plain` Excel puts next to it: tabs and CRLF, also after the last row. */
const excelText = (grid: string[][]) =>
  grid
    .map((line) =>
      line
        .map((text) => (text.includes('"') ? `"${text.replaceAll('"', '""')}"` : text))
        .join('\t'),
    )
    .join('\r\n') + '\r\n';

/** A range copied in Excel: its HTML, its text, and a picture of it. */
const excel = (grid: string[][], attributes = ''): Clip => ({
  data: { 'text/html': excelHtml(grid, attributes), 'text/plain': excelText(grid) },
  picture: true,
});

/** A table copied in Word: paragraphs in the cells, and Office's own tags. */
const WORD_HTML = `<html xmlns:o="urn:schemas-microsoft-com:office:office"
xmlns:w="urn:schemas-microsoft-com:office:word"
xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta http-equiv=Content-Type content="text/html; charset=utf-8">
<meta name=Generator content="Microsoft Word 15">
<style>
<!--
 /* Style Definitions */
 p.MsoNormal, li.MsoNormal, div.MsoNormal
	{margin-top:0cm; margin-right:0cm; margin-bottom:8.0pt; margin-left:0cm;
	line-height:107%; font-size:11.0pt; font-family:"Calibri",sans-serif;}
table.MsoTableGrid
	{border:solid windowtext 1.0pt; font-size:11.0pt; font-family:"Calibri",sans-serif;}
-->
</style>
</head>
<body lang=EN-US style='tab-interval:36.0pt'>
<!--StartFragment-->
<table class=MsoTableGrid border=1 cellspacing=0 cellpadding=0
 style='border-collapse:collapse;border:none;mso-border-alt:solid windowtext .5pt;
 mso-yfti-tbllook:1184;mso-padding-alt:0cm 5.4pt 0cm 5.4pt'>
 <tr style='mso-yfti-irow:0;mso-yfti-firstrow:yes'>
  <td width=208 valign=top style='width:155.8pt;border:solid windowtext 1.0pt;
  padding:0cm 5.4pt 0cm 5.4pt'>
  <p class=MsoNormal style='margin-bottom:0cm;line-height:normal'><b><span
  lang=EN-US>Name</span></b><o:p></o:p></p>
  </td>
  <td width=208 valign=top style='width:155.85pt;border:solid windowtext 1.0pt;
  border-left:none;padding:0cm 5.4pt 0cm 5.4pt'>
  <p class=MsoNormal style='margin-bottom:0cm;line-height:normal'><b><span
  lang=EN-US>Role in the
  team</span></b><o:p></o:p></p>
  </td>
 </tr>
 <tr style='mso-yfti-irow:1'>
  <td width=208 valign=top style='width:155.8pt;border:solid windowtext 1.0pt;
  border-top:none;padding:0cm 5.4pt 0cm 5.4pt'>
  <p class=MsoNormal style='margin-bottom:0cm;line-height:normal'><span
  lang=EN-US>Dana</span><o:p></o:p></p>
  </td>
  <td width=208 valign=top style='width:155.85pt;border-top:none;border-left:none;
  padding:0cm 5.4pt 0cm 5.4pt'>
  <p class=MsoNormal style='margin-bottom:0cm;line-height:normal'><span
  lang=EN-US>Design</span><o:p></o:p></p>
  <p class=MsoNormal style='margin-bottom:0cm;line-height:normal'><span
  lang=EN-US>Research</span><o:p></o:p></p>
  </td>
 </tr>
 <tr style='mso-yfti-irow:2;mso-yfti-lastrow:yes'>
  <td width=208 valign=top style='width:155.8pt;border:solid windowtext 1.0pt;
  border-top:none;padding:0cm 5.4pt 0cm 5.4pt'>
  <p class=MsoNormal style='margin-bottom:0cm;line-height:normal'><span
  lang=EN-US>Omer &amp; Noa</span><o:p></o:p></p>
  </td>
  <td width=208 valign=top style='width:155.85pt;border-top:none;border-left:none;
  padding:0cm 5.4pt 0cm 5.4pt'>
  <p class=MsoNormal style='margin-bottom:0cm;line-height:normal'><span
  lang=EN-US><o:p>&nbsp;</o:p></span></p>
  </td>
 </tr>
</table>
<!--EndFragment-->
</body>
</html>`;

const WORD: Clip = {
  data: {
    'text/html': WORD_HTML,
    'text/plain': 'Name\tRole in the team\r\nDana\tDesign\r\nResearch\r\nOmer & Noa\t\r\n',
  },
};

const text = (plain: string): Clip => ({ data: { 'text/plain': plain } });

const LETTERS = [
  ['a', 'b', 'c'],
  ['d', 'e', 'f'],
  ['g', 'h', 'i'],
];

/* ---------------------------------------------------------------- reading the slide */

const elements = async (page: Page): Promise<Element[]> => (await currentSlide(page)).elements;

/** The one element of the slide, which must be a table. */
async function onlyTable(page: Page): Promise<TableElement> {
  const all = await elements(page);
  expect(all.map((e) => e.type)).toEqual(['table']);
  return all[0] as TableElement;
}

const selectedIds = (page: Page) =>
  page.evaluate(() => window.slidr!.selection.getState().selectedElementIds);

/**
 * A picture that was taken from the clipboard would be on the slide by now: importing a file
 * takes a moment. No element is an image, and the deck has no asset.
 */
async function expectNoPicture(page: Page): Promise<void> {
  await page.waitForTimeout(400);
  expect((await elements(page)).filter((e) => e.type === 'image')).toEqual([]);
  expect(Object.keys((await deck(page)).assets)).toEqual([]);
}

/** A table that was just pasted is drawn as the model says: no row is taller than its row. */
async function expectFitted(page: Page, t: TableElement): Promise<void> {
  const drawn = await tableOnStage(page, t.id).evaluate(
    (root) => (root.querySelector('table') as HTMLElement).offsetHeight,
  );
  expect(Math.abs(drawn - t.frame.h)).toBeLessThan(1);
  expect(t.rows.reduce((a, b) => a + b, 0)).toBeCloseTo(t.frame.h, 1);
  expect(t.cols.reduce((a, b) => a + b, 0)).toBeCloseTo(t.frame.w, 1);
}

/* ---------------------------------------------------------------- a new table */

test('a range copied in Excel becomes a table, and the picture of it is not pasted', async ({
  page,
}) => {
  await openApp(page, { lang: 'en' });
  await stage(page).focus();
  const before = await steps(page);

  // The app took the paste.
  expect(await paste(page, excel(SALES))).toBe(false);
  await settled(page);
  const pasted = await onlyTable(page);
  expect(await texts(page, pasted.id)).toEqual(SALES);
  await expectNoPicture(page);
  // One undo step: the table, with its rows as tall as their text.
  expect(await steps(page)).toBe(before + 1);
  await expectFitted(page, pasted);
  // It is on the slide, selected as an object, and in the direction of the deck.
  expect(await selectedIds(page)).toEqual([pasted.id]);
  expect(await editingId(page)).toBeNull();
  expect(pasted.dir).toBe('ltr');
  expect(pasted.frame.x).toBeGreaterThanOrEqual(0);
  expect(pasted.frame.x + pasted.frame.w).toBeLessThanOrEqual(1920);
  // Nothing of the look of the sheet came along.
  for (const line of pasted.cells) {
    for (const c of line) expect(Object.keys(c)).toEqual(['content']);
  }
  await expect(stage(page).locator('[data-handle="se"]')).toBeVisible();
  await page.screenshot({ path: 'test-results/table/pasted-excel.png' });

  await undo(page);
  expect(await elements(page)).toEqual([]);
  expect(await steps(page)).toBe(before);
  await redo(page);
  expect((await onlyTable(page)).cells).toEqual(pasted.cells);
});

test('a right-to-left source table becomes a right-to-left table', async ({ page }) => {
  // In a deck that reads left to right: the direction is the source's.
  await openApp(page, { lang: 'en' });
  await stage(page).focus();
  await paste(page, excel(SALES, 'dir="rtl" '));
  await settled(page);
  const pasted = await onlyTable(page);
  expect(pasted.dir).toBe('rtl');
  expect(await texts(page, pasted.id)).toEqual(SALES);
  // The first column of the sheet is on the right.
  const first = (await cellOnStage(page, pasted.id, 0, 0).boundingBox())!;
  const last = (await cellOnStage(page, pasted.id, 0, 3).boundingBox())!;
  expect(first.x).toBeGreaterThan(last.x);
  await expectNoPicture(page);
  await page.screenshot({ path: 'test-results/table/pasted-excel-rtl.png' });
});

test('in a Hebrew deck a pasted table reads from the right', async ({ page }) => {
  await openApp(page);
  await stage(page).focus();
  await paste(page, excel(SALES));
  await settled(page);
  const pasted = await onlyTable(page);
  expect(pasted.dir).toBe('rtl');
  expect(await texts(page, pasted.id)).toEqual(SALES);
  await page.screenshot({ path: 'test-results/table/pasted-excel-hebrew.png' });
});

test('tab-separated text becomes a table', async ({ page }) => {
  await openApp(page, { lang: 'en' });
  await stage(page).focus();
  const before = await steps(page);
  // A quoted cell holds a line break and a quote, as Excel writes them.
  await paste(page, text('Name\tNote\r\nDana\t"two\nlines"\r\nOmer\t"said ""hi"""\r\n'));
  await settled(page);
  const pasted = await onlyTable(page);
  expect(await texts(page, pasted.id)).toEqual([
    ['Name', 'Note'],
    ['Dana', 'two\nlines'],
    ['Omer', 'said "hi"'],
  ]);
  expect(await steps(page)).toBe(before + 1);
  // The row of the cell with two lines is taller, and the model says so.
  expect(pasted.rows[1]).toBeGreaterThan(pasted.rows[0]! + 20);
  await expectFitted(page, pasted);
});

test('comma-separated text with quoted cells becomes a table', async ({ page }) => {
  await openApp(page, { lang: 'en' });
  await stage(page).focus();
  await paste(
    page,
    text('Name,Quote\r\n"Levi, Dana","She said ""hello"""\r\n"Cohen, Omer",none\r\n'),
  );
  await settled(page);
  expect(await texts(page, (await onlyTable(page)).id)).toEqual([
    ['Name', 'Quote'],
    ['Levi, Dana', 'She said "hello"'],
    ['Cohen, Omer', 'none'],
  ]);
});

test('semicolon-separated text keeps the commas of its numbers', async ({ page }) => {
  await openApp(page);
  await stage(page).focus();
  await paste(page, text('מוצר;מחיר;כמות\nתפוח;1,5;10\nאגס;2,25;4\n'));
  await settled(page);
  expect(await texts(page, (await onlyTable(page)).id)).toEqual([
    ['מוצר', 'מחיר', 'כמות'],
    ['תפוח', '1,5', '10'],
    ['אגס', '2,25', '4'],
  ]);
});

test('a table copied in Word becomes a table of its texts', async ({ page }) => {
  await openApp(page, { lang: 'en' });
  await stage(page).focus();
  const before = await steps(page);
  await paste(page, WORD);
  await settled(page);
  const pasted = await onlyTable(page);
  expect(await texts(page, pasted.id)).toEqual([
    ['Name', 'Role in the team'],
    // Two paragraphs of a cell are two lines of it.
    ['Dana', 'Design\nResearch'],
    // An empty cell of Word holds a non-breaking space: it is empty here.
    ['Omer & Noa', ''],
  ]);
  expect(await steps(page)).toBe(before + 1);
  await expectFitted(page, pasted);
  // Nothing of Word's markup is in the document: the texts are plain runs.
  for (const line of pasted.cells) {
    for (const c of line) {
      for (const paragraph of c.content.paragraphs) {
        for (const run of paragraph.runs) expect(Object.keys(run)).toEqual(['text']);
      }
    }
  }
});

test('a table copied on a web page keeps its merged cells', async ({ page }) => {
  await openApp(page, { lang: 'en' });
  await stage(page).focus();
  const before = await steps(page);
  await paste(page, {
    data: {
      'text/html':
        '<meta charset="utf-8"><table><thead><tr><th colspan="2">2026</th><th rowspan="2">Total</th></tr>' +
        '<tr><th>H1</th><th>H2</th></tr></thead>' +
        '<tbody><tr><td>10</td><td>20</td><td><b>30</b></td></tr></tbody></table>',
      'text/plain': '2026\t\tTotal\nH1\tH2\t\n10\t20\t30',
    },
  });
  await settled(page);
  const pasted = await onlyTable(page);
  expect(await texts(page, pasted.id)).toEqual([
    ['2026', '', 'Total'],
    ['H1', 'H2', ''],
    ['10', '20', '30'],
  ]);
  expect(pasted.cells[0]![0]).toMatchObject({ colSpan: 2 });
  expect(pasted.cells[0]![1]).toMatchObject({ merged: true });
  expect(pasted.cells[0]![2]).toMatchObject({ rowSpan: 2 });
  expect(pasted.cells[1]![2]).toMatchObject({ merged: true });
  await expect(tableOnStage(page, pasted.id).locator('td')).toHaveCount(7);
  // The table and its merged cells are one undo step.
  expect(await steps(page)).toBe(before + 1);
  await expectFitted(page, pasted);
});

test('a large range becomes a table with all of its rows', async ({ page }) => {
  await openApp(page, { lang: 'en' });
  await stage(page).focus();
  const grid = Array.from({ length: 24 }, (_, r) =>
    Array.from({ length: 6 }, (_, c) => (r === 0 ? `Column ${c + 1}` : `${r * 100 + c}`)),
  );
  const before = await steps(page);
  await paste(page, excel(grid));
  await settled(page);
  const pasted = await onlyTable(page);
  expect(await texts(page, pasted.id)).toEqual(grid);
  expect(await steps(page)).toBe(before + 1);
  await expectNoPicture(page);
  // The model says what is drawn, also when the rows did not fit the room they were given.
  await expectFitted(page, pasted);
  await page.screenshot({ path: 'test-results/table/pasted-large.png' });
});

test('prose with a comma does not become a table', async ({ page }) => {
  await openApp(page, { lang: 'en' });
  await stage(page).focus();
  await paste(page, text('Hello, world'));
  await settled(page);
  // It is a text box, as any text pasted on the slide is.
  const all = await elements(page);
  expect(all.map((e) => e.type)).toEqual(['text']);
});

test('one cell copied in Excel is text, not a table and not a picture', async ({ page }) => {
  await openApp(page, { lang: 'en' });
  await stage(page).focus();
  const before = await steps(page);
  expect(await paste(page, excel([['1,350']]))).toBe(false);
  await settled(page);
  await expectNoPicture(page);
  // A text box with the text of the cell, as plain text pasted on the slide becomes.
  const all = await elements(page);
  expect(all.map((e) => e.type)).toEqual(['text']);
  const box = all[0] as TextElement;
  expect(box.content.paragraphs.map((p) => p.runs.map((r) => r.text).join(''))).toEqual(['1,350']);
  expect(await selectedIds(page)).toEqual([box.id]);
  expect(await steps(page)).toBe(before + 1);
  await undo(page);
  expect(await elements(page)).toEqual([]);
});

/* ---------------------------------------------------------------- into a table */

test('a paste into a table selected as an object lands from its first cell, and the table grows', async ({
  page,
}) => {
  await openApp(page, { lang: 'en' });
  const id = await addTable(page, {
    texts: [
      ['a', 'b'],
      ['c', 'd'],
    ],
  });
  await selectTable(page, id);
  const start = await table(page);

  const after = await oneUndoStep(page, async () => {
    expect(await paste(page, excel(SALES))).toBe(false);
  });
  expect(await texts(page)).toEqual(SALES);
  expect(after.rows).toHaveLength(3);
  expect(after.cols).toHaveLength(4);
  // The table keeps its width and its place; a row was added under it.
  expect(after.frame).toEqual({ ...start.frame, h: after.frame.h });
  expect(after.frame.h).toBeGreaterThan(start.frame.h);
  await expectFitted(page, after);
  // Still the one element of the slide, still selected as an object.
  expect((await elements(page)).map((e) => e.id)).toEqual([id]);
  await expectNoPicture(page);
  expect(await selectedIds(page)).toEqual([id]);
  expect(await editingId(page)).toBeNull();
});

test('a paste inside a table lands from the selected cell', async ({ page }) => {
  await openApp(page, { lang: 'en' });
  const id = await addTable(page, { texts: LETTERS });
  await selectCell(page, id, 1, 1);
  const start = await table(page);

  const after = await oneUndoStep(page, async () => {
    await paste(
      page,
      excel([
        ['1', '2'],
        ['3', '4'],
      ]),
    );
  });
  expect(await texts(page)).toEqual([
    ['a', 'b', 'c'],
    ['d', '1', '2'],
    ['g', '3', '4'],
  ]);
  expect(after.frame).toEqual(start.frame);
  expect(after.rows).toEqual(start.rows);
  expect(after.cols).toEqual(start.cols);
  await expectNoPicture(page);
  // The pasted cells are the selected ones, and the keyboard is on them.
  expect(await editingId(page)).toBe(id);
  await expectSelection(page, id, [1, 1], [2, 2]);
  // An arrow moves from the cell the selection began at.
  await page.keyboard.press('ArrowUp');
  await expectSelection(page, id, [0, 1]);
});

test('a paste that reaches past the table adds the rows and the columns it needs', async ({
  page,
}) => {
  await openApp(page);
  const id = await addTable(page, { dir: 'rtl', texts: LETTERS });
  await selectCell(page, id, 2, 2);
  const start = await table(page);

  const after = await oneUndoStep(page, async () => {
    await paste(page, text('1\t2\r\n3\t4\r\n5\t6\r\n'));
  });
  expect(await texts(page)).toEqual([
    ['a', 'b', 'c', ''],
    ['d', 'e', 'f', ''],
    ['g', 'h', '1', '2'],
    ['', '', '3', '4'],
    ['', '', '5', '6'],
  ]);
  // The table is as wide as it was, with its right edge (where it starts) in place.
  expect(after.frame.w).toBe(start.frame.w);
  expect(after.frame.x).toBe(start.frame.x);
  expect(after.frame.y).toBe(start.frame.y);
  await expectFitted(page, after);
  await expectSelection(page, id, [2, 2], [4, 3]);
  await page.screenshot({ path: 'test-results/table/pasted-into-table.png' });
});

test('text that is no table, pasted into a selected cell, is the text of that cell', async ({
  page,
}) => {
  await openApp(page, { lang: 'en' });
  const id = await addTable(page, { texts: LETTERS });
  await selectCell(page, id, 1, 2);
  await oneUndoStep(page, async () => {
    expect(await paste(page, text('Hello world\r\n'))).toBe(false);
  });
  expect(await texts(page)).toEqual([
    ['a', 'b', 'c'],
    ['d', 'e', 'Hello world'],
    ['g', 'h', 'i'],
  ]);
  // No text box was made of it.
  expect((await elements(page)).map((e) => e.id)).toEqual([id]);
  await expectSelection(page, id, [1, 2]);
});

// One line with a comma is a sentence, not a row: as in Excel and Google Sheets, only a tab
// splits a single line.
test('a sentence with a comma, pasted into a selected cell, stays one cell', async ({ page }) => {
  await openApp(page, { lang: 'en' });
  const id = await addTable(page, { texts: LETTERS });
  await selectCell(page, id, 1, 2);
  await oneUndoStep(page, async () => {
    await paste(page, text('Hello, world'));
  });
  expect(await texts(page)).toEqual([
    ['a', 'b', 'c'],
    ['d', 'e', 'Hello, world'],
    ['g', 'h', 'i'],
  ]);
});

/* ---------------------------------------------------------------- while typing in a cell */

test('while a cell is typed in, one cell of text goes into its text at the caret', async ({
  page,
}) => {
  await openApp(page, { lang: 'en' });
  const id = await addTable(page, { texts: LETTERS });
  await typeInCell(page, id, 1, 1);
  await page.keyboard.press('End');
  await page.keyboard.type('-');
  const before = await steps(page);

  await paste(page, text('pasted, as text'));
  await expect.poll(async () => (await texts(page))[1]![1]).toBe('e-pasted, as text');
  // The editor is still open in the cell, and typing goes on after what was pasted.
  expect(await typingCell(page)).toBe('1,1');
  await page.keyboard.type('!');
  expect((await texts(page))[1]).toEqual(['d', 'e-pasted, as text!', 'f']);
  expect(await steps(page)).toBeGreaterThan(before);

  // One cell copied in Excel is text too, without its picture.
  await paste(page, excel([['1,350']]));
  await expect.poll(async () => (await texts(page))[1]![1]).toBe('e-pasted, as text!1,350');
  expect(await typingCell(page)).toBe('1,1');
  await expectNoPicture(page);
  expect((await elements(page)).map((e) => e.id)).toEqual([id]);
});

test('while a cell is typed in, a grid goes into the cells from that cell', async ({ page }) => {
  await openApp(page, { lang: 'en' });
  const id = await addTable(page, { texts: LETTERS });
  await typeInCell(page, id, 1, 1);
  await settled(page);

  const after = await oneUndoStep(page, async () => {
    expect(
      await paste(
        page,
        excel([
          ['1', '2'],
          ['3', '4'],
        ]),
      ),
    ).toBe(false);
  });
  expect(await texts(page)).toEqual([
    ['a', 'b', 'c'],
    ['d', '1', '2'],
    ['g', '3', '4'],
  ]);
  expect(after.rows).toHaveLength(3);
  await expectNoPicture(page);
  // The typing ended: the pasted cells are selected.
  expect(await typingCell(page)).toBeNull();
  expect(await editingId(page)).toBe(id);
  await expectSelection(page, id, [1, 1], [2, 2]);
});

/* ---------------------------------------------------------------- copy and cut */

test('the selected cells are copied as tab-separated text and as an HTML table', async ({
  page,
}) => {
  await openApp(page, { lang: 'en' });
  const id = await addTable(page, {
    texts: [
      ['a', 'b', 'x'],
      ['c', 'd', 'y'],
      ['p', 'q', 'z'],
    ],
  });
  await selectRange(page, id, [0, 0], [1, 1]);
  const before = await steps(page);

  const copied = await copy(page);
  expect(copied['text/plain']).toBe('a\tb\r\nc\td');
  expect(copied['text/html']).toBe(
    '<table dir="ltr"><tbody><tr><td>a</td><td>b</td></tr><tr><td>c</td><td>d</td></tr></tbody></table>',
  );
  // Cells are not an element of the slide.
  expect(copied).not.toHaveProperty('application/x-slidr+json');
  // A copy changes nothing.
  expect(await steps(page)).toBe(before);

  // What was copied is pasted back as cells, from another cell.
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expectSelection(page, id, [2, 0]);
  await oneUndoStep(page, async () => {
    await paste(page, { data: copied });
  });
  expect(await texts(page)).toEqual([
    ['a', 'b', 'x'],
    ['c', 'd', 'y'],
    ['a', 'b', 'z'],
    ['c', 'd', ''],
  ]);
});

test('cells with line breaks, tabs and markup are copied so that they come back as they were', async ({
  page,
}) => {
  await openApp(page);
  const grid = [
    ['שורה\nשנייה', '<b>5" & co</b>'],
    ['"מירכאות"', ''],
  ];
  // Tall enough for the cell with two lines: the selection is drawn where the model has the cells.
  const id = await addTable(page, {
    dir: 'rtl',
    texts: grid,
    frame: { x: 360, y: 240, w: 1200, h: 300 },
  });
  await selectRange(page, id, [0, 0], [1, 1]);
  const copied = await copy(page);
  // A cell with a line break or a quote is quoted, and its quotes doubled, as Excel reads them.
  expect(copied['text/plain']).toBe('"שורה\nשנייה"\t"<b>5"" & co</b>"\r\n"""מירכאות"""\t');
  expect(copied['text/html']).toBe(
    '<table dir="rtl"><tbody><tr><td>שורה<br>שנייה</td><td>&lt;b&gt;5&quot; &amp; co&lt;/b&gt;</td></tr>' +
      '<tr><td>&quot;מירכאות&quot;</td><td></td></tr></tbody></table>',
  );

  // Both forms read back to the same cells, on a slide of their own.
  for (const type of ['text/html', 'text/plain'] as const) {
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    expect(await selectedIds(page)).toEqual([]);
    await paste(page, { data: { [type]: copied[type]! } });
    await settled(page);
    const all = await elements(page);
    expect(all).toHaveLength(2);
    const pasted = all[1] as TableElement;
    expect(await texts(page, pasted.id), type).toEqual(grid);
    await undo(page);
  }
});

test('cut copies the selected cells and empties them, in one undo step', async ({ page }) => {
  await openApp(page, { lang: 'en' });
  const id = await addTable(page, { texts: LETTERS });
  await selectRange(page, id, [1, 1], [2, 2]);

  let cut: Record<string, string> = {};
  const after = await oneUndoStep(page, async () => {
    cut = await copy(page, 'cut');
  });
  expect(cut['text/plain']).toBe('e\tf\r\nh\ti');
  expect(cut['text/html']).toContain('<table');
  expect(await texts(page)).toEqual([
    ['a', 'b', 'c'],
    ['d', '', ''],
    ['g', '', ''],
  ]);
  // The cells are still there, and still selected.
  expect(after.rows).toHaveLength(3);
  expect(after.cols).toHaveLength(3);
  await expectSelection(page, id, [1, 1], [2, 2]);
});

test('a table selected as an object is copied as an element of the slide', async ({ page }) => {
  await openApp(page, { lang: 'en' });
  const id = await addTable(page, { texts: LETTERS });
  await selectTable(page, id);
  const copied = await copy(page);
  expect(Object.keys(copied)).toContain('application/x-slidr+json');
  const clip = JSON.parse(copied['application/x-slidr+json']!) as { kind: string };
  expect(clip.kind).toBe('elements');

  // Pasted back it is a second table, not cells of the first.
  await paste(page, { data: copied });
  await expect.poll(async () => (await elements(page)).length).toBe(2);
  const all = await elements(page);
  expect(all.map((e) => e.type)).toEqual(['table', 'table']);
  expect(await texts(page, all[1]!.id)).toEqual(LETTERS);
  expect(await texts(page)).toEqual(LETTERS);
});

test("while a cell is typed in, copy is the text editor's", async ({ page }) => {
  await openApp(page, { lang: 'en' });
  const id = await addTable(page, { texts: LETTERS });
  await typeInCell(page, id, 1, 1);
  await page.keyboard.press('Control+a');
  const copied = await copy(page);
  // The text of the cell, not a table of cells.
  expect(copied['text/plain']).toBe('e');
  expect(copied['text/html'] ?? '').not.toContain('<table');
});
