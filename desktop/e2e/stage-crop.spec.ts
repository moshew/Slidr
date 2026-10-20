import { expect, test, type Page } from '@playwright/test';

// Crop mode on the Stage (WG5-T02, IMG-03, IMG-04; ADR-016): on the Stage's dev page for the
// gestures, and in the app for the crop tools of Top Tools row B.

interface Frame {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface ImageModel {
  id: string;
  frame: Frame;
  rotation: number;
  crop?: Frame;
  children?: ImageModel[];
}

type SlidrWindow = {
  slidr: {
    bus: {
      deck: { slides: { id: string; elements: ImageModel[] }[] };
      undoStack: unknown[];
      undo(): boolean;
      batch(commands: unknown[], options?: unknown): void;
    };
    selection: {
      getState(): {
        selectedElementIds: string[];
        editingElementId: string | null;
        currentSlideId: string;
        selectElements(ids: string[]): void;
        startEditing(id: string): void;
      };
    };
    assets: { import(file: File): Promise<{ id: string }> };
  };
};

const image = (page: Page, id: string) =>
  page.evaluate((elementId) => {
    const { bus } = (window as unknown as SlidrWindow).slidr;
    const find = (list: ImageModel[]): ImageModel | null => {
      for (const e of list) {
        if (e.id === elementId) return e;
        const inside = e.children ? find(e.children) : null;
        if (inside) return inside;
      }
      return null;
    };
    for (const s of bus.deck.slides) {
      const e = find(s.elements);
      if (e) return { frame: e.frame, rotation: e.rotation, crop: e.crop ?? null };
    }
    throw new Error(`no element ${elementId}`);
  }, id);

const state = (page: Page) =>
  page.evaluate(() => {
    const { bus, selection } = (window as unknown as SlidrWindow).slidr;
    const s = selection.getState();
    return {
      selected: s.selectedElementIds,
      editing: s.editingElementId,
      steps: bus.undoStack.length,
    };
  });

const undo = (page: Page) =>
  page.evaluate(() => (window as unknown as SlidrWindow).slidr.bus.undo());

const surface = (page: Page) => page.getByTestId('stage-surface');

async function box(page: Page, selector: string) {
  const rect = await surface(page).locator(selector).first().boundingBox();
  if (!rect) throw new Error(`no box for ${selector}`);
  return rect;
}

async function center(page: Page, selector: string) {
  const rect = await box(page, selector);
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

const el = (id: string) => `[data-element-id="${id}"]`;
const handle = (name: string) => `[data-crop-handle="${name}"]`;
/** The whole picture as crop mode shows it, dimmed, around the frame. */
const PICTURE = '[data-crop-picture] img';

/** The zoom of the Stage: screen pixels per slide pixel. */
async function stageScale(page: Page) {
  const frame = await page.getByTestId('stage-frame').boundingBox();
  return frame!.width / 1920;
}

async function drag(
  page: Page,
  from: { x: number; y: number },
  by: { x: number; y: number },
  options: { shift?: boolean; release?: boolean } = {},
) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  if (options.shift) await page.keyboard.down('Shift');
  const steps = 8;
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(from.x + (by.x * i) / steps, from.y + (by.y * i) / steps);
    await page.waitForTimeout(20);
  }
  if (options.release === false) return;
  await page.mouse.up();
  if (options.shift) await page.keyboard.up('Shift');
}

async function enterCrop(page: Page, id: string) {
  const c = await center(page, el(id));
  await page.mouse.dblclick(c.x, c.y);
  await expect(surface(page)).toHaveAttribute('data-cropping', id);
}

