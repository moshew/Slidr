import { expect, test, type Page } from '@playwright/test';
import { elements, frames, openApp, undoSteps } from './arrange-helpers';
import { addText, caret, edit, editingId, para, plain, select } from './text-helpers';

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

/** A point near the leading edge of an actual rendered character. */
async function textPoint(page: Page, line: number, offset: number) {
  return surface(page)
    .locator(`[data-element-id="${ID}"] p`)
    .nth(line)
    .evaluate((paragraph, index) => {
      const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode();
      while (node && index >= (node.nodeValue ?? '').length) {
        index -= (node.nodeValue ?? '').length;
        node = walker.nextNode();
      }
      if (!node) throw new Error('The clicked character is missing');
      const range = document.createRange();
      range.setStart(node, index);
      range.setEnd(node, index + 1);
      const rect = range.getBoundingClientRect();
      const rtl = getComputedStyle(paragraph).direction === 'rtl';
      return {
        x: rtl ? rect.right - rect.width / 4 : rect.left + rect.width / 4,
        y: rect.top + rect.height / 2,
      };
    }, offset);
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

test('a new text box uses editing and frame cursors in Hebrew and English', async ({ page }) => {
  for (const lang of ['en', 'he'] as const) {
    if (lang === 'he') await openApp(page, { lang });
    await page.locator('[data-tool="insert.text"]').click();
    await expect(editor(page)).toBeFocused();
    // The empty line and its unused width are editable.
    await editor(page).locator('p').hover();
    await expect(editor(page)).toHaveCSS('cursor', 'text');
    await expect(editor(page).locator('p')).toHaveCSS('cursor', 'text');
    const text = lang === 'he' ? 'שלום' : 'hello';
    await page.keyboard.type(text);
    const [box] = await elements(page);
    await expect.poll(() => plain(page, box!.id)).toBe(text);
    await editor(page).locator('p').hover();
    await expect(editor(page).locator('p')).toHaveCSS('cursor', 'text');
    // The frame still moves the box, and its handles still resize it.
    const at = await onEdge(page);
    await page.mouse.move(at.x, at.y);
    await expect(edge(page).first()).toHaveCSS('cursor', 'move');
    const handle = surface(page).locator('[data-handle="se"]');
    await handle.hover();
    await expect(handle).toHaveCSS('cursor', 'nwse-resize');
    await editor(page).locator('p').hover();
    await expect(editor(page).locator('p')).toHaveCSS('cursor', 'text');
    await expect(editor(page)).toBeFocused();
    // Ending editing keeps a text cursor, including without another pointer movement.
    await page.keyboard.press('Escape');
    await expect(editor(page)).toHaveCount(0);
    await expect(surface(page)).toHaveCSS('cursor', 'text');
    const paragraph = surface(page).locator(`[data-element-id="${box!.id}"] p`);
    await paragraph.hover();
    await expect(paragraph).toHaveCSS('cursor', 'text');
    // Reopening the same box uses the editing cursor too.
    await page.keyboard.press('Enter');
    await expect(editor(page)).toBeFocused();
    await editor(page).locator('p').hover();
    await expect(editor(page).locator('p')).toHaveCSS('cursor', 'text');
    // The text cursor also appears when the box is no longer selected.
    await page.keyboard.press('Escape');
    const bounds = (await paragraph.boundingBox())!;
    await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height + 60);
    await expect(surface(page).locator('[data-handle]')).toHaveCount(0);
    await paragraph.hover();
    await expect(paragraph).toHaveCSS('cursor', 'text');
    expect(await editingId(page)).toBeNull();
  }
});

