import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  addBoxes,
  elements,
  expectOneStep,
  focusStage,
  frames,
  openApp,
  order,
  select,
  selected,
  THREE,
  undo,
} from './arrange-helpers';

/*
 * Arranging objects (WG5-T06, ARR-01..05) in the app: row B for a multiple selection, the Arrange
 * menu, the shortcuts and the Layers panel. Every action is checked to be one undo step.
 */

const ALL = ['e_a', 'e_b', 'e_c'];

const rowB = (page: Page) => page.getByTestId('top-tools-b');

/**
 * The name a row of the Layers panel shows. A row also holds what a screen reader is told after
 * its name (the kind of the object, "locked", "hidden"), which is not drawn and is no part of
 * the name: `a11y-reader.spec.ts` holds what is said.
 */
const shownName = (rows: Locator) => rows.locator(':scope > span:not(.sr-only)');

async function arrangeItem(page: Page, name: string) {
  await page.getByTestId('arrange-menu').click();
  return page.getByTestId('arrange-menu-content').getByRole('menuitem', { name });
}

/** Opens "Align to slide" in the Arrange menu and clicks one of its items. */
async function clickSlideItem(page: Page, testId: string) {
  const trigger = await arrangeItem(page, 'יישור לשקף');
  await trigger.hover();
  const item = page.getByTestId(testId);
  await expect(item).toBeInViewport();
  // As a hand moves: along the row and into the submenu, then to the item. The submenu stays
  // open for a pointer that travels towards it, not for one that jumps.
  const row = (await trigger.boundingBox())!;
  const box = (await item.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, row.y + row.height / 2, { steps: 8 });
  await item.click();
}

test.beforeEach(async ({ page }) => {
  await openApp(page);
  await addBoxes(page, THREE);
});

test('each align button moves the selection to one edge or centre line, as one undo step', async ({
  page,
}) => {
  // Six actions, each undone and checked: allow for a busy machine.
  test.slow();
  await select(page, ALL);
  await expect(rowB(page)).toHaveAttribute('data-selection', 'multiple');
  // The bounds of the three: x 100..1000, y 100..900.
  const cases = [
    { edge: 'left', axis: 'x', values: [100, 100, 100] },
    { edge: 'center', axis: 'x', values: [500, 450, 500] },
    { edge: 'right', axis: 'x', values: [900, 800, 900] },
    { edge: 'top', axis: 'y', values: [100, 100, 100] },
    { edge: 'middle', axis: 'y', values: [450, 450, 350] },
    { edge: 'bottom', axis: 'y', values: [800, 800, 600] },
  ] as const;
  const before = await frames(page, ALL);
  for (const { edge, axis, values } of cases) {
    await expectOneStep(page, () => page.getByTestId(`align-${edge}`).click());
    const after = await frames(page, ALL);
    expect(ALL.map((id) => after[id]![axis])).toEqual(values);
    // Only the one axis moved, and nothing changed size.
    const other = axis === 'x' ? 'y' : 'x';
    for (const id of ALL) {
      expect(after[id]![other]).toBe(before[id]![other]);
      expect([after[id]!.w, after[id]!.h]).toEqual([before[id]!.w, before[id]!.h]);
    }
    await undo(page);
    expect(await frames(page, ALL)).toEqual(before);
  }
});

test('the three horizontal align buttons keep their physical order in Hebrew', async ({ page }) => {
  await select(page, ALL);
  const x = async (edge: string) => (await page.getByTestId(`align-${edge}`).boundingBox())!.x;
  expect(await x('left')).toBeLessThan(await x('center'));
  expect(await x('center')).toBeLessThan(await x('right'));
});

test('distribute evens the gaps on each axis; it needs three elements', async ({ page }) => {
  await select(page, ALL);
  await expectOneStep(page, () => page.getByTestId('distribute-horizontal').click());
  // 900 wide, 400 of it boxes: gaps of 250, so B starts at 100 + 100 + 250.
  expect((await frames(page, ALL)).e_b).toMatchObject({ x: 450, y: 300 });
  await expectOneStep(page, () => page.getByTestId('distribute-vertical').click());
  // 800 high, 500 of it boxes: gaps of 150.
  expect((await frames(page, ALL)).e_b).toMatchObject({ x: 450, y: 350 });

  await select(page, ['e_a', 'e_b']);
  await expect(page.getByTestId('distribute-horizontal')).toBeDisabled();
  await expect(page.getByTestId('align-left')).toBeEnabled();
});

