import { expect, test, type Page } from '@playwright/test';
import type { ImageElement, LineElement, ShapeElement } from '@slidr/model';
import { shapePresets } from '@slidr/renderer';
import {
  currentSlide,
  deck,
  onStage,
  openApp,
  pageProblems,
  pngBytes,
  row,
  selected,
  undoDepth,
} from './objects-helpers';

/*
 * The Insert buttons of row A for pictures, shapes and lines (WG5-T01, T04, T05: IMG-01, SHP-01,
 * SHP-05). Every insert lands in the middle of the slide, ends selected, and is one undo step.
 */

const rowA = (page: Page) => page.getByTestId('top-tools-a');

async function openShapes(page: Page) {
  await rowA(page).locator('[data-tool="insert.elements"]').click();
  const panel = page.getByTestId('elements-panel');
  const collection = panel.locator('[data-collection="shapes"]');
  if (await collection.isVisible()) await collection.click();
  return page.getByTestId('elements-shapes');
}

test.afterEach(({ page }) => {
  expect(pageProblems(page)).toEqual([]);
});

test.describe('shapes', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page);
  });

  test('the library shows every preset, named, and a click inserts it', async ({ page }) => {
    const library = await openShapes(page);
    await expect(library).toBeVisible();
    await expect(library.locator('[data-preset]')).toHaveCount(shapePresets.length);
    for (const group of ['בסיסיות', 'מצולעים וכוכבים', 'חצים', 'בועות דיבור', 'סוגריים']) {
      await expect(library.getByRole('group', { name: group })).toBeVisible();
    }
    // Every button has a name of its own, and a glyph.
    const names = await library
      .locator('[data-preset]')
      .evaluateAll((buttons) => buttons.map((b) => b.getAttribute('aria-label') ?? ''));
    expect(names.every((name) => /[֐-׿]/.test(name))).toBe(true);
    expect(new Set(names).size).toBe(names.length);
    await expect(library.locator('[data-preset] svg path')).toHaveCount(shapePresets.length);

    const before = await undoDepth(page);
    await library.getByRole('button', { name: 'אליפסה' }).click();
    await expect(library).toBeVisible();
    await expect(row(page)).toHaveAttribute('data-selection', 'shape');

    const ellipse = await selected<ShapeElement>(page);
    expect(ellipse).toMatchObject({
      type: 'shape',
      geometry: { kind: 'preset', preset: 'ellipse' },
      fill: { kind: 'solid', color: { token: 'primary' } },
      frame: { x: 780, y: 360, w: 360, h: 360 },
      rotation: 0,
      opacity: 1,
    });
    expect(await undoDepth(page)).toBe(before + 1);
    // It is drawn on the Stage.
    await expect(onStage(page, ellipse.id)).toBeVisible();

    await page.evaluate(() => window.slidr!.bus.undo());
    expect((await currentSlide(page)).elements).toHaveLength(0);
    await expect(row(page)).toHaveAttribute('data-selection', 'none');
  });

  test('after an insert the keyboard is the Stage one: arrows nudge, Delete removes', async ({
    page,
  }) => {
    await openShapes(page);
    await page
      .getByTestId('elements-shapes')
      .getByRole('button', { name: 'מלבן', exact: true })
      .click();
    await expect(page.getByTestId('stage-surface')).toBeFocused();
    const { frame } = await selected<ShapeElement>(page);
    await page.keyboard.press('ArrowRight');
    expect((await selected<ShapeElement>(page)).frame.x).toBe(frame.x + 1);
    await page.keyboard.press('Delete');
    expect((await currentSlide(page)).elements).toHaveLength(0);
  });

  test('the library is named in English too', async ({ page }) => {
    await openApp(page, { lang: 'en' });
    const library = await openShapes(page);
    await expect(library.getByRole('group', { name: 'Speech bubbles' })).toBeVisible();
    await library.getByRole('button', { name: '5-point star' }).click();
    expect((await selected<ShapeElement>(page)).geometry).toEqual({
      kind: 'preset',
      preset: 'star5',
    });
  });

  test('an open outline is stroked, and a second insert steps aside', async ({ page }) => {
    await openShapes(page);
    await page.getByTestId('elements-shapes').getByRole('button', { name: 'סוגר שמאלי' }).click();
    const bracket = await selected<ShapeElement>(page);
    expect(bracket.fill).toEqual({ kind: 'none' });
    expect(bracket.stroke).toEqual({ color: { token: 'text' }, width: 4 });
    // Nothing to fill: row B offers the outline only.
    await expect(row(page).getByRole('button', { name: 'קו מתאר' })).toBeVisible();
    await expect(row(page).getByRole('button', { name: 'מילוי' })).toHaveCount(0);

    await openShapes(page);
    await page.getByTestId('elements-shapes').getByRole('button', { name: 'סוגר שמאלי' }).click();
    const second = await selected<ShapeElement>(page);
    expect(second.id).not.toBe(bracket.id);
    expect(second.frame).toMatchObject({ x: bracket.frame.x + 24, y: bracket.frame.y + 24 });
    expect((await currentSlide(page)).elements).toHaveLength(2);
  });
});

