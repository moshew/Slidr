import { expect, test, type Page } from '@playwright/test';
import { coords, editor } from './editor-text-helpers';
import { fakeClipboard, menu, menuItem, menuLabels } from './format-helpers';
import { openApp, pageProblems } from './objects-helpers';
import { addTable, cellOnStage, table, typeInCell } from './table-helpers';
import {
  addText,
  caret,
  edit,
  editingId,
  oneUndoStep,
  para,
  paragraphs,
  plain,
  setSelection,
  steps,
} from './text-helpers';

/*
 * The app's own menu inside text that is being edited (STG-06; ADR-060 left the browser's menu
 * there): the clipboard, the link and the character tools, registered as parts of the Stage's
 * menu. Each item does what its key and its row B button do.
 */

const ID = 'e_menu';
const runs = async (page: Page) => (await paragraphs(page, ID))[0]?.runs;

/** A check item of the menu by its label. */
const check = (page: Page, name: string) =>
  menu(page)
    .getByRole('menuitemcheckbox')
    .filter({ has: page.getByText(name, { exact: true }) });

/** A right click in the text, at a position of the editor's document. */
async function rightClick(page: Page, pos: number): Promise<void> {
  const at = await coords(page, pos);
  await page.mouse.click(at.x, at.y, { button: 'right' });
  await expect(menu(page)).toBeVisible();
}

const TEXT_MENU = [
  'גזירה',
  'העתקה',
  'הדבקה',
  'הדבקה מיוחדת',
  'קישור…',
  'מודגש',
  'נטוי',
  'קו תחתון',
  'ניקוי עיצוב',
  'בחירת כל הטקסט',
];

test.afterEach(({ page }) => {
  expect(pageProblems(page)).toEqual([]);
});

test.beforeEach(async ({ page }) => {
  await openApp(page);
  // "Plain bold words": positions 1 to 17, "bold" at 7 to 11.
  await addText(page, ID, [
    {
      dir: 'auto',
      align: 'start',
      runs: [{ text: 'Plain ' }, { text: 'bold', marks: { weight: 700 } }, { text: ' words' }],
    },
  ]);
  await edit(page, ID);
});

test('a right click in text that is being edited opens the menu of the text, not of the element', async ({
  page,
}) => {
  await rightClick(page, 3);
  expect(await menuLabels(page)).toEqual(TEXT_MENU);
  // What would act on the text box itself is not in it, and the text is still being edited.
  await expect(menuItem(page, 'מחיקה')).toHaveCount(0);
  await expect(menuItem(page, 'סדר שכבות')).toHaveCount(0);
  expect(await editingId(page)).toBe(ID);
  // The caret went to where the click was.
  expect(await caret(page)).toMatchObject({ from: 3, to: 3 });

  await page.keyboard.press('Escape');
  await expect(menu(page)).toHaveCount(0);
  await expect(editor(page)).toBeFocused();
  expect(await editingId(page)).toBe(ID);
});

test("cut and copy need a selection; with one they are the editor's own copy and cut", async ({
  page,
}) => {
  await fakeClipboard(page, null);
  await rightClick(page, 3);
  await expect(menuItem(page, 'גזירה')).toBeDisabled();
  await expect(menuItem(page, 'העתקה')).toBeDisabled();
  await page.keyboard.press('Escape');

  await setSelection(page, 7, 11);
  // Inside what is selected: the selection stays.
  await rightClick(page, 9);
  expect(await caret(page)).toMatchObject({ from: 7, to: 11 });
  await menuItem(page, 'העתקה').click();
  await expect.poll(() => page.evaluate(() => window.__copied?.['text/plain'])).toBe('bold');
  const copied = await page.evaluate(() => window.__copied!);
  expect(JSON.parse(copied['application/x-slidr-richtext+json']!)).toEqual({
    paragraphs: [para('', { runs: [{ text: 'bold', marks: { weight: 700 } }] })],
  });
  expect(await plain(page, ID)).toBe('Plain bold words');

  const after = await oneUndoStep(page, ID, async () => {
    await rightClick(page, 9);
    await menuItem(page, 'גזירה').click();
    await expect.poll(() => plain(page, ID)).toBe('Plain  words');
  });
  expect(after.content?.paragraphs[0]?.runs).toEqual([{ text: 'Plain  words' }]);
});

