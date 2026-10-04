import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  addBoxes,
  elements,
  expectOneStep,
  focusStage,
  openApp,
  order,
  select,
  selected,
  THREE,
  undoSteps,
} from './arrange-helpers';
import { addChart, dataEditor } from './chart-helpers';
import { addTable, cellTarget, editingId, table, tableOnStage } from './table-helpers';
import { addText, para } from './text-helpers';

/*
 * The Stage's right-click menu by kind of selection (STG-06), and the toolbar beside the
 * selection (STG-05), in the app. Each action is the one its shortcut and its row B button call,
 * and each is checked to be one undo step.
 */

const menu = (page: Page) => page.getByTestId('stage-menu');
/** An item by its label: the accessible name of an item also holds its shortcut. */
const item = (page: Page, name: string) =>
  menu(page)
    .getByRole('menuitem')
    .filter({ has: page.getByText(name, { exact: true }) });
const onStage = (page: Page, id: string) =>
  page.getByTestId('stage-frame').locator(`[data-element-id="${id}"]`);
const toolbar = (page: Page) => page.getByTestId('selection-toolbar');

/** The names of the menu's items, top to bottom. */
const itemNames = (page: Page) =>
  menu(page)
    .getByRole('menuitem')
    .evaluateAll((nodes) =>
      nodes.map((n) => n.querySelector('span')?.textContent?.trim() ?? n.textContent?.trim()),
    );

async function rightClick(page: Page, target: Locator) {
  await target.click({ button: 'right' });
  await expect(menu(page)).toBeVisible();
}

/** Right click on a part of the slide where nothing is. */
async function rightClickSlide(page: Page) {
  const box = (await page.getByTestId('stage-frame').boundingBox())!;
  await page.mouse.click(box.x + box.width - 20, box.y + 20, { button: 'right' });
  await expect(menu(page)).toBeVisible();
}

/** Opens a sub-menu as a hand does, and returns its content. */
async function openSub(page: Page, name: string, testId: string): Promise<Locator> {
  const trigger = item(page, name);
  await trigger.hover();
  const sub = page.getByTestId(testId);
  await expect(sub).toBeVisible();
  return sub;
}

/** Clicks an item of an open sub-menu, travelling along the row into it. */
async function clickInSub(page: Page, trigger: Locator, target: Locator) {
  await expect(target).toBeInViewport();
  const row = (await trigger.boundingBox())!;
  const box = (await target.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, row.y + row.height / 2, { steps: 8 });
  await target.click();
}

test.beforeEach(async ({ page }) => {
  await openApp(page);
  await addBoxes(page, THREE);
});

test('a right click on an element selects it and opens the menu of its kind', async ({ page }) => {
  await rightClick(page, onStage(page, 'e_b'));
  expect(await selected(page)).toEqual(['e_b']);
  expect(await itemNames(page)).toEqual([
    'גזירה',
    'העתקה',
    'הדבקה',
    'שכפול',
    'מחיקה',
    'הוספת טקסט',
    'סדר שכבות',
    'יישור לשקף',
    'נעילה',
    'הסתרה',
    'AI על האובייקט',
  ]);
  // Nothing was copied in this window yet.
  await expect(item(page, 'הדבקה')).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(menu(page)).toBeHidden();
});

test('the empty slide has a menu of its own', async ({ page }) => {
  await select(page, ['e_a']);
  await rightClickSlide(page);
  expect(await selected(page)).toEqual([]);
  expect(await itemNames(page)).toEqual(['הדבקה', 'בחירת הכול', 'AI שקף']);
  await item(page, 'בחירת הכול').click();
  expect(await selected(page)).toEqual(['e_a', 'e_b', 'e_c']);
});

test('duplicate and delete from the menu are one undo step each', async ({ page }) => {
  await rightClick(page, onStage(page, 'e_a'));
  await expectOneStep(page, () => item(page, 'שכפול').click());
  expect((await elements(page)).length).toBe(4);
  const [copy] = await selected(page);
  expect(copy).not.toBe('e_a');

  await rightClick(page, onStage(page, 'e_c'));
  await expectOneStep(page, () => item(page, 'מחיקה').click());
  expect(await order(page)).not.toContain('e_c');
});

test('copy, cut and paste from the menu go through the clipboard of the app', async ({ page }) => {
  await rightClick(page, onStage(page, 'e_b'));
  await item(page, 'העתקה').click();
  await rightClickSlide(page);
  await expect(item(page, 'הדבקה')).toBeEnabled();
  await expectOneStep(page, () => item(page, 'הדבקה').click());
  await expect.poll(async () => (await elements(page)).length).toBe(4);

  await rightClick(page, onStage(page, 'e_a'));
  await expectOneStep(page, () => item(page, 'גזירה').click());
  expect(await order(page)).not.toContain('e_a');
  await rightClickSlide(page);
  await item(page, 'הדבקה').click();
  await expect.poll(async () => (await elements(page)).length).toBe(4);
});

