import { expect, test, type Page } from '@playwright/test';
import {
  addBoxes,
  elements,
  expectOneStep,
  focusStage,
  frames,
  openApp,
  select,
  selected,
  THREE,
  undo,
  undoSteps,
} from './arrange-helpers';

/*
 * What M1 left open on the Stage: turning several elements together, reaching every element and
 * every handle from the keyboard (UI-06), and groups that stay fitted to their children after a
 * change that did not come from a gesture.
 */

const surface = (page: Page) => page.getByTestId('stage-surface');
const rotations = async (page: Page, ids: string[]) => {
  const all = await elements(page);
  return ids.map(
    (id) => (all.find((e) => e.id === id) as unknown as { rotation: number }).rotation,
  );
};

test.beforeEach(async ({ page }) => {
  await openApp(page);
  await addBoxes(page, THREE);
});

test('the rotation handle of the box around several elements turns them together', async ({
  page,
}) => {
  await select(page, ['e_a', 'e_b']);
  const handle = surface(page).locator('[data-handle="rotate"]');
  await expect(handle).toHaveCount(1);
  const from = (await handle.boundingBox())!;
  const before = await frames(page, ['e_a', 'e_b']);
  const steps = await undoSteps(page);

  // Drag the handle a quarter of the way round, with Shift: a multiple of 15 degrees.
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.keyboard.down('Shift');
  await page.mouse.move(from.x + 260, from.y + 180, { steps: 6 });
  await expect(surface(page).locator('[data-stage-label]')).toContainText('°');
  await page.mouse.up();
  await page.keyboard.up('Shift');

  const [a, b] = await rotations(page, ['e_a', 'e_b']);
  expect(a).toBeGreaterThan(0);
  expect(a! % 15).toBe(0);
  expect(b).toBe(a);
  // They turned around their common centre: both moved, and neither changed size.
  const after = await frames(page, ['e_a', 'e_b']);
  expect(after.e_a).not.toEqual(before.e_a);
  expect([after.e_a!.w, after.e_a!.h]).toEqual([before.e_a!.w, before.e_a!.h]);
  expect(await undoSteps(page)).toBe(steps + 1);
  await undo(page);
  expect(await frames(page, ['e_a', 'e_b'])).toEqual(before);
  expect(await rotations(page, ['e_a', 'e_b'])).toEqual([0, 0]);
});

test('Esc during the turn takes it back', async ({ page }) => {
  await select(page, ['e_a', 'e_c']);
  const handle = surface(page).locator('[data-handle="rotate"]');
  const from = (await handle.boundingBox())!;
  const steps = await undoSteps(page);
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + 200, from.y + 120, { steps: 4 });
  await expect.poll(async () => (await rotations(page, ['e_a']))[0]).not.toBe(0);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  expect(await rotations(page, ['e_a', 'e_c'])).toEqual([0, 0]);
  expect(await undoSteps(page)).toBe(steps);
});

test('Tab walks the elements of the slide, and leaves the Stage past the last one', async ({
  page,
}) => {
  await focusStage(page);
  await page.keyboard.press('Tab');
  expect(await selected(page)).toEqual(['e_a']);
  await page.keyboard.press('Tab');
  expect(await selected(page)).toEqual(['e_b']);
  await page.keyboard.press('Shift+Tab');
  expect(await selected(page)).toEqual(['e_a']);
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  expect(await selected(page)).toEqual(['e_c']);
  await expect(surface(page)).toBeFocused();
  // Past the last element the key is the browser's again.
  await page.keyboard.press('Tab');
  expect(await selected(page)).toEqual([]);
  await expect(surface(page)).not.toBeFocused();
});

test('Alt with the side arrows turns the selection, as one undo step for a burst', async ({
  page,
}) => {
  await select(page, ['e_b']);
  await focusStage(page);
  await expectOneStep(page, async () => {
    await page.keyboard.press('Alt+ArrowRight');
    await page.keyboard.press('Alt+ArrowRight');
    await page.keyboard.press('Alt+Shift+ArrowRight');
  });
  expect(await rotations(page, ['e_b'])).toEqual([17]);
  // A pause ends the burst: the next press is a step of its own.
  await page.waitForTimeout(900);
  await expectOneStep(page, () => page.keyboard.press('Alt+ArrowLeft'));
  expect(await rotations(page, ['e_b'])).toEqual([16]);
});

test('Ctrl with the arrows sizes the selection from its end and its bottom', async ({ page }) => {
  await select(page, ['e_b']);
  await focusStage(page);
  const before = (await frames(page, ['e_b'])).e_b!;
  await expectOneStep(page, async () => {
    await page.keyboard.press('Control+ArrowRight');
    await page.keyboard.press('Control+Shift+ArrowDown');
    await page.keyboard.press('Control+ArrowLeft');
    await page.keyboard.press('Control+ArrowLeft');
  });
  expect((await frames(page, ['e_b'])).e_b).toEqual({
    x: before.x,
    y: before.y,
    w: before.w - 1,
    h: before.h + 10,
  });
});

test('several elements are sized and turned together from the keyboard', async ({ page }) => {
  await select(page, ['e_a', 'e_b']);
  await focusStage(page);
  const before = await frames(page, ['e_a', 'e_b']);
  await expectOneStep(page, () => page.keyboard.press('Control+Shift+ArrowRight'));
  const after = await frames(page, ['e_a', 'e_b']);
  // The box around them grew by ten pixels: the far element moved, both grew a little.
  expect(after.e_a!.x).toBe(before.e_a!.x);
  expect(after.e_b!.x + after.e_b!.w).toBeCloseTo(before.e_b!.x + before.e_b!.w + 10, 1);
  await page.waitForTimeout(900);
  await expectOneStep(page, () => page.keyboard.press('Alt+Shift+ArrowRight'));
  expect(await rotations(page, ['e_a', 'e_b'])).toEqual([15, 15]);
});

