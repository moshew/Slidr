// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from 'vitest';
import { clipboardGrid, gridFromHtml, gridFromText, gridToClipboard } from './paste';

// In a browser a parsed clipboard document is inert: it has no window, so it loads nothing and
// runs nothing. happy-dom would run and fetch its scripts; that is switched off here, as in
// ../text/paste.test.ts.
beforeAll(() => {
  const settings = (window as unknown as { happyDOM?: { settings: Record<string, unknown> } })
    .happyDOM?.settings;
  if (!settings) return;
  settings.disableJavaScriptFileLoading = true;
  settings.disableJavaScriptEvaluation = true;
  settings.disableCSSFileLoading = true;
});

// The fixtures are written by hand in the shape these programs put on the clipboard: the wrapper,
// the style block, the fragment comments and the attributes without quotes. They are not captures.

/** Excel: a sheet set right-to-left, a merged title, a line break in a cell, numbers. */
const EXCEL = `<html xmlns:v="urn:schemas-microsoft-com:vml"
xmlns:o="urn:schemas-microsoft-com:office:office"
xmlns:x="urn:schemas-microsoft-com:office:excel"
xmlns="http://www.w3.org/TR/REC-html40">

<head>
<meta http-equiv=Content-Type content="text/html; charset=utf-8">
<meta name=ProgId content=Excel.Sheet>
<meta name=Generator content="Microsoft Excel 15">
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
  font-family:Calibri, sans-serif;
  text-align:general;
  vertical-align:bottom;
  white-space:nowrap;}
.xl65
  {font-weight:700;
  text-align:center;}
.xl66
  {mso-number-format:"\\#\\,\\#\\#0\\.00";}
-->
</style>
</head>

<body link="#0563C1" vlink="#954F72">

<table border=0 cellpadding=0 cellspacing=0 width=261 dir=RTL style='border-collapse:
 collapse;width:196pt'>
<!--StartFragment-->
 <col width=87 span=3 style='width:65pt'>
 <tr height=19 style='height:14.4pt'>
  <td colspan=2 height=19 class=xl65 width=174 style='height:14.4pt;width:130pt'>דוח
  מכירות רבעוני</td>
  <td align=right width=87 style='width:65pt' x:num>2026</td>
 </tr>
 <tr height=19 style='height:14.4pt'>
  <td height=19 style='height:14.4pt'>מוצר</td>
  <td>כמות</td>
  <td>הכנסות</td>
 </tr>
 <tr height=38 style='height:28.8pt'>
  <td height=38 width=87 style='height:28.8pt;width:65pt'>תפוחים<br>
    אדומים</td>
  <td align=right x:num>120</td>
  <td class=xl66 align=right x:num="1234.5">1,234.50</td>
 </tr>
 <tr height=19 style='height:14.4pt'>
  <td height=19 style='height:14.4pt'>אגסים</td>
  <td align=right x:num>80</td>
  <td>&nbsp;</td>
 </tr>
<!--EndFragment-->
</table>

</body>

</html>`;

