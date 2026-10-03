import { expect, test, type Page } from '@playwright/test';

// In-place text editing on the Stage (WG4-T02, ADR-006), on the Stage dev page.

type SlidrWindow = {
  slidr: {
    bus: {
      deck: {
        slides: {
          elements: { id: string; content?: { paragraphs: { runs: { text: string }[] }[] } }[];
        }[];
      };
      undoStack: unknown[];
      undo(): boolean;
    };
    selection: { getState(): { editingElementId: string | null } };
  };
};

const text = (page: Page, id: string) =>
  page.evaluate((elementId) => {
    const { bus } = (window as unknown as SlidrWindow).slidr;
    for (const s of bus.deck.slides) {
      const e = s.elements.find((x) => x.id === elementId);
      if (e?.content)
        return e.content.paragraphs.map((p) => p.runs.map((r) => r.text).join('')).join('\n');
    }
    return null;
  }, id);

const editing = (page: Page) =>
  page.evaluate(
    () => (window as unknown as SlidrWindow).slidr.selection.getState().editingElementId,
  );

const steps = (page: Page) =>
  page.evaluate(() => (window as unknown as SlidrWindow).slidr.bus.undoStack.length);

/** Line boxes of every paragraph and marker in an element, in page pixels. */
const lineBoxes = (page: Page, id: string) =>
  page
    .getByTestId('stage-surface')
    .locator(`[data-element-id="${id}"]`)
    .evaluate((root) =>
      Array.from(
        root.querySelectorAll('p, li, [data-slidr-marker], [contenteditable="false"]'),
      ).map((el) => {
        const r = el.getBoundingClientRect();
        return { left: r.left, top: r.top, width: r.width, height: r.height };
      }),
    );

test.beforeEach(async ({ page }) => {
  await page.goto('/dev/stage.html?deck=english&slide=1');
  await page.getByTestId('stage-surface').locator('[data-element-id="e_en_goals_title"]').waitFor();
  await page.evaluate(() => document.fonts.ready);
});

test('editing starts where the text is: nothing moves', async ({ page }) => {
  for (const id of ['e_en_goals_title', 'e_en_goals_body']) {
    const before = await lineBoxes(page, id);
    const box = await page
      .getByTestId('stage-surface')
      .locator(`[data-element-id="${id}"] p, [data-element-id="${id}"] li`)
      .first()
      .boundingBox();
    await page.mouse.dblclick(box!.x + 20, box!.y + box!.height / 2);
    await expect(page.locator('[data-text-editor]')).toBeFocused();
    const after = await lineBoxes(page, id);
    expect(after.length).toBe(before.length);
    after.forEach((b, i) => {
      expect(Math.abs(b.left - before[i]!.left)).toBeLessThan(0.6);
      expect(Math.abs(b.top - before[i]!.top)).toBeLessThan(0.6);
      expect(Math.abs(b.height - before[i]!.height)).toBeLessThan(0.6);
    });
    await page.keyboard.press('Escape');
    expect(await editing(page)).toBeNull();
  }
});

test('typing is one undo step per burst, and Esc leaves editing', async ({ page }) => {
  const title = page
    .getByTestId('stage-surface')
    .locator('[data-element-id="e_en_goals_title"] p')
    .first();
  const box = await title.boundingBox();
  await page.mouse.dblclick(box!.x + 10, box!.y + box!.height / 2);
  // ProseMirror ignores Home/End within 200ms of a programmatic focus (ADR-006 rule 6).
  await page.waitForTimeout(250);
  await page.keyboard.press('End');
  const before = await steps(page);
  await page.keyboard.type(' for Q4', { delay: 30 });
  expect(await text(page, 'e_en_goals_title')).toBe('Three goals for Q4');
  expect(await steps(page)).toBe(before + 1);

  // Ctrl+Z inside the editor is the deck's undo, and the editor shows the result.
  await page.keyboard.press('Control+z');
  expect(await text(page, 'e_en_goals_title')).toBe('Three goals');
  await expect(page.locator('[data-text-editor]')).toHaveText('Three goals');

  await page.keyboard.press('Escape');
  expect(await editing(page)).toBeNull();
  await expect(page.locator('[data-text-editor]')).toHaveCount(0);
});

test('Enter on a selected text box edits it; a click outside ends editing', async ({ page }) => {
  const box = await page
    .getByTestId('stage-surface')
    .locator('[data-element-id="e_en_goals_body"]')
    .boundingBox();
  await page.mouse.click(box!.x + box!.width - 20, box!.y + box!.height - 20);
  await page.keyboard.press('Enter');
  expect(await editing(page)).toBe('e_en_goals_body');
  await expect(page.locator('[data-text-editor]')).toBeFocused();
  await page.keyboard.type('!');
  expect(await text(page, 'e_en_goals_body')).toMatch(/!$/);
  await page.mouse.click(5, 300);
  expect(await editing(page)).toBeNull();
});

test('lists: Enter continues the list, Tab nests, Enter on an empty item leaves the list', async ({
  page,
}) => {
  const lists = () =>
    page.evaluate(() => {
      const { bus } = (window as unknown as SlidrWindow).slidr;
      const e = bus.deck.slides[1]!.elements.find((x) => x.id === 'e_en_goals_body') as unknown as {
        content: { paragraphs: { list?: { level: number }; runs: { text: string }[] }[] };
      };
      return e.content.paragraphs.map((p) => [
        p.runs.map((r) => r.text).join(''),
        p.list?.level ?? null,
      ]);
    });
  const last = page
    .getByTestId('stage-surface')
    .locator('[data-element-id="e_en_goals_body"] li')
    .last();
  const box = await last.boundingBox();
  await page.mouse.dblclick(box!.x + box!.width - 5, box!.y + box!.height / 2);
  await page.waitForTimeout(250);
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await page.keyboard.type('Nested');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Plain');
  expect((await lists()).slice(-4)).toEqual([
    ['Reach a thousand active users', 0],
    ['Nested', 1],
    ['', null],
    ['Plain', null],
  ]);
});

test('a growing text box writes its height to the frame, in the typing step', async ({ page }) => {
  await page.goto('/dev/stage.html?deck=reference&slide=2');
  const el = page.getByTestId('stage-surface').locator('[data-element-id="e_en_grow"]');
  await el.waitFor();
  const frameH = () =>
    page.evaluate(() => {
      const { bus } = (
        window as unknown as {
          slidr: {
            bus: { deck: { slides: { elements: { id: string; frame: { h: number } }[] }[] } };
          };
        }
      ).slidr;
      return bus.deck.slides[2]!.elements.find((e) => e.id === 'e_en_grow')!.frame.h;
    });
  const before = await frameH();
  const stepsBefore = await steps(page);
  const box = await el.locator('p').boundingBox();
  await page.mouse.dblclick(box!.x + 20, box!.y + 10);
  await page.waitForTimeout(250);
  await page.keyboard.press('Control+End');
  await page.keyboard.type(' More words to make it wrap onto a third line of text.', { delay: 5 });
  await page.waitForTimeout(100);
  const grown = await frameH();
  expect(grown).toBeGreaterThan(before + 20);
  expect(await steps(page)).toBe(stepsBefore + 1);
  await page.keyboard.press('Control+z');
  expect(await frameH()).toBe(before);
});
