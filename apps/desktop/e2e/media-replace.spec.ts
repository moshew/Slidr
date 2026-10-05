import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import type { Element, ImageElement } from '@slidr/model';
import {
  collectErrors,
  deck,
  elements,
  openApp,
  openMedia,
  redo,
  undo,
  undoDepth,
} from './media-helpers';
import { addElement, shape } from './objects-helpers';

/*
 * "Replace the selected picture" from the media panel (WG5-T13): with a picture selected on the
 * Stage, a tile of the panel (the deck's own pictures, the pictures the AI made, a stock photo)
 * offers its picture in that one's place. Only the file changes: the frame, the crop, the mask
 * and the adjustments stay, and it is one undo step.
 */

const out = (name: string) =>
  fileURLToPath(new URL(`../test-results/media/${name}.png`, import.meta.url));

/** What the picture on the slide has besides its file. */
const LOOK = {
  frame: { x: 560, y: 280, w: 640, h: 400 },
  crop: { x: 0.1, y: 0.15, w: 0.8, h: 0.7 },
  mask: { kind: 'rounded', radius: 32 },
  adjust: { brightness: 1.1 },
  filterPreset: 'warm',
} as const;

/** Imports a picture of one colour into the deck, as an upload or as one the AI made. */
function addAsset(
  page: Page,
  name: string,
  shade: string,
  made?: { prompt: string },
): Promise<string> {
  return page.evaluate(
    async ({ name, shade, made }) => {
      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 200;
      const context = canvas.getContext('2d')!;
      context.fillStyle = shade;
      context.fillRect(0, 0, 320, 200);
      const blob = await new Promise<Blob>((resolve) =>
        canvas.toBlob((b) => resolve(b!), 'image/png'),
      );
      const editor = window.slidr!;
      const stored = await editor.assets.import(new File([blob], name, { type: 'image/png' }));
      const asset = made
        ? { ...stored, origin: 'ai' as const, lineage: { provider: 'mock', prompt: made.prompt } }
        : stored;
      editor.bus.dispatch({ type: 'asset.add', asset });
      return asset.id;
    },
    { name, shade, made },
  );
}

/** Puts a picture on the slide with a crop, a mask and adjustments, and selects it. */
async function addPicture(page: Page, assetId: string): Promise<void> {
  await page.evaluate(
    ({ assetId, look }) => {
      const editor = window.slidr!;
      editor.bus.dispatch({
        type: 'element.add',
        slideId: editor.selection.getState().currentSlideId!,
        element: {
          id: 'e_photo',
          type: 'image',
          rotation: 0,
          opacity: 1,
          fit: 'cover',
          alt: 'The team at the harbour',
          assetId,
          ...look,
        } as unknown as Element,
      });
      editor.selection.getState().selectElements(['e_photo']);
    },
    { assetId, look: LOOK },
  );
}

const select = (page: Page, ids: string[]) =>
  page.evaluate((ids) => window.slidr!.selection.getState().selectElements(ids), ids);

const photo = async (page: Page) =>
  (await elements(page)).find((element) => element.id === 'e_photo') as ImageElement;

