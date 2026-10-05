import { expect, test, type Page } from '@playwright/test';

// The Stage on its dev page (/dev/stage.html), with the real CommandBus behind it.
// `window.slidr` exposes the bus and the selection.

interface Frame {
  x: number;
  y: number;
  w: number;
  h: number;
}

type SlidrWindow = {
  slidr: {
    bus: {
      deck: {
        slides: { id: string; elements: { id: string; frame: Frame; rotation: number }[] }[];
      };
      undoStack: unknown[];
      undo(): boolean;
    };
    selection: { getState(): { selectedElementIds: string[] } };
  };
};

const element = (page: Page, id: string) =>
  page.evaluate((elementId) => {
    const { bus } = (window as unknown as SlidrWindow).slidr;
    for (const s of bus.deck.slides) {
      const e = s.elements.find((x) => x.id === elementId);
      if (e) return { frame: e.frame, rotation: e.rotation };
    }
    return null;
  }, id);

const selected = (page: Page) =>
  page.evaluate(
    () => (window as unknown as SlidrWindow).slidr.selection.getState().selectedElementIds,
  );

const undoSteps = (page: Page) =>
  page.evaluate(() => (window as unknown as SlidrWindow).slidr.bus.undoStack.length);

async function center(page: Page, id: string) {
  const box = await page
    .getByTestId('stage-surface')
    .locator(`[data-element-id="${id}"]`)
    .boundingBox();
  if (!box) throw new Error(`no box for ${id}`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function drag(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
  keys: { shift?: boolean } = {},
) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  if (keys.shift) await page.keyboard.down('Shift');
  const steps = 8;
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(
      from.x + ((to.x - from.x) * i) / steps,
      from.y + ((to.y - from.y) * i) / steps,
    );
    await page.waitForTimeout(20);
  }
  await page.mouse.up();
  if (keys.shift) await page.keyboard.up('Shift');
}

test.beforeEach(async ({ page }) => {
  await page.goto('/dev/stage.html?deck=reference&slide=5');
  await page.getByTestId('stage-surface').locator('[data-element-id="e_fx_opacity"]').waitFor();
  await page.evaluate(() => document.fonts.ready);
});

test('a click selects; a drag moves as one undo step, with the slide fitted at 64%', async ({
  page,
}) => {
  await expect(page.getByTestId('zoom')).toHaveText(/\d+%/);
  const c = await center(page, 'e_fx_opacity');
  await page.mouse.click(c.x, c.y);
  expect(await selected(page)).toEqual(['e_fx_opacity']);

  const before = await element(page, 'e_fx_opacity');
  const steps = await undoSteps(page);
  await drag(page, c, { x: c.x + 77, y: c.y + 41 });
  const after = await element(page, 'e_fx_opacity');
  expect(after!.frame.x).not.toBe(before!.frame.x);
  expect(after!.frame.y).not.toBe(before!.frame.y);
  expect(await undoSteps(page)).toBe(steps + 1);
  await page.evaluate(() => (window as unknown as SlidrWindow).slidr.bus.undo());
  expect(await element(page, 'e_fx_opacity')).toEqual(before);
});

test('Esc during a drag puts the element back and leaves nothing to undo', async ({ page }) => {
  const c = await center(page, 'e_fx_blur');
  const before = await element(page, 'e_fx_blur');
  const steps = await undoSteps(page);
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.mouse.move(c.x + 60, c.y + 30, { steps: 5 });
  await page.waitForTimeout(50);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  expect(await element(page, 'e_fx_blur')).toEqual(before);
  expect(await undoSteps(page)).toBe(steps);
});

test('the corner handle resizes and the rotate handle snaps to 15 degrees with Shift', async ({
  page,
}) => {
  const c = await center(page, 'e_fx_opacity');
  await page.mouse.click(c.x, c.y);
  const before = await element(page, 'e_fx_opacity');
  const se = await page.locator('[data-handle="se"]').boundingBox();
  await drag(page, { x: se!.x + 4, y: se!.y + 4 }, { x: se!.x + 64, y: se!.y + 34 });
  const resized = await element(page, 'e_fx_opacity');
  expect(resized!.frame.w).toBeGreaterThan(before!.frame.w + 50);
  expect(resized!.frame.x).toBe(before!.frame.x);

  const rot = await page.locator('[data-handle="rotate"]').boundingBox();
  await drag(
    page,
    { x: rot!.x + 5, y: rot!.y + 5 },
    { x: rot!.x + 120, y: rot!.y + 60 },
    { shift: true },
  );
  const rotated = await element(page, 'e_fx_opacity');
  expect(rotated!.rotation).toBeGreaterThan(0);
  expect(rotated!.rotation % 15).toBe(0);
});

