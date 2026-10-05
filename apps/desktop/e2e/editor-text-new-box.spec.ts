import { expect, test, type Page } from '@playwright/test';
import { addBoxes, elements, focusStage, openApp, THREE, undoSteps } from './arrange-helpers';

/*
 * A new text box that is left without text is taken away again (ADR-013), and leaves nothing in
 * the history: not the box, and not what was done to it alone before it was left. Only when
 * something else was changed in between is taking it away a step of its own.
 */

const editor = (page: Page) => page.locator('[data-text-editor]');
const types = async (page: Page) => (await elements(page)).map((e) => e.type);
const canRedo = (page: Page) => page.evaluate(() => window.slidr!.bus.canRedo);

async function newBox(page: Page) {
  await focusStage(page);
  await page.keyboard.press('t');
  await expect(editor(page)).toBeFocused();
}

test.beforeEach(async ({ page }) => {
  await openApp(page, { lang: 'en' });
});

test('left empty at once, it leaves no step', async ({ page }) => {
  const steps = await undoSteps(page);
  await newBox(page);
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
  await page.keyboard.press('Escape');
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
  await page.keyboard.press('Escape');
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
  await page.keyboard.press('Escape');
  expect(await types(page)).toEqual([]);
  expect(await canRedo(page)).toBe(false);
  await focusStage(page);
  await page.keyboard.press('Control+y');
  expect(await types(page)).toEqual([]);
  expect(problems).toEqual([]);
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
  await page.keyboard.press('Escape');
  expect(await types(page)).toEqual(['shape', 'shape', 'shape']);
  // The box, the other change, and the box taken away: the other change is not undone for it.
  expect(await undoSteps(page)).toBe(steps + 3);
  expect((await elements(page))[0]).toMatchObject({ id: 'e_a', opacity: 0.5 });
});