test("a picture of the deck takes the selected picture's place, and only the file changes", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await openApp(page, { lang: 'en' });
  const shown = await addAsset(page, 'on the slide.png', 'teal');
  const spare = await addAsset(page, 'spare.png', 'gold');
  await addPicture(page, shown);
  const panel = await openMedia(page, 'uploads');
  await select(page, []);
  const offer = (id: string) => panel.locator(`[data-replace-with="${id}"]`);

  // Nothing is selected: a tile only adds its picture to the slide.
  await expect(panel.getByTestId('media-replace-hint')).toHaveCount(0);
  await expect(offer(spare)).toHaveCount(0);

  // With the picture selected the panel says what the buttons are for, and every other
  // picture offers itself; the one the element already shows does not.
  await select(page, ['e_photo']);
  await expect(panel.getByTestId('media-replace-hint')).toContainText('A picture is selected');
  await expect(offer(spare)).toBeVisible();
  await expect(offer(spare)).toHaveAccessibleName('Replace the selected picture: spare');
  await expect(offer(shown)).toHaveCount(0);

  const before = await photo(page);
  const steps = await undoDepth(page);
  await offer(spare).click();
  const after = await photo(page);
  // The frame, the crop, the mask, the adjustments, the filter and the alt text the user wrote.
  expect(after).toEqual({ ...before, assetId: spare });
  expect(after).toMatchObject(LOOK);
  expect(await undoDepth(page)).toBe(steps + 1);
  // The picture stays selected, the keyboard is the Stage's, and now the other tile offers.
  await expect(page.getByTestId('stage-surface')).toBeFocused();
  await expect(offer(shown)).toBeVisible();
  await expect(offer(spare)).toHaveCount(0);
  // A click on the tile itself still adds the picture to the slide.
  await panel.locator(`[data-asset="${shown}"]`).click();
  expect(await elements(page)).toHaveLength(2);
  await undo(page);

  await undo(page);
  expect(await photo(page)).toEqual(before);
  await redo(page);
  expect((await photo(page)).assetId).toBe(spare);

  // Two elements selected, or one that is not a picture: nothing to replace.
  await addElement(page, shape('rect', { id: 'e_box' }));
  await select(page, ['e_box']);
  await expect(panel.locator('[data-replace-with]')).toHaveCount(0);
  await select(page, ['e_photo', 'e_box']);
  await expect(panel.locator('[data-replace-with]')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('a picture the AI made, and a stock photo with its credit, take its place the same way', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await openApp(page, { lang: 'en' });
  const shown = await addAsset(page, 'on the slide.png', 'teal');
  const made = await addAsset(page, 'generated.png', 'purple', {
    prompt: 'a lighthouse at dusk',
  });
  await addPicture(page, shown);
  const before = await photo(page);

  // ---- From the pictures the AI made.
  const ai = await openMedia(page, 'ai');
  await select(page, ['e_photo']);
  const fromAi = ai.locator(`[data-replace-with="${made}"]`);
  await expect(fromAi).toHaveAccessibleName('Replace the selected picture: a lighthouse at dusk');
  let steps = await undoDepth(page);
  await fromAi.click();
  expect(await photo(page)).toEqual({ ...before, assetId: made });
  expect(await undoDepth(page)).toBe(steps + 1);

  // ---- From the stock library: the photo is taken into the deck in the same step.
  const stock = await openMedia(page, 'stock');
  await page.getByTestId('stock-query').fill('tower');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('stock-results').locator('[data-photo]').first()).toBeVisible();
  await select(page, ['e_photo']);
  await expect(stock.getByTestId('media-replace-hint')).toBeVisible();
  const assetsBefore = Object.keys((await deck(page)).assets);
  steps = await undoDepth(page);
  await stock.locator('[data-replace-with]').first().click();
  await expect.poll(async () => (await photo(page)).assetId).not.toBe(made);
  const after = await photo(page);
  expect(after).toEqual({ ...before, assetId: after.assetId });
  const taken = (await deck(page)).assets[after.assetId!];
  expect(taken).toMatchObject({
    origin: 'stock',
    attribution: { author: 'Dana Levi', license: 'Mock License' },
  });
  // No second picture was put on the slide, and the asset and the change are one step.
  expect((await elements(page)).filter((element) => element.type === 'image')).toHaveLength(1);
  expect(await undoDepth(page)).toBe(steps + 1);
  await expect(page.getByTestId('stock-credits')).toContainText('Dana Levi');
  await undo(page);
  expect((await photo(page)).assetId).toBe(made);
  expect(Object.keys((await deck(page)).assets)).toEqual(assetsBefore);
  expect(errors).toEqual([]);
});

for (const theme of ['light', 'dark'] as const) {
  for (const lang of ['he', 'en'] as const) {
    test(`the panel with a picture selected: ${theme}, ${lang}`, async ({ page }) => {
      await openApp(page, { lang, theme });
      const shown = await addAsset(page, 'harbour.png', 'teal');
      for (const [name, shade] of [
        ['sunset.png', 'coral'],
        ['forest.png', 'seagreen'],
        ['night.png', 'midnightblue'],
        ['sand.png', 'khaki'],
      ] as const) {
        await addAsset(page, name, shade);
      }
      await addPicture(page, shown);
      const panel = await openMedia(page, 'uploads');
      await select(page, ['e_photo']);
      await expect(panel.locator('[data-replace-with]')).toHaveCount(4);
      await panel.locator('[data-replace-with]').first().hover();
      await expect(page.getByRole('tooltip')).toBeVisible();
      await page.screenshot({ path: out(`replace-uploads-${lang}-${theme}`) });
    });
  }
}