/** Word: paragraphs inside the cells, a cell merged down, an empty paragraph after the table. */
const WORD = `<html xmlns:o="urn:schemas-microsoft-com:office:office"
xmlns:w="urn:schemas-microsoft-com:office:word"
xmlns="http://www.w3.org/TR/REC-html40">

<head>
<meta http-equiv=Content-Type content="text/html; charset=utf-8">
<meta name=Generator content="Microsoft Word 15">
<style>
<!--
 p.MsoNormal, li.MsoNormal, div.MsoNormal
  {margin:0cm;
  font-size:11.0pt;
  font-family:"Calibri",sans-serif;}
 table.MsoTableGrid
  {border:solid windowtext 1.0pt;}
-->
</style>
</head>

<body lang=EN-US style='tab-interval:36.0pt;word-wrap:break-word'>
<!--StartFragment-->

<div align=right dir=rtl>

<table class=MsoTableGrid dir=rtl border=1 cellspacing=0 cellpadding=0
 style='border-collapse:collapse;border:none'>
 <tr>
  <td width=208 valign=top style='width:155.8pt;border:solid windowtext 1.0pt;
  padding:0cm 5.4pt 0cm 5.4pt'>
  <p class=MsoNormal dir=RTL style='text-align:right;direction:rtl;unicode-bidi:
  embed'><b><span lang=HE style='font-family:"Arial",sans-serif'>שלב</span></b><span
  dir=LTR><o:p></o:p></span></p>
  </td>
  <td width=208 valign=top style='width:155.8pt;border:solid windowtext 1.0pt;
  border-right:none;padding:0cm 5.4pt 0cm 5.4pt'>
  <p class=MsoNormal dir=RTL style='text-align:right;direction:rtl;unicode-bidi:
  embed'><b><span lang=HE style='font-family:"Arial",sans-serif'>אחראי</span></b><span
  dir=LTR><o:p></o:p></span></p>
  </td>
 </tr>
 <tr>
  <td width=208 rowspan=2 valign=top style='width:155.8pt;border:solid windowtext 1.0pt;
  border-top:none;padding:0cm 5.4pt 0cm 5.4pt'>
  <p class=MsoNormal dir=RTL style='text-align:right;direction:rtl;unicode-bidi:
  embed'><span lang=HE style='font-family:"Arial",sans-serif'>תכנון</span><span
  dir=LTR><o:p></o:p></span></p>
  <p class=MsoNormal dir=RTL style='text-align:right;direction:rtl;unicode-bidi:
  embed'><span lang=HE style='font-family:"Arial",sans-serif'>ואפיון של
  המערכת</span><span dir=LTR><o:p></o:p></span></p>
  </td>
  <td width=208 valign=top style='width:155.8pt;padding:0cm 5.4pt 0cm 5.4pt'>
  <p class=MsoNormal dir=RTL style='text-align:right;direction:rtl;unicode-bidi:
  embed'><span lang=HE style='font-family:"Arial",sans-serif'>דנה</span><span
  dir=LTR><o:p></o:p></span></p>
  </td>
 </tr>
 <tr>
  <td width=208 valign=top style='width:155.8pt;padding:0cm 5.4pt 0cm 5.4pt'>
  <p class=MsoNormal dir=RTL style='text-align:right;direction:rtl;unicode-bidi:
  embed'><span lang=HE style='font-family:"Arial",sans-serif'>יואב</span><span
  dir=LTR> (QA)<o:p></o:p></span></p>
  <p class=MsoNormal dir=RTL style='text-align:right;direction:rtl;unicode-bidi:
  embed'><span dir=LTR><o:p>&nbsp;</o:p></span></p>
  </td>
 </tr>
</table>

</div>

<p class=MsoNormal><o:p>&nbsp;</o:p></p>

<!--EndFragment-->
</body>

</html>`;

/** Google Sheets: its own wrapper element, a style block, data attributes with quoted JSON. */
const SHEETS =
  `<meta charset='utf-8'><google-sheets-html-origin><style type="text/css"><!--td {border: 1px solid #cccccc;}br {mso-data-placement:same-cell;}--></style>` +
  `<table xmlns="http://www.w3.org/1999/xhtml" cellspacing="0" cellpadding="0" dir="ltr" border="1" style="table-layout:fixed;font-size:10pt;font-family:Arial;width:0px;border-collapse:collapse;border:none" data-sheets-root="1" data-sheets-baot="1">` +
  `<colgroup><col width="100"/><col width="100"/><col width="100"/></colgroup><tbody>` +
  `<tr style="height:21px;"><td style="overflow:hidden;padding:2px 3px 2px 3px;vertical-align:bottom;font-weight:bold;" data-sheets-value="{&quot;1&quot;:2,&quot;2&quot;:&quot;City&quot;}">City</td>` +
  `<td style="overflow:hidden;padding:2px 3px 2px 3px;vertical-align:bottom;font-weight:bold;" data-sheets-value="{&quot;1&quot;:2,&quot;2&quot;:&quot;Population&quot;}">Population</td>` +
  `<td style="overflow:hidden;padding:2px 3px 2px 3px;vertical-align:bottom;font-weight:bold;" data-sheets-value="{&quot;1&quot;:2,&quot;2&quot;:&quot;Note&quot;}">Note</td></tr>` +
  `<tr style="height:21px;"><td style="overflow:hidden;padding:2px 3px 2px 3px;vertical-align:bottom;" data-sheets-value="{&quot;1&quot;:2,&quot;2&quot;:&quot;תל אביב&quot;}">תל אביב</td>` +
  `<td style="overflow:hidden;padding:2px 3px 2px 3px;vertical-align:bottom;text-align:right;" data-sheets-value="{&quot;1&quot;:3,&quot;3&quot;:474530}" data-sheets-numberformat="{&quot;1&quot;:2,&quot;2&quot;:&quot;#,##0&quot;,&quot;3&quot;:1}">474,530</td>` +
  `<td style="overflow:hidden;padding:2px 3px 2px 3px;vertical-align:bottom;" data-sheets-value="{&quot;1&quot;:2,&quot;2&quot;:&quot;first line\\nsecond line&quot;}">first line<br/>second line</td></tr>` +
  `<tr style="height:21px;"><td style="overflow:hidden;padding:2px 3px 2px 3px;vertical-align:bottom;" rowspan="1" colspan="2" data-sheets-value="{&quot;1&quot;:2,&quot;2&quot;:&quot;Total &amp; average&quot;}">Total &amp; average</td>` +
  `<td style="overflow:hidden;padding:2px 3px 2px 3px;vertical-align:bottom;"></td></tr>` +
  `</tbody></table></google-sheets-html-origin>`;

