import { expect, test, type Page } from '@playwright/test';
import { openApp } from './arrange-helpers';
import {
  buildDeck,
  count,
  deckJson,
  marks,
  place,
  query,
  replacement,
  status,
  textOf,
  undoSteps,
  WORD,
} from './editor-find-helpers';
import { element, type TestElement } from './text-helpers';

/*
 * Replacing what the find bar found (WG4-T09, TXT-12): "replace" and "replace all" are each one
 * undo step, the replacement takes the formatting of what it replaces, and a locked element is
 * left alone.
 */

const stage = (page: Page) => page.getByTestId('stage-surface');
const NEW = 'חודש';

/** Opens the bar with Ctrl+H and fills what to look for and what to write instead. */
async function replaceWith(page: Page, find: string, write: string): Promise<void> {
  await page.keyboard.press('Control+h');
  await query(page).fill(find);
  await replacement(page).fill(write);
}

/** Ctrl+Z on the Stage: the deck's undo, not a field's. */
async function undoOnStage(page: Page): Promise<void> {
  await stage(page).focus();
  await page.keyboard.press('Control+z');
}

let first: string;

test.beforeEach(async ({ page }) => {
  await openApp(page);
  first = await buildDeck(page);
});

test('"replace" shows the match first, then replaces it and goes on, as one undo step', async ({
  page,
}) => {
  await replaceWith(page, WORD, NEW);
  const before = await deckJson(page);
  const steps = await undoSteps(page);
  const replace = page.getByTestId('find-replace');

  // Nothing is replaced before it was shown.
  await replace.click();
  await expect(count(page)).toHaveText('1 / 9');
  expect(await deckJson(page)).toBe(before);

  await replace.click();
  expect(await textOf(page, 'e_title')).toBe('תוכנית החודש');
  // The replacement is written in the formatting of the first letter it replaced.
  expect((await element(page, 'e_title')).content?.paragraphs[0]?.runs).toEqual([
    { text: 'תוכנית ה' },
    { text: NEW, marks: { weight: 800 } },
  ]);
  expect(await undoSteps(page)).toBe(steps + 1);
  // It went on to the next match, the first of the eight that are left.
  await expect(count(page)).toHaveText('1 / 8');
  expect(await place(page)).toMatchObject({ slide: first, selected: ['e_body'] });
  await expect.poll(() => marks(page)).toEqual({ soft: [WORD], current: [WORD] });

  // Enter in the replace field replaces too.
  await replacement(page).press('Enter');
  expect(await textOf(page, 'e_body')).toBe('חודש ראשון: צמיחה של 12%\nברבעון השני נשיק את Slidr');
  expect(await undoSteps(page)).toBe(steps + 2);
  await expect(count(page)).toHaveText('1 / 7');

  await undoOnStage(page);
  expect(await textOf(page, 'e_body')).toBe('רבעון ראשון: צמיחה של 12%\nברבעון השני נשיק את Slidr');
  await undoOnStage(page);
  expect(await deckJson(page)).toBe(before);
  expect(await undoSteps(page)).toBe(steps);
  // The bar still stands on the match it went to last, which is the third again.
  await expect(count(page)).toHaveText('3 / 9');
});

test('"replace all" changes every slide as one undo step, and says what a lock kept', async ({
  page,
}) => {
  await replaceWith(page, WORD, NEW);
  const before = await deckJson(page);
  const steps = await undoSteps(page);

  await page.getByTestId('find-replace-all').click();
  expect(await textOf(page, 'e_title')).toBe('תוכנית החודש');
  expect(await textOf(page, 'e_body')).toBe('חודש ראשון: צמיחה של 12%\nבחודש השני נשיק את Slidr');
  // Inside a group, in the cells of a table and in speaker notes, on a slide that is not shown.
  expect(await textOf(page, 'e_card')).toBe('יעדי חודש');
  expect(await textOf(page, 'e_table', { row: 0, col: 0 })).toBe(NEW);
  expect(await textOf(page, 'e_table', { row: 1, col: 0 })).toBe('חודש טוב');
  expect(await textOf(page, 'e_table', { row: 0, col: 1 })).toBe('הכנסות');
  expect(await textOf(page, 's_two')).toBe('לציין את החודש החזק');
  // On a hidden slide too; the locked box keeps its text.
  expect(await textOf(page, 'e_last')).toBe('סוף חודש');
  expect(await textOf(page, 'e_locked')).toBe('רבעון נעול');

  await expect(status(page).locator('p')).toHaveText([
    '8 תוצאות הוחלפו',
    'תוצאה אחת באובייקט נעול לא הוחלפה',
  ]);
  await expect(count(page)).toHaveText('1');
  expect(await undoSteps(page)).toBe(steps + 1);
  // The slide on the Stage is drawn with the new text.
  await expect(stage(page).locator('[data-element-id="e_title"]')).toHaveText('תוכנית החודש');

  await undoOnStage(page);
  expect(await deckJson(page)).toBe(before);
  expect(await undoSteps(page)).toBe(steps);
  await expect(count(page)).toHaveText('9');
  await expect(stage(page).locator('[data-element-id="e_title"]')).toHaveText('תוכנית הרבעון');
});

