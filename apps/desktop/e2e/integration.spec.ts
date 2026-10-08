import { expect, test, type Page } from '@playwright/test';
import type { Element, GroupElement } from '@slidr/model';
import { currentSlide, openApp, pageProblems, row, undo } from './objects-helpers';

/*
 * Flows that cross the areas built for M1 (text, objects, arrange, Stage), on the app at `/`.
 * Each area has its own specs; these check that they meet.
 */

test.afterEach(({ page }) => {
  expect(pageProblems(page)).toEqual([]);
});

async function element<T extends Element = Element>(page: Page, id: string): Promise<T> {
  const found = await page.evaluate((elementId) => {
    const editor = window.slidr!;
    const walk = (list: readonly unknown[]): unknown => {
      for (const item of list as { id: string; type: string; children?: unknown[] }[]) {
        if (item.id === elementId) return item;
        const inside = item.children ? walk(item.children) : undefined;
        if (inside) return inside;
      }
      return undefined;
    };
    for (const slide of editor.bus.deck.slides) {
      const hit = walk(slide.elements);
      if (hit) return hit;
    }
    return undefined;
  }, id);
  if (!found) throw new Error(`no element ${id}`);
  return found as T;
}

test('a shape from the library takes text, and row B follows the caret', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('top-tools-a').locator('[data-tool="insert.elements"]').click();
  await page.getByTestId('elements-panel').locator('[data-collection="shapes"]').click();
  await page
    .getByTestId('elements-shapes')
    .getByRole('button', { name: 'מלבן', exact: true })
    .click();
  await expect(row(page)).toHaveAttribute('data-selection', 'shape');

  // Enter edits the text of the selected shape: the caret is in text, so the text tools show.
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-text-editor]')).toBeFocused();
  await expect(row(page)).toHaveAttribute('data-selection', 'text');
  await page.keyboard.type('שלום 2026');
  await page.keyboard.press('Escape');
  await expect(row(page)).toHaveAttribute('data-selection', 'shape');

  const [shape] = (await currentSlide(page)).elements;
  expect(shape?.type).toBe('shape');
  expect(shape?.type === 'shape' && shape.content?.paragraphs[0]?.runs[0]?.text).toBe('שלום 2026');
});

test('a text box that grows inside a group takes its group along, and undo takes both back', async ({
  page,
}) => {
  await openApp(page);
  await page.evaluate(() => {
    const { bus, selection } = window.slidr!;
    const slideId = selection.getState().currentSlideId ?? '';
    const base = { rotation: 0, opacity: 1 };
    bus.batch([
      {
        type: 'element.add',
        slideId,
        element: {
          ...base,
          id: 'e_card',
          type: 'shape',
          frame: { x: 400, y: 300, w: 600, h: 160 },
          geometry: { kind: 'preset', preset: 'rect' },
          fill: { kind: 'solid', color: { token: 'surface' } },
        },
      },
      {
        type: 'element.add',
        slideId,
        element: {
          ...base,
          id: 'e_note',
          type: 'text',
          frame: { x: 420, y: 320, w: 560, h: 44 },
          autoFit: 'growHeight',
          vAlign: 'top',
          content: { paragraphs: [{ dir: 'auto', align: 'start', runs: [{ text: 'שורה' }] }] },
        },
      },
      { type: 'element.group', slideId, elementIds: ['e_card', 'e_note'], groupId: 'e_group' },
    ]);
    selection.getState().startEditing('e_note');
  });
  await expect(page.locator('[data-text-editor]')).toBeFocused();
  const before = await element<GroupElement>(page, 'e_group');
  expect(before.frame.h).toBe(160);

  // Six more lines: the box outgrows the card, and the group has to bound it again.
  await page.keyboard.press('Control+End');
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Enter');
    await page.keyboard.type('עוד');
  }
  await expect
    .poll(async () => (await element(page, 'e_note')).frame.h)
    .toBeGreaterThan(before.frame.h);
  const note = await element(page, 'e_note');
  const group = await element<GroupElement>(page, 'e_group');
  expect(group.frame.h).toBeGreaterThanOrEqual(note.frame.y + note.frame.h - 0.5);
  // The card did not move on the slide: the group grew downwards only.
  expect(group.frame.y).toBe(before.frame.y);

  // The new height and the refit ride in the undo step of the typing that caused them.
  await page.keyboard.press('Escape');
  while ((await element<GroupElement>(page, 'e_group')).frame.h !== 160) {
    expect(await undo(page)).toBe(true);
  }
  expect((await element(page, 'e_note')).frame.h).toBeLessThan(160);
});
