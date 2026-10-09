import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import {
  addElement,
  currentSlide,
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
import type {
  ChartElement,
  ImageElement,
  ShapeElement,
  SvgElement,
  TableElement,
} from '@slidr/model';
import { shapePresets } from '@slidr/renderer';

/*
 * Elements: the collections of everything that goes on a slide. The first screen offers them by
 * kind; a collection opens in its place, and what it holds lands in the middle of the slide,
 * selected, as one undo step.
 */

const COLLECTIONS = [
  'designs',
  'shapes',
  'graphics',
  'emoji',
  'icons',
  'photos',
  'frames',
  'clips',
  'tables',
  'charts',
];

/** The groups of photo frames, in the order the collection shows them. */
const FRAME_GROUPS = [
  'basic',
  'photo',
  'framed',
  'devices',
  'arches',
  'organic',
  'brush',
  'composed',
  'hebrew',
  'latin',
  'digits',
  'nature',
  'bubbles',
  'labels',
];

test.afterEach(({ page }) => {
  expect(pageProblems(page)).toEqual([]);
});

async function openElements(page: Parameters<typeof openApp>[0], lang: 'he' | 'en' = 'en') {
  await openApp(page, { lang });
  await page.getByTestId('activity-bar').locator('[data-panel="elements"]').click();
  const panel = page.getByTestId('elements-panel');
  await expect(panel).toBeVisible();
  return panel;
}

test('the first screen offers the collections by kind, each with a name', async ({ page }) => {
  const panel = await openElements(page);
  const tiles = panel.locator('[data-collection]');
  await expect(tiles).toHaveCount(COLLECTIONS.length);
  expect(
    await tiles.evaluateAll((all) => all.map((tile) => tile.getAttribute('data-collection'))),
  ).toEqual(COLLECTIONS);
  for (const name of [
    'Designs',
    'Shapes',
    'Graphics',
    'Emoji',
    'Icons',
    'Photos',
    'Frames',
    'Tables',
    'Charts',
  ]) {
    await expect(panel.getByRole('button', { name, exact: true })).toBeVisible();
  }
  // Nothing was used yet, so nothing is offered again.
  await expect(panel.getByTestId('elements-recent')).toHaveCount(0);
});

test('designs show ten finished previews and add an editable slide', async ({ page }) => {
  const panel = await openElements(page);
  await panel.locator('[data-collection="designs"]').click();
  const designs = panel.locator('[data-design]');
  await expect(designs).toHaveCount(10);
  await expect(designs.first().locator('[data-slide-id]')).toBeVisible();

  const before = await undoDepth(page);
  await panel.locator('[data-design="wedding"]').click();
  await expect.poll(async () => (await currentSlide(page)).elements.length).toBeGreaterThan(5);
  const slide = await currentSlide(page);
  expect(slide.elements.filter((element) => element.type === 'text').length).toBeGreaterThan(4);
  expect(slide.elements.some((element) => element.type === 'shape')).toBe(true);
  const image = slide.elements.find((element) => element.type === 'image');
  expect(image?.type).toBe('image');
  if (image?.type === 'image') {
    expect((await deck(page)).assets[image.assetId!]).toBeDefined();
    await expect(onStage(page, image.id).locator('img')).toBeVisible();
  }
  expect(await undoDepth(page)).toBe(before + 1);
});

test('graphics are one collection, in three styles, and a click adds one', async ({ page }) => {
  const panel = await openElements(page);
  await panel.locator('[data-collection="graphics"]').click();
  for (const style of ['glossy', 'illustrated', 'outlined']) {
    await expect(panel.locator(`[data-group="${style}"] [data-sticker]`).first()).toBeVisible();
  }

  const before = await undoDepth(page);
  await panel.locator('[data-sticker="graphic:glossy:trophy-48"]').click();
  const graphic = await selected<SvgElement>(page);
  expect(graphic.type).toBe('svg');
  expect(graphic.name).toBe('graphic:glossy:trophy-48');
  expect(graphic.markup).toMatch(
    /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="0 0 48 48">/,
  );
  await expect(onStage(page, graphic.id)).toBeVisible();
  expect(await undoDepth(page)).toBe(before + 1);

  // One style in full: more of it comes as the list is scrolled.
  await panel.getByRole('radio', { name: 'Outlined' }).click();
  const results = panel.getByTestId('graphic-results').locator('[data-sticker]');
  await expect(results.first()).toBeVisible();
  const shown = await results.count();
  expect(shown).toBeLessThan(400);
  await results.last().scrollIntoViewIfNeeded();
  await expect.poll(() => results.count()).toBeGreaterThan(shown);

  // The search looks in the style that is shown.
  await panel.getByTestId('graphics-query').fill('trophy');
  await expect(panel.locator('[data-sticker="graphic:outlined:award-trophy-1"]')).toBeVisible();
  await expect(panel.locator('[data-sticker^="graphic:glossy:"]')).toHaveCount(0);
  await panel.getByTestId('graphics-query').fill('qqqzzz');
  await expect(panel.getByText('Nothing found')).toBeVisible();
});

test('every emoji is in one list by group, found in Hebrew, and added with a click', async ({
  page,
}) => {
  const panel = await openElements(page, 'he');
  await panel.locator('[data-collection="emoji"]').click();
  await expect(panel.locator('[data-group]')).toHaveCount(9);
  await expect(panel.locator('[data-sticker="emoji:grinning-face"]')).toBeVisible();

  // A group far down the list is drawn once it is reached.
  await expect(panel.locator('[data-sticker="emoji:flag-israel"]')).toHaveCount(0);
  await panel.getByRole('button', { name: 'דגלים' }).click();
  await expect(panel.locator('[data-sticker="emoji:flag-israel"]')).toBeVisible();

  await panel.getByTestId('emoji-query').fill('טיל');
  const rocket = panel.locator('[data-sticker="emoji:rocket"]');
  await expect(rocket).toHaveAccessibleName('הוספת טיל לשקף');
  await rocket.click();
  const emoji = await selected<SvgElement>(page);
  expect(emoji.name).toBe('emoji:rocket');
  expect(emoji.markup).toContain('viewBox="0 0 36 36"');
  await expect(onStage(page, emoji.id)).toBeVisible();
});

test('what was used is offered again on the first screen', async ({ page }) => {
  const panel = await openElements(page);
  await panel.locator('[data-collection="emoji"]').click();
  await panel.locator('[data-sticker="emoji:grinning-face"]').click();
  await panel.getByRole('button', { name: 'Back to collections' }).click();
  await panel.locator('[data-collection="graphics"]').click();
  await panel.locator('[data-sticker="graphic:glossy:trophy-48"]').click();
  await panel.getByRole('button', { name: 'Back to collections' }).click();

  const recent = panel.getByTestId('elements-recent').locator('[data-sticker]');
  expect(
    await recent.evaluateAll((all) => all.map((one) => one.getAttribute('data-sticker'))),
  ).toEqual(['graphic:glossy:trophy-48', 'emoji:grinning-face']);
  await recent.last().click();
  expect((await selected<SvgElement>(page)).name).toBe('emoji:grinning-face');
  expect((await currentSlide(page)).elements).toHaveLength(3);
});

test('one search on the first screen finds graphics, frames, emoji and icons', async ({ page }) => {
  const panel = await openElements(page, 'he');
  await panel.getByTestId('elements-query').fill('לב');
  const found = panel.getByTestId('elements-found');
  await expect(found.locator('[data-group="graphics"] [data-sticker]').first()).toBeVisible();
  await expect(found.locator('[data-group="frames"] [data-frame="frame:heart"]')).toBeVisible();
  await expect(
    found.locator('[data-group="emoji"] [data-sticker="emoji:red-heart"]'),
  ).toBeVisible();
  await expect(found.locator('[data-group="icons"] [data-icon="lucide:heart"]')).toBeVisible();

  await found.locator('[data-icon="lucide:heart"]').click();
  expect((await selected<SvgElement>(page)).name).toBe('lucide:heart');

  await panel.getByTestId('elements-query').fill('');
  await expect(panel.locator('[data-collection]')).toHaveCount(COLLECTIONS.length);
});

test('shapes, icons, tables and charts are added from their collections', async ({ page }) => {
  const panel = await openElements(page);
  const back = () => panel.getByRole('button', { name: 'Back to collections' }).click();

  await panel.locator('[data-collection="shapes"]').click();
  await expect(panel.locator('[data-preset]')).toHaveCount(shapePresets.length);
  await expect(panel.locator('[data-preset="rect"] path')).toHaveAttribute('fill', '#111111');
  await panel.locator('[data-preset="ellipse"]').click();
  expect((await selected<ShapeElement>(page)).geometry).toEqual({
    kind: 'preset',
    preset: 'ellipse',
  });
  await panel.locator('[data-preset="gear12"]').click();
  expect((await selected<ShapeElement>(page)).geometry).toEqual({
    kind: 'preset',
    preset: 'gear12',
  });
  await expect(panel.getByRole('group', { name: 'Lines' }).locator('[data-line]')).toHaveCount(5);

  await back();
  await panel.locator('[data-collection="icons"]').click();
  await expect(panel.getByTestId('elements-icons')).toBeVisible();
  await panel.getByTestId('icon-query').fill('rocket');
  await panel.locator('[data-icon="lucide:rocket"]').click();
  expect((await selected<SvgElement>(page)).name).toBe('lucide:rocket');

  await back();
  await panel.locator('[data-collection="charts"]').click();
  await expect(panel.locator('[data-chart-type]')).toHaveCount(8);
  await panel.locator('[data-chart-type="pie"]').click();
  expect((await selected<ChartElement>(page)).chartType).toBe('pie');

  await back();
  await panel.locator('[data-collection="tables"]').click();
  await panel.getByRole('button', { name: '3 rows by 4 columns' }).click();
  const table = (await currentSlide(page)).elements.find(
    (element): element is TableElement => element.type === 'table',
  );
  expect(table?.rows).toHaveLength(3);
  expect(table?.cols).toHaveLength(4);

  await back();
  await panel.locator('[data-collection="photos"]').click();
  await expect(page.getByTestId('media-stock')).toBeVisible();
  await back();
  await panel.locator('[data-collection="clips"]').click();
  await expect(panel.getByTestId('elements-clips')).toBeVisible();
});

test('the icon collection offers 560 line and 560 filled icons', async ({ page }) => {
  const panel = await openElements(page);
  await panel.locator('[data-collection="icons"]').click();
  const icons = panel.getByTestId('icon-results').locator('[data-icon]');
  await expect(icons.first()).toHaveAttribute('data-icon', 'lucide:star');

  for (let pageNumber = 0; pageNumber < 10 && (await icons.count()) < 560; pageNumber++) {
    const previous = await icons.count();
    await icons.last().scrollIntoViewIfNeeded();
    await expect.poll(() => icons.count()).toBeGreaterThan(previous);
  }
  await expect(icons).toHaveCount(560);

  await panel.getByRole('radio', { name: 'Filled' }).click();
  await expect(icons.first()).toHaveAttribute('data-icon', 'tabler:star-filled');
  for (let pageNumber = 0; pageNumber < 10 && (await icons.count()) < 560; pageNumber++) {
    const previous = await icons.count();
    await icons.last().scrollIntoViewIfNeeded();
    await expect.poll(() => icons.count()).toBeGreaterThan(previous);
  }
  await expect(icons).toHaveCount(560);
  await icons.last().click();
  const filled = await selected<SvgElement>(page);
  expect(filled.name).toMatch(/^tabler:.+-filled$/);
  expect(filled.markup).toContain('fill="currentColor"');
});

test('frames are one collection in groups, and a click adds an empty frame', async ({ page }) => {
  const panel = await openElements(page);
  await panel.locator('[data-collection="frames"]').click();
  const groups = panel.getByTestId('frame-groups');
  // Twenty frames first, then every group with its first rows.
  const featured = groups.locator('[data-group="featured"]');
  await expect(featured.locator('[data-frame]')).toHaveCount(20);
  expect(
    await groups
      .locator('[data-group]')
      .evaluateAll((all) => all.map((one) => one.getAttribute('data-group'))),
  ).toEqual(['featured', ...FRAME_GROUPS]);
  for (const group of FRAME_GROUPS) {
    await expect(groups.locator(`[data-group="${group}"] [data-frame]`).first()).toBeVisible();
  }

  // A plain frame is a picture with no photograph yet, cut to its outline.
  const before = await undoDepth(page);
  await featured.locator('[data-frame="frame:circle"]').click();
  const circle = await selected<ImageElement>(page);
  expect(circle).toMatchObject({
    type: 'image',
    name: 'frame:circle',
    mask: { kind: 'ellipse' },
    frame: { w: 480, h: 480 },
  });
  expect(circle.assetId).toBeUndefined();
  await expect(onStage(page, circle.id)).toBeVisible();
  expect(await undoDepth(page)).toBe(before + 1);

  // A decorated frame carries its artwork, around an opening for the photograph. The frame
  // added before it is empty, so it stays as it is and this one is added beside it.
  await featured.locator('[data-frame="frame:instant"]').click();
  const instant = await selected<ImageElement>(page);
  expect(instant.id).not.toBe(circle.id);
  expect(instant.smartFrame?.opening).toEqual({ x: 26, y: 26, w: 348, h: 348 });
  await expect(
    onStage(page, instant.id).locator('[data-frame-artwork] [data-decoration-id]'),
  ).toHaveCount(1);
  expect((await currentSlide(page)).elements).toHaveLength(2);

  // One group in full, and back to all of them.
  await groups.locator('[data-group="hebrew"]').getByRole('button', { name: 'Show all' }).click();
  await expect(panel.getByTestId('frame-results').locator('[data-frame]')).toHaveCount(27);
  await panel.getByRole('button', { name: 'All groups' }).click();
  await expect(groups).toBeVisible();
});

test('frames are found in Hebrew, and an empty frame takes a picture from the computer', async ({
  page,
}) => {
  const panel = await openElements(page, 'he');
  await panel.locator('[data-collection="frames"]').click();
  const results = panel.getByTestId('frame-results');
  await panel.getByTestId('frames-query').fill('פולרואיד');
  await expect(results.locator('[data-frame="frame:instant"]')).toHaveAccessibleName(
    'הוספת תצלום מיידי לשקף',
  );
  await panel.getByTestId('frames-query').fill('א');
  await expect(results.locator('[data-frame]').first()).toHaveAttribute(
    'data-frame',
    'frame:he-alef',
  );
  await panel.getByTestId('frames-query').fill('qqqzzz');
  await expect(panel.getByText('לא נמצאו תוצאות')).toBeVisible();

  await panel.getByTestId('frames-query').fill('טלפון');
  await results.locator('[data-frame="frame:phone"]').click();
  const phone = await selected<ImageElement>(page);
  expect(phone.assetId).toBeUndefined();
  // The new frame is selected and empty: the collection offers to fill it.
  await expect(panel.getByTestId('frames-hint')).toContainText('אין עדיין תמונה');
  const file = await pngBytes(page);
  const chooser = page.waitForEvent('filechooser');
  await panel.getByTestId('frames-pick').click();
  await (await chooser).setFiles({ name: 'view.png', mimeType: 'image/png', buffer: file });
  await expect.poll(async () => (await selected<ImageElement>(page)).assetId).toBeTruthy();
  const filled = await selected<ImageElement>(page);
  expect(filled.id).toBe(phone.id);
  expect(filled.smartFrame).toEqual(phone.smartFrame);
  expect(filled.mask).toEqual(phone.mask);
  await expect(onStage(page, phone.id).locator('[data-image-opening] img')).toBeVisible();
});

test('a selected photograph takes the frame that is clicked, and keeps what it shows', async ({
  page,
}) => {
  const panel = await openElements(page);
  const assetId = await importPicture(page, 'view.png');
  const crop = { x: 0.1, y: 0, w: 0.8, h: 1 };
  await addElement(page, {
    id: 'e_photo',
    type: 'image',
    frame: { x: 400, y: 200, w: 800, h: 400 },
    assetId,
    fit: 'cover',
    crop,
  });
  await panel.locator('[data-collection="frames"]').click();
  await expect(panel.getByTestId('frames-hint')).toContainText('A click on a frame puts');
  const featured = panel.locator('[data-group="featured"]');
  const heart = featured.locator('[data-frame="frame:heart"]');
  await expect(heart).toHaveAccessibleName('Put the selected picture in the frame Heart');

  // The picture takes the proportions of the frame, inside the box it had.
  const before = await undoDepth(page);
  await heart.click();
  const framed = await selected<ImageElement>(page);
  expect(framed).toMatchObject({ id: 'e_photo', assetId, crop, mask: { kind: 'path' } });
  expect(framed.frame).toEqual({ x: 582, y: 200, w: 437, h: 400 });
  expect(await undoDepth(page)).toBe(before + 1);
  expect((await currentSlide(page)).elements).toHaveLength(1);

  // Another frame takes the place of the first: its artwork comes, the heart's outline goes.
  await featured.locator('[data-frame="frame:instant"]').click();
  const instant = await selected<ImageElement>(page);
  expect(instant).toMatchObject({ id: 'e_photo', assetId, crop });
  expect(instant.mask).toBeUndefined();
  expect(instant.smartFrame?.decorations).toHaveLength(1);
  await expect(onStage(page, 'e_photo').locator('[data-image-opening] img')).toBeVisible();

  await undo(page);
  await undo(page);
  const back = (await currentSlide(page)).elements[0] as ImageElement;
  expect(back.frame).toEqual({ x: 400, y: 200, w: 800, h: 400 });
  expect(back.mask).toBeUndefined();
  expect(back.smartFrame).toBeUndefined();
});

test('frames are in the exported file as they are on the slide', async ({ page }) => {
  const panel = await openElements(page);
  const assetId = await importPicture(page, 'view.png');
  await panel.locator('[data-collection="frames"]').click();
  const featured = panel.locator('[data-group="featured"]');

  // A heart with a photograph in it, and a phone that is still empty.
  await featured.locator('[data-frame="frame:heart"]').click();
  const heart = await selected<ImageElement>(page);
  await page.evaluate(
    ({ elementId, assetId }) => {
      const editor = window.slidr!;
      const slideId = editor.selection.getState().currentSlideId ?? '';
      editor.bus.dispatch({ type: 'element.update', slideId, elementId, patch: { assetId } });
      editor.selection.getState().selectElements([]);
    },
    { elementId: heart.id, assetId },
  );
  await featured.locator('[data-frame="frame:phone"]').click();
  const phone = await selected<ImageElement>(page);
  expect(phone.id).not.toBe(heart.id);

  await page.getByTestId('file-menu-trigger').click();
  await page.getByRole('menuitem', { name: 'Export HTML…', exact: true }).click();
  await expect(page.getByTestId('export-dialog')).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByTestId('export-run').click();
  const html = readFileSync(await (await download).path(), 'utf8');

  // The file draws the slide with the renderer: the cut of the heart, the photograph inside
  // it, and the phone's artwork over its opening.
  const drawn = (id: string) => html.slice(html.indexOf(`data-element-id="${id}"`));
  expect(drawn(heart.id)).toMatch(/^[^>]*>\s*<div style="[^"]*clip-path: ?path\(/);
  expect(html.match(/<img /g)).toHaveLength(1);
  expect(html.match(/data-image-opening/g)).toHaveLength(1);
  expect(html.match(/data-frame-artwork/g)).toHaveLength(1);
  expect(drawn(phone.id)).toContain('data-decoration-id');
});