test('a match in a locked element is found, said to be locked, and passed over', async ({
  page,
}) => {
  await replaceWith(page, WORD, NEW);
  await page.evaluate(() => window.slidr!.selection.getState().setCurrentSlide('s_three'));
  const steps = await undoSteps(page);
  await query(page).press('Enter');
  await expect(count(page)).toHaveText('8 / 9');
  expect(await place(page)).toMatchObject({ slide: 's_three', selected: ['e_locked'] });
  await expect(status(page)).toHaveText('התוצאה באובייקט נעול, ולכן לא תוחלף');

  await page.getByTestId('find-replace').click();
  expect(await textOf(page, 'e_locked')).toBe('רבעון נעול');
  expect(await undoSteps(page)).toBe(steps);
  // It went on to the next match and says what it left.
  await expect(count(page)).toHaveText('9 / 9');
  await expect(status(page)).toHaveText('תוצאה אחת באובייקט נעול לא הוחלפה');

  await page.getByTestId('find-replace').click();
  expect(await textOf(page, 'e_last')).toBe('סוף חודש');
  expect(await undoSteps(page)).toBe(steps + 1);
});

test('a replacement that holds what was looked for is passed, not found again', async ({
  page,
}) => {
  await replaceWith(page, WORD, 'רבעון טוב');
  const replace = page.getByTestId('find-replace');
  await replace.click();
  await expect(count(page)).toHaveText('1 / 9');
  await replace.click();
  expect(await textOf(page, 'e_title')).toBe('תוכנית הרבעון טוב');
  // Still nine matches, and the bar stands on the second: the one after what it wrote.
  await expect(count(page)).toHaveText('2 / 9');
  expect(await place(page)).toMatchObject({ slide: first, selected: ['e_body'] });
  await replace.click();
  expect(await textOf(page, 'e_body')).toContain('רבעון טוב ראשון');
  await expect(count(page)).toHaveText('3 / 9');
});

test('replacing by nothing deletes the match, and an empty line keeps its formatting', async ({
  page,
}) => {
  await page.evaluate(() => {
    const { bus, selection } = window.slidr!;
    bus.dispatch({
      type: 'text.set',
      slideId: selection.getState().currentSlideId!,
      elementId: 'e_title',
      content: {
        paragraphs: [
          { dir: 'auto', align: 'start', runs: [{ text: 'למחוק', marks: { size: 96 } }] },
        ],
      },
    });
  });
  await replaceWith(page, 'למחוק', '');
  await page.getByTestId('find-replace-all').click();
  expect((await element(page, 'e_title')).content?.paragraphs[0]?.runs).toEqual([
    { text: '', marks: { size: 96 } },
  ]);
  await expect(count(page)).toHaveText('אין תוצאות');
  await expect(status(page)).toHaveText('תוצאה אחת הוחלפה');
  // Nothing is left to replace, so the button is disabled: the keyboard is in the find field,
  // not nowhere, and Esc closes the bar.
  await expect(page.getByTestId('find-replace-all')).toBeDisabled();
  await expect(query(page)).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(stage(page)).toBeFocused();
});

test('"replace" by its button keeps the keyboard when it replaced the last match', async ({
  page,
}) => {
  await replaceWith(page, 'Slidr', 'Deck');
  const replace = page.getByTestId('find-replace');
  await replace.focus();
  await page.keyboard.press('Enter');
  await expect(count(page)).toHaveText('1 / 1');
  await expect(replace).toBeFocused();
  await page.keyboard.press('Enter');
  expect(await textOf(page, 'e_body')).toContain('נשיק את Deck');
  await expect(count(page)).toHaveText('אין תוצאות');
  await expect(query(page)).toBeFocused();
});

test('what the Stage draws taller for a replacement takes its new height in the same undo step', async ({
  page,
}) => {
  // A text box that grows with its text, and a table with one narrow column, both on the Stage.
  await page.evaluate(() => {
    const { bus, selection } = window.slidr!;
    const slideId = selection.getState().currentSlideId!;
    const para = (text: string) => ({
      dir: 'auto' as const,
      align: 'start' as const,
      runs: [{ text }],
    });
    bus.batch([
      {
        type: 'element.add',
        slideId,
        element: {
          id: 'e_grow',
          type: 'text',
          frame: { x: 160, y: 760, w: 300, h: 44 },
          rotation: 0,
          opacity: 1,
          autoFit: 'growHeight',
          vAlign: 'top',
          content: { paragraphs: [para('קצר')] },
        },
      },
      {
        type: 'element.add',
        slideId,
        element: {
          id: 'e_narrow',
          type: 'table',
          frame: { x: 900, y: 760, w: 400, h: 80 },
          rotation: 0,
          opacity: 1,
          rows: [80],
          cols: [200, 200],
          dir: 'rtl',
          style: { headerRow: false, bandedRows: false, firstColumn: false },
          cells: [[{ content: { paragraphs: [para('קצר')] } }, { content: { paragraphs: [] } }]],
        },
      },
    ]);
  });
  await stage(page).locator('[data-element-id="e_narrow"]').waitFor();
  const before = await deckJson(page);
  const steps = await undoSteps(page);
  const rowHeight = async () =>
    ((await element(page, 'e_narrow')) as TestElement & { rows: number[] }).rows[0]!;

  await replaceWith(page, 'קצר', 'טקסט ארוך הרבה יותר, שנשבר לכמה שורות בתיבה צרה');
  await page.getByTestId('find-replace-all').click();
  await expect(status(page)).toHaveText('שתי תוצאות הוחלפו');
  await expect.poll(async () => (await element(page, 'e_grow')).frame.h).toBeGreaterThan(100);
  await expect.poll(rowHeight).toBeGreaterThan(100);
  // The text and the heights are one step.
  expect(await undoSteps(page)).toBe(steps + 1);
  await undoOnStage(page);
  expect(await deckJson(page)).toBe(before);
});