test('group and ungroup, from row B and from Ctrl+G / Ctrl+Shift+G', async ({ page }) => {
  await select(page, ALL);
  await expectOneStep(page, () => page.getByTestId('group').click());
  let tree = await elements(page);
  expect(tree).toHaveLength(1);
  expect(tree[0]).toMatchObject({ type: 'group', frame: { x: 100, y: 100, w: 900, h: 800 } });
  expect(tree[0]!.children!.map((c) => c.id)).toEqual(ALL);
  expect(await selected(page)).toEqual([tree[0]!.id]);
  await expect(rowB(page)).toHaveAttribute('data-selection', 'group');

  await expectOneStep(page, () => page.getByTestId('ungroup').click());
  expect(await order(page)).toEqual(ALL);
  expect((await selected(page)).sort()).toEqual(ALL);
  expect(await frames(page, ALL)).toMatchObject({ e_a: { x: 100, y: 100 }, e_c: { x: 900 } });

  await select(page, ['e_a', 'e_b']);
  await focusStage(page);
  await expectOneStep(page, () => page.keyboard.press('Control+g'));
  tree = await elements(page);
  expect(tree.map((e) => e.type)).toEqual(['group', 'shape']);
  const groupId = tree[0]!.id;
  expect(await selected(page)).toEqual([groupId]);
  await expectOneStep(page, () => page.keyboard.press('Control+Shift+g'));
  expect(await order(page)).toEqual(ALL);
  expect((await selected(page)).sort()).toEqual(['e_a', 'e_b']);

  // One element is nothing to group: the menu says so, and the key does nothing.
  await select(page, ['e_a']);
  await expect(await arrangeItem(page, 'קיבוץ')).toHaveAttribute('data-disabled', '');
  await expect(
    page.getByTestId('arrange-menu-content').getByRole('menuitem', { name: 'פירוק קבוצה' }),
  ).toHaveAttribute('data-disabled', '');
});

test('the four z-order moves, from the Arrange menu and from the shortcuts', async ({ page }) => {
  test.slow();
  const viaMenu = async (name: string) => {
    const item = await arrangeItem(page, name);
    await expectOneStep(page, () => item.click());
  };
  const viaKeys = async (keys: string) => {
    await focusStage(page);
    await expectOneStep(page, () => page.keyboard.press(keys));
  };

  // Bottom to top: a, b, c.
  await select(page, ['e_a']);
  await viaMenu('הבאה קדימה');
  expect(await order(page)).toEqual(['e_b', 'e_a', 'e_c']);
  await viaMenu('הבאה לחזית');
  expect(await order(page)).toEqual(['e_b', 'e_c', 'e_a']);
  // On top already: nothing further up.
  await expect(await arrangeItem(page, 'הבאה לחזית')).toHaveAttribute('data-disabled', '');
  await expect(
    page.getByTestId('arrange-menu-content').getByRole('menuitem', { name: 'הבאה קדימה' }),
  ).toHaveAttribute('data-disabled', '');
  await page.keyboard.press('Escape');

  await viaMenu('העברה אחורה');
  expect(await order(page)).toEqual(['e_b', 'e_a', 'e_c']);
  await viaMenu('העברה לרקע');
  expect(await order(page)).toEqual(['e_a', 'e_b', 'e_c']);

  await viaKeys('Control+BracketRight');
  expect(await order(page)).toEqual(['e_b', 'e_a', 'e_c']);
  await viaKeys('Control+Shift+BracketRight');
  expect(await order(page)).toEqual(['e_b', 'e_c', 'e_a']);
  await viaKeys('Control+BracketLeft');
  expect(await order(page)).toEqual(['e_b', 'e_a', 'e_c']);
  await viaKeys('Control+Shift+BracketLeft');
  expect(await order(page)).toEqual(['e_a', 'e_b', 'e_c']);

  // Several at once keep their own order.
  await select(page, ['e_a', 'e_b']);
  await viaKeys('Control+Shift+BracketRight');
  expect(await order(page)).toEqual(['e_c', 'e_a', 'e_b']);
});

test('align to the slide, for a single element too', async ({ page }) => {
  await select(page, ['e_a']);
  await expectOneStep(page, () => clickSlideItem(page, 'slide-center'));
  expect((await frames(page, ['e_a'])).e_a).toMatchObject({ x: 910, y: 100 });

  await expectOneStep(page, () => clickSlideItem(page, 'slide-bottom'));
  expect((await frames(page, ['e_a'])).e_a).toMatchObject({ x: 910, y: 980 });

  // Against the slide, distributing spreads from edge to edge.
  await select(page, ALL);
  await expectOneStep(page, () => clickSlideItem(page, 'slide-distribute-horizontal'));
  const after = await frames(page, ALL);
  // In the order of their centres: B, C, then A, which was moved to the middle above.
  expect([after.e_b!.x, after.e_c!.x, after.e_a!.x]).toEqual([0, 960, 1820]);
});