test('the layer order and the alignment to the slide are sub-menus', async ({ page }) => {
  await rightClick(page, onStage(page, 'e_a'));
  let sub = await openSub(page, 'סדר שכבות', 'stage-menu-order');
  // The bottom element cannot go further back.
  await expect(sub.getByRole('menuitem', { name: 'העברה לרקע' })).toBeDisabled();
  await expectOneStep(page, () =>
    clickInSub(page, item(page, 'סדר שכבות'), sub.getByRole('menuitem', { name: 'הבאה לחזית' })),
  );
  expect(await order(page)).toEqual(['e_b', 'e_c', 'e_a']);

  await rightClick(page, onStage(page, 'e_b'));
  sub = await openSub(page, 'יישור לשקף', 'stage-menu-align');
  await expectOneStep(page, () =>
    clickInSub(page, item(page, 'יישור לשקף'), sub.getByRole('menuitem', { name: 'יישור לשמאל' })),
  );
  expect((await elements(page)).find((e) => e.id === 'e_b')!.frame.x).toBe(0);
});

test('lock and hide from the menu', async ({ page }) => {
  await rightClick(page, onStage(page, 'e_b'));
  await expectOneStep(page, () => item(page, 'נעילה').click());
  expect((await elements(page)).find((e) => e.id === 'e_b')!.locked).toBe(true);
  // Still selected, and now the menu offers the way back.
  await rightClick(page, onStage(page, 'e_b'));
  await expect(item(page, 'מחיקה')).toBeDisabled();
  await expectOneStep(page, () => item(page, 'ביטול נעילה').click());

  await rightClick(page, onStage(page, 'e_c'));
  await expectOneStep(page, () => item(page, 'הסתרה').click());
  expect((await elements(page)).find((e) => e.id === 'e_c')!.hidden).toBe(true);
  await expect(onStage(page, 'e_c')).toHaveCount(0);
});

test('several elements can be grouped, and a group entered or taken apart', async ({ page }) => {
  await select(page, ['e_a', 'e_b']);
  // A right click on one of the selected keeps the selection.
  await rightClick(page, onStage(page, 'e_a'));
  expect(await selected(page)).toEqual(['e_a', 'e_b']);
  expect(await itemNames(page)).toContain('קיבוץ');
  expect(await itemNames(page)).not.toContain('AI על האובייקט');
  await expectOneStep(page, () => item(page, 'קיבוץ').click());
  const [groupId] = await selected(page);
  expect((await elements(page)).find((e) => e.id === groupId)!.type).toBe('group');

  await rightClick(page, onStage(page, groupId!));
  await item(page, 'כניסה לקבוצה').click();
  expect(await selected(page)).toEqual(['e_a', 'e_b']);
  await expect(page.getByTestId('stage-surface')).toHaveAttribute('data-entered', groupId!);

  await page.keyboard.press('Escape');
  await rightClick(page, onStage(page, groupId!));
  await expectOneStep(page, () => item(page, 'פירוק קבוצה').click());
  expect((await elements(page)).map((e) => e.type)).not.toContain('group');
});

test('the text of a text box and of a shape is edited from the menu', async ({ page }) => {
  await addText(page, 'e_text', [para('שלום')], {
    frame: { x: 1200, y: 100, w: 500, h: 120 },
  });
  await rightClick(page, onStage(page, 'e_text'));
  await item(page, 'עריכת הטקסט').click();
  await expect.poll(() => editingId(page)).toBe('e_text');
  // While text is edited the right click is the text's own, not the Stage's.
  await onStage(page, 'e_text').click({ button: 'right' });
  await expect(menu(page)).toBeHidden();

  await page.keyboard.press('Escape');
  await rightClick(page, onStage(page, 'e_c'));
  await item(page, 'הוספת טקסט').click();
  await expect.poll(() => editingId(page)).toBe('e_c');
});

test('a table selected as an object opens to its cells, and the cells have their own menu', async ({
  page,
}) => {
  await addTable(page, {
    frame: { x: 360, y: 500, w: 1200, h: 240 },
    texts: [
      ['א', 'ב', 'ג'],
      ['1', '2', '3'],
      ['4', '5', '6'],
    ],
  });
  await rightClick(page, tableOnStage(page, 'e_table'));
  await item(page, 'עריכת התאים').click();
  await expect.poll(() => editingId(page)).toBe('e_table');

  // Among the cells: the cell under the pointer is selected, and the menu is about the cells.
  await rightClick(page, cellTarget(page, 1, 1));
  expect(await itemNames(page)).toEqual([
    'גזירה',
    'העתקה',
    'הוספת שורה מעל',
    'הוספת שורה מתחת',
    'הוספת עמודה מימין',
    'הוספת עמודה משמאל',
    'מחיקת השורה',
    'מחיקת העמודה',
    'מיזוג תאים',
    'פיצול תאים',
    'AI על האובייקט',
  ]);
  const steps = await undoSteps(page);
  await item(page, 'הוספת שורה מעל').click();
  await expect.poll(async () => (await table(page)).rows.length).toBe(4);
  expect((await table(page)).cells[1]!.every((c) => c.content.paragraphs.length <= 1)).toBe(true);
  // One step for the row; the fitting of the rows that follows is part of it.
  expect(await undoSteps(page)).toBe(steps + 1);

  await rightClick(page, cellTarget(page, 0, 2));
  await item(page, 'מחיקת העמודה').click();
  await expect.poll(async () => (await table(page)).cols.length).toBe(2);
});