describe('a table in clipboard HTML', () => {
  it('reads what Excel copies', () => {
    expect(gridFromHtml(EXCEL)).toEqual({
      cells: [
        ['דוח מכירות רבעוני', '', '2026'],
        ['מוצר', 'כמות', 'הכנסות'],
        ['תפוחים\nאדומים', '120', '1,234.50'],
        ['אגסים', '80', ''],
      ],
      merges: [{ row0: 0, col0: 0, row1: 0, col1: 1 }],
      dir: 'rtl',
      source: 'html',
    });
    // The style block and the fragment comments are not text.
    expect(JSON.stringify(gridFromHtml(EXCEL))).not.toMatch(/mso|Fragment|xl65|<|>/);
  });

  it('reads what Word copies: paragraphs in cells, and a cell merged down', () => {
    expect(gridFromHtml(WORD)).toEqual({
      cells: [
        ['שלב', 'אחראי'],
        ['תכנון\nואפיון של המערכת', 'דנה'],
        ['', 'יואב (QA)'],
      ],
      merges: [{ row0: 1, col0: 0, row1: 2, col1: 0 }],
      dir: 'rtl',
      source: 'html',
    });
  });

  it('reads what Google Sheets copies', () => {
    expect(gridFromHtml(SHEETS)).toEqual({
      cells: [
        ['City', 'Population', 'Note'],
        ['תל אביב', '474,530', 'first line\nsecond line'],
        ['Total & average', '', ''],
      ],
      merges: [{ row0: 2, col0: 0, row1: 2, col1: 1 }],
      dir: 'ltr',
      source: 'html',
    });
  });

  it('takes the rows of the head, the body and the foot, and pads short rows', () => {
    const grid = gridFromHtml(
      `<p>Before</p>
       <table>
         <caption>Fruit</caption>
         <thead><tr><th>Name</th><th>Qty</th><th>Price</th></tr></thead>
         <tbody><tr><td>Apples</td><td>3</td></tr></tbody>
         <tfoot><tr><td>Total</td></tr></tfoot>
       </table>
       <table><tr><td>second table</td></tr></table>`,
    );
    expect(grid?.cells).toEqual([
      ['Name', 'Qty', 'Price'],
      ['Apples', '3', ''],
      ['Total', '', ''],
    ]);
    expect(grid?.merges).toEqual([]);
    // No direction is declared anywhere.
    expect(grid).not.toHaveProperty('dir');
  });

  it('places cells around the spans of the rows above', () => {
    const grid = gridFromHtml(
      `<table>
         <tr><td rowspan="2" colspan="2">A</td><td>b</td></tr>
         <tr><td>c</td></tr>
         <tr><td>d</td><td rowspan="9">e</td><td>f</td></tr>
       </table>`,
    );
    expect(grid?.cells).toEqual([
      ['A', '', 'b'],
      ['', '', 'c'],
      ['d', 'e', 'f'],
    ]);
    // A span past the last row ends with the table, and a span of one cell is no merge.
    expect(grid?.merges).toEqual([{ row0: 0, col0: 0, row1: 1, col1: 1 }]);
  });

  it('keeps merges apart when the markup asks for spans that overlap', () => {
    const grid = gridFromHtml(
      `<table>
         <tr><td>a</td><td rowspan="2">B</td><td>c</td></tr>
         <tr><td colspan="3">D</td></tr>
       </table>`,
    );
    expect(grid?.cells).toEqual([
      ['a', 'B', 'c'],
      ['D', '', ''],
    ]);
    expect(grid?.merges).toEqual([{ row0: 0, col0: 1, row1: 1, col1: 1 }]);
  });

  it('makes lines of line breaks and blocks, and one space of any other white space', () => {
    const cell = (inner: string) => gridFromHtml(`<table><tr><td>${inner}</td></tr></table>`);
    expect(cell('  one\n     two\t three  ')?.cells).toEqual([['one two three']]);
    expect(cell('a<br>b<br/>c')?.cells).toEqual([['a\nb\nc']]);
    expect(cell('<p>a</p><p>b</p><div>c</div>')?.cells).toEqual([['a\nb\nc']]);
    expect(cell('<ul><li>one</li><li>two</li></ul>')?.cells).toEqual([['one\ntwo']]);
    expect(cell('a <b>bold</b> and <span>plain</span>')?.cells).toEqual([['a bold and plain']]);
    // An empty line between lines stays; at the edges it goes.
    expect(cell('<br>a<br><br>b<br>')?.cells).toEqual([['a\n\nb']]);
    expect(cell('<p><br></p><p>a</p><p>&nbsp;</p><p>b</p><p></p>')?.cells).toEqual([['a\n\nb']]);
    expect(cell('&nbsp;')?.cells).toEqual([['']]);
    expect(cell('a&nbsp;&nbsp;b')?.cells).toEqual([['a b']]);
  });

  it('gives a grid for a single cell, and nothing without a table', () => {
    expect(gridFromHtml('<table><tr><td>only</td></tr></table>')).toEqual({
      cells: [['only']],
      merges: [],
      source: 'html',
    });
    expect(gridFromHtml('<p>Some <b>text</b></p>')).toBeUndefined();
    expect(gridFromHtml('')).toBeUndefined();
    expect(gridFromHtml('<table></table>')).toBeUndefined();
    expect(gridFromHtml('<table><tr></tr></table>')).toBeUndefined();
  });

  it('keeps the rows of a table inside a cell out of the grid', () => {
    const grid = gridFromHtml(
      `<table>
         <tr><td>outer<table><tr><td>in</td><td>ner</td></tr><tr><td>more</td></tr></table></td><td>b</td></tr>
         <tr><td>c</td><td>d</td></tr>
       </table>`,
    );
    expect(grid?.cells).toEqual([
      ['outer\nin ner\nmore', 'b'],
      ['c', 'd'],
    ]);
  });

  it('reads the direction from the attribute or from CSS, on the table or around it', () => {
    const table = '<tr><td>a</td></tr></table>';
    expect(gridFromHtml(`<table dir="rtl">${table}`)?.dir).toBe('rtl');
    expect(gridFromHtml(`<table dir=LTR>${table}`)?.dir).toBe('ltr');
    expect(gridFromHtml(`<table style="width: 10px; direction: rtl">${table}`)?.dir).toBe('rtl');
    // CSS wins over the attribute, as in a browser.
    expect(gridFromHtml(`<table dir="rtl" style="direction:ltr">${table}`)?.dir).toBe('ltr');
    expect(gridFromHtml(`<div dir="rtl"><table>${table}</div>`)?.dir).toBe('rtl');
    expect(gridFromHtml(`<table dir="auto">${table}`)?.dir).toBeUndefined();
    // The direction of a cell is not the table's.
    expect(gridFromHtml('<table><tr><td dir="rtl">a</td></tr></table>')?.dir).toBeUndefined();
  });

  it('runs nothing that a pasted table carries, and leaves no markup in the text', async () => {
    const flags = window as unknown as Record<string, unknown>;
    delete flags.__tablePaste;
    const grid = gridFromHtml(
      `<table onclick="window.__tablePaste = 'click'">
         <tr>
           <td>before<script>window.__tablePaste = 'script'</script>after</td>
           <td><img src="x" onerror="window.__tablePaste = 'img'">picture</td>
         </tr>
         <tr>
           <td onmouseover="window.__tablePaste = 'over'"><a href="javascript:window.__tablePaste = 'link'">link</a><style>td { color: red }</style></td>
           <td><svg onload="window.__tablePaste = 'svg'"><text>drawn</text></svg><template><p>kept out</p></template>end</td>
         </tr>
       </table>`,
    );
    // Time for anything that would run later (an image's error handler) to run.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(flags.__tablePaste).toBeUndefined();
    expect(grid?.cells).toEqual([
      ['beforeafter', 'picture'],
      ['link', 'end'],
    ]);
    expect(JSON.stringify(grid)).not.toMatch(/__tablePaste|script|onerror|javascript|color|<|>/);
  });
});