test('bold, italic and underline show the state of the selection and change it', async ({
  page,
}) => {
  await setSelection(page, 7, 11);
  await rightClick(page, 9);
  await expect(check(page, 'מודגש')).toHaveAttribute('aria-checked', 'true');
  await expect(check(page, 'נטוי')).toHaveAttribute('aria-checked', 'false');
  const before = await steps(page);
  await check(page, 'נטוי').click();
  await expect(menu(page)).toHaveCount(0);
  expect(await steps(page)).toBe(before + 1);
  expect(await runs(page)).toEqual([
    { text: 'Plain ' },
    { text: 'bold', marks: { weight: 700, italic: true } },
    { text: ' words' },
  ]);
  // The text has the keyboard and its selection again.
  await expect(editor(page)).toBeFocused();
  expect(await caret(page)).toMatchObject({ from: 7, to: 11 });

  await rightClick(page, 9);
  await check(page, 'מודגש').click();
  expect((await runs(page))?.[1]).toEqual({ text: 'bold', marks: { italic: true } });
  await rightClick(page, 9);
  await check(page, 'קו תחתון').click();
  expect((await runs(page))?.[1]).toEqual({
    text: 'bold',
    marks: { italic: true, underline: true },
  });

  await rightClick(page, 9);
  await menuItem(page, 'ניקוי עיצוב').click();
  expect(await runs(page)).toEqual([{ text: 'Plain bold words' }]);
});

test('"select all" selects the text, and "link" opens the link tool on the word that was clicked', async ({
  page,
}) => {
  await rightClick(page, 3);
  await menuItem(page, 'בחירת כל הטקסט').click();
  await expect.poll(() => caret(page)).toMatchObject({ from: 1, to: 17 });
  await expect(editor(page)).toBeFocused();

  // A click on "words", outside what is selected, puts the caret there.
  await setSelection(page, 2);
  await rightClick(page, 14);
  await menuItem(page, 'קישור…').click();
  const address = page.getByRole('textbox', { name: 'כתובת' });
  await expect(address).toBeFocused();
  await page.keyboard.type('slidr.dev');
  await page.keyboard.press('Enter');
  expect((await runs(page))?.at(-1)).toEqual({
    text: 'words',
    marks: { link: 'https://slidr.dev', underline: true },
  });
  // From inside the link the item edits it.
  await rightClick(page, 14);
  await expect(menuItem(page, 'עריכת הקישור…')).toBeVisible();
});

test('the menu key opens it where the caret is', async ({ page }) => {
  await setSelection(page, 7, 11);
  await page.keyboard.press('Shift+F10');
  await expect(menu(page)).toBeVisible();
  expect(await menuLabels(page)).toEqual(TEXT_MENU);
  expect(await caret(page)).toMatchObject({ from: 7, to: 11 });
  await page.keyboard.press('Escape');
  await expect(editor(page)).toBeFocused();
});

test("a right click beside the text ends the editing, and the menu is the slide's as before", async ({
  page,
}) => {
  const frame = (await page.getByTestId('stage-frame').boundingBox())!;
  await page.mouse.click(frame.x + frame.width - 30, frame.y + frame.height - 30, {
    button: 'right',
  });
  await expect(menu(page)).toBeVisible();
  expect(await editingId(page)).toBeNull();
  expect(await menuLabels(page)).toEqual(['הדבקה', 'בחירת הכול', 'הדבקת טקסט']);
});

test('the text of a table cell that is typed in has the same menu, and its link', async ({
  page,
}) => {
  await page.keyboard.press('Escape');
  await addTable(page, {
    texts: [
      ['Name', 'City'],
      ['Dana Levi', 'Haifa'],
    ],
  });
  await typeInCell(page, 'e_table', 1, 0);
  const inCell = cellOnStage(page, 'e_table', 1, 0).locator('[data-text-editor]');
  const word = await inCell.evaluate((dom) => {
    const { view } = (dom as unknown as { editor: { view: { coordsAtPos(pos: number): DOMRect } } })
      .editor;
    const box = view.coordsAtPos(7);
    return { x: box.left, y: (box.top + box.bottom) / 2 };
  });
  await page.mouse.click(word.x, word.y, { button: 'right' });
  await expect(menu(page)).toBeVisible();
  // The text's menu, and not the menu of the cells (rows and columns).
  expect(await menuLabels(page)).toEqual(TEXT_MENU);

  await menuItem(page, 'קישור…').click();
  await expect(page.getByRole('textbox', { name: 'כתובת' })).toBeFocused();
  await page.keyboard.type('example.com');
  await page.keyboard.press('Enter');
  const cell = (await table(page)).cells[1]?.[0];
  // The word the click was on: "Levi".
  expect(cell?.content.paragraphs[0]?.runs).toEqual([
    { text: 'Dana ' },
    { text: 'Levi', marks: { link: 'https://example.com', underline: true } },
  ]);
});