test('the data of a chart opens from the menu', async ({ page }) => {
  await addChart(page);
  await rightClick(page, onStage(page, 'e_chart'));
  await item(page, 'עריכת הנתונים').click();
  await expect(dataEditor(page)).toBeVisible();
});

test('the menu opens from the keyboard too', async ({ page }) => {
  await select(page, ['e_b']);
  await focusStage(page);
  await page.keyboard.press('Shift+F10');
  await expect(menu(page)).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Escape');
  await expect(menu(page)).toBeHidden();
});

/* ---------------------------------------------------------------- the toolbar */

test('the toolbar sits beside the selection and follows it', async ({ page }) => {
  await expect(toolbar(page)).toHaveCount(0);
  await select(page, ['e_b']);
  await expect(toolbar(page)).toBeVisible();
  const bar = (await toolbar(page).boundingBox())!;
  const element = (await onStage(page, 'e_b').boundingBox())!;
  // Above the element, clear of the rotation handle, and centred on it.
  expect(bar.y + bar.height).toBeLessThan(element.y - 30);
  expect(Math.abs(bar.x + bar.width / 2 - (element.x + element.width / 2))).toBeLessThan(2);

  // At the top of the slide there is no room above: it goes below.
  await page.evaluate(() => {
    const editor = window.slidr!;
    const slideId = editor.selection.getState().currentSlideId!;
    editor.bus.dispatch({
      type: 'element.update',
      slideId,
      elementId: 'e_b',
      patch: { frame: { x: 400, y: 0, w: 200, h: 100 } },
    });
  });
  await expect
    .poll(async () => {
      const b = (await toolbar(page).boundingBox())!;
      const e = (await onStage(page, 'e_b').boundingBox())!;
      return b.y >= e.y + e.height;
    })
    .toBe(true);

  // An element that fills the Stage still has its toolbar, inside the Stage.
  await page.evaluate(() => {
    const editor = window.slidr!;
    const slideId = editor.selection.getState().currentSlideId!;
    editor.bus.dispatch({
      type: 'element.update',
      slideId,
      elementId: 'e_b',
      patch: { frame: { x: 0, y: 0, w: 1920, h: 1080 } },
    });
  });
  const stage = (await page.getByTestId('stage-surface').boundingBox())!;
  await expect
    .poll(async () => {
      const b = (await toolbar(page).boundingBox())!;
      return b.y >= stage.y && b.y + b.height <= stage.y + stage.height;
    })
    .toBe(true);
});

test('the toolbar duplicates, deletes, locks and reorders, and the keys stay on the slide', async ({
  page,
}) => {
  await select(page, ['e_a']);
  await focusStage(page);
  const button = (name: string) => toolbar(page).getByRole('button', { name, exact: true });

  await expectOneStep(page, () => button('שכפול').click());
  const [copy] = await selected(page);
  expect(copy).not.toBe('e_a');
  // The press did not take the keyboard from the Stage: an arrow still moves the copy.
  const before = (await elements(page)).find((e) => e.id === copy)!.frame.x;
  await page.keyboard.press('ArrowRight');
  expect((await elements(page)).find((e) => e.id === copy)!.frame.x).toBe(before + 1);

  await button('סדר שכבות').click();
  await expectOneStep(page, () =>
    page
      .getByTestId('selection-toolbar-order')
      .getByRole('menuitem', { name: 'העברה לרקע' })
      .click(),
  );
  expect((await order(page))[0]).toBe(copy);

  await expectOneStep(page, () => button('נעילה').click());
  // A locked selection can only be unlocked.
  await expect(button('שכפול')).toHaveCount(0);
  await expect(button('מחיקה')).toHaveCount(0);
  await expectOneStep(page, () => button('ביטול נעילה').click());

  await expectOneStep(page, () => button('מחיקה').click());
  expect(await order(page)).not.toContain(copy);
  await expect(toolbar(page)).toHaveCount(0);
});

test('"AI" on the toolbar opens the object tool', async ({ page }) => {
  await select(page, ['e_b']);
  await toolbar(page).getByRole('button', { name: 'AI על האובייקט' }).click();
  await expect(page.locator('[data-testid="tool-panel"]')).toContainText('AI אובייקט');
});

test('the toolbar steps aside during a drag and while something is edited in place', async ({
  page,
}) => {
  await addText(page, 'e_text', [para('שלום')], {
    frame: { x: 1200, y: 100, w: 500, h: 120 },
  });
  await select(page, ['e_b']);
  await expect(toolbar(page)).toBeVisible();

  const box = (await onStage(page, 'e_b').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2 + 10, { steps: 4 });
  await expect(toolbar(page)).toHaveCount(0);
  await page.mouse.up();
  await expect(toolbar(page)).toBeVisible();

  await onStage(page, 'e_text').dblclick();
  await expect.poll(() => editingId(page)).toBe('e_text');
  await expect(toolbar(page)).toHaveCount(0);
});
