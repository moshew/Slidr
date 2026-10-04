import { expect, test, type Page } from '@playwright/test';
import { editor, LAPTOP, onStage, open, row, tool } from './editor-text-helpers';
import {
  addText,
  caret,
  edit,
  editingId,
  element,
  oneUndoStep,
  para,
  paragraphs,
  select,
  setSelection,
  steps,
} from './text-helpers';

/*
 * The text styles of the theme (WG4-T08, TXT-08), in the app: row B shows the style of the
 * paragraphs and applies another, and "update the style to match" writes what the text has into
 * the theme's style. Each is one undo step.
 */

test.describe.configure({ timeout: 120_000 });

const ID = 'e_style';
const OTHER = 'e_other';
const LINK = 'https://example.com/';

const styleButton = (page: Page) => row(page).locator('[data-style]');
const menuItem = (page: Page, name: string) =>
  page.getByRole('menuitemradio', { name, exact: true });
const bodyStyle = (page: Page) => page.evaluate(() => window.slidr!.bus.deck.theme.textStyles.body);
const fontSize = (page: Page, id: string) =>
  onStage(page, id)
    .locator('p')
    .first()
    .evaluate((p) => getComputedStyle(p).fontSize);

test.beforeEach(async ({ page }) => {
  await open(page);
  await addText(
    page,
    ID,
    [
      {
        dir: 'auto',
        align: 'start',
        lineHeight: 1.1,
        spaceAfter: 12,
        runs: [
          { text: 'כותרת ', marks: { size: 44, weight: 700, color: { token: 'accent' } } },
          {
            text: 'נטויה',
            marks: { size: 44, weight: 700, color: { token: 'accent' }, italic: true },
          },
        ],
      },
      {
        dir: 'auto',
        align: 'start',
        runs: [
          { text: 'second ', marks: { font: 'Rubik', letterSpacing: 2, case: 'upper' } },
          { text: 'link', marks: { link: LINK, underline: true } },
        ],
      },
    ],
    { frame: { x: 160, y: 120, w: 1600, h: 300 } },
  );
  await addText(page, OTHER, [para('טקסט אחר באותו סגנון')], {
    frame: { x: 160, y: 520, w: 1600, h: 200 },
  });
});

test.describe('applying a style', () => {
  test('to a selected box: every paragraph takes it, and what would hide it goes', async ({
    page,
  }) => {
    await select(page, ID);
    // A paragraph that names no style has the body style.
    await expect(styleButton(page)).toHaveAttribute('data-style', 'body');
    await expect(styleButton(page)).toHaveAttribute('aria-label', 'סגנון טקסט: גוף הטקסט');

    const after = await oneUndoStep(page, ID, async () => {
      await styleButton(page).click();
      await expect(menuItem(page, 'גוף הטקסט')).toHaveAttribute('aria-checked', 'true');
      await menuItem(page, 'כותרת').click();
    });
    expect(after.content?.paragraphs).toEqual([
      {
        dir: 'auto',
        align: 'start',
        spaceAfter: 12,
        styleRef: 'title',
        runs: [{ text: 'כותרת ' }, { text: 'נטויה', marks: { italic: true } }],
      },
      {
        dir: 'auto',
        align: 'start',
        styleRef: 'title',
        runs: [{ text: 'second ' }, { text: 'link', marks: { link: LINK, underline: true } }],
      },
    ]);
    await expect(styleButton(page)).toHaveAttribute('data-style', 'title');
    // The row shows the style's own values now, and the Stage keeps the keyboard.
    const title = await page.evaluate(() => window.slidr!.bus.deck.theme.textStyles.title);
    await expect(row(page).getByRole('textbox', { name: 'גודל גופן' })).toHaveValue(
      String(title.size),
    );
    await expect(page.getByTestId('stage-surface')).toBeFocused();
  });

  test('in the editor: the paragraph of the caret, all of it', async ({ page }) => {
    await edit(page, ID);
    // The caret is inside the first word; nothing is selected.
    await setSelection(page, 3);
    const after = await oneUndoStep(page, ID, async () => {
      await styleButton(page).click();
      await menuItem(page, 'כותרת משנה').click();
    });
    expect(after.content?.paragraphs[0]).toEqual({
      dir: 'auto',
      align: 'start',
      spaceAfter: 12,
      styleRef: 'heading',
      runs: [{ text: 'כותרת ' }, { text: 'נטויה', marks: { italic: true } }],
    });
    // The other paragraph is as it was, and the editor still has its caret.
    expect(after.content?.paragraphs[1]?.styleRef).toBeUndefined();
    expect(after.content?.paragraphs[1]?.runs[0]?.marks).toEqual({
      font: 'Rubik',
      letterSpacing: 2,
      case: 'upper',
    });
    expect(await editingId(page)).toBe(ID);
    await expect(editor(page)).toBeFocused();
    expect(await caret(page)).toMatchObject({ from: 3, to: 3 });
    // Two paragraphs, two styles: the row says so.
    await page.keyboard.press('Control+a');
    await expect(styleButton(page)).toHaveAttribute('data-style', 'mixed');
  });
});

