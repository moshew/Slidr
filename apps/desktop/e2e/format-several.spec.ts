import { expect, test, type Locator, type Page } from '@playwright/test';
import type { ShapeElement, TextElement } from '@slidr/model';
import { addSelected, box, elementOf, rect, rowOverflow } from './format-helpers';
import { line, openApp, pageProblems, row, steps, undo } from './objects-helpers';
import { para } from './text-helpers';

/*
 * Formatting several selected elements at once (beyond SPEC 4.4, which gives a multiple selection
 * the arrange tools only): the row holds the tools that apply to every member, a value the members
 * do not share is shown as mixed and never as the first member's, and one change is one undo step
 * for the whole selection.
 */

const tool = (page: Page, name: string) => row(page).getByRole('button', { name, exact: true });
const size = (page: Page) => row(page).getByRole('textbox', { name: 'גודל גופן' });
const popover = (page: Page) => page.getByRole('dialog').last();

const text = (page: Page, id: string) => elementOf<TextElement>(page, id);
const shapeOf = (page: Page, id: string) => elementOf<ShapeElement>(page, id);
const runs = async (page: Page, id: string) =>
  (await text(page, id)).content.paragraphs.flatMap((p) => p.runs);

/** Three text boxes: plain, bold at 48, and one whose second word is italic. */
const boxes = [
  box('t_plain', 140, [para('ראשון')]),
  box('t_bold', 300, [
    { dir: 'auto', align: 'start', runs: [{ text: 'שני', marks: { weight: 700, size: 48 } }] },
  ]),
  box('t_part', 460, [
    {
      dir: 'auto',
      align: 'center',
      runs: [{ text: 'שלישי ' }, { text: 'נטוי', marks: { italic: true } }],
    },
  ]),
];
const ids = boxes.map((b) => b.id);

async function open(page: Page, name: string): Promise<Locator> {
  await tool(page, name).click();
  await expect(page.getByRole('dialog')).toHaveCount(1);
  return page.getByRole('dialog');
}

test.afterEach(({ page }) => {
  expect(pageProblems(page)).toEqual([]);
});

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

