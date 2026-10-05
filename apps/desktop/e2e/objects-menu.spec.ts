import { fileURLToPath } from 'node:url';
import { expect, test, type Locator, type Page } from '@playwright/test';
import type { AudioElement, ImageElement, VideoElement } from '@slidr/model';
import { card, codePanel, dialog as decomposeDialog, HTML_ID } from './code-helpers';
import {
  addElement,
  deck,
  importPicture,
  onStage,
  openApp,
  pageProblems,
  pngBytes,
  selected,
  undo,
  undoDepth,
} from './objects-helpers';
import { addClip, testMedia } from './video-helpers';

/*
 * The tools of an image, an `html` element and a clip in the Stage's right-click menu (STG-06,
 * ADR-060 and ADR-057): replace the picture, edit the code, decompose, loop and mute. Each item
 * calls what its row B button calls, so each is one undo step like the button.
 */

const shot = (name: string) =>
  fileURLToPath(new URL(`../test-results/objects/${name}.png`, import.meta.url));
const menu = (page: Page) => page.getByTestId('stage-menu');
const item = (page: Page, name: string) =>
  menu(page)
    .getByRole('menuitem')
    .filter({ has: page.getByText(name, { exact: true }) });
const checkItem = (page: Page, name: string) => menu(page).getByRole('menuitemcheckbox', { name });

async function rightClick(page: Page, target: Locator) {
  await target.click({ button: 'right' });
  await expect(menu(page)).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

test.afterEach(({ page }) => {
  // An html element is drawn in a sandboxed frame, whose refusals the console reports.
  expect(pageProblems(page).filter((problem) => !problem.includes('sandboxed'))).toEqual([]);
});

test('an image is replaced from the menu, in one step, with its crop kept', async ({ page }) => {
  const original = await importPicture(page, 'harbour.png');
  await addElement(page, {
    id: 'e_picture',
    type: 'image',
    frame: { x: 560, y: 280, w: 640, h: 400 },
    fit: 'cover',
    assetId: original,
    crop: { x: 0.1, y: 0.2, w: 0.6, h: 0.5 },
  });
  await rightClick(page, onStage(page, 'e_picture'));
  // Beside the crop, the element's own way in.
  await expect(item(page, 'חיתוך התמונה')).toBeVisible();
  const bytes = await pngBytes(page);
  const depth = await undoDepth(page);
  const chooser = page.waitForEvent('filechooser');
  await item(page, 'החלפת תמונה').click();
  await (await chooser).setFiles({ name: 'tower.png', mimeType: 'image/png', buffer: bytes });
  await expect.poll(async () => (await selected<ImageElement>(page)).assetId).not.toBe(original);
  expect(await selected<ImageElement>(page)).toMatchObject({
    crop: { x: 0.1, y: 0.2, w: 0.6, h: 0.5 },
    alt: 'tower',
  });
  expect(await undoDepth(page)).toBe(depth + 1);
  await undo(page);
  expect((await selected<ImageElement>(page)).assetId).toBe(original);
});

test('the code of an html element opens from the menu, and so does decompose', async ({ page }) => {
  await addElement(page, card());
  await rightClick(page, onStage(page, HTML_ID));
  await item(page, 'עריכת הקוד').click();
  await expect(codePanel(page).getByTestId('code-editor')).toHaveAttribute('data-state', 'ready');

  await rightClick(page, onStage(page, HTML_ID));
  await item(page, 'פירוק לאובייקטים').click();
  await expect(decomposeDialog(page)).toBeVisible();
  await expect(decomposeDialog(page)).toHaveAttribute('data-phase', 'ready', { timeout: 20_000 });
});

test('an html element that cannot be decomposed says why, in the menu too', async ({ page }) => {
  await addElement(page, card({ hasScripts: true, markup: '<div>x</div><script>1</script>' }));
  await rightClick(page, onStage(page, HTML_ID));
  const decompose = item(page, 'פירוק לאובייקטים');
  await expect(decompose).toHaveAttribute('aria-disabled', 'true');
  // The reason is the item's description, as it is the tooltip of row B's button.
  await expect(decompose).toHaveAccessibleDescription(/.+/);
  await expect(item(page, 'עריכת הקוד')).toBeEnabled();
  await page.screenshot({ path: shot('stage-menu-html-blocked-light-he') });
});

test('a clip loops and is muted from the menu, one step each', async ({ page }) => {
  const media = await testMedia(page);
  await addClip(page, 'video', media.video);
  await rightClick(page, onStage(page, 'e_video'));
  const loop = checkItem(page, 'ניגון בלולאה');
  await expect(loop).toHaveAttribute('aria-checked', 'false');
  const depth = await undoDepth(page);
  await loop.click();
  expect((await selected<VideoElement>(page)).loop).toBe(true);
  expect(await undoDepth(page)).toBe(depth + 1);

  await rightClick(page, onStage(page, 'e_video'));
  await expect(checkItem(page, 'ניגון בלולאה')).toHaveAttribute('aria-checked', 'true');
  await checkItem(page, 'השתקה').click();
  expect((await selected<VideoElement>(page)).muted).toBe(true);
  await undo(page);
  expect((await selected<VideoElement>(page)).muted).toBe(false);

  // A sound has no mute of its own: its volume is the sound.
  await addClip(page, 'audio', media.sound);
  await rightClick(page, onStage(page, 'e_audio'));
  await expect(checkItem(page, 'ניגון בלולאה')).toBeVisible();
  await expect(checkItem(page, 'השתקה')).toHaveCount(0);
  await checkItem(page, 'ניגון בלולאה').click();
  expect((await selected<AudioElement>(page)).loop).toBe(true);
  expect(Object.keys((await deck(page)).assets)).toHaveLength(2);
});