test('several elements turn around one centre for all the presses, and back to where they were', async ({
  page,
}) => {
  await select(page, ['e_a', 'e_c']);
  await focusStage(page);
  const before = await frames(page, ['e_a', 'e_c']);
  // There and back, also with a pause between the two, which makes them two undo steps.
  await page.keyboard.press('Alt+Shift+ArrowRight');
  await page.keyboard.press('Alt+Shift+ArrowRight');
  await page.waitForTimeout(900);
  await page.keyboard.press('Alt+Shift+ArrowLeft');
  await page.keyboard.press('Alt+Shift+ArrowLeft');
  expect(await frames(page, ['e_a', 'e_c'])).toEqual(before);
  expect(await rotations(page, ['e_a', 'e_c'])).toEqual([0, 0]);

  // A quarter turn in six presses is the quarter turn of the handle: each centre goes a
  // quarter of the way around the centre of the box that was around them.
  for (let i = 0; i < 6; i++) await page.keyboard.press('Alt+Shift+ArrowRight');
  const centre = { x: (100 + 1000) / 2, y: (100 + 900) / 2 };
  const turned = await frames(page, ['e_a', 'e_c']);
  const centreOf = (f: { x: number; y: number; w: number; h: number }) => ({
    x: f.x + f.w / 2,
    y: f.y + f.h / 2,
  });
  const quarter = (p: { x: number; y: number }) => ({
    x: centre.x - (p.y - centre.y),
    y: centre.y + (p.x - centre.x),
  });
  for (const id of ['e_a', 'e_c'] as const) {
    const want = quarter(centreOf(before[id]!));
    const got = centreOf(turned[id]!);
    expect(got.x).toBeCloseTo(want.x, 2);
    expect(got.y).toBeCloseTo(want.y, 2);
  }
  expect(await rotations(page, ['e_a', 'e_c'])).toEqual([90, 90]);
  // And a full turn brings them home.
  for (let i = 0; i < 18; i++) await page.keyboard.press('Alt+Shift+ArrowRight');
  expect(await frames(page, ['e_a', 'e_c'])).toEqual(before);

  // A move in between starts the turn again, around where they are now.
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Alt+Shift+ArrowRight');
  await page.keyboard.press('Alt+Shift+ArrowLeft');
  const moved = await frames(page, ['e_a', 'e_c']);
  expect(moved.e_a).toEqual({ ...before.e_a!, x: before.e_a!.x + 1 });
  expect(moved.e_c).toEqual({ ...before.e_c!, x: before.e_c!.x + 1 });
});

test('children of a group turn together around one centre too, and the group stays around them', async ({
  page,
}) => {
  await page.evaluate(() => {
    const editor = window.slidr!;
    editor.bus.dispatch({
      type: 'element.group',
      slideId: editor.selection.getState().currentSlideId!,
      elementIds: ['e_a', 'e_b', 'e_c'],
      groupId: 'e_group',
    });
  });
  await select(page, ['e_a', 'e_c']);
  await focusStage(page);
  const before = await frames(page, ['e_group', 'e_a', 'e_b', 'e_c']);
  await page.keyboard.press('Alt+Shift+ArrowRight');
  await page.keyboard.press('Alt+Shift+ArrowRight');
  expect(await frames(page, ['e_group', 'e_a', 'e_b', 'e_c'])).not.toEqual(before);
  await page.keyboard.press('Alt+Shift+ArrowLeft');
  await page.keyboard.press('Alt+Shift+ArrowLeft');
  expect(await frames(page, ['e_group', 'e_a', 'e_b', 'e_c'])).toEqual(before);
});

test('a group stays around its children when one of them is aligned from a menu', async ({
  page,
}) => {
  await page.evaluate(() => {
    const editor = window.slidr!;
    const slideId = editor.selection.getState().currentSlideId!;
    editor.bus.dispatch({
      type: 'element.group',
      slideId,
      elementIds: ['e_a', 'e_b'],
      groupId: 'e_group',
    });
  });
  const group = async () => (await elements(page)).find((e) => e.id === 'e_group')!;
  // The children of a group are written in the group's own coordinates.
  const fits = async () => {
    const g = await group();
    const kids = g.children!;
    const left = Math.min(...kids.map((k) => k.frame.x));
    const top = Math.min(...kids.map((k) => k.frame.y));
    const right = Math.max(...kids.map((k) => k.frame.x + k.frame.w));
    const bottom = Math.max(...kids.map((k) => k.frame.y + k.frame.h));
    return left === 0 && top === 0 && right === g.frame.w && bottom === g.frame.h;
  };
  expect(await fits()).toBe(true);

  // A child selected from outside the Stage, and aligned to the slide from the Arrange menu.
  await select(page, ['e_b']);
  await page.getByTestId('arrange-menu').click();
  const trigger = page
    .getByTestId('arrange-menu-content')
    .getByRole('menuitem', { name: 'יישור לשקף' });
  await trigger.hover();
  const item = page.getByTestId('slide-right');
  await expect(item).toBeInViewport();
  const row = (await trigger.boundingBox())!;
  const box = (await item.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, row.y + row.height / 2, { steps: 8 });
  await expectOneStep(page, () => item.click());
  expect(await fits()).toBe(true);
  // The child reached the right edge of the slide, and the group grew to hold it there.
  const g = await group();
  expect(g.frame.x + g.frame.w).toBe(1920);
});
