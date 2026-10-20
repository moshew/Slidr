import { expect, test, type Page } from '@playwright/test';

// Editing lines on the Stage (WG5-T05, SHP-05; ADR-016), on the Stage's dev page.

interface Point {
  x: number;
  y: number;
}

interface LineModel {
  id: string;
  frame: { x: number; y: number; w: number; h: number };
  rotation: number;
  points: Point[];
  curve: string;
}

type SlidrWindow = {
  slidr: {
    bus: {
      deck: { slides: { elements: LineModel[] }[] };
      undoStack: unknown[];
      undo(): boolean;
    };
    selection: { getState(): { selectedElementIds: string[] } };
  };
};

const line = (page: Page, id: string) =>
  page.evaluate((elementId) => {
    const { bus } = (window as unknown as SlidrWindow).slidr;
    for (const s of bus.deck.slides) {
      const e = s.elements.find((x) => x.id === elementId);
      if (e) return { frame: e.frame, rotation: e.rotation, points: e.points, curve: e.curve };
    }
    throw new Error(`no element ${elementId}`);
  }, id);

const selected = (page: Page) =>
  page.evaluate(
    () => (window as unknown as SlidrWindow).slidr.selection.getState().selectedElementIds,
  );

const steps = (page: Page) =>
  page.evaluate(() => (window as unknown as SlidrWindow).slidr.bus.undoStack.length);

const undo = (page: Page) =>
  page.evaluate(() => (window as unknown as SlidrWindow).slidr.bus.undo());

const surface = (page: Page) => page.getByTestId('stage-surface');
const pointHandle = (page: Page, i: number) => surface(page).locator(`[data-line-point="${i}"]`);

/** The zoom of the Stage and where a slide point is on the screen. */
async function stage(page: Page) {
  const frame = (await page.getByTestId('stage-frame').boundingBox())!;
  const scale = frame.width / 1920;
  return { scale, at: (p: Point) => ({ x: frame.x + p.x * scale, y: frame.y + p.y * scale }) };
}

async function centerOf(page: Page, i: number) {
  const rect = (await pointHandle(page, i).boundingBox())!;
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

async function drag(
  page: Page,
  from: Point,
  to: Point,
  keys: { shift?: boolean; ctrl?: boolean } = {},
) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  if (keys.shift) await page.keyboard.down('Shift');
  if (keys.ctrl) await page.keyboard.down('Control');
  const n = 8;
  for (let i = 1; i <= n; i++) {
    await page.mouse.move(from.x + ((to.x - from.x) * i) / n, from.y + ((to.y - from.y) * i) / n);
    await page.waitForTimeout(20);
  }
  await page.mouse.up();
  if (keys.shift) await page.keyboard.up('Shift');
  if (keys.ctrl) await page.keyboard.up('Control');
}

async function clickSlide(page: Page, p: Point, offset: Point = { x: 0, y: 0 }) {
  const { at } = await stage(page);
  const s = at(p);
  await page.mouse.click(s.x + offset.x, s.y + offset.y);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/dev/stage.html?deck=stage&slide=2');
  await surface(page).locator('[data-element-id="e_line_diagonal"]').waitFor();
  await page.evaluate(() => document.fonts.ready);
});

test('a line is picked by its stroke, with some slack, and not by the box around it', async ({
  page,
}) => {
  // The middle of the diagonal.
  await clickSlide(page, { x: 450, y: 310 });
  expect(await selected(page)).toEqual(['e_line_diagonal']);
  // Inside its frame box, far from the stroke: the empty slide.
  await clickSlide(page, { x: 640, y: 200 });
  expect(await selected(page)).toEqual([]);
  await clickSlide(page, { x: 250, y: 420 });
  expect(await selected(page)).toEqual([]);

  // A flat line has no box at all: a few pixels beside its stroke still pick it.
  await clickSlide(page, { x: 450, y: 600 }, { x: 0, y: 6 });
  expect(await selected(page)).toEqual(['e_line_flat']);
  await clickSlide(page, { x: 450, y: 600 }, { x: 0, y: 16 });
  expect(await selected(page)).toEqual([]);
  await clickSlide(page, { x: 450, y: 600 }, { x: 0, y: -6 });
  expect(await selected(page)).toEqual(['e_line_flat']);

  // An elbow is hit on the path it is drawn on: its upright stretch, not its diagonal.
  await clickSlide(page, { x: 1040, y: 280 });
  expect(await selected(page)).toEqual(['e_line_elbow']);
  await clickSlide(page, { x: 950, y: 280 });
  expect(await selected(page)).toEqual([]);
  // A curve leaves its ends level: near the start it runs along the top of its box.
  await clickSlide(page, { x: 900, y: 524 });
  expect(await selected(page)).toEqual(['e_line_curved']);
  await clickSlide(page, { x: 1040, y: 560 });
  expect(await selected(page)).toEqual([]);

  // A turned, mirrored line: its middle is on the stroke, its box corner is not.
  await clickSlide(page, { x: 500, y: 840 });
  expect(await selected(page)).toEqual(['e_line_turned']);
  await clickSlide(page, { x: 330, y: 900 });
  expect(await selected(page)).toEqual([]);
});