test.describe('on the Stage', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dev/stage.html?deck=stage&slide=0');
    await surface(page).locator(el('e_crop_plain')).waitFor();
    await page.evaluate(() => document.fonts.ready);
  });

  test('double-click and Enter start crop mode; Esc, Enter and a click outside leave it', async ({
    page,
  }) => {
    const c = await center(page, el('e_crop_plain'));
    await page.mouse.dblclick(c.x, c.y);
    expect((await state(page)).editing).toBe('e_crop_plain');
    await expect(surface(page).locator('[data-crop-handle]')).toHaveCount(8);
    // The resize handles give way to the crop handles.
    await expect(surface(page).locator('[data-handle]')).toHaveCount(0);
    await page.keyboard.press('Escape');
    expect(await state(page)).toMatchObject({ editing: null, selected: ['e_crop_plain'] });
    await expect(surface(page).locator('[data-handle]')).toHaveCount(9);

    await page.keyboard.press('Enter');
    await expect(surface(page)).toHaveAttribute('data-cropping', 'e_crop_plain');
    await page.keyboard.press('Enter');
    expect((await state(page)).editing).toBeNull();

    await page.mouse.dblclick(c.x, c.y);
    await expect(surface(page)).toHaveAttribute('data-cropping', 'e_crop_plain');
    // Empty slide, away from every image.
    await page.mouse.click(c.x + 320, c.y - 60);
    expect(await state(page)).toMatchObject({ editing: null, selected: [] });

    // Anyone may ask for crop mode through the selection store (the Crop button does).
    await page.evaluate(() =>
      (window as unknown as SlidrWindow).slidr.selection.getState().startEditing('e_crop_cover'),
    );
    await expect(surface(page)).toHaveAttribute('data-cropping', 'e_crop_cover');
    await expect(surface(page)).toBeFocused();
    await page.keyboard.press('Escape');

    // A placeholder has no picture to crop.
    const pending = await center(page, el('e_crop_pending'));
    await page.mouse.dblclick(pending.x, pending.y);
    expect(await state(page)).toMatchObject({ editing: null, selected: ['e_crop_pending'] });
  });

  test('a crop handle changes the frame and the crop; the picture stays; one undo step', async ({
    page,
  }) => {
    const before = await image(page, 'e_crop_plain');
    await enterCrop(page, 'e_crop_plain');
    const scale = await stageScale(page);
    const picture = await box(page, PICTURE);
    const { steps } = await state(page);

    const east = await center(page, handle('e'));
    await drag(page, east, { x: -150 * scale, y: 30 });
    const cropped = await image(page, 'e_crop_plain');
    expect(cropped.frame).toEqual({ ...before.frame, w: 450 });
    expect(cropped.crop).toEqual({ x: 0, y: 0, w: 0.75, h: 1 });
    // The picture did not move on the screen, and the slide's own image shows the same part.
    const after = await box(page, PICTURE);
    expect(Math.abs(after.x - picture.x)).toBeLessThan(0.5);
    expect(Math.abs(after.width - picture.width)).toBeLessThan(0.5);
    const shown = await box(page, `${el('e_crop_plain')} img`);
    expect(Math.abs(shown.x - picture.x)).toBeLessThan(0.5);
    expect(Math.abs(shown.width - picture.width)).toBeLessThan(0.5);
    expect((await state(page)).steps).toBe(steps + 1);

    // A corner, from the other side.
    const corner = await center(page, handle('nw'));
    await drag(page, corner, { x: 60 * scale, y: 100 * scale });
    const twice = await image(page, 'e_crop_plain');
    expect(twice.frame).toEqual({ x: 200, y: 220, w: 390, h: 300 });
    expect(twice.crop).toEqual({ x: 0.1, y: 0.25, w: 0.65, h: 0.75 });
    expect((await state(page)).steps).toBe(steps + 2);

    // Undo takes back one gesture at a time, and crop mode stays on.
    await undo(page);
    expect(await image(page, 'e_crop_plain')).toEqual(cropped);
    await undo(page);
    expect(await image(page, 'e_crop_plain')).toEqual(before);
    expect((await state(page)).editing).toBe('e_crop_plain');

    // The frame cannot leave the picture.
    await drag(page, await center(page, handle('se')), { x: 200, y: 200 });
    expect(await image(page, 'e_crop_plain')).toEqual(before);
  });

  test('the dimmed picture outside the crop frame can be grabbed and dragged', async ({ page }) => {
    await enterCrop(page, 'e_crop_plain');
    const scale = await stageScale(page);
    await drag(page, await center(page, handle('e')), { x: -150 * scale, y: 0 });
    const before = await image(page, 'e_crop_plain');
    const { steps } = await state(page);
    const frame = await box(page, '[data-crop-frame]');
    const picture = await box(page, PICTURE);
    const from = {
      x: frame.x + frame.width + (picture.x + picture.width - frame.x - frame.width) / 2,
      y: frame.y + frame.height / 2,
    };

    await page.mouse.move(from.x, from.y);
    await expect(surface(page)).toHaveCSS('cursor', 'move');
    await drag(page, from, { x: -80 * scale, y: 0 });

    const after = await image(page, 'e_crop_plain');
    expect(after.frame).toEqual(before.frame);
    expect(after.crop!.x).toBeGreaterThan(before.crop!.x);
    expect((await state(page)).steps).toBe(steps + 1);
    expect((await state(page)).editing).toBe('e_crop_plain');
    await undo(page);
    expect(await image(page, 'e_crop_plain')).toEqual(before);
  });

  test('Esc during a crop drag rolls that drag back and stays in crop mode', async ({ page }) => {
    const before = await image(page, 'e_crop_plain');
    await enterCrop(page, 'e_crop_plain');
    const { steps } = await state(page);
    await drag(page, await center(page, handle('s')), { x: 0, y: -80 }, { release: false });
    expect((await image(page, 'e_crop_plain')).frame.h).toBeLessThan(before.frame.h);
    await page.keyboard.press('Escape');
    await page.mouse.up();
    expect(await image(page, 'e_crop_plain')).toEqual(before);
    expect(await state(page)).toMatchObject({ steps, editing: 'e_crop_plain' });
  });

  test('the wheel zooms the picture and a drag moves it under the frame, each one undo step', async ({
    page,
  }) => {
    const before = await image(page, 'e_crop_plain');
    await enterCrop(page, 'e_crop_plain');
    const scale = await stageScale(page);
    const { steps } = await state(page);
    const c = await center(page, el('e_crop_plain'));

    // `mouse.wheel` returns before the page has handled the step, so the model is waited for:
    // four steps of 120, each building on the one before, magnify by 1.0015 ** 480 = 2.05.
    const FOUR_STEPS = 1 / Math.pow(1.0015, 480);
    const zoomIn = async () => {
      await page.mouse.move(c.x, c.y);
      for (let i = 0; i < 4; i++) await page.mouse.wheel(0, -120);
      await expect
        .poll(async () => (await image(page, 'e_crop_plain')).crop?.w ?? 1)
        .toBeCloseTo(FOUR_STEPS, 3);
      return image(page, 'e_crop_plain');
    };

    // Several wheel steps in a row are one zoom.
    const zoomed = await zoomIn();
    expect(zoomed.frame).toEqual(before.frame);
    // Around the pointer, which is in the middle: the crop stays centred.
    expect(zoomed.crop!.x + zoomed.crop!.w / 2).toBeCloseTo(0.5, 2);
    expect((await state(page)).steps).toBe(steps + 1);

    await page.waitForTimeout(900);
    await drag(page, c, { x: 60 * scale, y: -30 * scale });
    const panned = await image(page, 'e_crop_plain');
    expect(panned.frame).toEqual(before.frame);
    expect(panned.crop!.w).toBe(zoomed.crop!.w);
    // Dragging right shows more of the picture's left side.
    expect(panned.crop!.x).toBeLessThan(zoomed.crop!.x);
    expect(panned.crop!.y).toBeGreaterThan(zoomed.crop!.y);
    expect((await state(page)).steps).toBe(steps + 2);

    // Each of the two is undone alone, and crop mode stays on.
    await undo(page);
    expect(await image(page, 'e_crop_plain')).toEqual(zoomed);
    await undo(page);
    expect(await image(page, 'e_crop_plain')).toEqual(before);
    expect((await state(page)).editing).toBe('e_crop_plain');

    // The picture never uncovers the frame: not by a drag, not by zooming out.
    await page.waitForTimeout(900);
    await zoomIn();
    await drag(page, c, { x: 900, y: 0 });
    expect((await image(page, 'e_crop_plain')).crop!.x).toBe(0);
    // Far more than it takes to get back to the whole picture.
    for (let i = 0; i < 4; i++) await page.mouse.wheel(0, 1200);
    await expect.poll(async () => (await image(page, 'e_crop_plain')).crop).toBeNull();

    // The arrows move the picture too, 10 slide pixels with Shift. Zoomed from the middle again,
    // so the picture has room to move; it is 600 * 2.05 wide on the slide.
    await page.waitForTimeout(900);
    const again = await zoomIn();
    await page.keyboard.press('Shift+ArrowLeft');
    const nudged = await image(page, 'e_crop_plain');
    expect(nudged.crop!.x - again.crop!.x).toBeCloseTo((10 * FOUR_STEPS) / 600, 4);
    expect(nudged.crop!.w).toBe(again.crop!.w);
    // At the edge of the picture an arrow changes nothing: the frame stays covered.
    for (let i = 0; i < 40; i++) await page.keyboard.press('Shift+ArrowLeft');
    const edge = await image(page, 'e_crop_plain');
    expect(edge.crop!.x + edge.crop!.w).toBeCloseTo(1, 5);
    await page.keyboard.press('Shift+ArrowLeft');
    expect(await image(page, 'e_crop_plain')).toEqual(edge);
  });

  test('a turned and mirrored image is cropped along its own axes', async ({ page }) => {
    const before = await image(page, 'e_crop_turned');
    await enterCrop(page, 'e_crop_turned');
    const scale = await stageScale(page);
    const picture = await box(page, PICTURE);
    const { steps } = await state(page);

    // Along the frame's x axis, which is turned by 20 degrees.
    const east = await center(page, handle('e'));
    const rad = (20 * Math.PI) / 180;
    await drag(page, east, {
      x: -150 * scale * Math.cos(rad),
      y: -150 * scale * Math.sin(rad),
    });
    const cropped = await image(page, 'e_crop_turned');
    expect(cropped.frame.w).toBe(450);
    expect(cropped.frame.h).toBe(400);
    expect(cropped.rotation).toBe(20);
    // Mirrored: the handle on the right takes off the picture's left side.
    expect(cropped.crop).toEqual({ x: 0.25, y: 0, w: 0.75, h: 1 });
    const after = await box(page, PICTURE);
    for (const k of ['x', 'y', 'width', 'height'] as const) {
      expect(Math.abs(after[k] - picture[k])).toBeLessThan(0.75);
    }
    // The opposite edge stayed where it was: the west handle did not move.
    const shown = await box(page, `${el('e_crop_turned')} img`);
    for (const k of ['x', 'y', 'width', 'height'] as const) {
      expect(Math.abs(shown[k] - picture[k])).toBeLessThan(0.75);
    }
    expect((await state(page)).steps).toBe(steps + 1);
    await page.screenshot({ path: 'test-results/stage/crop-turned.png' });

    await undo(page);
    expect(await image(page, 'e_crop_turned')).toEqual(before);
  });

  test('contain and fill: the picture stays put through a crop', async ({ page }) => {
    for (const id of ['e_crop_contain', 'e_crop_fill', 'e_crop_cover']) {
      const before = await image(page, id);
      await enterCrop(page, id);
      const picture = await box(page, PICTURE);
      await drag(page, await center(page, handle('e')), { x: -40, y: 0 });
      const cropped = await image(page, id);
      expect(cropped.frame.w).toBeLessThan(before.frame.w);
      const shown = await box(page, `${el(id)} img`);
      for (const k of ['x', 'y', 'width', 'height'] as const) {
        expect(Math.abs(shown[k] - picture[k])).toBeLessThan(0.75);
      }
      await page.keyboard.press('Escape');
      expect((await state(page)).editing).toBeNull();
    }
    // The bars of `contain` may not grow: its bottom edge is already past the picture.
    const contain = await image(page, 'e_crop_contain');
    await enterCrop(page, 'e_crop_contain');
    await drag(page, await center(page, handle('s')), { x: 0, y: 60 });
    expect((await image(page, 'e_crop_contain')).frame).toEqual(contain.frame);
  });

  for (const scheme of ['light', 'dark'] as const) {
    test(`crop mode looks right in ${scheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await enterCrop(page, 'e_crop_plain');
      await drag(page, await center(page, handle('e')), { x: -120, y: 0 });
      await drag(page, await center(page, handle('n')), { x: 0, y: 50 });
      await page.mouse.move(10, 10);
      await page.screenshot({ path: `test-results/stage/crop-${scheme}.png` });
    });
  }
});

// ---- The crop tools of Top Tools row B, in the app ----

/** A picture of 1200 x 800 in the open document, as a 600 x 400 image in the middle of the slide. */
async function addPicture(page: Page) {
  await page.evaluate(async () => {
    const { bus, selection, assets } = (window as unknown as SlidrWindow).slidr;
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 800;
    const g = canvas.getContext('2d')!;
    const sky = g.createLinearGradient(0, 0, 1200, 800);
    sky.addColorStop(0, '#7fb6ff');
    sky.addColorStop(1, '#f6a96b');
    g.fillStyle = sky;
    g.fillRect(0, 0, 1200, 800);
    g.fillStyle = '#20374d';
    g.beginPath();
    g.arc(600, 400, 220, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#ffffff';
    g.lineWidth = 24;
    g.strokeRect(12, 12, 1176, 776);
    const blob = await new Promise<Blob>((resolve) =>
      canvas.toBlob((b) => resolve(b!), 'image/png'),
    );
    const asset = await assets.import(new File([blob], 'picture.png', { type: 'image/png' }));
    const slideId = selection.getState().currentSlideId;
    bus.batch([
      { type: 'asset.add', asset },
      {
        type: 'element.add',
        slideId,
        element: {
          id: 'e_picture',
          type: 'image',
          frame: { x: 660, y: 340, w: 600, h: 400 },
          rotation: 0,
          opacity: 1,
          assetId: asset.id,
          fit: 'cover',
        },
      },
    ]);
    selection.getState().selectElements(['e_picture']);
  });
  await surface(page)
    .locator(`${el('e_picture')} img`)
    .waitFor();
}

async function openApp(page: Page, language: 'he' | 'en') {
  await page.addInitScript((lang) => localStorage.setItem('slidr.language', lang), language);
  await page.goto('/');
  await expect(page.getByTestId('stage-frame')).toBeVisible();
  await addPicture(page);
}

const rowB = (page: Page) => page.getByTestId('top-tools-b');

test.describe('the crop tools', () => {
  test('the Crop button turns crop mode on and off; Done and Esc leave it', async ({ page }) => {
    await openApp(page, 'en');
    await expect(rowB(page)).toHaveAttribute('data-selection', 'image');
    const crop = rowB(page).getByRole('button', { name: 'Crop', exact: true });
    await expect(crop).toHaveAttribute('aria-pressed', 'false');
    // Only the button shows until crop mode is on.
    await expect(rowB(page).getByRole('button', { name: 'Done' })).toHaveCount(0);

    await crop.click();
    await expect(surface(page)).toHaveAttribute('data-cropping', 'e_picture');
    await expect(crop).toHaveAttribute('aria-pressed', 'true');
    await expect(rowB(page).getByRole('combobox', { name: 'Crop proportions' })).toBeVisible();
    await expect(rowB(page).getByRole('slider', { name: 'Picture zoom' })).toHaveCount(0);
    await expect(surface(page).locator('[data-picture-handle]')).toHaveCount(4);
    await expect(rowB(page).getByRole('button', { name: 'Reset crop' })).toBeDisabled();
    // The Stage has the focus, so Esc leaves at once.
    await expect(surface(page)).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(surface(page)).not.toHaveAttribute('data-cropping', /./);
    expect((await state(page)).selected).toEqual(['e_picture']);

    await crop.click();
    await expect(surface(page)).toHaveAttribute('data-cropping', 'e_picture');
    await crop.click();
    await expect(surface(page)).not.toHaveAttribute('data-cropping', /./);

    await crop.click();
    await rowB(page).getByRole('button', { name: 'Done' }).click();
    await expect(surface(page)).not.toHaveAttribute('data-cropping', /./);
    await expect(surface(page)).toBeFocused();

    // Esc also leaves from a crop tool that has the focus.
    await crop.click();
    await rowB(page).getByRole('button', { name: 'Reset crop' }).focus();
    await page.keyboard.press('Escape');
    await expect(surface(page)).not.toHaveAttribute('data-cropping', /./);
  });

  test('a preset shapes the frame and holds while a handle is dragged; reset undoes the crop', async ({
    page,
  }) => {
    await openApp(page, 'en');
    const before = await image(page, 'e_picture');
    await rowB(page).getByRole('button', { name: 'Crop', exact: true }).click();
    const scale = await stageScale(page);
    const picture = await box(page, PICTURE);
    const { steps } = await state(page);
    const proportions = rowB(page).getByRole('combobox', { name: 'Crop proportions' });
    const pick = async (name: string) => {
      await proportions.click();
      await page.getByRole('option', { name, exact: true }).click();
    };

    await pick('1:1');
    let now = await image(page, 'e_picture');
    expect(now.frame.w).toBe(now.frame.h);
    expect(now.frame.h).toBeLessThanOrEqual(400);
    // Around the same centre.
    expect(now.frame.x + now.frame.w / 2).toBe(960);
    expect(now.crop!.w).toBeCloseTo(now.frame.w / 600, 5);
    expect((await state(page)).steps).toBe(steps + 1);
    await expect(proportions).toHaveText('1:1');

    // Undone, the frame no longer has those proportions, and the tool says so: picking them
    // again shapes the frame again.
    const square = now;
    await undo(page);
    expect(await image(page, 'e_picture')).toEqual(before);
    await expect(proportions).toHaveText('Free');
    await pick('1:1');
    expect(await image(page, 'e_picture')).toEqual(square);
    await expect(proportions).toHaveText('1:1');

    // The handles keep the proportions now.
    await drag(page, await center(page, handle('se')), { x: -80 * scale, y: -10 * scale });
    now = await image(page, 'e_picture');
    expect(now.frame.w).toBe(now.frame.h);
    expect(now.frame.w).toBeLessThan(400);

    await pick('16:9');
    now = await image(page, 'e_picture');
    expect(now.frame.w / now.frame.h).toBeCloseTo(16 / 9, 1);
    await pick('4:3');
    now = await image(page, 'e_picture');
    expect(now.frame.w / now.frame.h).toBeCloseTo(4 / 3, 1);
    // The picture's own proportions: 3 to 2.
    await pick('Original');
    now = await image(page, 'e_picture');
    expect(now.frame.w / now.frame.h).toBeCloseTo(1.5, 1);

    // Free again: an edge moves alone.
    await pick('Free');
    expect((await image(page, 'e_picture')).frame).toEqual(now.frame);
    await drag(page, await center(page, handle('e')), { x: -60 * scale, y: 0 });
    const free = await image(page, 'e_picture');
    expect(free.frame.h).toBe(now.frame.h);
    expect(free.frame.w).toBeLessThan(now.frame.w);

    // None of this moved the picture.
    const after = await box(page, PICTURE);
    for (const k of ['x', 'y', 'width', 'height'] as const) {
      expect(Math.abs(after[k] - picture[k])).toBeLessThan(0.75);
    }

    const count = (await state(page)).steps;
    await rowB(page).getByRole('button', { name: 'Reset crop' }).click();
    expect(await image(page, 'e_picture')).toEqual(before);
    expect((await state(page)).steps).toBe(count + 1);
    await expect(rowB(page).getByRole('button', { name: 'Reset crop' })).toBeDisabled();
    await undo(page);
    expect(await image(page, 'e_picture')).toEqual(free);
  });

  test('picture corner points scale the picture in its fixed frame, one undo step per drag', async ({
    page,
  }) => {
    await openApp(page, 'en');
    const before = await image(page, 'e_picture');
    await rowB(page).getByRole('button', { name: 'Crop', exact: true }).click();
    const { steps } = await state(page);
    const scale = await stageScale(page);
    const from = await center(page, '[data-picture-handle="se"]');
    await drag(page, from, { x: 120 * scale, y: 80 * scale });
    let zoomed = await image(page, 'e_picture');
    expect(zoomed.frame).toEqual(before.frame);
    expect(zoomed.crop!.w).toBeCloseTo(1 / 1.2, 3);
    // The opposite corner stays in place as the picture grows.
    expect(zoomed.crop!.x).toBeCloseTo(0, 5);
    expect(zoomed.crop!.y).toBeCloseTo(0, 5);
    expect(zoomed.crop!.w / zoomed.crop!.h).toBeCloseTo(1, 5);
    expect((await state(page)).steps).toBe(steps + 1);

    // The whole drag is undone at once.
    await undo(page);
    expect(await image(page, 'e_picture')).toEqual(before);
    await drag(page, from, { x: 120 * scale, y: 80 * scale });
    zoomed = await image(page, 'e_picture');
    expect(zoomed.crop!.w).toBeCloseTo(1 / 1.2, 3);

    await drag(page, await center(page, '[data-picture-handle="se"]'), {
      x: -120 * scale,
      y: -80 * scale,
    });
    expect((await image(page, 'e_picture')).crop).toBeNull();

    await drag(page, await center(page, '[data-picture-handle="se"]'), {
      x: 120 * scale,
      y: 80 * scale,
    });
    zoomed = await image(page, 'e_picture');

    // The wheel still scales the picture under the pointer.
    const c = await center(page, el('e_picture'));
    await page.mouse.move(c.x, c.y);
    await page.mouse.wheel(0, -200);
    await expect
      .poll(async () => (await image(page, 'e_picture')).crop?.w ?? 1)
      .toBeLessThan(zoomed.crop!.w);

    await rowB(page).getByRole('button', { name: 'Reset crop' }).click();
    expect((await image(page, 'e_picture')).crop).toBeNull();
  });

  const shots = [
    { lang: 'he', scheme: 'light', width: 1920, height: 1032 },
    { lang: 'en', scheme: 'dark', width: 1920, height: 1032 },
    { lang: 'he', scheme: 'dark', width: 1366, height: 768 },
    { lang: 'en', scheme: 'light', width: 1366, height: 768 },
  ] as const;
  for (const { lang, scheme, width, height } of shots) {
    test(`the crop tools fit row B: ${lang}, ${scheme}, ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      await openApp(page, lang);
      await rowB(page)
        .getByRole('button', { name: lang === 'he' ? 'חיתוך' : 'Crop', exact: true })
        .click();
      await expect(surface(page)).toHaveAttribute('data-cropping', 'e_picture');
      const scale = await stageScale(page);
      await drag(page, await center(page, handle('e')), { x: -120 * scale, y: 0 });
      await drag(page, await center(page, handle('n')), { x: 0, y: 60 * scale });
      await page.mouse.move(5, 5);
      await page.waitForTimeout(250);
      // Nothing of the row is cut off or pushed out.
      const overflow = await rowB(page).evaluate((row) => row.scrollWidth - row.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
      const done = await rowB(page)
        .getByRole('button', { name: lang === 'he' ? 'סיום' : 'Done' })
        .boundingBox();
      const row = (await rowB(page).boundingBox())!;
      expect(done!.x).toBeGreaterThanOrEqual(row.x);
      expect(done!.x + done!.width).toBeLessThanOrEqual(row.x + row.width);
      await page.screenshot({
        path: `test-results/stage/crop-tools-${lang}-${scheme}-${width}.png`,
      });
      await rowB(page).screenshot({
        path: `test-results/stage/crop-row-${lang}-${scheme}-${width}.png`,
      });
    });
  }
});