test.describe('several text boxes', () => {
  test('a size they do not share is shown as mixed, and a size typed goes to all of them as one undo step', async ({
    page,
  }) => {
    await addSelected(page, boxes);
    await expect(row(page)).toHaveAttribute('data-selection', 'multiple');
    // 30 (the body style), 48 and 30: not one size, and not the first box's.
    await expect(size(page)).toHaveValue('');
    const before = await Promise.all(ids.map((id) => text(page, id)));

    await size(page).fill('40');
    expect(await steps(page, () => size(page).press('Enter'))).toBe(1);
    for (const id of ids) {
      for (const run of await runs(page, id)) expect(run.marks).toMatchObject({ size: 40 });
    }
    await expect(size(page)).toHaveValue('40');
    // What each box had besides the size is still its own.
    expect(await runs(page, 't_bold')).toEqual([{ text: 'שני', marks: { weight: 700, size: 40 } }]);
    expect((await runs(page, 't_part'))[1]).toEqual({
      text: 'נטוי',
      marks: { italic: true, size: 40 },
    });

    await undo(page);
    expect(await Promise.all(ids.map((id) => text(page, id)))).toEqual(before);
    await expect(size(page)).toHaveValue('');
  });

  test('bold is on only when all the text is bold; a click on a mixed selection makes all of it bold', async ({
    page,
  }) => {
    await addSelected(page, boxes);
    const bold = tool(page, 'מודגש');
    await expect(bold).toHaveAttribute('aria-pressed', 'false');
    expect(await steps(page, () => bold.click())).toBe(1);
    for (const id of ids) {
      for (const run of await runs(page, id)) expect(run.marks).toMatchObject({ weight: 700 });
    }
    await expect(bold).toHaveAttribute('aria-pressed', 'true');
    // The keyboard stays on the Stage, and the shortcut does the same to the selection.
    await expect(page.getByTestId('stage-surface')).toBeFocused();
    expect(await steps(page, () => page.keyboard.press('Control+b'))).toBe(1);
    for (const id of ids) {
      for (const run of await runs(page, id)) expect(run.marks?.weight).toBeUndefined();
    }
    await expect(bold).toHaveAttribute('aria-pressed', 'false');
  });

  test('the colour, the alignment and the text style go to every box, each as one undo step', async ({
    page,
  }) => {
    await addSelected(page, boxes);

    await tool(page, 'צבע טקסט').click();
    expect(
      await steps(page, async () => {
        await popover(page).getByRole('button', { name: 'הדגשה' }).click();
        await page.keyboard.press('Escape');
      }),
    ).toBe(1);
    for (const id of ids) {
      for (const run of await runs(page, id)) expect(run.marks?.color).toEqual({ token: 'accent' });
    }

    // Two boxes start at the side and one is centred: no alignment button is pressed.
    const centre = tool(page, 'יישור הטקסט למרכז');
    await expect(centre).toHaveAttribute('aria-pressed', 'false');
    await expect(tool(page, 'יישור הטקסט לימין')).toHaveAttribute('aria-pressed', 'false');
    expect(await steps(page, () => centre.click())).toBe(1);
    for (const id of ids) {
      expect((await text(page, id)).content.paragraphs.map((p) => p.align)).toEqual(['center']);
    }
    await expect(centre).toHaveAttribute('aria-pressed', 'true');

    await tool(page, 'סגנון טקסט: גוף הטקסט').click();
    expect(
      await steps(page, () =>
        page.getByRole('menuitemradio', { name: 'כותרת', exact: true }).click(),
      ),
    ).toBe(1);
    for (const id of ids) {
      const { paragraphs } = (await text(page, id)).content;
      expect(paragraphs.map((p) => p.styleRef)).toEqual(['title']);
      // What a style holds itself goes, so that the style shows; the italic word stays italic.
      for (const run of paragraphs.flatMap((p) => p.runs)) {
        expect(run.marks?.size).toBeUndefined();
        expect(run.marks?.color).toBeUndefined();
      }
    }
    expect((await runs(page, 't_part'))[1]?.marks).toEqual({ italic: true });
  });

  test('"clear formatting" clears every box, and the weight is in "more"', async ({ page }) => {
    await addSelected(page, boxes);
    const more = await open(page, 'עוד עיצוב תווים');
    // 400, 700 and 400: no weight is shown.
    await expect(more.getByRole('combobox', { name: 'משקל' })).toHaveText('מעורב');
    expect(await steps(page, () => more.getByRole('button', { name: 'ניקוי עיצוב' }).click())).toBe(
      1,
    );
    for (const id of ids) {
      for (const run of await runs(page, id)) expect(run.marks).toBeUndefined();
    }
    await expect(more.getByRole('combobox', { name: 'משקל' })).toHaveText('רגיל');
  });

  test('boxes that grow with their text get their new height in the same undo step', async ({
    page,
  }) => {
    await addSelected(page, [
      box('g_one', 140, [para('שורה אחת')], {
        autoFit: 'growHeight',
        frame: { x: 160, y: 140, w: 700, h: 45 },
      }),
      box('g_two', 400, [para('ועוד אחת')], {
        autoFit: 'growHeight',
        frame: { x: 160, y: 400, w: 700, h: 45 },
      }),
    ]);
    await size(page).fill('90');
    const made = await steps(page, async () => {
      await size(page).press('Enter');
      await expect.poll(async () => (await text(page, 'g_two')).frame.h).toBeGreaterThan(100);
    });
    expect(made).toBe(1);
    expect((await text(page, 'g_one')).frame.h).toBeGreaterThan(100);
    await undo(page);
    expect((await text(page, 'g_one')).frame.h).toBe(45);
    expect((await text(page, 'g_two')).frame.h).toBe(45);
  });
});

test.describe('what applies to every member', () => {
  test('a text box and a shape with text share the text tools; with a shape that has no text only the look is left', async ({
    page,
  }) => {
    const withText = rect('s_text', 1000, { content: { paragraphs: [para('בצורה')] } });
    await addSelected(page, [boxes[0]!, withText]);
    await expect(size(page)).toBeVisible();
    expect(await steps(page, () => tool(page, 'נטוי').click())).toBe(1);
    expect(await runs(page, 't_plain')).toEqual([{ text: 'ראשון', marks: { italic: true } }]);
    expect((await shapeOf(page, 's_text')).content?.paragraphs[0]?.runs).toEqual([
      { text: 'בצורה', marks: { italic: true } },
    ]);
    // A fill is a shape's: the text box has none.
    await expect(tool(page, 'מילוי')).toHaveCount(0);
    await expect(tool(page, 'צל')).toBeVisible();

    await addSelected(page, [rect('s_empty', 1400)]);
    await page.evaluate(() =>
      window.slidr!.selection.getState().selectElements(['t_plain', 's_empty']),
    );
    await expect(row(page)).toHaveAttribute('data-selection', 'multiple');
    await expect(size(page)).toHaveCount(0);
    await expect(tool(page, 'מודגש')).toHaveCount(0);
    await expect(tool(page, 'צל')).toBeVisible();
    await expect(tool(page, 'אטימות')).toBeVisible();
    // The shortcut has nothing to format either.
    await page.getByTestId('stage-surface').focus();
    expect(await steps(page, () => page.keyboard.press('Control+b'))).toBe(0);
  });

  test('shapes and a line share the outline but not the fill, and a line keeps its stroke', async ({
    page,
  }) => {
    await addSelected(page, [
      rect('s_a', 160, { stroke: { color: { token: 'accent' }, width: 2 } }),
      line({ id: 'l_a' }),
    ]);
    await expect(tool(page, 'מילוי')).toHaveCount(0);
    const editor = await open(page, 'קו מתאר');
    // A line always has a stroke: "none" is not offered for a selection that has one.
    await expect(editor.getByRole('radio', { name: 'ללא' })).toHaveCount(0);
    expect(await steps(page, () => editor.getByRole('radio', { name: 'מקווקו' }).click())).toBe(1);
    expect((await shapeOf(page, 's_a')).stroke).toEqual({
      color: { token: 'accent' },
      width: 2,
      dash: 'dashed',
    });
    expect((await elementOf(page, 'l_a')) as unknown).toMatchObject({
      stroke: { color: { token: 'text' }, width: 4, dash: 'dashed' },
    });
  });
});

