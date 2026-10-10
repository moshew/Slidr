import { expect, test, type Page } from '@playwright/test';

// The handles of an image on the Stage (IMG-02): dots on the corners, bars on the edges. A corner
// sizes the image whole; an edge moves alone, and cuts the picture or shows more of it, and past
// the end of the picture the picture grows with the frame. On the Stage's dev page.

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
}

type SlidrWindow = {
  slidr: {
    bus: {
      deck: { slides: { id: string; elements: ImageModel[] }[] };
      undoStack: unknown[];
      undo(): boolean;
    };
    selection: { getState(): { selectElements(ids: string[]): void } };
  };
};

const image = (page: Page, id: string) =>
  page.evaluate((elementId) => {
    const { bus } = (window as unknown as SlidrWindow).slidr;
    for (const s of bus.deck.slides) {
      const e = s.elements.find((element) => element.id === elementId);
      if (e) return { frame: e.frame, rotation: e.rotation, crop: e.crop ?? null };
    }
    throw new Error(`no element ${elementId}`);
  }, id);

const steps = (page: Page) =>
  page.evaluate(() => (window as unknown as SlidrWindow).slidr.bus.undoStack.length);

const undo = (page: Page) =>
  page.evaluate(() => (window as unknown as SlidrWindow).slidr.bus.undo());

const select = (page: Page, id: string) =>
  page.evaluate(
    (elementId) =>
      (window as unknown as SlidrWindow).slidr.selection.getState().selectElements([elementId]),
    id,
  );

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
const handle = (name: string) => `[data-handle="${name}"]`;
/** What is drawn of a handle, inside the area that takes the pointer. */
const drawn = (name: string) => `${handle(name)} > div`;
/** The whole picture is shown only in crop mode. */
const PICTURE = '[data-crop-picture] img';

/** The zoom of the Stage: screen pixels per slide pixel. */
async function stageScale(page: Page) {
  const frame = await page.getByTestId('stage-frame').boundingBox();
  return frame!.width / 1920;
}

/**
 * A drag from a point. Ctrl is held unless `snap` asks otherwise: the edge then goes exactly as
 * far as the pointer, and not to a guide that happens to be near.
 */
async function drag(
  page: Page,
  from: { x: number; y: number },
  by: { x: number; y: number },
  options: { shift?: boolean; alt?: boolean; snap?: boolean; release?: boolean } = {},
) {
  const keys = [
    ...(options.snap ? [] : ['Control']),
    ...(options.shift ? ['Shift'] : []),
    ...(options.alt ? ['Alt'] : []),
  ];
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (const key of keys) await page.keyboard.down(key);
  const count = 8;
  for (let i = 1; i <= count; i++) {
    await page.mouse.move(from.x + (by.x * i) / count, from.y + (by.y * i) / count);
    await page.waitForTimeout(20);
  }
  if (options.release === false) return;
  await page.mouse.up();
  for (const key of keys) await page.keyboard.up(key);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/dev/stage.html?deck=stage&slide=0');
  await surface(page).locator(el('e_crop_plain')).waitFor();
  await page.evaluate(() => document.fonts.ready);
});

test('a selected element has dots on its corners and bars along its edges, lit under the pointer', async ({
  page,
}) => {
  await select(page, 'e_crop_plain');
  await expect(surface(page).locator('[data-handle]')).toHaveCount(9);
  for (const name of ['nw', 'ne', 'se', 'sw']) {
    const dot = await box(page, drawn(name));
    expect([dot.width, dot.height]).toEqual([12, 12]);
  }
  for (const name of ['n', 's']) {
    const bar = await box(page, drawn(name));
    expect([bar.width, bar.height]).toEqual([16, 6]);
  }
  for (const name of ['e', 'w']) {
    const bar = await box(page, drawn(name));
    expect([bar.width, bar.height]).toEqual([6, 16]);
  }
  // Each is centred on its place on the frame.
  const frame = await box(page, el('e_crop_plain'));
  const east = await center(page, handle('e'));
  expect(Math.abs(east.x - (frame.x + frame.width))).toBeLessThan(1);
  expect(Math.abs(east.y - (frame.y + frame.height / 2))).toBeLessThan(1);

  // The one under the pointer is lit, and the one that is dragged stays lit through the drag.
  await page.mouse.move(east.x, east.y);
  await expect(surface(page).locator(handle('e'))).toHaveAttribute('data-lit', 'true');
  await expect(surface(page).locator('[data-lit]')).toHaveCount(1);
  await drag(page, east, { x: -80, y: 60 }, { release: false });
  await expect(surface(page).locator(handle('e'))).toHaveAttribute('data-lit', 'true');
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await page.keyboard.up('Control');
});

