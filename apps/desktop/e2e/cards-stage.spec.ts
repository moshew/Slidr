import { expect, test, type Page } from '@playwright/test';

// The text inside a group, as in PowerPoint (ARR-01): the pointer over it shows the text's own
// frame and the text cursor, a click goes straight into editing it, from outside the group and
// from inside it, a drag from it still moves what a press takes (the group, or the text box in a
// group that was entered), and a second click on a selected group picks the child under the
// pointer. On the Stage's dev page, on the slide of cards.

interface Frame {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Model {
  id: string;
  frame: Frame;
  children?: Model[];
  content?: { paragraphs: { runs: { text: string }[] }[] };
}

type SlidrWindow = {
  slidr: {
    bus: {
      deck: { slides: { id: string; elements: Model[] }[] };
      undoStack: unknown[];
    };
    selection: {
      getState(): { selectedElementIds: string[]; editingElementId: string | null };
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

const textOf = async (page: Page, id: string) =>
  (await element(page, id))!
    .content!.paragraphs.map((p) => p.runs.map((r) => r.text).join(''))
    .join('\n');

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
const el = (id: string) => `[data-element-id="${id}"]`;
const editor = (page: Page) => page.locator('[data-text-editor]');

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

/** A point of the slide that nothing is drawn on, below the card. */
async function empty(page: Page) {
  const frame = (await page.getByTestId('stage-frame').boundingBox())!;
  const scale = frame.width / 1920;
  return { x: frame.x + 1000 * scale, y: frame.y + 980 * scale };
}

/** A point of the card that only its background is under: near its bottom right corner. */
async function bare(page: Page) {
  const card = await box(page, el('g_card'));
  const scale = await stageScale(page);
  return { x: card.x + card.width - 40 * scale, y: card.y + card.height - 30 * scale };
}

async function drag(page: Page, from: { x: number; y: number }, by: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  // Ctrl keeps the move free of snapping, so the distance is the pointer's own.
  await page.keyboard.down('Control');
  const n = 8;
  for (let i = 1; i <= n; i++) {
    await page.mouse.move(from.x + (by.x * i) / n, from.y + (by.y * i) / n);
    await page.waitForTimeout(20);
  }
  await page.mouse.up();
  await page.keyboard.up('Control');
}

/** What the pointer is over: the one hover frame on the Stage, and whether the cursor is the text's. */
async function expectOver(
  page: Page,
  at: { x: number; y: number },
  id: string,
  cursor: 'text' | 'auto',
) {
  await page.mouse.move(at.x, at.y);
  await expect(surface(page).locator('[data-outline]')).toHaveCount(1);
  await expect(surface(page).locator(`[data-outline="${id}"]`)).toBeVisible();
  await expect(surface(page)).toHaveCSS('cursor', cursor);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/dev/stage.html?deck=stage&slide=3');
  await surface(page).locator(el('g_card_title')).waitFor();
  await page.evaluate(() => document.fonts.ready);
});

test('over text inside a group the frame is the text own, and the cursor is the text cursor', async ({
  page,
}) => {
  const scale = await stageScale(page);
  // A text box is its text all over its frame.
  await expectOver(page, await center(page, el('g_card_title')), 'g_card_title', 'text');
  await page.screenshot({ path: 'test-results/stage/card-text-hover.png' });
  const title = await box(page, el('g_card_title'));
  await expectOver(
    page,
    { x: title.x + title.width - 4, y: title.y + title.height - 4 },
    'g_card_title',
    'text',
  );
  // Off the text, the frame is the group's, which a press there takes.
  await expectOver(page, await bare(page), 'g_card', 'auto');
  await expectOver(page, await center(page, el('g_card_icon')), 'g_card', 'auto');

  // A shape is its text only where the text is: the empty part of a big one is the group's.
  await expectOver(page, await center(page, el('g_card_chip')), 'g_card_chip', 'text');
  const panel = await box(page, el('g_card_panel'));
  const middle = { x: panel.x + panel.width / 2, y: panel.y + panel.height / 2 };
  await expectOver(page, middle, 'g_card_panel', 'text');
  await expectOver(page, { x: middle.x, y: panel.y + 24 * scale }, 'g_card', 'auto');
  // The block of the text is as wide as the shape lets its lines be.
  await expectOver(page, { x: panel.x + 30 * scale, y: middle.y }, 'g_card_panel', 'text');

  // At any depth: the tag is in a group that is in the card.
  await expectOver(page, await center(page, el('g_card_tag')), 'g_card_tag', 'text');

  // In a turned and mirrored group the text is where it is drawn.
  const tilted = await center(page, `${el('g_tilt_panel')} [data-slidr-text-block]`);
  await expectOver(page, tilted, 'g_tilt_panel', 'text');
  // 80 slide pixels up the panel's own axis, which is turned by 20 degrees: on it, off its text.
  const turn = (20 * Math.PI) / 180;
  const off = {
    x: tilted.x + 80 * Math.sin(turn) * scale,
    y: tilted.y - 80 * Math.cos(turn) * scale,
  };
  await expectOver(page, off, 'g_tilt', 'auto');

  // A text box in no group is as it was: its frame, and no text cursor before it is edited.
  await expectOver(page, await center(page, el('e_solo')), 'e_solo', 'auto');
  // Nothing was pressed: nothing is selected and nothing is edited.
  expect(await state(page)).toMatchObject({ selected: [], editing: null });
});

test('a click on a text box inside a group edits it, with the caret where the click was', async ({
  page,
}) => {
  const scale = await stageScale(page);
  const title = await box(page, el('g_card_title'));
  // On the first line, before its first letter.
  await page.mouse.click(title.x + 2, title.y + 26 * scale);
  expect(await state(page)).toMatchObject({ selected: ['g_card_title'], editing: 'g_card_title' });
  await expect(editor(page)).toBeFocused();
  await expect(surface(page)).toHaveAttribute('data-entered', 'g_card');
  await page.keyboard.type('Z');
  expect(await textOf(page, 'g_card_title')).toBe('ZCard title');

  // Out of the text, the text box is the selection inside its group, as after two double-clicks.
  await page.keyboard.press('Escape');
  expect(await state(page)).toMatchObject({ selected: ['g_card_title'], editing: null });
  await expect(surface(page)).toHaveAttribute('data-entered', 'g_card');
  await expect(surface(page).locator('[data-handle]')).toHaveCount(9);
  await page.keyboard.press('Escape');
  expect((await state(page)).selected).toEqual(['g_card']);
  await expect(surface(page)).not.toHaveAttribute('data-entered', /./);
});

test('a click on the text of a shape inside a group edits it, at any depth; off its text it takes the group', async ({
  page,
}) => {
  const scale = await stageScale(page);
  const chip = await center(page, el('g_card_chip'));
  await page.mouse.click(chip.x, chip.y);
  expect((await state(page)).editing).toBe('g_card_chip');
  await expect(editor(page)).toBeFocused();
  await page.keyboard.type('X');
  // The caret is where the click was, inside the word, and not at its end.
  expect(await textOf(page, 'g_card_chip')).toMatch(/^C\w*X\w*p$/);
  await page.keyboard.press('Escape');
  expect(await state(page)).toMatchObject({ selected: ['g_card_chip'], editing: null });

  // From inside the card, a click on the tag in the row goes into its text all the same.
  const tag = await center(page, el('g_card_tag'));
  await page.mouse.click(tag.x, tag.y);
  expect((await state(page)).editing).toBe('g_card_tag');
  await expect(surface(page)).toHaveAttribute('data-entered', 'g_card g_card_row');
  // The editor puts its caret where the click was once it has the keyboard: a key sent before
  // that would be answered from wherever the caret was first.
  await expect(editor(page)).toBeFocused();
  await page.keyboard.press('End');
  await page.keyboard.type('!');
  expect(await textOf(page, 'g_card_tag')).toBe('Nested!');
  await page.keyboard.press('Escape');
  expect(await state(page)).toMatchObject({ selected: ['g_card_tag'], editing: null });

  // The empty part of a big shape stands for the group: a click there selects the card.
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  expect((await state(page)).selected).toEqual([]);
  const panel = await box(page, el('g_card_panel'));
  await page.mouse.click(panel.x + panel.width / 2, panel.y + 24 * scale);
  expect(await state(page)).toMatchObject({ selected: ['g_card'], editing: null });
  await expect(surface(page)).not.toHaveAttribute('data-entered', /./);
});

test('inside the card a click on another of its texts edits that one, and a drag moves it alone', async ({
  page,
}) => {
  const scale = await stageScale(page);
  const title = await center(page, el('g_card_title'));
  await page.mouse.click(title.x, title.y);
  expect((await state(page)).editing).toBe('g_card_title');
  await expect(editor(page)).toBeFocused();
  await page.keyboard.press('Escape');
  expect(await state(page)).toMatchObject({ selected: ['g_card_title'], editing: null });
  await expect(surface(page)).toHaveAttribute('data-entered', 'g_card');

  // The Stage is inside the card now, and its texts are what they were from outside: the frame
  // of the text and the text cursor, also over the text box that is selected.
  const chip = await center(page, el('g_card_chip'));
  await page.mouse.move(chip.x, chip.y);
  await expect(surface(page).locator('[data-outline="g_card_chip"]')).toBeVisible();
  await expect(surface(page)).toHaveCSS('cursor', 'text');
  await page.mouse.move(title.x, title.y);
  await expect(surface(page)).toHaveCSS('cursor', 'text');

  // A click on the other text edits it, with the caret where the click was.
  await page.mouse.click(chip.x, chip.y);
  expect(await state(page)).toMatchObject({ selected: ['g_card_chip'], editing: 'g_card_chip' });
  await expect(editor(page)).toBeFocused();
  await page.keyboard.type('X');
  expect(await textOf(page, 'g_card_chip')).toMatch(/^C\w*X\w*p$/);

  // From one text straight into the next, and into the text box that is the selection.
  const frame = await box(page, el('g_card_title'));
  await page.mouse.click(frame.x + 2, frame.y + 26 * scale);
  expect(await state(page)).toMatchObject({ selected: ['g_card_title'], editing: 'g_card_title' });
  await expect(editor(page)).toBeFocused();
  await page.keyboard.type('Z');
  expect(await textOf(page, 'g_card_title')).toBe('ZCard title');
  await page.keyboard.press('Escape');
  expect(await state(page)).toMatchObject({ selected: ['g_card_title'], editing: null });
  await page.mouse.click(title.x, title.y);
  expect((await state(page)).editing).toBe('g_card_title');
  await expect(editor(page)).toBeFocused();
  await page.keyboard.press('Escape');

  // A drag from the text of the chip moves the chip, and nothing else of the card.
  const card = (await element(page, 'g_card'))!;
  const { steps } = await state(page);
  const others = (group: Model) => group.children!.filter((c) => c.id !== 'g_card_chip');
  const chipOf = (group: Model) => group.children!.find((c) => c.id === 'g_card_chip')!;
  await drag(page, chip, { x: 20 * scale, y: 70 * scale });
  const after = (await element(page, 'g_card'))!;
  expect(Math.abs(chipOf(after).frame.x - (chipOf(card).frame.x + 20))).toBeLessThanOrEqual(1);
  expect(Math.abs(chipOf(after).frame.y - (chipOf(card).frame.y + 70))).toBeLessThanOrEqual(1);
  expect(after.frame).toEqual(card.frame);
  expect(others(after)).toEqual(others(card));
  expect(await state(page)).toMatchObject({
    selected: ['g_card_chip'],
    editing: null,
    steps: steps + 1,
  });
  await expect(editor(page)).toHaveCount(0);

  // A text box is still taken as an object: by a Shift-click, and off the text of a shape.
  await page.keyboard.down('Shift');
  await page.mouse.click(title.x, title.y);
  await page.keyboard.up('Shift');
  expect(await state(page)).toMatchObject({
    selected: ['g_card_chip', 'g_card_title'],
    editing: null,
  });
  const panel = await box(page, el('g_card_panel'));
  await page.mouse.click(panel.x + panel.width / 2, panel.y + 24 * scale);
  expect(await state(page)).toMatchObject({ selected: ['g_card_panel'], editing: null });
  await expect(surface(page)).toHaveAttribute('data-entered', 'g_card');
});

test('a drag from the text moves the whole group, and edits nothing', async ({ page }) => {
  const scale = await stageScale(page);
  const before = (await element(page, 'g_card'))!;
  const { steps } = await state(page);
  const title = await center(page, el('g_card_title'));
  await page.mouse.move(title.x, title.y);
  await expect(surface(page)).toHaveCSS('cursor', 'text');
  await page.mouse.down();
  // The press took the group: the frame and the cursor of the text are gone while it lasts.
  await expect(surface(page).locator('[data-outline="g_card_title"]')).toHaveCount(0);
  await expect(surface(page)).toHaveCSS('cursor', 'auto');
  await page.mouse.up();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');

  await drag(page, title, { x: 200 * scale, y: 100 * scale });
  const after = (await element(page, 'g_card'))!;
  expect(Math.abs(after.frame.x - (before.frame.x + 200))).toBeLessThanOrEqual(1);
  expect(Math.abs(after.frame.y - (before.frame.y + 100))).toBeLessThanOrEqual(1);
  // Inside the group nothing moved, and the drag is one step to undo.
  expect(after.children).toEqual(before.children);
  expect(await state(page)).toMatchObject({
    selected: ['g_card'],
    editing: null,
    steps: steps + 1,
  });
  await expect(editor(page)).toHaveCount(0);
  await expect(surface(page)).not.toHaveAttribute('data-entered', /./);

  // And from the text of a chip.
  const chip = await center(page, el('g_card_chip'));
  await drag(page, chip, { x: -60 * scale, y: 0 });
  const back = (await element(page, 'g_card'))!.frame.x;
  expect(Math.abs(back - (before.frame.x + 140))).toBeLessThanOrEqual(1);
  expect(await state(page)).toMatchObject({ selected: ['g_card'], editing: null });
  expect(await textOf(page, 'g_card_chip')).toBe('Chip');
});

test('a second click on a selected group picks the child under the pointer, one level at a time', async ({
  page,
}) => {
  const scale = await stageScale(page);
  const icon = await center(page, el('g_card_icon'));
  await page.mouse.click(icon.x, icon.y);
  expect((await state(page)).selected).toEqual(['g_card']);
  await expect(surface(page)).not.toHaveAttribute('data-entered', /./);

  await page.mouse.click(icon.x, icon.y);
  expect((await state(page)).selected).toEqual(['g_card_row']);
  await expect(surface(page)).toHaveAttribute('data-entered', 'g_card');
  await page.mouse.click(icon.x, icon.y);
  expect((await state(page)).selected).toEqual(['g_card_icon']);
  await expect(surface(page)).toHaveAttribute('data-entered', 'g_card g_card_row');
  // The child is no group: a click on it leaves it selected, and edits nothing.
  await page.mouse.click(icon.x, icon.y);
  expect(await state(page)).toMatchObject({ selected: ['g_card_icon'], editing: null });

  // A drag from a selected group moves it and does not go in.
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  expect((await state(page)).selected).toEqual(['g_card']);
  const x = (await element(page, 'g_card'))!.frame.x;
  await drag(page, await bare(page), { x: 80 * scale, y: 0 });
  expect(Math.abs((await element(page, 'g_card'))!.frame.x - (x + 80))).toBeLessThanOrEqual(1);
  expect((await state(page)).selected).toEqual(['g_card']);
  await expect(surface(page)).not.toHaveAttribute('data-entered', /./);

  // With Shift the click is about the selection, as it was: the group leaves it.
  const at = await bare(page);
  await page.keyboard.down('Shift');
  await page.mouse.click(at.x, at.y);
  await page.keyboard.up('Shift');
  expect((await state(page)).selected).toEqual([]);
  await expect(surface(page)).not.toHaveAttribute('data-entered', /./);
});

test('a double-click still goes one level in, and edits only what it always edited', async ({
  page,
}) => {
  // On a group that is not selected: into it, the child under the pointer selected.
  const icon = await center(page, el('g_card_icon'));
  await page.mouse.dblclick(icon.x, icon.y);
  expect(await state(page)).toMatchObject({ selected: ['g_card_row'], editing: null });
  await expect(surface(page)).toHaveAttribute('data-entered', 'g_card');
  // On a group that is selected: one level, and not two. The child is a shape, and is not edited.
  await page.mouse.dblclick(icon.x, icon.y);
  expect(await state(page)).toMatchObject({ selected: ['g_card_icon'], editing: null });
  await expect(surface(page)).toHaveAttribute('data-entered', 'g_card g_card_row');
  await expect(editor(page)).toHaveCount(0);
  // On the shape itself, now that a click reaches it: its text is edited, as on any shape.
  await page.mouse.dblclick(icon.x, icon.y);
  expect((await state(page)).editing).toBe('g_card_icon');
  await expect(editor(page)).toBeFocused();
  await page.keyboard.press('Escape');

  // The same from a card that is selected, on its background.
  const nowhere = await empty(page);
  await page.mouse.click(nowhere.x, nowhere.y);
  expect((await state(page)).selected).toEqual([]);
  const at = await bare(page);
  await page.mouse.click(at.x, at.y);
  expect((await state(page)).selected).toEqual(['g_card']);
  await page.mouse.dblclick(at.x, at.y);
  expect(await state(page)).toMatchObject({ selected: ['g_card_bg'], editing: null });
  await expect(surface(page)).toHaveAttribute('data-entered', 'g_card');

  // On a text inside a group it ends in the text, also beside its lines, where the second
  // press falls outside the editor.
  await page.mouse.click(nowhere.x, nowhere.y);
  const title = await box(page, el('g_card_title'));
  await page.mouse.dblclick(title.x + title.width - 6, title.y + title.height - 4);
  expect(await state(page)).toMatchObject({ selected: ['g_card_title'], editing: 'g_card_title' });
  await expect(editor(page)).toBeFocused();
  await page.keyboard.press('Escape');

  // A text box in no group: a click selects it, a double-click edits it.
  const free = await center(page, el('e_solo'));
  await page.mouse.click(free.x, free.y);
  expect(await state(page)).toMatchObject({ selected: ['e_solo'], editing: null });
  await expect(surface(page)).not.toHaveAttribute('data-entered', /./);
  await page.mouse.dblclick(free.x, free.y);
  expect((await state(page)).editing).toBe('e_solo');
  await expect(editor(page)).toBeFocused();
});
