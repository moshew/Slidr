import { expect, test, type Page } from '@playwright/test';
import { elements, frames, openApp, undoSteps } from './arrange-helpers';
import { addText, edit, editingId, para, plain } from './text-helpers';

/*
 * The frame of a text box whose text is typed in (`Stage.tsx`, `typing`). A press on the text is
 * the editor's, so the box is held by its frame: the handles size it and the edge of the frame
 * moves it, and the text stays open under both. The box that the "Text" button of the toolbar
 * adds is typed in at once, and is put in its place by the same frame before its first word.
 */

const ID = 'e_t';
const FRAME = { x: 400, y: 300, w: 600, h: 200 };
const surface = (page: Page) => page.getByTestId('stage-surface');
const editor = (page: Page) => page.locator('[data-text-editor]');
const edge = (page: Page) => surface(page).locator('[data-move-frame]');
const frameOf = async (page: Page, id: string) => (await frames(page, [id]))[id]!;

/** A point on the top edge of the frame, clear of the handle in its middle. */
async function onEdge(page: Page): Promise<{ x: number; y: number }> {
  const top = (await edge(page).first().boundingBox())!;
  return { x: top.x + top.width / 4, y: top.y + top.height / 2 };
}

/** Drags at the pace of a hand: the Stage draws a drag once a frame. */
async function drag(
  page: Page,
  from: { x: number; y: number },
  by: { x: number; y: number },
  keys: { alt?: boolean } = {},
) {
  await page.mouse.move(from.x, from.y);
  if (keys.alt) await page.keyboard.down('Alt');
  await page.mouse.down();
  const n = 8;
  for (let i = 1; i <= n; i++) {
    await page.mouse.move(from.x + (by.x * i) / n, from.y + (by.y * i) / n);
    await page.waitForTimeout(20);
  }
  await page.mouse.up();
  if (keys.alt) await page.keyboard.up('Alt');
}

test.beforeEach(async ({ page }) => {
  await openApp(page, { lang: 'en' });
});

test('the Text button adds a box that is typed in at once', async ({ page }) => {
  await page.locator('[data-tool="insert.text"]').click();
  await expect(editor(page)).toBeFocused();
  await page.keyboard.type('hello');
  const [box] = await elements(page);
  await expect.poll(() => plain(page, box!.id)).toBe('hello');
});

test('the frame gives the caret side room and keeps the text box height', async ({ page }) => {
  await addText(page, ID, [para('hello')], { frame: FRAME });
  await edit(page, ID);
  const box = (await surface(page).locator(`[data-element-id="${ID}"]`).boundingBox())!;
  const outline = (await surface(page).locator(`[data-outline="${ID}"]`).boundingBox())!;
  // The caret at the start of a line is on the side edge: keep room there, but no extra height.
  expect(box.x - outline.x).toBeGreaterThanOrEqual(4);
  expect(outline.y).toBeCloseTo(box.y, 0);
  expect(outline.height).toBeCloseTo(box.height, 0);
  expect(outline.width - box.width).toBeCloseTo(2 * (box.x - outline.x), 0);
  await expect(surface(page).locator('[data-handle]')).toHaveCount(9);
  const nw = (await surface(page).locator('[data-handle="nw"]').boundingBox())!;
  expect(nw.x + nw.width / 2).toBeCloseTo(outline.x, 0);
  expect(nw.y + nw.height / 2).toBeCloseTo(outline.y, 0);
});

test('the edge of the frame moves the box, and the text stays open', async ({ page }) => {
  await addText(page, ID, [para('hello')], { frame: FRAME });
  await edit(page, ID);
  const steps = await undoSteps(page);
  await drag(page, await onEdge(page), { x: 120, y: 90 });
  const moved = await frameOf(page, ID);
  expect(moved.x).toBeGreaterThan(FRAME.x + 100);
  expect(moved.y).toBeGreaterThan(FRAME.y + 80);
  expect([moved.w, moved.h]).toEqual([FRAME.w, FRAME.h]);
  expect(await undoSteps(page)).toBe(steps + 1);
  // The keyboard is back in the text, with the caret where it was.
  expect(await editingId(page)).toBe(ID);
  await expect(editor(page)).toBeFocused();
  await page.keyboard.type(' world');
  await expect.poll(() => plain(page, ID)).toBe('hello world');
});