test.describe('several shapes', () => {
  const shapes = [
    rect('s_one', 160),
    rect('s_two', 560, {
      fill: { kind: 'solid', color: { token: 'accent' } },
      stroke: { color: { value: '#e5484d' }, width: 2 },
      opacity: 0.5,
    }),
    rect('s_three', 960, { stroke: { color: { token: 'text' }, width: 8, dash: 'dotted' } }),
  ];
  const shapeIds = shapes.map((s) => s.id);

  test('fills that differ show as mixed, and a kind chosen goes to all of them', async ({
    page,
  }) => {
    await addSelected(page, shapes);
    await expect(tool(page, 'מילוי').locator('[data-mixed]')).toBeVisible();
    const editor = (await open(page, 'מילוי')).getByTestId('fill-editor');
    // No kind is selected, and no colour of one of the shapes is on show.
    for (const kind of ['ללא', 'מלא', 'הדרגתי', 'תמונה']) {
      await expect(editor.getByRole('radio', { name: kind })).toHaveAttribute('data-state', 'off');
    }
    await expect(editor.getByText('לאובייקטים שנבחרו מילויים שונים')).toBeVisible();
    await expect(editor.getByRole('button', { name: 'צבע' })).toHaveCount(0);

    expect(await steps(page, () => editor.getByRole('radio', { name: 'מלא' }).click())).toBe(1);
    for (const id of shapeIds) {
      expect((await shapeOf(page, id)).fill).toEqual({
        kind: 'solid',
        color: { token: 'primary' },
      });
    }
    await expect(tool(page, 'מילוי').locator('[data-mixed]')).toHaveCount(0);

    // From here they share a fill, and its colour is edited for all of them.
    await editor.getByRole('button', { name: 'צבע' }).click();
    expect(
      await steps(page, () =>
        popover(page).getByRole('button', { name: 'משני', exact: true }).click(),
      ),
    ).toBe(1);
    for (const id of shapeIds) {
      expect((await shapeOf(page, id)).fill).toEqual({
        kind: 'solid',
        color: { token: 'secondary' },
      });
    }
    await undo(page);
    await undo(page);
    expect((await shapeOf(page, 's_two')).fill).toEqual({
      kind: 'solid',
      color: { token: 'accent' },
    });
    expect((await shapeOf(page, 's_one')).fill).toEqual({
      kind: 'solid',
      color: { token: 'primary' },
    });
  });

  test('an outline only some have is mixed; one given to all leaves each its own, and a width goes to all without touching their colours', async ({
    page,
  }) => {
    await addSelected(page, shapes);
    const editor = await open(page, 'קו מתאר');
    for (const style of ['ללא', 'רציף', 'מקווקו', 'מנוקד']) {
      await expect(editor.getByRole('radio', { name: style })).toHaveAttribute('data-state', 'off');
    }
    await expect(editor.getByText('רק לחלק מהאובייקטים שנבחרו יש קו מתאר')).toBeVisible();
    await expect(editor.getByRole('textbox', { name: 'עובי' })).toHaveCount(0);

    expect(await steps(page, () => editor.getByRole('radio', { name: 'רציף' }).click())).toBe(1);
    // The one that had none gets the default outline; the others keep their colour and width.
    expect((await shapeOf(page, 's_one')).stroke).toEqual({ color: { token: 'text' }, width: 4 });
    expect((await shapeOf(page, 's_two')).stroke).toEqual({
      color: { value: '#e5484d' },
      width: 2,
    });
    expect((await shapeOf(page, 's_three')).stroke).toEqual({ color: { token: 'text' }, width: 8 });

    // Three widths: the field is empty. Two colours: "mixed", not the first one's name.
    const width = editor.getByRole('textbox', { name: 'עובי' });
    await expect(width).toHaveValue('');
    await expect(editor.getByText('מעורב')).toBeVisible();
    await width.fill('6');
    expect(await steps(page, () => width.press('Enter'))).toBe(1);
    expect((await shapeOf(page, 's_one')).stroke).toEqual({ color: { token: 'text' }, width: 6 });
    expect((await shapeOf(page, 's_two')).stroke).toEqual({
      color: { value: '#e5484d' },
      width: 6,
    });
    expect((await shapeOf(page, 's_three')).stroke).toEqual({ color: { token: 'text' }, width: 6 });
    await expect(width).toHaveValue('6');
    await expect(editor.getByText('מעורב')).toBeVisible();

    expect(await steps(page, () => editor.getByRole('radio', { name: 'ללא' }).click())).toBe(1);
    for (const id of shapeIds) expect((await shapeOf(page, id)).stroke).toBeUndefined();
  });

  test('a shadow switched on for all, and an opacity they do not share set for all', async ({
    page,
  }) => {
    await addSelected(page, shapes);
    const shadow = await open(page, 'צל');
    expect(
      await steps(page, () => shadow.getByRole('radio', { name: 'צל', exact: true }).click()),
    ).toBe(1);
    const theme = await page.evaluate(() => window.slidr!.bus.deck.theme.shadow);
    for (const id of shapeIds) expect((await shapeOf(page, id)).effects?.shadow).toEqual(theme);
    const blur = shadow.getByRole('textbox', { name: 'טשטוש' });
    await blur.fill('30');
    expect(await steps(page, () => blur.press('Enter'))).toBe(1);
    for (const id of shapeIds) {
      expect((await shapeOf(page, id)).effects?.shadow).toEqual({ ...theme, blur: 30 });
    }
    await page.keyboard.press('Escape');

    const opacity = (await open(page, 'אטימות')).getByRole('textbox', { name: 'אטימות' });
    // 100%, 50% and 100%: not a number.
    await expect(opacity).toHaveValue('');
    await opacity.fill('80');
    expect(await steps(page, () => opacity.press('Enter'))).toBe(1);
    for (const id of shapeIds) expect((await shapeOf(page, id)).opacity).toBe(0.8);
    await expect(opacity).toHaveValue('80');
    await undo(page);
    expect((await shapeOf(page, 's_two')).opacity).toBe(0.5);
    expect((await shapeOf(page, 's_one')).opacity).toBe(1);
  });
});