test('duplicate with Ctrl+D and from the menu: the copies land next to the originals, selected', async ({
  page,
}) => {
  await select(page, ['e_a', 'e_b']);
  await focusStage(page);
  await expectOneStep(page, () => page.keyboard.press('Control+d'));
  let tree = await elements(page);
  expect(tree.map((e) => e.id).slice(0, 3)).toEqual(ALL);
  const copies = tree.slice(3);
  expect(copies.map((e) => e.frame)).toEqual([
    { x: 124, y: 124, w: 100, h: 100 },
    { x: 424, y: 324, w: 200, h: 100 },
  ]);
  expect(await selected(page)).toEqual(copies.map((e) => e.id));

  // The copy is what is selected, so duplicating again walks on.
  const item = await arrangeItem(page, 'שכפול');
  await expectOneStep(page, () => item.click());
  tree = await elements(page);
  expect(tree).toHaveLength(7);
  expect(tree.at(-1)!.frame).toMatchObject({ x: 448, y: 348 });
});

test('delete from the Arrange menu skips what is locked', async ({ page }) => {
  await page.evaluate(() => {
    const editor = window.slidr!;
    const slideId = editor.selection.getState().currentSlideId!;
    editor.bus.dispatch({
      type: 'element.update',
      slideId,
      elementId: 'e_b',
      patch: { locked: true },
    });
  });
  await select(page, ['e_b', 'e_c']);
  const item = await arrangeItem(page, 'מחיקה');
  await expectOneStep(page, () => item.click());
  expect(await order(page)).toEqual(['e_a', 'e_b']);
});