test('a selected line has a handle on each point; dragging one moves that end only', async ({
  page,
}) => {
  const before = await line(page, 'e_line_diagonal');
  await clickSlide(page, { x: 450, y: 310 });
  await expect(surface(page).locator('[data-line-point]')).toHaveCount(2);
  // No box handles: only the rotation handle is left of them.
  await expect(surface(page).locator('[data-handle]')).toHaveCount(1);
  await expect(surface(page).locator('[data-handle="rotate"]')).toHaveCount(1);

  const { at } = await stage(page);
  const count = await steps(page);
  await drag(page, await centerOf(page, 1), at({ x: 1000, y: 700 }), { ctrl: true });
  const moved = await line(page, 'e_line_diagonal');
  // The start stayed at 200, 160; the end went to 1000, 700; the frame is the box around them.
  expect(moved.frame.x).toBe(200);
  expect(moved.frame.y).toBe(160);
  expect(Math.abs(moved.frame.w - 800)).toBeLessThanOrEqual(1);
  expect(Math.abs(moved.frame.h - 540)).toBeLessThanOrEqual(1);
  expect(moved.points[0]).toEqual({ x: 0, y: 0 });
  expect(moved.points[1]).toEqual({ x: moved.frame.w, y: moved.frame.h });
  expect(await steps(page)).toBe(count + 1);

  // The other end, past the first: the points swap corners of the frame, the far end stays.
  await drag(page, await centerOf(page, 0), at({ x: 1200, y: 100 }), { ctrl: true });
  const crossed = await line(page, 'e_line_diagonal');
  const end = {
    x: crossed.frame.x + crossed.points[1]!.x,
    y: crossed.frame.y + crossed.points[1]!.y,
  };
  expect(Math.abs(end.x - (200 + moved.frame.w))).toBeLessThanOrEqual(1);
  expect(Math.abs(end.y - (160 + moved.frame.h))).toBeLessThanOrEqual(1);
  expect(crossed.points[0]!.y).toBe(0);
  expect(crossed.points[1]!.x).toBe(0);
  expect(await steps(page)).toBe(count + 2);

  await undo(page);
  await undo(page);
  expect(await line(page, 'e_line_diagonal')).toEqual(before);
});

test('Esc during the drag of an end puts the line back', async ({ page }) => {
  const before = await line(page, 'e_line_flat');
  await clickSlide(page, { x: 450, y: 600 });
  const count = await steps(page);
  const from = await centerOf(page, 1);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 40, from.y + 90, { steps: 5 });
  await page.waitForTimeout(60);
  expect((await line(page, 'e_line_flat')).frame.h).toBeGreaterThan(50);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  expect(await line(page, 'e_line_flat')).toEqual(before);
  expect(await steps(page)).toBe(count);
});

test('Shift keeps the end on multiples of 15 degrees', async ({ page }) => {
  await clickSlide(page, { x: 450, y: 600 });
  const { at } = await stage(page);
  for (const to of [
    { x: 705, y: 430 },
    { x: 520, y: 380 },
    { x: 760, y: 590 },
  ]) {
    await drag(page, await centerOf(page, 1), at(to), { shift: true });
    const { points } = await line(page, 'e_line_flat');
    const angle =
      (Math.atan2(points[1]!.y - points[0]!.y, points[1]!.x - points[0]!.x) * 180) / Math.PI;
    expect(Math.abs(angle / 15 - Math.round(angle / 15))).toBeLessThan(0.02);
  }
  // The last one came back to level: a flat frame again.
  expect((await line(page, 'e_line_flat')).frame.h).toBe(0);
});

test('an end snaps to the guides of the other elements', async ({ page }) => {
  await clickSlide(page, { x: 450, y: 310 });
  const { at } = await stage(page);
  // Near the left edge and the middle of the box at 1400, 200, 300 x 200.
  await drag(page, await centerOf(page, 1), at({ x: 1396, y: 303 }));
  const snapped = await line(page, 'e_line_diagonal');
  expect(snapped.frame.x + snapped.points[1]!.x).toBe(1400);
  expect(snapped.frame.y + snapped.points[1]!.y).toBe(300);
});

test('moving and rotating a line still work', async ({ page }) => {
  const before = await line(page, 'e_line_diagonal');
  const { at, scale } = await stage(page);
  const mid = at({ x: 450, y: 310 });
  await drag(page, mid, { x: mid.x + 50 * scale, y: mid.y + 40 * scale }, { ctrl: true });
  const moved = await line(page, 'e_line_diagonal');
  expect(Math.abs(moved.frame.x - 250)).toBeLessThanOrEqual(1);
  expect(Math.abs(moved.frame.y - 200)).toBeLessThanOrEqual(1);
  expect(moved.points).toEqual(before.points);

  const rot = (await surface(page).locator('[data-handle="rotate"]').boundingBox())!;
  await drag(
    page,
    { x: rot.x + 5, y: rot.y + 5 },
    { x: rot.x + 120, y: rot.y + 70 },
    { shift: true },
  );
  const turned = await line(page, 'e_line_diagonal');
  expect(turned.rotation).toBeGreaterThan(0);
  expect(turned.rotation % 15).toBe(0);
  expect(turned.points).toEqual(before.points);
});

