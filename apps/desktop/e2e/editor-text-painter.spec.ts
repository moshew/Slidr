import { expect, test, type Page } from '@playwright/test';
import {
  coords,
  dragSelect,
  editor,
  onStage,
  open,
  pressOnHebrewLayout,
  row,
  tool,
} from './editor-text-helpers';
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
 * Clear formatting and the format painter (WG4-T10, TXT-10), in the app: on a selected text box
 * (all of its text) and on the selection inside the text editor. Each is one undo step.
 */

test.describe.configure({ timeout: 120_000 });

const SOURCE = 'e_src';
const TARGET = 'e_dst';
const LINK = 'https://example.com/';

/** A formatted box, and a plain one under it. */
async function twoBoxes(page: Page) {
  await addText(
    page,
    SOURCE,
    [
      {
        dir: 'auto',
        align: 'center',
        lineHeight: 1.2,
        runs: [
          { text: 'כותרת ', marks: { size: 56, weight: 700, color: { token: 'primary' } } },
          { text: 'קישור', marks: { link: LINK, underline: true, italic: true } },
        ],
      },
    ],
    { frame: { x: 160, y: 120, w: 1600, h: 160 } },
  );
  await addText(page, TARGET, [para('שורה ראשונה'), para('second line here')], {
    frame: { x: 160, y: 420, w: 1600, h: 300 },
  });
}

const runs = async (page: Page, id: string) =>
  (await paragraphs(page, id)).map((p) => p.runs.map((r) => ({ text: r.text, marks: r.marks })));

test.beforeEach(async ({ page }) => {
  await open(page);
  await twoBoxes(page);
});

test.describe('clear formatting', () => {
  test('on a selected box: the marks go, the link and the paragraph stay, in one step', async ({
    page,
  }) => {
    await select(page, SOURCE);
    const after = await oneUndoStep(page, SOURCE, async () => {
      await tool(page, 'עוד עיצוב תווים').click();
      await page.getByRole('button', { name: 'ניקוי עיצוב', exact: true }).click();
    });
    expect(after.content?.paragraphs).toEqual([
      {
        dir: 'auto',
        align: 'center',
        lineHeight: 1.2,
        runs: [{ text: 'כותרת ' }, { text: 'קישור', marks: { link: LINK, underline: true } }],
      },
    ]);
  });

  test('Ctrl+\\ clears a selected box, and inside the editor only what is selected', async ({
    page,
  }) => {
    await select(page, SOURCE);
    await oneUndoStep(page, SOURCE, () => page.keyboard.press('Control+\\'));
    expect((await runs(page, SOURCE))[0]?.[0]).toEqual({ text: 'כותרת ', marks: undefined });
    await page.keyboard.press('Control+z');

    await edit(page, SOURCE);
    // "כות": the first three letters.
    await setSelection(page, 1, 4);
    await oneUndoStep(page, SOURCE, () => page.keyboard.press('Control+\\'));
    expect((await runs(page, SOURCE))[0]).toEqual([
      { text: 'כות', marks: undefined },
      { text: 'רת ', marks: { size: 56, weight: 700, color: { token: 'primary' } } },
      { text: 'קישור', marks: { link: LINK, underline: true, italic: true } },
    ]);
    // The editor is still open, with its selection.
    expect(await editingId(page)).toBe(SOURCE);
    await expect(editor(page)).toBeFocused();
    expect(await caret(page)).toMatchObject({ from: 1, to: 4 });
  });

  test('with a caret, what is typed next is plain', async ({ page }) => {
    await edit(page, SOURCE);
    await setSelection(page, 4);
    const before = await steps(page);
    await page.keyboard.press('Control+\\');
    // Nothing changed yet: the caret has no text.
    expect(await steps(page)).toBe(before);
    await page.keyboard.type('X');
    expect((await runs(page, SOURCE))[0]?.slice(0, 3)).toEqual([
      { text: 'כות', marks: { size: 56, weight: 700, color: { token: 'primary' } } },
      { text: 'X', marks: undefined },
      { text: 'רת ', marks: { size: 56, weight: 700, color: { token: 'primary' } } },
    ]);
  });
});