test.describe('the row', () => {
  test('holds the arrange tools and the text tools at 1920, in both languages', async ({
    page,
  }) => {
    for (const lang of ['he', 'en'] as const) {
      await openApp(page, { lang });
      await addSelected(page, boxes);
      await expect(row(page).getByTestId('align-left')).toBeVisible();
      await expect(row(page).getByRole('textbox').first()).toBeVisible();
      expect(await rowOverflow(page)).toBe(0);
    }
  });

  test('a row with no room for all the text tools holds them compact before it folds them', async ({
    page,
  }) => {
    // At 1800 the row is about 1170 wide: the roomy tools take 1240 and more, the compact ones
    // under 1100.
    await page.setViewportSize({ width: 1800, height: 1032 });
    for (const lang of ['he', 'en'] as const) {
      await openApp(page, { lang });
      await addSelected(page, boxes);
      await expect(row(page).getByRole('textbox').first()).toBeVisible();
      await expect(row(page).getByTestId('text-fold').getByRole('button')).toHaveCount(0);
      // Compact: the text style is in "more", not in the row.
      await expect(row(page).locator('[data-style]')).toHaveCount(0);
      expect(await rowOverflow(page)).toBe(0);
    }
  });

  test('at 1366 the text tools fold into one button, and work from its popover', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    for (const lang of ['he', 'en'] as const) {
      await openApp(page, { lang });
      await addSelected(page, boxes);
      await expect(row(page).getByTestId('text-fold').getByRole('button')).toBeVisible();
      await expect(row(page).getByRole('textbox')).toHaveCount(0);
      expect(await rowOverflow(page)).toBe(0);
    }
    // The last language was English.
    const fold = await open(page, 'Text formatting');
    const fontSize = fold.getByRole('textbox', { name: 'Font size' });
    await expect(fontSize).toHaveValue('');
    expect(
      await steps(page, () => fold.getByRole('button', { name: 'Bold', exact: true }).click()),
    ).toBe(1);
    for (const id of ids) {
      for (const run of await runs(page, id)) expect(run.marks).toMatchObject({ weight: 700 });
    }
    // All four alignments are there as buttons, as in a roomy row.
    await expect(fold.getByRole('button', { name: 'Align text centre' })).toBeVisible();
    await expect(fold.getByRole('button', { name: 'Justify text' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('stage-surface')).toBeFocused();
  });
});