test.describe('lines', () => {
  const kinds = [
    { name: 'קו', heads: ['none', 'none'], curve: 'straight' },
    { name: 'חץ', heads: ['none', 'triangle'], curve: 'straight' },
    { name: 'חץ דו-כיווני', heads: ['triangle', 'triangle'], curve: 'straight' },
    { name: 'קו זוויתי', heads: ['none', 'none'], curve: 'elbow' },
    { name: 'קו מעוקל', heads: ['none', 'none'], curve: 'curved' },
  ] as const;

  for (const kind of kinds) {
    test(`"${kind.name}" inserts a ${kind.curve} line, selected, as one undo step`, async ({
      page,
    }) => {
      await openApp(page);
      const before = await undoDepth(page);
      await rowA(page).getByRole('button', { name: 'קו', exact: true }).click();
      const library = page.getByTestId('line-library');
      await expect(library.getByRole('button')).toHaveCount(5);
      await library.getByRole('button', { name: kind.name, exact: true }).click();
      await expect(library).toHaveCount(0);
      await expect(row(page)).toHaveAttribute('data-selection', 'shape');

      const line = await selected<LineElement>(page);
      expect(line).toMatchObject({
        type: 'line',
        startHead: kind.heads[0],
        endHead: kind.heads[1],
        curve: kind.curve,
        stroke: { color: { token: 'text' }, width: 4 },
      });
      // In the middle of the slide.
      expect(line.frame.x + line.frame.w / 2).toBe(960);
      expect(line.frame.y + line.frame.h / 2).toBe(540);
      // A Hebrew deck reads right to left, so the line starts on the right.
      expect(line.points[0]?.x).toBe(line.frame.w);
      expect(line.points[1]?.x).toBe(0);
      await expect(onStage(page, line.id).locator('path').first()).toBeAttached();

      expect(await undoDepth(page)).toBe(before + 1);
      await page.keyboard.press('Control+z');
      await expect.poll(async () => (await currentSlide(page)).elements.length).toBe(0);
    });
  }

  test('in an English deck a new arrow points right', async ({ page }) => {
    await openApp(page, { lang: 'en' });
    await rowA(page).getByRole('button', { name: 'Line', exact: true }).click();
    await page
      .getByTestId('line-library')
      .getByRole('button', { name: 'Arrow', exact: true })
      .click();
    const line = await selected<LineElement>(page);
    expect(line.points).toEqual([
      { x: 0, y: 0 },
      { x: 480, y: 0 },
    ]);
    expect(line.endHead).toBe('triangle');
  });
});

test.describe('pictures', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page);
  });

  test('a chosen file becomes an asset and an image in the middle of the slide', async ({
    page,
  }) => {
    const bytes = await pngBytes(page);
    const before = await undoDepth(page);
    const chooser = page.waitForEvent('filechooser');
    await rowA(page).getByRole('button', { name: 'תמונה' }).click();
    const dialog = await chooser;
    expect(dialog.isMultiple()).toBe(true);
    await dialog.setFiles({ name: 'harbour.png', mimeType: 'image/png', buffer: bytes });

    await expect(row(page)).toHaveAttribute('data-selection', 'image');
    const image = await selected<ImageElement>(page);
    expect(image).toMatchObject({ type: 'image', fit: 'cover', name: 'harbour', alt: 'harbour' });
    // 800 x 500 fits the slide as it is, and is centred.
    expect(image.frame).toEqual({ x: 560, y: 290, w: 800, h: 500 });
    const assets = (await deck(page)).assets;
    expect(assets[image.assetId ?? '']).toMatchObject({
      kind: 'image',
      width: 800,
      height: 500,
      name: 'harbour.png',
    });
    await expect(onStage(page, image.id).locator('img')).toBeVisible();
    // The keyboard goes to the Stage, where the new picture is selected.
    await expect(page.getByTestId('stage-surface')).toBeFocused();

    // The asset and the element are one change: one undo takes both away.
    expect(await undoDepth(page)).toBe(before + 1);
    await page.evaluate(() => window.slidr!.bus.undo());
    const after = await deck(page);
    expect(after.slides[0]?.elements).toHaveLength(0);
    expect(Object.keys(after.assets)).toHaveLength(0);
    // The file input was made in code and is gone again.
    await expect(page.locator('input[type="file"]')).toHaveCount(0);
  });

  test('several files are one undo step, and all end selected', async ({ page }) => {
    const first = await pngBytes(page, ['#2f5bea', '#f59e0b']);
    const second = await pngBytes(page, ['#0f9d8a', '#e5484d'], [400, 600]);
    const before = await undoDepth(page);
    const chooser = page.waitForEvent('filechooser');
    await rowA(page).getByRole('button', { name: 'תמונה' }).click();
    await (
      await chooser
    ).setFiles([
      { name: 'one.png', mimeType: 'image/png', buffer: first },
      { name: 'two.png', mimeType: 'image/png', buffer: second },
    ]);

    await expect(row(page)).toHaveAttribute('data-selection', 'multiple');
    const slide = await currentSlide(page);
    expect(slide.elements.map((e) => e.type)).toEqual(['image', 'image']);
    expect(Object.keys((await deck(page)).assets)).toHaveLength(2);
    expect(await undoDepth(page)).toBe(before + 1);
    await page.evaluate(() => window.slidr!.bus.undo());
    expect((await currentSlide(page)).elements).toHaveLength(0);
  });

  test('cancelling the file dialog changes nothing', async ({ page }) => {
    const before = await undoDepth(page);
    const chooser = page.waitForEvent('filechooser');
    await rowA(page).getByRole('button', { name: 'תמונה' }).click();
    await (await chooser).setFiles([]);
    await page.waitForTimeout(200);
    expect(await undoDepth(page)).toBe(before);
    expect((await currentSlide(page)).elements).toHaveLength(0);
  });
});