for (const lang of ['en', 'he'] as const) {
  test(`a click places the caret at the clicked text, before and during editing (${lang})`, async ({
    page,
  }) => {
    if (lang === 'he') await openApp(page, { lang });
    const lines =
      lang === 'he'
        ? ['ברוכים הבאים לסדנה', 'נשמח לשמוע את הרעיונות שלכם']
        : ['Welcome to the workshop', 'Bring your ideas today'];
    await addText(
      page,
      ID,
      lines.map((line) => para(line)),
      {
        frame: { ...FRAME, w: 1100 },
      },
    );
    const before = await frameOf(page, ID);
    const steps = await undoSteps(page);
    const clicks = [
      { line: 0, offset: 3 },
      { line: 1, offset: 7 },
      { line: 0, offset: 12 },
    ];
    for (const [attempt, { line, offset }] of clicks.entries()) {
      // Click near the leading edge of an actual rendered character, on either line.
      const at = await textPoint(page, line, offset);
      await page.mouse.move(at.x, at.y);
      await page.mouse.down();
      await expect(editor(page)).toBeFocused();
      if (attempt === 0) await page.waitForTimeout(700);
      await page.mouse.up();
      // A click only enters editing. Typing must insert at that position without moving the box.
      expect(await undoSteps(page)).toBe(steps + attempt);
      await page.keyboard.type('|');
      lines[line] = `${lines[line]!.slice(0, offset)}|${lines[line]!.slice(offset)}`;
      await expect.poll(() => plain(page, ID)).toBe(lines.join('\n'));
      expect(await frameOf(page, ID)).toEqual(before);
      // First open an unselected box, then reopen the selected box, then click while editing.
      if (attempt === 0) await page.keyboard.press('Escape');
    }
  });

  test(`dragging from an idle text box selects from the press, just like an open editor (${lang})`, async ({
    page,
  }) => {
    if (lang === 'he') await openApp(page, { lang });
    const lines =
      lang === 'he'
        ? ['ברוכים הבאים לסדנת Slidr', 'נשמח לשמוע את הרעיונות שלכם']
        : ['Welcome to the סדנה', 'Bring your ideas today'];
    await addText(
      page,
      ID,
      lines.map((line) => para(line)),
      { frame: { ...FRAME, w: 1100 } },
    );
    const before = await frameOf(page, ID);
    const steps = await undoSteps(page);
    const drags = [
      { from: { line: 0, offset: 3 }, to: { line: 0, offset: 12 } },
      { from: { line: 0, offset: 3 }, to: { line: 1, offset: 7 } },
      { from: { line: 1, offset: 7 }, to: { line: 0, offset: 3 } },
    ];
    const position = ({ line, offset }: { line: number; offset: number }) =>
      1 + offset + lines.slice(0, line).reduce((sum, text) => sum + text.length + 2, 0);
    for (const [attempt, { from, to }] of drags.entries()) {
      const start = await textPoint(page, from.line, from.offset);
      const end = await textPoint(page, to.line, to.offset);
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      // Also cover a quick drag, without waiting for the editor to mount before moving.
      if (attempt > 0) {
        await expect(editor(page)).toBeFocused();
        await page.waitForTimeout(700);
      }
      await page.mouse.move(end.x, end.y, { steps: 8 });
      await page.mouse.up();
      await expect(editor(page)).toBeFocused();
      await expect
        .poll(() => caret(page))
        .toMatchObject({
          anchor: position(from),
          head: position(to),
          empty: false,
        });
      const opened = await caret(page);
      const highlighted = await page.evaluate(() => getSelection()?.toString());
      expect(highlighted).toBeTruthy();
      expect(await frameOf(page, ID)).toEqual(before);
      expect(await undoSteps(page)).toBe(steps);
      expect(await plain(page, ID)).toBe(lines.join('\n'));
      // Compare the same gesture with native selection in an editor that was already open.
      await page.keyboard.press('Escape');
      await edit(page, ID);
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      await page.mouse.move(end.x, end.y, { steps: 8 });
      await page.mouse.up();
      await expect.poll(() => caret(page)).toEqual(opened);
      expect(await page.evaluate(() => getSelection()?.toString())).toBe(highlighted);
      await page.keyboard.press('Escape');
      await expect(editor(page)).toHaveCount(0);
    }
  });
}

