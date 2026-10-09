import { expect, test, type Page } from '@playwright/test';

// Crop mode of a picture in a drawn frame (`smartFrame`; IMG-03): the photograph shows through
// the frame's opening, so crop mode works on that opening and not on the whole card. The picture
// is moved and scaled under the opening; the card and its opening stay as they are. In the app,
// with the crop tools of Top Tools row B.

interface Frame {
  x: number;
  y: number;
  w: number;
  h: number;
}

type SlidrWindow = {
  slidr: {
    bus: {
      deck: { slides: { elements: { id: string; frame: Frame; crop?: Frame }[] }[] };
      undoStack: unknown[];
      batch(commands: unknown[], options?: unknown): void;
    };
    selection: {
      getState(): {
        selectedElementIds: string[];
        editingElementId: string | null;
        currentSlideId: string;
        selectElements(ids: string[]): void;
      };
    };
    assets: { import(file: File): Promise<{ id: string }> };
  };
};

const ID = 'e_framed';
/** The card on the slide: an instant photo, with a square opening near its top. */
const CARD = { x: 760, y: 300, w: 400, h: 480 };
const OPENING = { x: 26, y: 26, w: 348, h: 348 };

const image = (page: Page) =>
  page.evaluate((id) => {
    const { bus } = (window as unknown as SlidrWindow).slidr;
    for (const s of bus.deck.slides) {
      const e = s.elements.find((element) => element.id === id);
      if (e) return { frame: e.frame, crop: e.crop ?? null };
    }
    throw new Error(`no element ${id}`);
  }, ID);

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

const surface = (page: Page) => page.getByTestId('stage-surface');
const rowB = (page: Page) => page.getByTestId('top-tools-b');

async function box(page: Page, selector: string) {
  const rect = await surface(page).locator(selector).first().boundingBox();
  if (!rect) throw new Error(`no box for ${selector}`);
  return rect;
}

