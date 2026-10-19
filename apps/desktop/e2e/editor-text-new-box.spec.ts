import { expect, test, type Page } from '@playwright/test';
import { addBoxes, elements, focusStage, openApp, THREE, undoSteps } from './arrange-helpers';

/*
 * A new text box that is left without text is taken away again (ADR-013), and leaves nothing in
 * the history: not the box, and not what was done to it alone before it was left. Only when
 * something else was changed in between is taking it away a step of its own. As in PowerPoint,
 * an empty box stays while it is selected: Esc ends its typing and leaves it selected, and it
 * goes when it is let go, by a second Esc or a click elsewhere.
 */

const editor = (page: Page) => page.locator('[data-text-editor]');
const types = async (page: Page) => (await elements(page)).map((e) => e.type);
const canRedo = (page: Page) => page.evaluate(() => window.slidr!.bus.canRedo);

async function newBox(page: Page) {
  await focusStage(page);
  await page.keyboard.press('t');
  await expect(editor(page)).toBeFocused();
}

/** Ends the typing, and lets the box go. */
async function leave(page: Page) {
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
}

test.beforeEach(async ({ page }) => {
  await openApp(page, { lang: 'en' });
});

test('left empty at once, it leaves no step', async ({ page }) => {
  const steps = await undoSteps(page);
  await newBox(page);
  // Out of its typing it is still selected, and stays.
  await page.keyboard.press('Escape');
  await expect(editor(page)).toHaveCount(0);
  expect(await types(page)).toEqual(['text']);
  expect(
    await page.evaluate(() => window.slidr!.selection.getState().selectedElementIds),
  ).toHaveLength(1);
  // Let go, it goes.
  await page.keyboard.press('Escape');
  expect(await types(page)).toEqual([]);
  expect(await undoSteps(page)).toBe(steps);
});

test('a format key on its empty line leaves no step either, and nothing comes back with Ctrl+Z', async ({
  page,
}) => {
  await addBoxes(page, THREE);
  const steps = await undoSteps(page);
  await newBox(page);
  await page.keyboard.press('Control+b');
  await page.keyboard.press('Control+i');
  await leave(page);
  expect(await types(page)).toEqual(['shape', 'shape', 'shape']);
  expect(await undoSteps(page)).toBe(steps);
  expect(await canRedo(page)).toBe(false);
  // The step before the box is what Ctrl+Z undoes now: no empty, invisible box returns.
  await focusStage(page);
  await page.keyboard.press('Control+z');
  expect(await types(page)).toEqual([]);
});

test('text that was typed and deleted again goes with the box', async ({ page }) => {
  const steps = await undoSteps(page);
  await newBox(page);
  await page.keyboard.type('abc');
  await page.waitForTimeout(700);
  for (let i = 0; i < 3; i++) await page.keyboard.press('Backspace');
  await leave(page);
  expect(await types(page)).toEqual([]);
  expect(await undoSteps(page)).toBe(steps);
});

test('typing that was undone is not left to be redone into a box that is gone', async ({
  page,
}) => {
  const problems: string[] = [];
  page.on('pageerror', (error) => problems.push(error.message));
  await newBox(page);
  await page.keyboard.type('abc');
  await page.keyboard.press('Control+z');
  await leave(page);
  expect(await types(page)).toEqual([]);
  expect(await canRedo(page)).toBe(false);
  await focusStage(page);
  await page.keyboard.press('Control+y');
  expect(await types(page)).toEqual([]);
  expect(problems).toEqual([]);
});

test('text deleted after its typing ended takes the box away too, once it is let go', async ({
  page,
}) => {
  const steps = await undoSteps(page);
  await newBox(page);
  await page.keyboard.type('abc');
  await page.keyboard.press('Escape');
  expect(await types(page)).toEqual(['text']);
  // Opened again and emptied, it is an empty box like any other.
  await page.keyboard.press('Enter');
  await expect(editor(page)).toBeFocused();
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Backspace');
  await leave(page);
  expect(await types(page)).toEqual([]);
  expect(await undoSteps(page)).toBe(steps);
});

test('a box that has text stays, with its steps', async ({ page }) => {
  const steps = await undoSteps(page);
  await newBox(page);
  await page.keyboard.type('abc');
  await page.keyboard.press('Escape');
  expect(await types(page)).toEqual(['text']);
  // Adding it, and the typing.
  expect(await undoSteps(page)).toBe(steps + 2);
});

test('when something else changed meanwhile, taking the empty box away is a step of its own', async ({
  page,
}) => {
  await addBoxes(page, THREE);
  const steps = await undoSteps(page);
  await newBox(page);
  // The agent, or a panel, changes another element while the box is open.
  await page.evaluate(() => {
    const editor = window.slidr!;
    editor.bus.dispatch({
      type: 'element.update',
      slideId: editor.selection.getState().currentSlideId!,
      elementId: 'e_a',
      patch: { opacity: 0.5 },
    });
  });
  await leave(page);
  expect(await types(page)).toEqual(['shape', 'shape', 'shape']);
  // The box, the other change, and the box taken away: the other change is not undone for it.
  expect(await undoSteps(page)).toBe(steps + 3);
  expect((await elements(page))[0]).toMatchObject({ id: 'e_a', opacity: 0.5 });
});