test('an edge handle moves that edge alone and cuts the picture, which stays; one undo step', async ({
  page,
}) => {
  const before = await image(page, 'e_crop_plain');
  await select(page, 'e_crop_plain');
  const scale = await stageScale(page);
  const picture = await box(page, `${el('e_crop_plain')} img`);
  const count = await steps(page);

  // The pointer also goes down the screen: the edge follows it on its own axis only.
  await drag(page, await center(page, handle('e')), { x: -150 * scale, y: 40 });
  const cut = await image(page, 'e_crop_plain');
  expect(cut.frame).toEqual({ ...before.frame, w: 450 });
  expect(cut.crop).toEqual({ x: 0, y: 0, w: 0.75, h: 1 });
  const after = await box(page, `${el('e_crop_plain')} img`);
  expect(Math.abs(after.x - picture.x)).toBeLessThan(0.5);
  expect(Math.abs(after.y - picture.y)).toBeLessThan(0.5);
  expect(Math.abs(after.width - picture.width)).toBeLessThan(0.5);
  expect(await steps(page)).toBe(count + 1);

  // The top edge, from the other side; the picture still has not moved.
  await drag(page, await center(page, handle('n')), { x: -30, y: 100 * scale });
  const twice = await image(page, 'e_crop_plain');
  expect(twice.frame).toEqual({ x: 140, y: 220, w: 450, h: 300 });
  expect(twice.crop).toEqual({ x: 0, y: 0.25, w: 0.75, h: 0.75 });
  const still = await box(page, `${el('e_crop_plain')} img`);
  expect(Math.abs(still.y - picture.y)).toBeLessThan(0.5);
  expect(Math.abs(still.height - picture.height)).toBeLessThan(0.5);

  // Out again shows what was cut, as far as the picture goes.
  await drag(page, await center(page, handle('e')), { x: 150 * scale, y: 0 });
  expect(await image(page, 'e_crop_plain')).toEqual({
    ...twice,
    frame: { x: 140, y: 220, w: 600, h: 300 },
    crop: { x: 0, y: 0.25, w: 1, h: 0.75 },
  });

  await undo(page);
  await undo(page);
  expect(await image(page, 'e_crop_plain')).toEqual(cut);
  await undo(page);
  expect(await image(page, 'e_crop_plain')).toEqual(before);
});

test('past the end of the picture the picture grows with the frame, and is cut on the other axis', async ({
  page,
}) => {
  const before = await image(page, 'e_crop_plain');
  await select(page, 'e_crop_plain');
  const scale = await stageScale(page);

  await drag(page, await center(page, handle('e')), { x: 150 * scale, y: 0 });
  const grown = await image(page, 'e_crop_plain');
  expect(grown.frame).toEqual({ ...before.frame, w: 750 });
  // A quarter larger: all of its width shows, and a tenth of its height is cut above and below.
  expect(grown.crop).toEqual({ x: 0, y: 0.1, w: 1, h: 0.8 });
  const shown = await box(page, `${el('e_crop_plain')} img`);
  const frame = await box(page, el('e_crop_plain'));
  expect(Math.abs(shown.width - 750 * scale)).toBeLessThan(0.5);
  expect(Math.abs(shown.height - 500 * scale)).toBeLessThan(0.5);
  expect(Math.abs(shown.y - (frame.y - 50 * scale))).toBeLessThan(0.5);

  // Back in, in a drag of its own, the edge cuts the larger picture.
  await drag(page, await center(page, handle('e')), { x: -150 * scale, y: 0 });
  expect(await image(page, 'e_crop_plain')).toEqual({
    ...before,
    crop: { x: 0, y: 0.1, w: 0.8, h: 0.8 },
  });

  // In one drag, out and back in leaves the image as it was.
  await undo(page);
  await undo(page);
  const east = await center(page, handle('e'));
  await drag(page, east, { x: 200 * scale, y: 0 }, { release: false });
  expect((await image(page, 'e_crop_plain')).frame.w).toBe(800);
  await page.mouse.move(east.x, east.y);
  await page.waitForTimeout(40);
  await page.mouse.up();
  await page.keyboard.up('Control');
  expect(await image(page, 'e_crop_plain')).toEqual(before);
});

test('a corner sizes the image whole and leaves its crop, and so does an edge with Shift', async ({
  page,
}) => {
  await select(page, 'e_crop_plain');
  const scale = await stageScale(page);
  await drag(page, await center(page, handle('w')), { x: 150 * scale, y: 0 });
  const cut = await image(page, 'e_crop_plain');
  expect(cut.frame).toEqual({ x: 290, y: 120, w: 450, h: 400 });
  expect(cut.crop).toEqual({ x: 0.25, y: 0, w: 0.75, h: 1 });

  await drag(page, await center(page, handle('se')), { x: 90 * scale, y: 80 * scale });
  const larger = await image(page, 'e_crop_plain');
  expect(larger.frame).toEqual({ x: 290, y: 120, w: 540, h: 480 });
  expect(larger.crop).toEqual(cut.crop);

  await drag(page, await center(page, handle('e')), { x: -90 * scale, y: 0 }, { shift: true });
  const smaller = await image(page, 'e_crop_plain');
  expect(smaller.frame).toEqual({ x: 290, y: 160, w: 450, h: 400 });
  expect(smaller.crop).toEqual(cut.crop);
});

