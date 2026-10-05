import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import type { ImageElement } from '@slidr/model';
import {
  addImage,
  chat,
  collectErrors,
  element,
  openApp,
  openTool,
  turnEnds,
  undoDepth,
} from './aitools-helpers';

/*
 * The AI tool of an image (AIO-04, AIO-05): editing the picture through the image provider, with
 * an area the user paints, and the controls that are not AI, which are row B's own. The agent is
 * the scripted mock of a plain browser page, and the image provider its stand-in, which edits
 * exactly and takes a mask.
 */

const out = (name: string) =>
  fileURLToPath(new URL(`../test-results/objects/${name}.png`, import.meta.url));

const actions = (page: Page) => page.getByTestId('ai-actions');
const picture = (page: Page) => element<ImageElement>(page, 'e_picture');

async function open(page: Page, lang: 'he' | 'en' = 'en', theme: 'light' | 'dark' = 'light') {
  await openApp(page, { script: 'image-alternatives', lang, theme });
  await addImage(page);
  await openTool(page, 'actions');
  await expect(page.getByTestId('image-edit-kind')).toHaveAttribute('data-kind', 'exact');
}

/** Paints a stroke across the middle of the painter's canvas. */
async function paintStroke(page: Page) {
  const box = (await page.getByTestId('mask-canvas').boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.5, { steps: 8 });
  await page.mouse.up();
}

test('the controls that are not AI are the ones row B has, and write the same fields', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await open(page);
  const local = page.getByTestId('image-local');
  const depth = await undoDepth(page);

  await local.getByRole('button', { name: 'Mask', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Circle' }).click();
  expect((await picture(page)).mask).toEqual({ kind: 'ellipse' });
  await page.keyboard.press('Escape');

  await local.getByRole('button', { name: 'Filter', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Sepia' }).click();
  expect((await picture(page)).filterPreset).toBe('sepia');
  await page.keyboard.press('Escape');
  expect(await undoDepth(page)).toBe(depth + 2);

  // Crop is the Stage's: the button starts it there.
  await local.getByRole('button', { name: 'Crop', exact: true }).click();
  expect(await page.evaluate(() => window.slidr!.selection.getState().editingElementId)).toBe(
    'e_picture',
  );
  expect(errors).toEqual([]);
});

test('an edit by words, inside an area painted on the image, goes to the chat as an action', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await open(page);
  const edit = actions(page).locator('[data-action="image.edit"]');
  // Without words there is nothing to ask for.
  await expect(edit).toBeDisabled();
  await expect(actions(page).locator('[data-action="image.restyle"]')).toBeEnabled();
  await page.getByTestId('image-prompt').fill('a red boat on the water');
  await expect(edit).toBeEnabled();

  // The area: painted over the image, kept only when something was painted.
  await page.getByTestId('image-mask').click();
  const painter = page.getByTestId('mask-painter');
  await expect(painter).toBeVisible();
  await expect(painter.getByTestId('mask-done')).toBeDisabled();
  await paintStroke(page);
  await expect(painter.getByTestId('mask-done')).toBeEnabled();
  await painter.getByRole('button', { name: 'Clear' }).click();
  await expect(painter.getByTestId('mask-done')).toBeDisabled();
  await paintStroke(page);
  await painter.getByTestId('mask-done').click();
  await expect(painter).toHaveCount(0);
  await expect(page.getByTestId('image-mask-set')).toBeVisible();
  await expect(page.getByTestId('image-mask')).toHaveAttribute('aria-pressed', 'true');

  // Pressed again, the mark is gone; painted anew, it is back.
  await page.getByTestId('image-mask').click();
  await expect(page.getByTestId('image-mask-set')).toHaveCount(0);
  await page.getByTestId('image-mask').click();
  await paintStroke(page);
  await page.getByTestId('mask-done').click();
  await expect(page.getByTestId('image-mask-set')).toBeVisible();

  // The action is a message of the object's chat, under its own name.
  await edit.click();
  await expect(chat(page)).toBeVisible();
  await expect(page.getByTestId('chat-user').last()).toHaveText('Change the image as described');
  await turnEnds(page);
  expect(errors).toEqual([]);
});

test('the mask of an edit is opaque where the image stays and clear where it was painted', async ({
  page,
}) => {
  await open(page);
  await page.getByTestId('image-prompt').fill('x');
  // The stored mask, read back as the image provider would read it.
  const imported = page.evaluate(
    () =>
      new Promise<{ name: string; alpha: number[]; size: number[] }>((resolve) => {
        const { assets } = window.slidr!;
        const original = assets.import.bind(assets);
        assets.import = async (file, origin) => {
          const bitmap = await createImageBitmap(file);
          const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
          const g = canvas.getContext('2d')!;
          g.drawImage(bitmap, 0, 0);
          const at = (x: number, y: number) => g.getImageData(x, y, 1, 1).data[3]!;
          resolve({
            name: file.name,
            size: [bitmap.width, bitmap.height],
            alpha: [at(bitmap.width / 2, bitmap.height / 2), at(5, 5)],
          });
          return original(file, origin);
        };
      }),
  );
  await page.getByTestId('image-mask').click();
  await paintStroke(page);
  await page.getByTestId('mask-done').click();
  expect(await imported).toEqual({ name: 'first-mask.png', size: [640, 400], alpha: [0, 255] });
});

test('extending an image asks the provider to fill around it, and the frame grows with it', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await open(page);
  const before = await picture(page);
  const depth = await undoDepth(page);
  await page.getByTestId('image-expand').click();
  // The stand-in provider takes a moment, as a real one takes a minute.
  await expect
    .poll(async () => (await picture(page)).assetId, { timeout: 20_000 })
    .not.toBe(before.assetId);
  const after = await picture(page);
  // The picture that was there keeps its height; the frame is wider by what was added (640 by
  // 400 extended to 16:9 is 711 by 400), around the same centre, and the crop is given up.
  expect(after.crop).toBeUndefined();
  expect(after.frame.h).toBe(before.frame.h);
  expect(after.frame.w).toBe(Math.round((before.frame.w * 711) / 639));
  expect(after.frame.x + after.frame.w / 2).toBeCloseTo(before.frame.x + before.frame.w / 2, 0);
  expect(await undoDepth(page)).toBe(depth + 1);
  await page.evaluate(() => window.slidr!.bus.undo());
  expect(await picture(page)).toEqual(before);
  expect(errors).toEqual([]);
});

for (const theme of ['light', 'dark'] as const) {
  for (const { lang, dir } of [
    { lang: 'he', dir: 'rtl' },
    { lang: 'en', dir: 'ltr' },
  ] as const) {
    test(`the image tool and the mask painter ${theme}-${dir}-1366`, async ({ page }) => {
      await page.setViewportSize({ width: 1366, height: 768 });
      await open(page, lang, theme);
      await page
        .getByTestId('image-prompt')
        .fill(lang === 'he' ? 'סירה אדומה על המים' : 'a red boat');
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(300);
      await page.screenshot({ path: out(`image-ai-${theme}-${dir}-1366`) });
      await page.getByTestId('image-mask').click();
      await paintStroke(page);
      await page.waitForTimeout(200);
      await page.screenshot({ path: out(`mask-painter-${theme}-${dir}-1366`) });
    });
  }
}