test.describe('update the style to match', () => {
  const update = (page: Page) => page.getByRole('menuitem', { name: 'עדכון הסגנון לפי הטקסט' });

  test('writes what the text has into the theme, and takes the marks that repeat it: one step', async ({
    page,
  }) => {
    const before = await bodyStyle(page);
    const text = await element(page, ID);
    const stepsBefore = await steps(page);
    expect(await fontSize(page, OTHER)).toBe(`${before.size}px`);

    await edit(page, ID);
    // The first paragraph: size 44, bold, the accent colour, line height 1.1.
    await setSelection(page, 1, 12);
    await styleButton(page).click();
    await update(page).click();
    await expect.poll(() => steps(page)).toBe(stepsBefore + 1);

    expect(await bodyStyle(page)).toEqual({
      ...before,
      size: 44,
      weight: 700,
      color: { token: 'accent' },
      lineHeight: 1.1,
    });
    expect(await paragraphs(page, ID)).toEqual([
      {
        dir: 'auto',
        align: 'start',
        spaceAfter: 12,
        runs: [{ text: 'כותרת ' }, { text: 'נטויה', marks: { italic: true } }],
      },
      text.content?.paragraphs[1],
    ]);
    // Every text in that style follows. The text is still being edited, with its selection: the
    // editor was built anew for the new theme, and carried on from where it was.
    expect(await fontSize(page, OTHER)).toBe('44px');
    expect(await editingId(page)).toBe(ID);
    await expect(editor(page)).toBeFocused();
    expect(await caret(page)).toMatchObject({ from: 1, to: 12 });
    // Nothing is left to update.
    await styleButton(page).click();
    await expect(update(page)).toHaveAttribute('aria-disabled', 'true');
    await page.keyboard.press('Escape');

    // One Ctrl+Z takes back the theme and the text together.
    await page.keyboard.press('Control+z');
    expect(await bodyStyle(page)).toEqual(before);
    expect(await element(page, ID)).toEqual(text);
    expect(await steps(page)).toBe(stepsBefore);
    expect(await fontSize(page, OTHER)).toBe(`${before.size}px`);
  });

  test('on a selected box whose text has more than one size, the size is left alone', async ({
    page,
  }) => {
    await addText(
      page,
      'e_mixed',
      [
        {
          dir: 'auto',
          align: 'start',
          styleRef: 'caption',
          runs: [
            { text: 'קטן ', marks: { size: 20, letterSpacing: 1.5 } },
            { text: 'גדול', marks: { size: 28, letterSpacing: 1.5 } },
          ],
        },
      ],
      { frame: { x: 160, y: 800, w: 800, h: 120 } },
    );
    const caption = await page.evaluate(() => window.slidr!.bus.deck.theme.textStyles.caption);
    await select(page, 'e_mixed');
    await expect(styleButton(page)).toHaveAttribute('data-style', 'caption');
    const stepsBefore = await steps(page);
    await styleButton(page).click();
    await update(page).click();
    await expect.poll(() => steps(page)).toBe(stepsBefore + 1);
    expect(await page.evaluate(() => window.slidr!.bus.deck.theme.textStyles.caption)).toEqual({
      ...caption,
      letterSpacing: 1.5,
    });
    expect((await paragraphs(page, 'e_mixed'))[0]?.runs).toEqual([
      { text: 'קטן ', marks: { size: 20 } },
      { text: 'גדול', marks: { size: 28 } },
    ]);
    await page.keyboard.press('Control+z');
    expect(await steps(page)).toBe(stepsBefore);
    expect(await page.evaluate(() => window.slidr!.bus.deck.theme.textStyles.caption)).toEqual(
      caption,
    );
  });
});

test.describe('at 1366x768 the style, the highlight and the direction are inside other tools', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(LAPTOP);
    await select(page, ID);
    await expect(tool(page, 'משקל')).toHaveCount(0);
  });

  test('the style and "update the style" are in the "more" popover', async ({ page }) => {
    await expect(styleButton(page)).toHaveCount(0);
    const after = await oneUndoStep(page, ID, async () => {
      await tool(page, 'עוד עיצוב תווים').click();
      const style = page.getByRole('combobox', { name: 'סגנון טקסט' });
      await expect(style).toHaveText('גוף הטקסט');
      await style.click();
      await page.getByRole('option', { name: 'כיתוב' }).click();
    });
    expect(after.content?.paragraphs.map((p) => p.styleRef)).toEqual(['caption', 'caption']);
    await page.keyboard.press('Control+z');

    const before = await bodyStyle(page);
    await edit(page, ID);
    await setSelection(page, 1, 12);
    await tool(page, 'עוד עיצוב תווים').click();
    await page.getByRole('button', { name: 'עדכון הסגנון לפי הטקסט' }).click();
    expect(await bodyStyle(page)).toMatchObject({ size: 44, weight: 700 });
    await page.keyboard.press('Escape');
    await expect(editor(page)).toBeFocused();
    await page.keyboard.press('Control+z');
    expect(await bodyStyle(page)).toEqual(before);
  });

  test('the highlight colour is in the "more" popover', async ({ page }) => {
    await expect(tool(page, 'צבע הדגשה')).toHaveCount(0);
    await tool(page, 'עוד עיצוב תווים').click();
    const after = await oneUndoStep(page, ID, async () => {
      await page.getByRole('button', { name: 'צבע הדגשה', exact: true }).click();
      await page.getByRole('button', { name: 'משני', exact: true }).click();
    });
    expect(after.content?.paragraphs[0]?.runs[0]?.marks).toMatchObject({
      highlight: { token: 'secondary' },
    });
  });

  test('the direction of the paragraph is in the alignment menu', async ({ page }) => {
    await expect(tool(page, 'כיוון הפסקה')).toHaveCount(0);
    const after = await oneUndoStep(page, ID, async () => {
      await tool(page, 'יישור').click();
      await page.getByRole('menuitemradio', { name: 'משמאל לימין' }).click();
    });
    expect(after.content?.paragraphs.map((p) => p.dir)).toEqual(['ltr', 'ltr']);
  });
});