test('a handle sizes the box, and the text stays open', async ({ page }) => {
  await addText(page, ID, [para('hello')], { frame: FRAME });
  await edit(page, ID);
  const corner = (await surface(page).locator('[data-handle="se"]').boundingBox())!;
  await drag(
    page,
    { x: corner.x + corner.width / 2, y: corner.y + corner.height / 2 },
    { x: 90, y: 60 },
  );
  const sized = await frameOf(page, ID);
  expect([sized.x, sized.y]).toEqual([FRAME.x, FRAME.y]);
  expect(sized.w).toBeGreaterThan(FRAME.w + 80);
  expect(sized.h).toBeGreaterThan(FRAME.h + 50);
  expect(await editingId(page)).toBe(ID);
  await expect(editor(page)).toBeFocused();
  await page.keyboard.type('!');
  await expect.poll(() => plain(page, ID)).toBe('hello!');
});

test('Alt on the edge moves the box, and makes no copy of it', async ({ page }) => {
  await addText(page, ID, [para('hello')], { frame: FRAME });
  await edit(page, ID);
  await drag(page, await onEdge(page), { x: 120, y: 90 }, { alt: true });
  expect(await elements(page)).toHaveLength(1);
  expect((await frameOf(page, ID)).x).toBeGreaterThan(FRAME.x + 100);
  expect(await editingId(page)).toBe(ID);
});

test('Esc during the drag puts the box back, and the text stays open', async ({ page }) => {
  await addText(page, ID, [para('hello')], { frame: FRAME });
  await edit(page, ID);
  const steps = await undoSteps(page);
  const from = await onEdge(page);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 120, from.y + 90, { steps: 4 });
  await expect.poll(async () => (await frameOf(page, ID)).x).toBeGreaterThan(FRAME.x + 100);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  expect(await frameOf(page, ID)).toEqual(FRAME);
  expect(await undoSteps(page)).toBe(steps);
  expect(await editingId(page)).toBe(ID);
  await expect(editor(page)).toBeFocused();
});

test('a double-click on the edge does not go on to what lies under it', async ({ page }) => {
  // A box behind the text, under the top edge of its frame.
  await addText(page, 'e_under', [para('under')], {
    frame: { x: FRAME.x - 100, y: FRAME.y - 150, w: FRAME.w + 200, h: 160 },
  });
  await addText(page, ID, [para('hello')], { frame: FRAME });
  await edit(page, ID);
  const at = await onEdge(page);
  await page.mouse.dblclick(at.x, at.y - 2);
  expect(await editingId(page)).toBe(ID);
  await expect(editor(page)).toBeFocused();
});

test('a new box that was moved and left empty leaves nothing behind', async ({ page }) => {
  const steps = await undoSteps(page);
  await page.locator('[data-tool="insert.text"]').click();
  await expect(editor(page)).toBeFocused();
  const [box] = await elements(page);
  const added = await frameOf(page, box!.id);
  await drag(page, await onEdge(page), { x: -120, y: 90 });
  expect((await frameOf(page, box!.id)).x).toBeLessThan(added.x - 100);
  await expect(editor(page)).toBeFocused();
  await page.keyboard.press('Escape');
  expect(await elements(page)).toHaveLength(0);
  expect(await undoSteps(page)).toBe(steps);
});

test('a press beside the frame still ends the typing', async ({ page }) => {
  await addText(page, ID, [para('hello')], { frame: FRAME });
  await edit(page, ID);
  const outline = (await surface(page).locator(`[data-outline="${ID}"]`).boundingBox())!;
  await page.mouse.click(outline.x + outline.width / 2, outline.y + outline.height + 60);
  expect(await editingId(page)).toBeNull();
  await expect(edge(page)).toHaveCount(0);
});