test.describe('the format painter', () => {
  const brush = (page: Page) => tool(page, 'מברשת עיצוב');
  const PAINTED = { size: 56, weight: 700, color: { token: 'primary' } };

  test('a click picks up the format of the box, and the next box clicked takes it', async ({
    page,
  }) => {
    await select(page, SOURCE);
    await brush(page).click();
    await expect(brush(page)).toHaveAttribute('aria-pressed', 'true');
    // Picking up changes nothing.
    const before = await steps(page);

    const box = (await onStage(page, TARGET).boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect.poll(() => steps(page)).toBe(before + 1);
    expect(await paragraphs(page, TARGET)).toEqual([
      {
        dir: 'auto',
        align: 'center',
        lineHeight: 1.2,
        runs: [{ text: 'שורה ראשונה', marks: PAINTED }],
      },
      {
        dir: 'auto',
        align: 'center',
        lineHeight: 1.2,
        runs: [{ text: 'second line here', marks: PAINTED }],
      },
    ]);
    // The brush is down again, and the box that was painted is the selection.
    await expect(brush(page)).toHaveAttribute('aria-pressed', 'false');
    expect(
      await page.evaluate(() => window.slidr!.selection.getState().selectedElementIds),
    ).toEqual([TARGET]);

    await page.keyboard.press('Control+z');
    expect(await paragraphs(page, TARGET)).toEqual([para('שורה ראשונה'), para('second line here')]);
    expect(await steps(page)).toBe(before);
  });

  test('from the caret of the editor: the format there, on the next box clicked', async ({
    page,
  }) => {
    // The caret is inside the bold title; the toolbar leaves it there.
    await edit(page, SOURCE);
    await setSelection(page, 3);
    await brush(page).click();
    await expect(brush(page)).toHaveAttribute('aria-pressed', 'true');
    await expect(editor(page)).toBeFocused();
    expect(await caret(page)).toMatchObject({ from: 3, to: 3 });
    await expect(row(page)).toHaveAttribute('data-selection', 'text');

    const box = (await onStage(page, TARGET).boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(brush(page)).toHaveAttribute('aria-pressed', 'false');
    expect((await runs(page, TARGET))[1]).toEqual([{ text: 'second line here', marks: PAINTED }]);
    expect(await editingId(page)).toBeNull();
  });

  test('a double click keeps the brush until Esc; in the editor a drag paints the selection and a click paints a word', async ({
    page,
  }) => {
    await select(page, SOURCE);
    await brush(page).dblclick();
    await expect(brush(page)).toHaveAttribute('aria-pressed', 'true');

    // The first click on the other box paints it whole; the brush stays in hand.
    const box = (await onStage(page, TARGET).boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(brush(page)).toHaveAttribute('aria-pressed', 'true');
    expect((await runs(page, TARGET))[0]).toEqual([{ text: 'שורה ראשונה', marks: PAINTED }]);
    await page.keyboard.press('Control+z');
    expect(await paragraphs(page, TARGET)).toEqual([para('שורה ראשונה'), para('second line here')]);

    // Inside it, by a drag: "second", the first word of the second line (positions 14 to 20).
    await edit(page, TARGET);
    const before = await steps(page);
    await dragSelect(page, 14, 20);
    await expect.poll(() => steps(page)).toBe(before + 1);
    expect(await runs(page, TARGET)).toEqual([
      [{ text: 'שורה ראשונה', marks: undefined }],
      [
        { text: 'second', marks: PAINTED },
        { text: ' line here', marks: undefined },
      ],
    ]);
    // The paragraph the selection touches took the paragraph format; the other did not.
    expect((await paragraphs(page, TARGET)).map((p) => p.align)).toEqual(['start', 'center']);

    // A plain click paints the word under it: "ראשונה" (positions 6 to 12).
    const at = await coords(page, 8);
    await page.mouse.click(at.x, at.y);
    await expect.poll(() => steps(page)).toBe(before + 2);
    expect((await runs(page, TARGET))[0]).toEqual([
      { text: 'שורה ', marks: undefined },
      { text: 'ראשונה', marks: PAINTED },
    ]);
    await expect(brush(page)).toHaveAttribute('aria-pressed', 'true');

    // Esc puts the brush down, and does not leave the text.
    await page.keyboard.press('Escape');
    await expect(brush(page)).toHaveAttribute('aria-pressed', 'false');
    expect(await editingId(page)).toBe(TARGET);
    await expect(editor(page)).toBeFocused();
    // The next Esc is the editor's again.
    await page.keyboard.press('Escape');
    expect(await editingId(page)).toBeNull();
  });

  test('from the keyboard: Ctrl+Alt+C picks up, Ctrl+Alt+V paints what is selected', async ({
    page,
  }) => {
    await select(page, SOURCE);
    await page.keyboard.press('Control+Alt+c');
    await expect(brush(page)).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Escape');
    // The selection is still there: Esc only put the brush down.
    expect(
      await page.evaluate(() => window.slidr!.selection.getState().selectedElementIds),
    ).toEqual([SOURCE]);

    await select(page, TARGET);
    await oneUndoStep(page, TARGET, () => page.keyboard.press('Control+Alt+v'));
    expect((await runs(page, TARGET))[0]).toEqual([{ text: 'שורה ראשונה', marks: PAINTED }]);
    await page.keyboard.press('Control+z');

    // In the editor, on its selection; and the format in hand can be used again and again.
    await edit(page, TARGET);
    await setSelection(page, 1, 5);
    await oneUndoStep(page, TARGET, () => page.keyboard.press('Control+Alt+v'));
    expect((await runs(page, TARGET))[0]).toEqual([
      { text: 'שורה', marks: PAINTED },
      { text: ' ראשונה', marks: undefined },
    ]);
    await expect(editor(page)).toBeFocused();
  });

  test('the keys arrive on a Hebrew keyboard layout, on a box and in the editor', async ({
    page,
  }) => {
    await select(page, SOURCE);
    // Ctrl+Alt+C: on a Hebrew layout the C key types bet.
    await pressOnHebrewLayout(page, 'KeyC', 'ב', { ctrl: true, alt: true });
    await expect(brush(page)).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Escape');

    await edit(page, TARGET);
    await setSelection(page, 1, 5);
    // Ctrl+Alt+V: the V key types he.
    await pressOnHebrewLayout(page, 'KeyV', 'ה', { ctrl: true, alt: true });
    expect((await runs(page, TARGET))[0]?.[0]).toEqual({ text: 'שורה', marks: PAINTED });
    // Ctrl+\: the backslash is the same key on both layouts.
    await pressOnHebrewLayout(page, 'Backslash', '\\', { ctrl: true });
    expect((await runs(page, TARGET))[0]).toEqual([{ text: 'שורה ראשונה', marks: undefined }]);
    expect((await element(page, TARGET)).content?.paragraphs[0]?.align).toBe('center');
  });
});