test('a marquee from empty space selects what it touches; arrows nudge; Delete removes', async ({
  page,
}) => {
  const a = await center(page, 'e_fx_opacity');
  const b = await center(page, 'e_fx_blur');
  // From below-left of the first box to above the second, through empty space.
  await drag(page, { x: a.x - 40, y: a.y + 120 }, { x: b.x, y: b.y });
  expect((await selected(page)).sort()).toEqual(['e_fx_blur', 'e_fx_opacity']);

  const before = await element(page, 'e_fx_blur');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Shift+ArrowDown');
  const nudged = await element(page, 'e_fx_blur');
  expect(nudged!.frame.x).toBe(before!.frame.x + 1);
  expect(nudged!.frame.y).toBe(before!.frame.y + 10);

  await page.keyboard.press('Delete');
  await expect(
    page.getByTestId('stage-surface').locator('[data-element-id="e_fx_blur"]'),
  ).toHaveCount(0);
  expect(await selected(page)).toEqual([]);
});

test('the stage looks right with a selection', async ({ page }) => {
  // On the card of the group, beside its text: a click on the text goes into editing it. The
  // group is turned by 8 degrees, and the text keeps 40 slide pixels from the card's edge.
  const c = await center(page, 'e_fx_group');
  const frame = await page.getByTestId('stage-frame').boundingBox();
  const scale = frame!.width / 1920;
  const turn = (8 * Math.PI) / 180;
  await page.mouse.click(c.x - 280 * Math.cos(turn) * scale, c.y - 280 * Math.sin(turn) * scale);
  expect(await selected(page)).toEqual(['e_fx_group']);
  await page.screenshot({ path: 'test-results/stage/selection.png' });
});

// ---- Filmstrip ----

const slideIds = (page: Page) =>
  page.evaluate(() => (window as unknown as SlidrWindow).slidr.bus.deck.slides.map((s) => s.id));

const thumb = (page: Page, id: string) =>
  page.locator(`[data-testid="filmstrip"] [role="option"][data-slide-id="${id}"]`);

test('a thumbnail click shows its slide; Ctrl adds to the selection; Delete removes', async ({
  page,
}) => {
  const ids = await slideIds(page);
  await thumb(page, ids[2]!).click();
  await expect(
    page.locator(`[data-testid="stage-surface"] [data-slide-id="${ids[2]}"]`),
  ).toBeVisible();
  await thumb(page, ids[3]!).click({ modifiers: ['Control'] });
  await expect(thumb(page, ids[2]!)).toHaveAttribute('aria-selected', 'true');
  await expect(thumb(page, ids[3]!)).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Delete');
  expect(await slideIds(page)).toEqual(ids.filter((id) => id !== ids[2] && id !== ids[3]));
});

test('dragging a thumbnail reorders the slides in one undo step', async ({ page }) => {
  const ids = await slideIds(page);
  const from = await thumb(page, ids[0]!).boundingBox();
  const to = await thumb(page, ids[2]!).boundingBox();
  await drag(
    page,
    { x: from!.x + 40, y: from!.y + 40 },
    { x: to!.x + to!.width + 4, y: to!.y + 40 },
  );
  expect((await slideIds(page)).slice(0, 4)).toEqual([ids[1], ids[2], ids[0], ids[3]]);
  await page.evaluate(() => (window as unknown as SlidrWindow).slidr.bus.undo());
  expect(await slideIds(page)).toEqual(ids);
});

test('200 slides render only the thumbnails in view', async ({ page }) => {
  await page.goto('/dev/stage.html?deck=big');
  await thumb(page, 's_big_0').waitFor();
  const rendered = await page.locator('[data-testid="filmstrip"] [role="option"]').count();
  expect(rendered).toBeLessThan(25);
  await page.getByRole('listbox').focus();
  await page.keyboard.press('End');
  await expect(thumb(page, 's_big_199')).toBeVisible();
  await expect(
    page.locator('[data-testid="stage-surface"] [data-slide-id="s_big_199"]'),
  ).toBeVisible();
});

test('a picture dropped on the Stage becomes a selected image element where it was dropped', async ({
  page,
}) => {
  const surface = page.getByTestId('stage-surface');
  const box = await surface.boundingBox();
  const at = { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
  const before = await page.evaluate(
    () => (window as unknown as SlidrWindow).slidr.bus.deck.slides[5]!.elements.length,
  );
  await surface.evaluate(async (el, point) => {
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 300;
    const g = canvas.getContext('2d')!;
    g.fillStyle = '#e5484d';
    g.fillRect(0, 0, 400, 300);
    const blob = await new Promise<Blob>((resolve) =>
      canvas.toBlob((b) => resolve(b!), 'image/png'),
    );
    const dt = new DataTransfer();
    dt.items.add(new File([blob], 'red.png', { type: 'image/png' }));
    el.dispatchEvent(
      new DragEvent('drop', {
        dataTransfer: dt,
        clientX: point.x,
        clientY: point.y,
        bubbles: true,
        cancelable: true,
      }),
    );
  }, at);
  await expect.poll(() => selected(page)).toHaveLength(1);
  const id = (await selected(page))[0]!;
  const e = await element(page, id);
  expect(e!.frame.w).toBe(400);
  expect(Math.abs(e!.frame.x + 200 - 960)).toBeLessThan(5);
  expect(
    await page.evaluate(
      () => (window as unknown as SlidrWindow).slidr.bus.deck.slides[5]!.elements.length,
    ),
  ).toBe(before + 1);
  await expect(surface.locator(`[data-element-id="${id}"] img`)).toBeVisible();
});