test('holding and dragging inside a text box enters editing immediately and keeps the box in place', async ({
  page,
}) => {
  await addText(page, ID, [para('Welcome to the workshop')], { frame: FRAME });
  const paragraph = (await surface(page).locator(`[data-element-id="${ID}"] p`).boundingBox())!;
  const steps = await undoSteps(page);
  const at = { x: paragraph.x + paragraph.width / 2, y: paragraph.y + paragraph.height / 2 };
  await page.mouse.move(at.x, at.y);
  await expect(surface(page)).toHaveCSS('cursor', 'text');
  await page.mouse.down();
  await expect(editor(page)).toBeFocused();
  expect(await editingId(page)).toBe(ID);
  await page.waitForTimeout(700);
  await page.mouse.move(at.x + 60, at.y + 30, { steps: 8 });
  expect(await frameOf(page, ID)).toEqual(FRAME);
  await page.mouse.up();
  expect(await undoSteps(page)).toBe(steps);
  expect(await editingId(page)).toBe(ID);
  expect(await plain(page, ID)).toBe('Welcome to the workshop');
});

test('Escape during an opening text drag ends selection tracking and leaves the frame movable', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await addText(page, ID, [para('Welcome to the workshop')], { frame: FRAME });
  const before = await frameOf(page, ID);
  const steps = await undoSteps(page);
  const start = await textPoint(page, 0, 3);
  const end = await textPoint(page, 0, 12);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await expect(editor(page)).toBeFocused();
  await page.mouse.move(end.x, end.y, { steps: 8 });
  await expect.poll(() => caret(page)).toMatchObject({ anchor: 4, head: 13, empty: false });
  await page.keyboard.press('Escape');
  await expect(editor(page)).toHaveCount(0);
  // The pointer can keep moving after the editor has been destroyed.
  await page.mouse.move(end.x + 100, end.y + 50, { steps: 8 });
  await page.mouse.up();
  expect(await frameOf(page, ID)).toEqual(before);
  expect(await undoSteps(page)).toBe(steps);
  await drag(page, await onEdge(page), { x: 120, y: 90 });
  const moved = await frameOf(page, ID);
  expect(moved.x).toBeGreaterThan(before.x + 100);
  expect(moved.y).toBeGreaterThan(before.y + 80);
  expect(await editingId(page)).toBeNull();
  expect(await plain(page, ID)).toBe('Welcome to the workshop');
  expect(errors).toEqual([]);
});

for (const selected of [false, true]) {
  test(`the frame of an idle text box has a move cursor and moves the box (${selected ? 'selected' : 'hovered'})`, async ({
    page,
  }) => {
    await addText(page, ID, [para('Welcome to the workshop')], { frame: FRAME });
    if (selected) await select(page, ID);
    else await surface(page).locator(`[data-element-id="${ID}"] p`).hover();
    await expect(edge(page)).toHaveCount(4);
    const at = await onEdge(page);
    await page.mouse.move(at.x, at.y);
    await expect(edge(page).first()).toHaveCSS('cursor', 'move');
    expect(
      await page.evaluate((point) => {
        const target = document.elementFromPoint(point.x, point.y)!;
        return {
          frame: target.getAttribute('data-move-frame'),
          cursor: getComputedStyle(target).cursor,
        };
      }, at),
    ).toEqual({ frame: ID, cursor: 'move' });
    const steps = await undoSteps(page);
    await page.mouse.down();
    await expect(editor(page)).toHaveCount(0);
    expect(await editingId(page)).toBeNull();
    await page.waitForTimeout(700);
    await page.mouse.move(at.x + 120, at.y + 90, { steps: 8 });
    await page.mouse.up();
    const moved = await frameOf(page, ID);
    expect(moved.x).toBeGreaterThan(FRAME.x + 100);
    expect(moved.y).toBeGreaterThan(FRAME.y + 80);
    expect([moved.w, moved.h]).toEqual([FRAME.w, FRAME.h]);
    expect(await undoSteps(page)).toBe(steps + 1);
    expect(await editingId(page)).toBeNull();
    expect(await plain(page, ID)).toBe('Welcome to the workshop');
  });
}

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