async function center(page: Page, selector: string) {
  const rect = await box(page, selector);
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

/** The photograph as the slide draws it, and the opening it shows through. */
const PHOTO = `[data-element-id="${ID}"] img`;
const HOLE = `[data-element-id="${ID}"] [data-image-opening]`;
/** What crop mode draws: the frame it works in, and the whole picture, dimmed, around it. */
const CROP_FRAME = `[data-crop-frame="${ID}"]`;
const PICTURE = '[data-crop-picture] img';

/** Two boxes of the screen are the same one, to within half a pixel. */
async function expectSameBox(page: Page, a: string, b: string) {
  const [one, other] = [await box(page, a), await box(page, b)];
  for (const side of ['x', 'y', 'width', 'height'] as const) {
    expect(Math.abs(one[side] - other[side]), `${side} of ${a} and of ${b}`).toBeLessThan(0.5);
  }
}

async function stageScale(page: Page) {
  const frame = await page.getByTestId('stage-frame').boundingBox();
  return frame!.width / 1920;
}

async function drag(page: Page, from: { x: number; y: number }, by: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  const count = 8;
  for (let i = 1; i <= count; i++) {
    await page.mouse.move(from.x + (by.x * i) / count, from.y + (by.y * i) / count);
    await page.waitForTimeout(20);
  }
  await page.mouse.up();
}

/** A picture of 1200 x 800 in a drawn frame, selected, in the open document. */
async function openApp(page: Page, placed: { rotation?: number; flipH?: boolean } = {}) {
  await page.addInitScript(() => localStorage.setItem('slidr.language', 'en'));
  await page.goto('/');
  await expect(page.getByTestId('stage-frame')).toBeVisible();
  await page.evaluate(
    async ({ id, card, opening, rotation, flipH }) => {
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
      const blob = await new Promise<Blob>((resolve) =>
        canvas.toBlob((b) => resolve(b!), 'image/png'),
      );
      const asset = await assets.import(new File([blob], 'picture.png', { type: 'image/png' }));
      bus.batch([
        { type: 'asset.add', asset },
        {
          type: 'element.add',
          slideId: selection.getState().currentSlideId,
          element: {
            id,
            type: 'image',
            frame: card,
            rotation,
            flipH,
            opacity: 1,
            assetId: asset.id,
            fit: 'cover',
            smartFrame: {
              viewBox: { w: card.w, h: card.h },
              opening,
              background: { kind: 'solid', color: { token: 'surface' } },
              decorations: [],
            },
          },
        },
      ]);
      selection.getState().selectElements([id]);
    },
    {
      id: ID,
      card: CARD,
      opening: OPENING,
      rotation: placed.rotation ?? 0,
      flipH: placed.flipH ?? false,
    },
  );
  await surface(page).locator(PHOTO).waitFor();
}

async function enterCrop(page: Page) {
  await rowB(page).getByRole('button', { name: 'Crop', exact: true }).click();
  await expect(surface(page)).toHaveAttribute('data-cropping', ID);
}

test('crop mode works on the opening: no handles, no proportions, and the picture as the slide draws it', async ({
  page,
}) => {
  await openApp(page);
  await enterCrop(page);
  // The frame of crop mode is the opening, and the dimmed picture lies on the slide's own.
  await expectSameBox(page, CROP_FRAME, HOLE);
  await expectSameBox(page, PICTURE, PHOTO);
  const scale = await stageScale(page);
  const hole = await box(page, HOLE);
  expect(Math.abs(hole.width - OPENING.w * scale)).toBeLessThan(0.5);

  // The opening is the drawn frame's: nothing here changes it.
  await expect(surface(page).locator('[data-crop-handle]')).toHaveCount(0);
  await expect(rowB(page).getByRole('combobox', { name: 'Crop proportions' })).toHaveCount(0);
  await expect(rowB(page).getByRole('slider', { name: 'Picture zoom' })).toBeVisible();
  await expect(rowB(page).getByRole('button', { name: 'Reset crop' })).toBeDisabled();

  // A press on the card around the opening leaves crop mode, as a press beside any image does.
  const card = await box(page, `[data-element-id="${ID}"]`);
  await page.mouse.click(card.x + card.width / 2, card.y + card.height - 20 * scale);
  expect(await state(page)).toMatchObject({ editing: null, selected: [ID] });
});

test('a drag, the wheel and the arrows move and scale the picture under the opening; the card stays', async ({
  page,
}) => {
  await openApp(page);
  await enterCrop(page);
  const scale = await stageScale(page);
  const { steps } = await state(page);
  const middle = await center(page, HOLE);
  const photo = await box(page, PHOTO);

  // 522 wide under an opening of 348: 87 are out of sight on either side.
  await drag(page, middle, { x: -60 * scale, y: 30 * scale });
  const panned = await image(page);
  expect(panned.frame).toEqual(CARD);
  expect(panned.crop!.x).toBeCloseTo(147 / 522, 3);
  expect(panned.crop!.w).toBeCloseTo(348 / 522, 5);
  expect(panned.crop).toMatchObject({ y: 0, h: 1 });
  const moved = await box(page, PHOTO);
  expect(Math.abs(moved.x - (photo.x - 60 * scale))).toBeLessThan(0.5);
  expect(Math.abs(moved.y - photo.y)).toBeLessThan(0.5);
  await expectSameBox(page, PICTURE, PHOTO);
  await expectSameBox(page, CROP_FRAME, HOLE);
  expect((await state(page)).steps).toBe(steps + 1);

  // The arrows move the picture, since there is no handle for them to move.
  await page.keyboard.press('ArrowLeft');
  await expect.poll(async () => (await image(page)).crop!.x).toBeCloseTo(148 / 522, 3);
  expect((await image(page)).frame).toEqual(CARD);

  // `mouse.wheel` returns before the page has handled the step, so the model is waited for.
  await page.waitForTimeout(900);
  await page.mouse.move(middle.x, middle.y);
  await page.mouse.wheel(0, -240);
  await expect.poll(async () => (await image(page)).crop!.w).toBeLessThan(0.5);
  const zoomed = await image(page);
  expect(zoomed.frame).toEqual(CARD);
  expect(zoomed.crop!.h).toBeLessThan(1);
  await expectSameBox(page, PICTURE, PHOTO);

  // Reset: the picture fills the opening again as it did at first, and the card has not moved.
  const reset = rowB(page).getByRole('button', { name: 'Reset crop' });
  await expect(reset).toBeEnabled();
  await reset.click();
  expect(await image(page)).toEqual({ frame: CARD, crop: null });
  await expect(reset).toBeDisabled();
  await expectSameBox(page, PICTURE, PHOTO);
  const back = await box(page, PHOTO);
  expect(Math.abs(back.x - photo.x)).toBeLessThan(0.5);
  expect(Math.abs(back.width - photo.width)).toBeLessThan(0.5);
});

test('in a turned and mirrored card the opening and the picture are where the slide draws them', async ({
  page,
}) => {
  await openApp(page, { rotation: 20, flipH: true });
  await enterCrop(page);
  await expectSameBox(page, CROP_FRAME, HOLE);
  await expectSameBox(page, PICTURE, PHOTO);

  const scale = await stageScale(page);
  const photo = await box(page, PHOTO);
  await drag(page, await center(page, HOLE), { x: -40 * scale, y: 0 });
  const panned = await image(page);
  expect(panned.frame).toEqual(CARD);
  expect(panned.crop).not.toBeNull();
  // The picture went the way the pointer did, and crop mode still draws it where the slide does.
  const moved = await box(page, PHOTO);
  expect(moved.x).toBeLessThan(photo.x - 20 * scale);
  await expectSameBox(page, PICTURE, PHOTO);
  await expectSameBox(page, CROP_FRAME, HOLE);
});