test('Alt moves both edges, around the middle', async ({ page }) => {
  const before = await image(page, 'e_crop_plain');
  await select(page, 'e_crop_plain');
  const scale = await stageScale(page);
  await drag(page, await center(page, handle('e')), { x: -100 * scale, y: 0 }, { alt: true });
  expect(await image(page, 'e_crop_plain')).toEqual({
    ...before,
    frame: { x: 240, y: 120, w: 400, h: 400 },
    crop: { x: 0.166667, y: 0, w: 0.666667, h: 1 },
  });
});

test('the edge of a turned and mirrored image cuts the side of the picture that is under it', async ({
  page,
}) => {
  const before = await image(page, 'e_crop_turned');
  await select(page, 'e_crop_turned');
  const scale = await stageScale(page);
  const picture = await box(page, `${el('e_crop_turned')} img`);
  // Along the frame's own x axis, which is turned by 20 degrees.
  const turn = (20 * Math.PI) / 180;
  await drag(page, await center(page, handle('e')), {
    x: -150 * scale * Math.cos(turn),
    y: -150 * scale * Math.sin(turn),
  });
  const cut = await image(page, 'e_crop_turned');
  expect(cut.frame.w).toBe(450);
  expect(cut.frame.h).toBe(400);
  expect(cut.rotation).toBe(before.rotation);
  // Mirrored: the east handle is over the picture's left side.
  expect(cut.crop).toEqual({ x: 0.25, y: 0, w: 0.75, h: 1 });
  // The picture stayed, to within the whole pixel the frame's place is kept in.
  const after = await box(page, `${el('e_crop_turned')} img`);
  expect(Math.abs(after.x - picture.x)).toBeLessThan(1);
  expect(Math.abs(after.y - picture.y)).toBeLessThan(1);
  expect(Math.abs(after.width - picture.width)).toBeLessThan(1);
});

test('resizing shows only the framed image; the whole picture appears in crop mode', async ({
  page,
}) => {
  const before = await image(page, 'e_crop_plain');
  await select(page, 'e_crop_plain');
  const scale = await stageScale(page);
  const count = await steps(page);
  await expect(surface(page).locator(PICTURE)).toHaveCount(0);

  await drag(page, await center(page, handle('s')), { x: 0, y: -100 * scale }, { release: false });
  expect((await image(page, 'e_crop_plain')).frame.h).toBe(300);
  const frame = await box(page, el('e_crop_plain'));
  expect(Math.abs(frame.height - 300 * scale)).toBeLessThan(0.5);
  await expect(surface(page).locator(PICTURE)).toHaveCount(0);
  await expect(page.getByText('600 × 300')).toBeVisible();

  await page.keyboard.press('Escape');
  await page.mouse.up();
  await page.keyboard.up('Control');
  expect(await image(page, 'e_crop_plain')).toEqual(before);
  expect(await steps(page)).toBe(count);
  await expect(surface(page).locator(PICTURE)).toHaveCount(0);

  const middle = await center(page, el('e_crop_plain'));
  await page.mouse.dblclick(middle.x, middle.y);
  await expect(surface(page)).toHaveAttribute('data-cropping', 'e_crop_plain');
  await expect(surface(page).locator(PICTURE)).toHaveCount(1);
});

test('the moving edge snaps to a guide, and the picture is cut at the guide', async ({ page }) => {
  await select(page, 'e_crop_plain');
  const scale = await stageScale(page);
  // The image below ends at 500: the edge is let go a few pixels short of it.
  await drag(page, await center(page, handle('e')), { x: -237 * scale, y: 0 }, { snap: true });
  const cut = await image(page, 'e_crop_plain');
  expect(cut.frame).toEqual({ x: 140, y: 120, w: 360, h: 400 });
  expect(cut.crop).toEqual({ x: 0, y: 0, w: 0.6, h: 1 });
});

test('a picture with bars is fitted to its frame again, and an empty frame just changes', async ({
  page,
}) => {
  const scale = await stageScale(page);
  // Contained in a square frame: bars above and below.
  const contained = await image(page, 'e_crop_contain');
  await select(page, 'e_crop_contain');
  await drag(page, await center(page, handle('e')), { x: -60 * scale, y: 0 });
  expect(await image(page, 'e_crop_contain')).toEqual({
    ...contained,
    frame: { ...contained.frame, w: 300 },
  });

  // A placeholder has no picture yet.
  const pending = await image(page, 'e_crop_pending');
  await select(page, 'e_crop_pending');
  await drag(page, await center(page, handle('n')), { x: 0, y: -40 * scale });
  expect(await image(page, 'e_crop_pending')).toEqual({
    ...pending,
    frame: { ...pending.frame, y: pending.frame.y - 40, h: pending.frame.h + 40 },
  });
});
