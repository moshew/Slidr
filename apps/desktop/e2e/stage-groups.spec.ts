import { expect, test, type Page } from '@playwright/test';

// Working inside groups (ARR-01) and duplicating by Alt+drag (ARR-05) on the Stage (ADR-016), on
// the Stage's dev page.

interface Frame {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Model {
  id: string;
  type: string;
  frame: Frame;
  rotation: number;
  crop?: Frame;
  children?: Model[];
  content?: { paragraphs: { runs: { text: string }[] }[] };
}

type SlidrWindow = {
  slidr: {
    bus: {
      deck: { slides: { id: string; elements: Model[] }[] };
      undoStack: unknown[];
      undo(): boolean;
    };
    selection: {
      getState(): {
        selectedElementIds: string[];
        editingElementId: string | null;
        currentSlideId: string;
      };
    };
  };
};

/** An element anywhere in the deck, as plain data. */
const element = (page: Page, id: string) =>
  page.evaluate((elementId) => {
    const { bus } = (window as unknown as SlidrWindow).slidr;
    const find = (list: Model[]): Model | null => {
      for (const e of list) {
        if (e.id === elementId) return e;
        const inside = e.children ? find(e.children) : null;
        if (inside) return inside;
      }
      return null;
    };
    for (const s of bus.deck.slides) {
      const e = find(s.elements);
      if (e) return JSON.parse(JSON.stringify(e)) as Model;
    }
    return null;
  }, id);

const state = (page: Page) =>
  page.evaluate(() => {
    const { bus, selection } = (window as unknown as SlidrWindow).slidr;
    const s = selection.getState();
    const slide = bus.deck.slides.find((x) => x.id === s.currentSlideId)!;
    return {
      selected: s.selectedElementIds,
      editing: s.editingElementId,
      steps: bus.undoStack.length,
      top: slide.elements.map((e) => e.id),
    };
  });

const undo = (page: Page) =>
  page.evaluate(() => (window as unknown as SlidrWindow).slidr.bus.undo());

const surface = (page: Page) => page.getByTestId('stage-surface');
const el = (id: string) => `[data-element-id="${id}"]`;

async function box(page: Page, selector: string) {
  const rect = await surface(page).locator(selector).first().boundingBox();
  if (!rect) throw new Error(`no box for ${selector}`);
  return rect;
}

async function center(page: Page, selector: string) {
  const rect = await box(page, selector);
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

async function stageScale(page: Page) {
  const frame = await page.getByTestId('stage-frame').boundingBox();
  return frame!.width / 1920;
}

async function drag(
  page: Page,
  from: { x: number; y: number },
  by: { x: number; y: number },
  keys: { alt?: boolean; ctrl?: boolean; shift?: boolean; release?: boolean } = {},
) {
  await page.mouse.move(from.x, from.y);
  if (keys.alt) await page.keyboard.down('Alt');
  await page.mouse.down();
  if (keys.ctrl) await page.keyboard.down('Control');
  if (keys.shift) await page.keyboard.down('Shift');
  const n = 8;
  for (let i = 1; i <= n; i++) {
    await page.mouse.move(from.x + (by.x * i) / n, from.y + (by.y * i) / n);
    await page.waitForTimeout(20);
  }
  if (keys.release === false) return;
  await page.mouse.up();
  if (keys.ctrl) await page.keyboard.up('Control');
  if (keys.shift) await page.keyboard.up('Shift');
  if (keys.alt) await page.keyboard.up('Alt');
}

/** Goes into a group by a double-click on one of its children, which ends up selected. */
async function enter(page: Page, child: string) {
  const c = await center(page, el(child));
  await page.mouse.dblclick(c.x, c.y);
  await expect.poll(async () => (await state(page)).selected).toEqual([child]);
}

async function expectSameBox(
  page: Page,
  selector: string,
  before: Awaited<ReturnType<typeof box>>,
) {
  const now = await box(page, selector);
  for (const k of ['x', 'y', 'width', 'height'] as const) {
    expect(Math.abs(now[k] - before[k]), `${selector} ${k}`).toBeLessThan(0.75);
  }
}

/** The box around the children of a group, in the group's own coordinates. */
function childBounds(group: Model): Frame {
  const boxes = group.children!.map((c) => c.frame);
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  return {
    x,
    y,
    w: Math.max(...boxes.map((b) => b.x + b.w)) - x,
    h: Math.max(...boxes.map((b) => b.y + b.h)) - y,
  };
}

test.beforeEach(async ({ page }) => {
  await page.goto('/dev/stage.html?deck=stage&slide=1');
  await surface(page).locator(el('g_plain_dot')).waitFor();
  await page.evaluate(() => document.fonts.ready);
});

test('a click picks the group; a double-click goes in; Esc and a click outside come out', async ({
  page,
}) => {
  const dot = await center(page, el('g_plain_dot'));
  await page.mouse.click(dot.x, dot.y);
  expect((await state(page)).selected).toEqual(['g_plain']);
  await expect(surface(page)).not.toHaveAttribute('data-entered', /./);

  await page.mouse.dblclick(dot.x, dot.y);
  expect((await state(page)).selected).toEqual(['g_plain_dot']);
  await expect(surface(page)).toHaveAttribute('data-entered', 'g_plain');
  await expect(surface(page).locator('[data-entered-group="g_plain"]')).toBeVisible();
  // The child has its own handles now.
  await expect(surface(page).locator('[data-handle]')).toHaveCount(9);

  // Inside, a click picks the children, also the one that fills the group.
  const text = await center(page, el('g_plain_text'));
  await page.mouse.click(text.x, text.y);
  expect((await state(page)).selected).toEqual(['g_plain_text']);
  await page.mouse.click(dot.x + 20, dot.y + 75);
  expect((await state(page)).selected).toEqual(['g_plain_card']);
  await page.keyboard.press('Control+a');
  expect((await state(page)).selected).toHaveLength(4);

  await page.keyboard.press('Escape');
  expect((await state(page)).selected).toEqual(['g_plain']);
  await expect(surface(page)).not.toHaveAttribute('data-entered', /./);

  // A click on another element, or on the empty slide, leaves the group too.
  await page.mouse.dblclick(dot.x, dot.y);
  await expect(surface(page)).toHaveAttribute('data-entered', 'g_plain');
  const free = await center(page, el('e_free'));
  await page.mouse.click(free.x, free.y);
  expect((await state(page)).selected).toEqual(['e_free']);
  await expect(surface(page)).not.toHaveAttribute('data-entered', /./);

  await page.mouse.dblclick(dot.x, dot.y);
  await page.mouse.click(free.x + 300, free.y);
  expect((await state(page)).selected).toEqual([]);
  await expect(surface(page)).not.toHaveAttribute('data-entered', /./);

  // Enter on a selected group goes in and selects what is in it.
  await page.mouse.click(dot.x, dot.y);
  await page.keyboard.press('Enter');
  expect((await state(page)).selected).toEqual([
    'g_plain_card',
    'g_plain_text',
    'g_plain_image',
    'g_plain_dot',
  ]);
  await expect(surface(page)).toHaveAttribute('data-entered', 'g_plain');
});

test('moving a child is one undo step; the group grows around it and nothing else moves', async ({
  page,
}) => {
  const before = await element(page, 'g_plain');
  const scale = await stageScale(page);
  await enter(page, 'g_plain_dot');
  const card = await box(page, el('g_plain_card'));
  const dot = await box(page, el('g_plain_dot'));
  const { steps } = await state(page);

  // Past the right edge of the group.
  const c = await center(page, el('g_plain_dot'));
  await drag(page, c, { x: 260 * scale, y: 40 * scale }, { ctrl: true });
  let group = (await element(page, 'g_plain'))!;
  expect(group.frame).toEqual({ x: 120, y: 120, w: 840, h: 380 });
  expect(group.children!.find((e) => e.id === 'g_plain_dot')!.frame.w).toBe(160);
  expect(Math.abs((await element(page, 'g_plain_dot'))!.frame.x - 680)).toBeLessThanOrEqual(1);
  expect((await state(page)).steps).toBe(steps + 1);
  await undo(page);
  expect(await element(page, 'g_plain')).toEqual(before);

  // Past its top-left corner: the group's origin moves, so every child gets a new frame, and
  // still none of the others moves on the screen.
  await page.mouse.click(c.x, c.y);
  await drag(page, c, { x: -500 * scale, y: -200 * scale }, { ctrl: true });
  group = (await element(page, 'g_plain'))!;
  expect(childBounds(group)).toEqual({ x: 0, y: 0, w: group.frame.w, h: group.frame.h });
  expect(group.frame.x).toBeLessThan(120);
  expect(group.frame.y).toBeLessThan(120);
  expect(group.children!.find((e) => e.id === 'g_plain_card')!.frame.x).toBe(120 - group.frame.x);
  await expectSameBox(page, el('g_plain_card'), card);
  const moved = await box(page, el('g_plain_dot'));
  expect(Math.abs(moved.x - (dot.x - 500 * scale))).toBeLessThan(1.5);
  expect(Math.abs(moved.y - (dot.y - 200 * scale))).toBeLessThan(1.5);
  expect((await state(page)).steps).toBe(steps + 1);
  await undo(page);
  expect(await element(page, 'g_plain')).toEqual(before);

  // Esc during the drag: the group is as it was, and nothing is left to undo.
  await page.mouse.click(c.x, c.y);
  await drag(page, c, { x: 300, y: 0 }, { release: false });
  expect((await element(page, 'g_plain'))!.frame.w).toBeGreaterThan(640);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  expect(await element(page, 'g_plain')).toEqual(before);
  expect((await state(page)).steps).toBe(steps);
});

test('a child is resized and rotated in place, and nudged with the arrows', async ({ page }) => {
  const before = await element(page, 'g_plain');
  const scale = await stageScale(page);
  await enter(page, 'g_plain_dot');
  const { steps } = await state(page);

  const se = await center(page, '[data-handle="se"]');
  await drag(page, se, { x: 60 * scale, y: 40 * scale });
  let dot = (await element(page, 'g_plain_dot'))!;
  expect(Math.abs(dot.frame.w - 220)).toBeLessThanOrEqual(1);
  expect(Math.abs(dot.frame.h - 200)).toBeLessThanOrEqual(1);
  expect(dot.frame.x).toBe(420);
  // Still inside the group: the group did not change.
  expect((await element(page, 'g_plain'))!.frame).toEqual(before!.frame);

  const rot = await center(page, '[data-handle="rotate"]');
  await drag(page, rot, { x: 120, y: 60 }, { shift: true });
  dot = (await element(page, 'g_plain_dot'))!;
  expect(dot.rotation).toBeGreaterThan(0);
  expect(dot.rotation % 15).toBe(0);

  await page.waitForTimeout(900);
  await page.keyboard.press('Shift+ArrowLeft');
  await page.keyboard.press('ArrowUp');
  const nudged = (await element(page, 'g_plain_dot'))!;
  expect(nudged.frame.x).toBe(dot.frame.x - 10);
  expect(nudged.frame.y).toBe(dot.frame.y - 1);
  expect((await state(page)).steps).toBe(steps + 3);

  for (let i = 0; i < 3; i++) await undo(page);
  expect(await element(page, 'g_plain')).toEqual(before);
});

test('in a turned, mirrored group a child follows the pointer and the rest stays', async ({
  page,
}) => {
  const before = await element(page, 'g_turned');
  await enter(page, 'g_turned_arrow');
  await expect(surface(page)).toHaveAttribute('data-entered', 'g_turned');
  const arrow = await center(page, el('g_turned_arrow'));
  const card = await box(page, el('g_turned_card'));
  const text = await box(page, el('g_turned_text'));
  const { steps } = await state(page);

  // Out of the group, to the right on the screen (the arrow is drawn on the mirrored side).
  await drag(page, arrow, { x: 190, y: 40 }, { ctrl: true });
  const moved = await center(page, el('g_turned_arrow'));
  expect(Math.abs(moved.x - (arrow.x + 190))).toBeLessThan(1.5);
  expect(Math.abs(moved.y - (arrow.y + 40))).toBeLessThan(1.5);
  await expectSameBox(page, el('g_turned_card'), card);
  await expectSameBox(page, el('g_turned_text'), text);
  const group = (await element(page, 'g_turned'))!;
  expect(group.frame.w).toBeGreaterThan(560);
  expect(group.rotation).toBe(20);
  const bounds = childBounds(group);
  expect(bounds.x).toBeCloseTo(0, 2);
  expect(bounds.y).toBeCloseTo(0, 2);
  expect(bounds.w).toBeCloseTo(group.frame.w, 2);
  expect(bounds.h).toBeCloseTo(group.frame.h, 2);
  expect((await state(page)).steps).toBe(steps + 1);

  // A handle is where the child's own edge is on the screen, and drags it.
  const width = (await element(page, 'g_turned_arrow'))!.frame.w;
  const east = await center(page, '[data-handle="e"]');
  const out = { x: east.x - moved.x, y: east.y - moved.y };
  const len = Math.hypot(out.x, out.y);
  await drag(page, east, { x: (out.x / len) * 40, y: (out.y / len) * 40 });
  const scale = await stageScale(page);
  const wider = (await element(page, 'g_turned_arrow'))!.frame.w;
  expect(Math.abs(wider - (width + 40 / scale))).toBeLessThan(2);
  await expectSameBox(page, el('g_turned_text'), text);
  await page.screenshot({ path: 'test-results/stage/group-turned.png' });

  await undo(page);
  await undo(page);
  expect(await element(page, 'g_turned')).toEqual(before);
});

test('nested groups are entered one level at a time, and all of them stay fitted', async ({
  page,
}) => {
  const before = await element(page, 'g_outer');
  const scale = await stageScale(page);
  const a = await center(page, el('g_inner_a'));
  await page.mouse.click(a.x, a.y);
  expect((await state(page)).selected).toEqual(['g_outer']);
  await page.mouse.dblclick(a.x, a.y);
  expect((await state(page)).selected).toEqual(['g_inner']);
  await expect(surface(page)).toHaveAttribute('data-entered', 'g_outer');
  await page.mouse.dblclick(a.x, a.y);
  expect((await state(page)).selected).toEqual(['g_inner_a']);
  await expect(surface(page)).toHaveAttribute('data-entered', 'g_outer g_inner');

  const box0 = await box(page, el('g_outer_box'));
  const b0 = await box(page, el('g_inner_b'));
  const { steps } = await state(page);
  // Up, out of both groups: both get a new frame, and their other children new offsets.
  await drag(page, a, { x: 0, y: -100 * scale }, { ctrl: true });
  const outer = (await element(page, 'g_outer'))!;
  const inner = outer.children!.find((e) => e.id === 'g_inner')!;
  expect(Math.abs(outer.frame.y - 560)).toBeLessThanOrEqual(1);
  expect(Math.abs(outer.frame.h - 380)).toBeLessThanOrEqual(1);
  expect(inner.frame.y).toBe(0);
  expect(childBounds(inner)).toEqual({ x: 0, y: 0, w: inner.frame.w, h: inner.frame.h });
  expect(childBounds(outer)).toEqual({ x: 0, y: 0, w: outer.frame.w, h: outer.frame.h });
  await expectSameBox(page, el('g_outer_box'), box0);
  await expectSameBox(page, el('g_inner_b'), b0);
  expect((await state(page)).steps).toBe(steps + 1);
  await page.screenshot({ path: 'test-results/stage/group-nested.png' });
  await undo(page);
  expect(await element(page, 'g_outer')).toEqual(before);

  await page.keyboard.press('Escape');
  expect((await state(page)).selected).toEqual(['g_inner']);
  await expect(surface(page)).toHaveAttribute('data-entered', 'g_outer');
  await page.keyboard.press('Escape');
  expect((await state(page)).selected).toEqual(['g_outer']);
  await page.keyboard.press('Escape');
  expect((await state(page)).selected).toEqual([]);
});

test('text inside a group is edited in place', async ({ page }) => {
  await enter(page, 'g_plain_dot');
  const text = await center(page, el('g_plain_text'));
  await page.mouse.dblclick(text.x, text.y);
  expect((await state(page)).editing).toBe('g_plain_text');
  await expect(page.locator('[data-text-editor]')).toBeFocused();
  await page.keyboard.press('End');
  await page.keyboard.type(' edited');
  const content = (await element(page, 'g_plain_text'))!.content!;
  expect(content.paragraphs[0]!.runs.map((r) => r.text).join('')).toBe('A plain group edited');
  await page.keyboard.press('Escape');
  expect(await state(page)).toMatchObject({ editing: null, selected: ['g_plain_text'] });
  await expect(surface(page)).toHaveAttribute('data-entered', 'g_plain');
});

test('an image inside a group is cropped, and the group follows its frame', async ({ page }) => {
  const scale = await stageScale(page);
  await enter(page, 'g_plain_image');
  const picture = await box(page, `${el('g_plain_image')} img`);
  await page.keyboard.press('Enter');
  await expect(surface(page)).toHaveAttribute('data-cropping', 'g_plain_image');
  const west = await center(page, '[data-crop-handle="w"]');
  await drag(page, west, { x: 60 * scale, y: 0 });
  const image = (await element(page, 'g_plain_image'))!;
  expect(image.frame).toEqual({ x: 100, y: 140, w: 240, h: 200 });
  expect(image.crop).toEqual({ x: 0.2, y: 0, w: 0.8, h: 1 });
  await expectSameBox(page, `${el('g_plain_image')} img`, picture);
  await page.keyboard.press('Escape');
  expect(await state(page)).toMatchObject({ editing: null, selected: ['g_plain_image'] });
});

test('Delete inside a group shrinks the group around what is left', async ({ page }) => {
  const before = await element(page, 'g_plain');
  await enter(page, 'g_plain_dot');
  const text = await box(page, el('g_plain_text'));
  const dot = await center(page, el('g_plain_dot'));
  // The card that fills the group.
  await page.mouse.click(dot.x + 20, dot.y + 75);
  expect((await state(page)).selected).toEqual(['g_plain_card']);
  const { steps } = await state(page);
  await page.keyboard.press('Delete');
  const group = (await element(page, 'g_plain'))!;
  expect(group.children!.map((c) => c.id)).toEqual([
    'g_plain_text',
    'g_plain_image',
    'g_plain_dot',
  ]);
  expect(group.frame).toEqual({ x: 160, y: 150, w: 560, h: 310 });
  expect(childBounds(group)).toEqual({ x: 0, y: 0, w: 560, h: 310 });
  await expectSameBox(page, el('g_plain_text'), text);
  expect((await state(page)).steps).toBe(steps + 1);
  await undo(page);
  expect(await element(page, 'g_plain')).toEqual(before);
});

test('Alt+drag leaves the original and moves a copy, as one undo step', async ({ page }) => {
  const original = (await element(page, 'e_free'))!;
  const scale = await stageScale(page);
  const c = await center(page, el('e_free'));
  const before = await state(page);

  await drag(page, c, { x: 300 * scale, y: -120 * scale }, { alt: true, ctrl: true });
  const after = await state(page);
  expect(after.top).toHaveLength(before.top.length + 1);
  expect(after.selected).toHaveLength(1);
  const copyId = after.selected[0]!;
  expect(copyId).not.toBe('e_free');
  expect(await element(page, 'e_free')).toEqual(original);
  const copy = (await element(page, copyId))!;
  expect(Math.abs(copy.frame.x - (original.frame.x + 300))).toBeLessThanOrEqual(1);
  expect(Math.abs(copy.frame.y - (original.frame.y - 120))).toBeLessThanOrEqual(1);
  expect(copy.frame.w).toBe(original.frame.w);
  expect(after.steps).toBe(before.steps + 1);

  await undo(page);
  expect((await state(page)).top).toEqual(before.top);
  expect(await element(page, copyId)).toBeNull();

  // Esc during the drag: no copy is left, the original is selected again, nothing to undo.
  await page.mouse.click(c.x, c.y);
  const selected = await state(page);
  await drag(page, c, { x: 200, y: 60 }, { alt: true, release: false });
  expect((await state(page)).top).toHaveLength(before.top.length + 1);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await page.keyboard.up('Alt');
  expect(await state(page)).toEqual(selected);
  expect(await element(page, 'e_free')).toEqual(original);
});

test('Alt+drag inside a group copies into the group', async ({ page }) => {
  const scale = await stageScale(page);
  await enter(page, 'g_plain_dot');
  const c = await center(page, el('g_plain_dot'));
  const { steps } = await state(page);
  await drag(page, c, { x: 300 * scale, y: 0 }, { alt: true, ctrl: true });
  const group = (await element(page, 'g_plain'))!;
  expect(group.children).toHaveLength(5);
  const { selected } = await state(page);
  expect(group.children!.at(-1)!.id).toBe(selected[0]);
  expect(group.children!.find((e) => e.id === 'g_plain_dot')!.frame).toEqual({
    x: 420,
    y: 160,
    w: 160,
    h: 160,
  });
  // The copy went past the group's edge, and the group grew around it.
  expect(Math.abs(group.frame.w - 880)).toBeLessThanOrEqual(1);
  expect((await state(page)).steps).toBe(steps + 1);
  await undo(page);
  expect((await element(page, 'g_plain'))!.children).toHaveLength(4);
});

test('a marquee started inside an entered group selects its children only', async ({ page }) => {
  const scale = await stageScale(page);
  await enter(page, 'g_outer_box');
  await expect(surface(page)).toHaveAttribute('data-entered', 'g_outer');
  // The gap between the box and the inner group belongs to the group, not to a child.
  const edge = await box(page, el('g_outer_box'));
  const gap = { x: edge.x + edge.width + 30 * scale, y: edge.y + 12 * scale };
  await drag(page, gap, { x: 300 * scale, y: 280 * scale });
  expect((await state(page)).selected).toEqual(['g_inner']);
  await expect(surface(page)).toHaveAttribute('data-entered', 'g_outer');
});

test('resizing a group stretches everything in it, as one undo step', async ({ page }) => {
  const before = await element(page, 'g_plain');
  const scale = await stageScale(page);
  const dot = await center(page, el('g_plain_dot'));
  await page.mouse.click(dot.x, dot.y);
  expect((await state(page)).selected).toEqual(['g_plain']);
  const { steps } = await state(page);
  // From 640 x 380 to 768 x 456: one fifth more each way.
  const se = await center(page, '[data-handle="se"]');
  await drag(page, se, { x: 128 * scale, y: 76 * scale }, { ctrl: true });
  const group = (await element(page, 'g_plain'))!;
  expect(group.frame).toEqual({ x: 120, y: 120, w: 768, h: 456 });
  const child = (id: string) => group.children!.find((c) => c.id === id)!.frame;
  expect(child('g_plain_card')).toEqual({ x: 0, y: 0, w: 768, h: 456 });
  expect(child('g_plain_dot')).toEqual({ x: 504, y: 192, w: 192, h: 192 });
  expect(child('g_plain_image')).toEqual({ x: 48, y: 168, w: 360, h: 240 });
  expect((await state(page)).steps).toBe(steps + 1);
  await undo(page);
  expect(await element(page, 'g_plain')).toEqual(before);
});

test('several elements are resized together by the handles of the box around them', async ({
  page,
}) => {
  const outer = await element(page, 'g_outer');
  const scale = await stageScale(page);
  const free = await center(page, el('e_free'));
  await page.mouse.click(free.x, free.y);
  const boxed = await center(page, el('g_outer_box'));
  await page.keyboard.down('Shift');
  await page.mouse.click(boxed.x, boxed.y);
  await page.keyboard.up('Shift');
  expect((await state(page)).selected).toEqual(['e_free', 'g_outer']);
  // The box has the eight resize handles, and the rotation handle that turns them together.
  await expect(surface(page).locator('[data-handle]')).toHaveCount(9);
  await expect(surface(page).locator('[data-handle="rotate"]')).toHaveCount(1);
  const { steps } = await state(page);

  // The box is 200..1480 wide; three quarters of that, from its right edge.
  const east = await center(page, '[data-handle="e"]');
  await drag(page, east, { x: -320 * scale, y: 0 }, { ctrl: true });
  expect((await element(page, 'e_free'))!.frame).toEqual({ x: 980, y: 700, w: 180, h: 180 });
  const group = (await element(page, 'g_outer'))!;
  expect(group.frame).toEqual({ x: 200, y: 620, w: 525, h: 320 });
  expect(group.children![0]!.frame).toEqual({ x: 0, y: 0, w: 195, h: 320 });
  expect((await state(page)).steps).toBe(steps + 1);
  await undo(page);
  expect(await element(page, 'g_outer')).toEqual(outer);
  expect((await element(page, 'e_free'))!.frame).toEqual({ x: 1240, y: 700, w: 240, h: 180 });
});

test('an edge that a handle moves snaps to the other elements', async ({ page }) => {
  const scale = await stageScale(page);
  const free = await center(page, el('e_free'));
  await page.mouse.click(free.x, free.y);
  // To within a few pixels of the right edge of the nested group, at 900.
  const west = await center(page, '[data-handle="w"]');
  await drag(page, west, { x: -336 * scale, y: 0 });
  expect((await element(page, 'e_free'))!.frame).toEqual({ x: 900, y: 700, w: 580, h: 180 });
});

for (const scheme of ['light', 'dark'] as const) {
  test(`an entered group looks right in ${scheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await enter(page, 'g_plain_dot');
    await page.mouse.move(10, 10);
    await page.screenshot({ path: `test-results/stage/group-entered-${scheme}.png` });
  });
}