test('a double-click on the stroke adds a point, and on a point removes it', async ({ page }) => {
  const before = await line(page, 'e_line_flat');
  await clickSlide(page, { x: 450, y: 600 });
  const { at } = await stage(page);
  const count = await steps(page);
  const on = at({ x: 400, y: 600 });
  await page.mouse.dblclick(on.x, on.y);
  await expect(surface(page).locator('[data-line-point]')).toHaveCount(3);
  let now = await line(page, 'e_line_flat');
  // On the stroke under the pointer, on a whole pixel; the pointer itself is between pixels.
  expect(now.points).toHaveLength(3);
  expect(now.points[0]).toEqual({ x: 0, y: 0 });
  expect(Math.abs(now.points[1]!.x - 200)).toBeLessThanOrEqual(1);
  expect(Number.isInteger(now.points[1]!.x)).toBe(true);
  expect(now.points[1]!.y).toBe(0);
  expect(now.points[2]).toEqual({ x: 500, y: 0 });
  expect(await steps(page)).toBe(count + 1);
  // One step to undo; then the same double-click adds it again.
  await undo(page);
  expect(await line(page, 'e_line_flat')).toEqual(before);
  await page.mouse.dblclick(on.x, on.y);
  await expect(surface(page).locator('[data-line-point]')).toHaveCount(3);

  // The new point bends the line; the frame grows around it.
  await drag(page, await centerOf(page, 1), at({ x: 400, y: 720 }), { ctrl: true });
  now = await line(page, 'e_line_flat');
  expect(Math.abs(now.frame.h - 120)).toBeLessThanOrEqual(1);
  expect(now.points[0]).toEqual({ x: 0, y: 0 });
  expect(now.points[2]).toEqual({ x: 500, y: 0 });

  const handle = await centerOf(page, 1);
  await page.mouse.dblclick(handle.x, handle.y);
  await expect(surface(page).locator('[data-line-point]')).toHaveCount(2);
  expect(await line(page, 'e_line_flat')).toEqual(before);
  // The two ends cannot be removed.
  const end = await centerOf(page, 1);
  await page.mouse.dblclick(end.x, end.y);
  expect((await line(page, 'e_line_flat')).points).toHaveLength(2);
});

test('an elbow, a curve and a turned line keep their kind and their other points', async ({
  page,
}) => {
  const { at } = await stage(page);
  await clickSlide(page, { x: 1040, y: 280 });
  await drag(page, await centerOf(page, 1), at({ x: 1300, y: 460 }), { ctrl: true });
  const elbow = await line(page, 'e_line_elbow');
  expect(elbow.curve).toBe('elbow');
  expect(elbow.frame.x).toBe(860);
  expect(Math.abs(elbow.frame.w - 440)).toBeLessThanOrEqual(1);
  // Its corner moved with it: the upright stretch is in the middle of the new width.
  await clickSlide(page, { x: 400, y: 100 });
  await clickSlide(page, { x: 860 + elbow.frame.w / 2, y: 300 });
  expect(await selected(page)).toEqual(['e_line_elbow']);

  // A curve through four points: each of them has a handle.
  await clickSlide(page, { x: 1240, y: 820 });
  expect(await selected(page)).toEqual(['e_line_wave']);
  await expect(surface(page).locator('[data-line-point]')).toHaveCount(4);
  await drag(page, await centerOf(page, 1), at({ x: 1240, y: 760 }), { ctrl: true });
  const wave = await line(page, 'e_line_wave');
  expect(wave.points).toHaveLength(4);
  expect(Math.abs(wave.frame.y - 760)).toBeLessThanOrEqual(1);
  expect(Math.abs(wave.frame.h - 220)).toBeLessThanOrEqual(1);

  // Turned by -15 degrees and mirrored: the end that is not dragged stays on the screen.
  await clickSlide(page, { x: 500, y: 840 });
  expect(await selected(page)).toEqual(['e_line_turned']);
  const stay = await centerOf(page, 0);
  const from = await centerOf(page, 1);
  await drag(page, from, { x: from.x + 90, y: from.y - 50 }, { ctrl: true });
  const after = await centerOf(page, 0);
  expect(Math.abs(after.x - stay.x)).toBeLessThan(0.75);
  expect(Math.abs(after.y - stay.y)).toBeLessThan(0.75);
  const moved = await centerOf(page, 1);
  expect(Math.abs(moved.x - (from.x + 90))).toBeLessThan(1.5);
  expect(Math.abs(moved.y - (from.y - 50))).toBeLessThan(1.5);
  expect((await line(page, 'e_line_turned')).rotation).toBe(-15);
});

test('line handles look right', async ({ page }) => {
  await clickSlide(page, { x: 1240, y: 820 });
  await expect(surface(page).locator('[data-line-point]')).toHaveCount(4);
  await page.screenshot({ path: 'test-results/stage/line-points.png' });
  await clickSlide(page, { x: 500, y: 840 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.screenshot({ path: 'test-results/stage/line-turned-dark.png' });
});