test.describe('the Layers panel', () => {
  const row = (page: Page, id: string) => page.locator(`[data-layer="${id}"]`);

  test.beforeEach(async ({ page }) => {
    await page.getByRole('button', { name: 'שכבות', exact: true }).click();
    await expect(page.getByTestId('layers')).toBeVisible();
  });

  test('lists the slide top first, groups with their children, and selects with Ctrl and Shift', async ({
    page,
  }) => {
    const rows = page.getByTestId('layers').getByRole('treeitem');
    await expect(shownName(rows)).toHaveText(['C', 'B', 'A']);

    await row(page, 'e_c').click();
    expect(await selected(page)).toEqual(['e_c']);
    await expect(row(page, 'e_c')).toHaveAttribute('aria-selected', 'true');
    await row(page, 'e_a').click({ modifiers: ['Shift'] });
    expect(await selected(page)).toEqual(['e_c', 'e_b', 'e_a']);
    await row(page, 'e_b').click({ modifiers: ['Control'] });
    expect(await selected(page)).toEqual(['e_c', 'e_a']);

    await select(page, ['e_a', 'e_b']);
    await page.getByTestId('group').click();
    const [groupId] = await selected(page);
    await expect(shownName(rows)).toHaveText(['C', 'קבוצה', 'B', 'A']);
    await expect(row(page, groupId!)).toHaveAttribute('aria-level', '1');
    await expect(row(page, 'e_b')).toHaveAttribute('aria-level', '2');
    // A child is picked on its own from the panel.
    await row(page, 'e_b').click();
    expect(await selected(page)).toEqual(['e_b']);
  });

  test('lock and unlock: the row is the way back to an element the Stage will not select', async ({
    page,
  }) => {
    const lock = row(page, 'e_b').getByTestId('layer-lock');
    // The toggle is quiet until the row is pointed at.
    await expect(lock).toHaveCSS('opacity', '0');
    await row(page, 'e_b').hover();
    await expect(lock).toHaveCSS('opacity', '1');

    await expectOneStep(page, () => lock.click());
    expect((await elements(page))[1]).toMatchObject({ id: 'e_b', locked: true });
    await expect(row(page, 'e_b')).toHaveAttribute('data-locked', 'true');
    await expect(lock).toHaveAttribute('aria-pressed', 'true');
    // Locked, it shows its lock without the pointer.
    await page.mouse.move(0, 0);
    await expect(lock).toHaveCSS('opacity', '1');

    // The Stage does not pick a locked element; the panel does.
    const box = (await page
      .getByTestId('stage-surface')
      .locator('[data-element-id="e_b"]')
      .boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    expect(await selected(page)).toEqual([]);
    await row(page, 'e_b').click();
    expect(await selected(page)).toEqual(['e_b']);

    // With all of the selection locked, the Arrange menu offers to unlock.
    const item = await arrangeItem(page, 'ביטול נעילה');
    await expectOneStep(page, () => item.click());
    expect((await elements(page))[1]!.locked).toBeUndefined();
    await expect(lock).toHaveAttribute('aria-pressed', 'false');

    // And "Lock" in the menu locks the whole selection.
    await select(page, ['e_a', 'e_c']);
    const lockItem = await arrangeItem(page, 'נעילה');
    await expectOneStep(page, () => lockItem.click());
    expect((await elements(page)).map((e) => Boolean(e.locked))).toEqual([true, false, true]);
    await expectOneStep(page, () => row(page, 'e_a').getByTestId('layer-lock').click());
    expect((await elements(page))[0]!.locked).toBeUndefined();
  });

  test('hide and show: a hidden element leaves the slide and stays in the panel', async ({
    page,
  }) => {
    const onStage = page.getByTestId('stage-surface').locator('[data-element-id="e_c"]');
    const eye = row(page, 'e_c').getByTestId('layer-visibility');
    await expect(onStage).toBeVisible();

    await expectOneStep(page, () => eye.click());
    expect((await elements(page))[2]).toMatchObject({ id: 'e_c', hidden: true });
    await expect(onStage).toHaveCount(0);
    await expect(row(page, 'e_c')).toHaveAttribute('data-hidden', 'true');

    // Still there to be picked, and shown again.
    await row(page, 'e_c').click();
    expect(await selected(page)).toEqual(['e_c']);
    await expectOneStep(page, () => eye.click());
    expect((await elements(page))[2]!.hidden).toBeUndefined();
    await expect(onStage).toBeVisible();

    // "Hide" in the Arrange menu hides the selection and lets go of it.
    await select(page, ['e_a', 'e_c']);
    const item = await arrangeItem(page, 'הסתרה');
    await item.click();
    expect((await elements(page)).map((e) => Boolean(e.hidden))).toEqual([true, false, true]);
    expect(await selected(page)).toEqual([]);
    await undo(page);
    expect((await elements(page)).some((e) => e.hidden)).toBe(false);
  });

  test('a double click renames; Esc leaves the name as it was', async ({ page }) => {
    await row(page, 'e_a').dblclick();
    const field = page.getByTestId('layer-name');
    await expect(field).toBeFocused();
    await expect(field).toHaveValue('A');
    await field.fill('כותרת ראשית');
    await expectOneStep(page, () => field.press('Enter'));
    expect((await elements(page))[0]!.name).toBe('כותרת ראשית');
    await expect(shownName(row(page, 'e_a'))).toHaveText('כותרת ראשית');

    await row(page, 'e_a').dblclick();
    await page.getByTestId('layer-name').fill('אחר');
    await page.getByTestId('layer-name').press('Escape');
    await expect(page.getByTestId('layer-name')).toHaveCount(0);
    expect((await elements(page))[0]!.name).toBe('כותרת ראשית');

    // Without a name the row says what the element is, or how its text begins.
    await row(page, 'e_a').dblclick();
    await page.getByTestId('layer-name').fill('');
    await page.getByTestId('layer-name').press('Enter');
    expect((await elements(page))[0]!.name).toBeUndefined();
    await expect(shownName(row(page, 'e_a'))).toHaveText('צורה');
  });

  test('an empty slide says so', async ({ page }) => {
    await select(page, ALL);
    await focusStage(page);
    await page.keyboard.press('Delete');
    await expect(page.getByText('אין אובייקטים בשקף')).toBeVisible();
  });
});

test('Delete in the Layers panel keeps the keyboard in the list, on the row that took the place', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'שכבות', exact: true }).click();
  const rows = page.getByTestId('layers').getByRole('treeitem');
  await expect(shownName(rows)).toHaveText(['C', 'B', 'A']);
  const row = (id: string) => page.locator(`[data-layer="${id}"]`);

  await row('e_c').click();
  await expectOneStep(page, () => page.keyboard.press('Delete'));
  expect(await order(page)).toEqual(['e_a', 'e_b']);
  // The row below the one removed has the keyboard, and the arrows go on from it.
  await expect(row('e_b')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(row('e_a')).toBeFocused();
  expect(await selected(page)).toEqual(['e_a']);

  // The last row removed: the keyboard goes to the one above it.
  await expectOneStep(page, () => page.keyboard.press('Delete'));
  expect(await order(page)).toEqual(['e_b']);
  await expect(row('e_b')).toBeFocused();
});