describe('a table in clipboard text', () => {
  it('reads the TSV Excel puts on the clipboard', () => {
    expect(gridFromText('שם\tכמות\tמחיר\r\nתפוחים\t3\t4.5\r\nאגסים\t12\t\r\n')).toEqual({
      cells: [
        ['שם', 'כמות', 'מחיר'],
        ['תפוחים', '3', '4.5'],
        ['אגסים', '12', ''],
      ],
      merges: [],
      source: 'tsv',
    });
    // One row is a table too, and any kind of line break ends a row.
    expect(gridFromText('a\tb')?.cells).toEqual([['a', 'b']]);
    expect(gridFromText('a\tb\rc\td\ne\tf')?.cells).toEqual([
      ['a', 'b'],
      ['c', 'd'],
      ['e', 'f'],
    ]);
  });

  it('reads quoted cells with line breaks, tabs and quotes inside', () => {
    const text = 'Name\tNote\r\nApples\t"red\nand ""sweet"""\r\nPears\t"a\tb"\r\n"x"\t""\r\n';
    expect(gridFromText(text)?.cells).toEqual([
      ['Name', 'Note'],
      ['Apples', 'red\nand "sweet"'],
      ['Pears', 'a\tb'],
      ['x', ''],
    ]);
  });

  it('takes a quote that opens no quoted cell as text', () => {
    expect(gridFromText('5" pipe\t3\n"unclosed\t4\n"half" open\t5')?.cells).toEqual([
      ['5" pipe', '3'],
      ['"unclosed', '4'],
      ['"half" open', '5'],
    ]);
  });

  it('pads short rows, keeps an empty line between rows, and drops those at the end', () => {
    expect(gridFromText('a\tb\tc\n\nd\n\n\n')?.cells).toEqual([
      ['a', 'b', 'c'],
      ['', '', ''],
      ['d', '', ''],
    ]);
    // A row of empty cells is a row.
    expect(gridFromText('a\tb\n\t\n')?.cells).toEqual([
      ['a', 'b'],
      ['', ''],
    ]);
    expect(gridFromText(`${String.fromCodePoint(0xfeff)}a\tb`)?.cells).toEqual([['a', 'b']]);
  });

  it('reads CSV with quotes', () => {
    const text = 'Name,Qty,Note\n"Apples, red",3,"He said ""hi"""\r\nPears,12,"two\nlines"\n';
    expect(gridFromText(text)).toEqual({
      cells: [
        ['Name', 'Qty', 'Note'],
        ['Apples, red', '3', 'He said "hi"'],
        ['Pears', '12', 'two\nlines'],
      ],
      merges: [],
      source: 'csv',
    });
    // Empty lines are not rows.
    expect(gridFromText('a,b\n\nc,d\n\n')?.cells).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('reads CSV with semicolons, where a comma is part of a number', () => {
    expect(gridFromText('שם;מחיר\nתפוח;1,5\nאגס;"2,25; בערך"')).toEqual({
      cells: [
        ['שם', 'מחיר'],
        ['תפוח', '1,5'],
        ['אגס', '2,25; בערך'],
      ],
      merges: [],
      source: 'csv',
    });
  });

  it('does not take ordinary prose for a table', () => {
    expect(gridFromText('Hello, world')).toBeUndefined();
    expect(gridFromText('Hello, world\n')).toBeUndefined();
    // Two lines with different numbers of commas.
    expect(gridFromText('Hello, world\nThis is a second line.')).toBeUndefined();
    expect(gridFromText('First, second, third\nOnly, two')).toBeUndefined();
    expect(gridFromText('שלום, מה נשמע?\nהכול טוב; תודה, באמת, כן.')).toBeUndefined();
    expect(gridFromText('just a line')).toBeUndefined();
    expect(gridFromText('two\nlines')).toBeUndefined();
    expect(gridFromText('')).toBeUndefined();
    expect(gridFromText('\n\n')).toBeUndefined();
    // The limit of the rule: lines with the same number of commas are CSV, whatever they say.
    expect(gridFromText('Dear all, welcome\nBest regards, Dana')?.source).toBe('csv');
  });

  it('takes one delimited line when forced, and still nothing without a delimiter', () => {
    // Fields are taken as they are (RFC 4180): the space after the comma is part of the cell.
    expect(gridFromText('Hello, world', { force: true })?.cells).toEqual([['Hello', ' world']]);
    expect(gridFromText('a;b;c', { force: true })).toEqual({
      cells: [['a', 'b', 'c']],
      merges: [],
      source: 'csv',
    });
    expect(gridFromText('just a line', { force: true })).toBeUndefined();
    expect(gridFromText('a,b\nc', { force: true })).toBeUndefined();
  });
});

describe('what a paste holds as a table', () => {
  it('prefers the HTML table to the text', () => {
    const html = '<table><tr><td>from</td><td>html</td></tr></table>';
    expect(clipboardGrid({ html, text: 'from\ttext' })).toMatchObject({
      cells: [['from', 'html']],
      source: 'html',
    });
  });

  it('falls back to the text when the HTML has no table', () => {
    expect(clipboardGrid({ html: '<p>a b</p>', text: 'a\tb' })).toMatchObject({
      cells: [['a', 'b']],
      source: 'tsv',
    });
    expect(clipboardGrid({ text: 'a,b\nc,d' })?.source).toBe('csv');
  });

  it('passes `force` on to the text, and gives nothing for a paste that is not a table', () => {
    expect(clipboardGrid({ text: 'a,b' })).toBeUndefined();
    expect(clipboardGrid({ text: 'a,b' }, { force: true })?.cells).toEqual([['a', 'b']]);
    expect(clipboardGrid({ html: '<p>Hello, world</p>', text: 'Hello, world' })).toBeUndefined();
    expect(clipboardGrid({})).toBeUndefined();
    expect(clipboardGrid({ html: '', text: '' })).toBeUndefined();
  });
});

describe('copying cells out', () => {
  const cells = [
    ['שם', 'הערה'],
    ['תפוח "גרני"', 'שורה 1\nשורה 2'],
    ['<b>1 & 2</b>', ''],
  ];

  it('writes TSV with the cells that need it quoted', () => {
    const { text } = gridToClipboard(
      [
        ['a', 'b c'],
        ['tab\there', 'say "hi"'],
        ['two\nlines', ''],
      ],
      'ltr',
    );
    expect(text).toBe('a\tb c\r\n"tab\there"\t"say ""hi"""\r\n"two\nlines"\t');
  });

  it('writes an HTML table with the text escaped and the direction on it', () => {
    const { html } = gridToClipboard(
      [
        ['a < b', 'x & "y"'],
        ['two\nlines', ''],
      ],
      'rtl',
    );
    expect(html).toBe(
      '<table dir="rtl"><tbody>' +
        '<tr><td>a &lt; b</td><td>x &amp; &quot;y&quot;</td></tr>' +
        '<tr><td>two<br>lines</td><td></td></tr>' +
        '</tbody></table>',
    );
  });

  it('comes back the same through the text', () => {
    const { text } = gridToClipboard(cells, 'rtl');
    expect(gridFromText(text)).toEqual({ cells, merges: [], source: 'tsv' });
    // Also cells with tabs in them, which only the quoted text can carry.
    const tabbed = [
      ['a\tb', 'c'],
      ['d', 'e\r\nf'],
    ];
    expect(gridFromText(gridToClipboard(tabbed, 'ltr').text)?.cells).toEqual(tabbed);
  });

  it('comes back the same through the HTML, with its direction', () => {
    const { html } = gridToClipboard(cells, 'rtl');
    expect(gridFromHtml(html)).toEqual({ cells, merges: [], dir: 'rtl', source: 'html' });
    expect(gridFromHtml(gridToClipboard(cells, 'ltr').html)?.dir).toBe('ltr');
    // What is pasted back is what a paste prefers.
    expect(clipboardGrid(gridToClipboard(cells, 'rtl'))?.source).toBe('html');
  });
});
