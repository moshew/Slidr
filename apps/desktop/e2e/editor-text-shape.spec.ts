import { expect, test, type Page } from '@playwright/test';
import { addShape, editor, open, pressOnHebrewLayout, row, tool } from './editor-text-helpers';
import {
  addText,
  caret,
  editingId,
  element,
  para,
  paragraphs,
  plain,
  select,
  steps,
} from './text-helpers';

/*
 * Text inside a shape, and starting to type (SHP-04), in the app: a character typed on a selected
 * shape or text box starts editing with it, text in a shape starts centred, and the row of a
 * selected shape has a way into its text.
 */

test.describe.configure({ timeout: 120_000 });

const SHAPE = 'e_shape';
const TEXT = 'e_text';

const texts = (page: Page) =>
  page.evaluate(() =>
    window.slidr!.bus.deck.slides[0]!.elements.filter((e) => e.type === 'text').map((e) => e.id),
  );

test.beforeEach(async ({ page }) => {
  await open(page);
  await addShape(page, SHAPE);
  await addText(
    page,
    TEXT,
    [
      {
        dir: 'auto',
        align: 'start',
        runs: [{ text: 'plain ' }, { text: 'bold', marks: { weight: 700 } }],
      },
    ],
    { frame: { x: 160, y: 120, w: 1600, h: 200 } },
  );
});

test('a character typed on a selected shape starts its text, centred, as one burst of typing', async ({
  page,
}) => {
  await select(page, SHAPE);
  await expect(row(page)).toHaveAttribute('data-selection', 'shape');
  const before = await steps(page);
  // On a Hebrew layout: the A key types shin.
  await pressOnHebrewLayout(page, 'KeyA', 'ש');
  await expect(editor(page)).toBeFocused();
  expect(await editingId(page)).toBe(SHAPE);
  await expect(row(page)).toHaveAttribute('data-selection', 'text');
  await page.keyboard.type('לום');
  expect(await paragraphs(page, SHAPE)).toEqual([
    { dir: 'auto', align: 'center', runs: [{ text: 'שלום' }] },
  ]);
  // The character that opened the editor and the ones after it are one undo step.
  expect(await steps(page)).toBe(before + 1);
  // In the middle of the shape, both ways.
  const drawn = await editor(page)
    .locator('p')
    .evaluate((p) => {
      const shape = p.closest('[data-element-id]')!.getBoundingClientRect();
      const line = p.getBoundingClientRect();
      return {
        align: getComputedStyle(p).textAlign,
        offCentre: Math.abs(line.top + line.height / 2 - (shape.top + shape.height / 2)),
      };
    });
  expect(drawn.align).toBe('center');
  expect(drawn.offCentre).toBeLessThan(2);

  // Undo takes the text away, and the empty line the caret is on is still a centred one.
  await page.keyboard.press('Control+z');
  expect((await element(page, SHAPE)).content).toBeUndefined();
  expect(await editingId(page)).toBe(SHAPE);
  await expect(editor(page).locator('p')).toHaveCSS('text-align', 'center');
  await page.keyboard.type('שוב');
  expect((await paragraphs(page, SHAPE))[0]).toMatchObject({ align: 'center' });
});

test('a character typed on a selected text box goes to the end of its text, in the format there', async ({
  page,
}) => {
  await select(page, TEXT);
  await page.keyboard.press('x');
  await expect(editor(page)).toBeFocused();
  expect(await editingId(page)).toBe(TEXT);
  await page.keyboard.type('yz');
  expect((await paragraphs(page, TEXT))[0]?.runs).toEqual([
    { text: 'plain ' },
    { text: 'boldxyz', marks: { weight: 700 } },
  ]);
  // "plain boldxyz" is 13 characters: the caret is after the last of them.
  expect(await caret(page)).toMatchObject({ from: 14, to: 14 });
});

test('no character is lost while the editor is on its way: typing does not wait for it', async ({
  page,
}) => {
  await select(page, SHAPE);
  const before = await steps(page);
  // As fast as a machine types: the editor is built, and takes the keyboard, in the middle of it.
  await page.keyboard.type('Go on, type fast');
  await expect(editor(page)).toBeFocused();
  expect(await plain(page, SHAPE)).toBe('Go on, type fast');
  expect(await steps(page)).toBe(before + 1);
  // The space on the way to the text did not pan the Stage: its cursor is not the hand.
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('stage-surface')).not.toHaveCSS('cursor', 'grab');
});

test('T on a selected text box is a letter; with nothing selected it adds a text box', async ({
  page,
}) => {
  await select(page, TEXT);
  await page.keyboard.press('t');
  await expect(editor(page)).toBeFocused();
  expect(await texts(page)).toEqual([TEXT]);
  expect(await plain(page, TEXT)).toBe('plain boldt');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => window.slidr!.selection.getState().selectedElementIds)).toEqual(
    [],
  );
  await page.keyboard.press('t');
  await expect(editor(page)).toBeFocused();
  expect(await texts(page)).toHaveLength(2);
});

test('what is not typing does not start it: the space, a shortcut, a locked shape, a key in a field', async ({
  page,
}) => {
  await select(page, SHAPE);
  await page.keyboard.press('Space');
  await page.keyboard.press('Control+b');
  await page.keyboard.press('ArrowRight');
  expect(await editingId(page)).toBeNull();

  await page.evaluate((id) => {
    const { bus, selection } = window.slidr!;
    bus.dispatch({
      type: 'element.update',
      slideId: selection.getState().currentSlideId!,
      elementId: id,
      patch: { locked: true },
    });
  }, SHAPE);
  await page.keyboard.press('a');
  expect(await editingId(page)).toBeNull();

  // A text box is selected, and the keys go to a field of row B: they are the field's.
  await select(page, TEXT);
  const size = row(page).getByRole('textbox', { name: 'גודל גופן' });
  await size.click();
  await page.keyboard.type('4');
  expect(await editingId(page)).toBeNull();
  expect(await plain(page, TEXT)).toBe('plain bold');
});

test('the row of a selected shape has a button into its text', async ({ page }) => {
  await select(page, SHAPE);
  // A shape without text: the button adds it.
  await tool(page, 'הוספת טקסט לצורה').click();
  await expect(editor(page)).toBeFocused();
  expect(await editingId(page)).toBe(SHAPE);
  await expect(row(page)).toHaveAttribute('data-selection', 'text');
  await page.keyboard.type('Go');
  await page.keyboard.press('Escape');
  await expect(row(page)).toHaveAttribute('data-selection', 'shape');
  expect(await paragraphs(page, SHAPE)).toEqual([
    { dir: 'auto', align: 'center', runs: [{ text: 'Go' }] },
  ]);

  // Now it has text: the button edits it, with the caret at the end.
  await tool(page, 'עריכת הטקסט שבצורה').click();
  await expect(editor(page)).toBeFocused();
  expect(await caret(page)).toMatchObject({ from: 3, to: 3 });
});

test('a shape that has text keeps the alignment of its text', async ({ page }) => {
  await addShape(page, 'e_left', {
    frame: { x: 100, y: 700, w: 500, h: 200 },
    content: { paragraphs: [para('left')] },
  });
  await select(page, 'e_left');
  await page.keyboard.press('!');
  await expect(editor(page)).toBeFocused();
  expect(await paragraphs(page, 'e_left')).toEqual([
    { dir: 'auto', align: 'start', runs: [{ text: 'left!' }] },
  ]);
});
