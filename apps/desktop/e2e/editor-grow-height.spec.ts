import { expect, test, type Page } from '@playwright/test';
import {
  elements,
  focusStage,
  frames,
  openApp,
  paste,
  select,
  selected,
  undo,
  undoSteps,
} from './arrange-helpers';
import { addText, para } from './text-helpers';

/*
 * A text box that grows with its text (`autoFit: growHeight`) is drawn as tall as its text. Its
 * frame follows, in the undo step of the change that made the text wrap otherwise: typing and
 * formatting (ADR-012, ADR-013), and what does not come from the text at all: a resize by a
 * handle, by the keys or by a number, and a paste.
 */

const surface = (page: Page) => page.getByTestId('stage-surface');
const onStage = (page: Page, id: string) =>
  page.getByTestId('stage-frame').locator(`[data-element-id="${id}"]`);

const LONG = 'word '.repeat(30).trim();

/** The height of a box in the model, and the height it is drawn at, in slide pixels. */
async function heights(page: Page, id: string) {
  const model = (await frames(page, [id]))[id]!;
  const drawn = await onStage(page, id).evaluate((el) => (el as HTMLElement).offsetHeight);
  return { model, drawn };
}

/** Waits until the frame of a box is as tall as the box is drawn, and returns both. */
async function settled(page: Page, id: string) {
  await expect
    .poll(async () => {
      const { model, drawn } = await heights(page, id);
      return Math.abs(drawn - model.h);
    })
    .toBeLessThan(1.5);
  return heights(page, id);
}

/**
 * A growing text box as the app leaves one: with the frame as tall as its text. Added here
 * through the bus, which measures nothing, so the height is written as it is drawn.
 */
async function addGrowing(page: Page, id = 'e_t') {
  await addText(page, id, [para(LONG)], {
    frame: { x: 200, y: 200, w: 800, h: 40 },
    autoFit: 'growHeight',
  });
  const drawn = await onStage(page, id).evaluate((el) => (el as HTMLElement).offsetHeight);
  await page.evaluate(
    ({ elementId, h }) => {
      const editor = window.slidr!;
      editor.bus.dispatch({
        type: 'element.update',
        slideId: editor.selection.getState().currentSlideId!,
        elementId,
        patch: { frame: { x: 200, y: 200, w: 800, h } },
      });
    },
    { elementId: id, h: drawn },
  );
}

test('a handle that makes the box narrower leaves its frame as tall as its text, in one step', async ({
  page,
}) => {
  await openApp(page, { lang: 'en' });
  await focusStage(page);
  // The app's own way to a text box: T. It grows with its text.
  await page.keyboard.press('t');
  await expect(page.locator('[data-text-editor]')).toBeFocused();
  await page.keyboard.type(LONG);
  await page.keyboard.press('Escape');
  const [id] = await selected(page);
  const before = await settled(page, id!);
  const steps = await undoSteps(page);

  // The right handle, dragged to half the width: the text wraps into more lines.
  const handle = (await surface(page).locator('[data-handle="e"]').boundingBox())!;
  const box = (await onStage(page, id!).boundingBox())!;
  const x = handle.x + handle.width / 2;
  const y = handle.y + handle.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - box.width / 4, y, { steps: 5 });
  await page.mouse.move(x - box.width / 2, y, { steps: 5 });
  await page.mouse.up();

  const after = await settled(page, id!);
  expect(after.model.w).toBeLessThan(before.model.w * 0.6);
  expect(after.model.h).toBeGreaterThan(before.model.h);
  // The width and the height that follows it are one undo step.
  expect(await undoSteps(page)).toBe(steps + 1);
  await undo(page);
  expect((await frames(page, [id!]))[id!]).toEqual(before.model);
});

test('Ctrl with the arrows, too: the height follows the width of every press', async ({ page }) => {
  await openApp(page, { lang: 'en' });
  await addGrowing(page);
  await select(page, ['e_t']);
  await focusStage(page);
  const before = await settled(page, 'e_t');
  const steps = await undoSteps(page);
  for (let i = 0; i < 30; i++) await page.keyboard.press('Control+Shift+ArrowLeft');
  const after = await settled(page, 'e_t');
  expect(after.model.w).toBe(before.model.w - 300);
  expect(after.model.h).toBeGreaterThan(before.model.h);
  expect(await undoSteps(page)).toBe(steps + 1);
});

test('a width typed as a number, too; and a height that is typed gives way to the text', async ({
  page,
}) => {
  await openApp(page, { lang: 'en' });
  await addGrowing(page);
  await select(page, ['e_t']);
  await focusStage(page);
  const before = await settled(page, 'e_t');
  await page.getByTestId('placement-tool').click();
  const editor = page.getByTestId('placement-editor');
  const steps = await undoSteps(page);
  const width = editor.getByRole('textbox', { name: 'Width' });
  await width.fill('400');
  await width.press('Enter');
  const narrow = await settled(page, 'e_t');
  expect(narrow.model.w).toBe(400);
  expect(narrow.model.h).toBeGreaterThan(before.model.h);
  expect(await undoSteps(page)).toBe(steps + 1);

  // The box is as tall as its text: a height that says otherwise does not hold.
  const height = editor.getByRole('textbox', { name: 'Height' });
  await height.fill('900');
  await height.press('Enter');
  const again = await settled(page, 'e_t');
  expect(again.model.h).toBe(narrow.model.h);
});

test('text pasted on the slide becomes a text box whose frame is as tall as its text', async ({
  page,
}) => {
  await openApp(page, { lang: 'en' });
  await focusStage(page);
  const steps = await undoSteps(page);
  await paste(page, {
    'text/plain': 'A sentence copied from somewhere else, long enough to wrap. '.repeat(5),
  });
  await expect.poll(async () => (await elements(page)).length).toBe(1);
  const [id] = await selected(page);
  const { model } = await settled(page, id!);
  // More than the one line the box was made with.
  expect(model.h).toBeGreaterThan(100);
  expect(await undoSteps(page)).toBe(steps + 1);
});

test('a growing text box inside a group that is resized follows too, and the group with it', async ({
  page,
}) => {
  await openApp(page, { lang: 'en' });
  await addGrowing(page);
  await addText(page, 'e_u', [para('beside')], { frame: { x: 1100, y: 200, w: 300, h: 60 } });
  await settled(page, 'e_t');
  await page.evaluate(() => {
    const editor = window.slidr!;
    editor.bus.dispatch({
      type: 'element.group',
      slideId: editor.selection.getState().currentSlideId!,
      elementIds: ['e_t', 'e_u'],
      groupId: 'e_group',
    });
  });
  await select(page, ['e_group']);
  await focusStage(page);
  const before = await settled(page, 'e_t');
  for (let i = 0; i < 40; i++) await page.keyboard.press('Control+Shift+ArrowLeft');
  const after = await settled(page, 'e_t');
  expect(after.model.w).toBeLessThan(before.model.w);
  expect(after.model.h).toBeGreaterThan(before.model.h);
  // The group reaches as far down as the box that grew.
  const all = await frames(page, ['e_group', 'e_t']);
  expect(all.e_group!.h).toBeGreaterThanOrEqual(all.e_t!.y + all.e_t!.h - 0.5);
});
