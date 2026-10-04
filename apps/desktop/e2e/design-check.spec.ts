import { expect, test } from '@playwright/test';
import { createDeck, createElement, createSlide } from '@slidr/model';
import {
  checked,
  collectErrors,
  deck,
  group,
  openCheck,
  panel,
  selection,
  shown,
  undo,
  undoSteps,
} from './design-helpers';

/* The Design check panel (LNT-03, WG7-T08) over a deck whose findings are known. */

test('lists the findings by slide, and a finding leads to its object on the Stage', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await openCheck(page);
  // The first slide is clean and has no group; the others are in the order of the deck.
  expect(await shown(page)).toEqual([
    's_errors L01',
    's_errors L03',
    's_errors L05',
    's_arrange L09',
    's_arrange L10',
    's_arrange L15',
    's_colour L11',
  ]);
  await expect(group(page, 's_clean')).toHaveCount(0);
  await expect(page.getByTestId('design-check-summary')).toHaveText('2 שגיאות4 אזהרותהערה אחת');
  await expect(group(page, 's_errors').getByRole('heading')).toHaveText('שקף 2 · תוכנית העבודה');

  // A finding is named in the language of the app, with the object it is about.
  const overflow = group(page, 's_errors').locator('li[data-finding="L01"]');
  await expect(overflow).toContainText('טקסט גולש מהתיבה שלו');
  await expect(overflow).toContainText('פסקת הפתיחה');
  await overflow.getByRole('button', { name: /מעבר אל הממצא/ }).click();
  expect(await selection(page)).toEqual({ slide: 's_errors', elements: ['e_overflow'] });
  // Open, it says what to do, and holds what was measured as the agent gets it.
  await expect(overflow).toContainText('אפשר להגדיל את התיבה, לקצר את הטקסט או לכווץ אותו.');
  await overflow.getByText('פרטי המדידה').click();
  await expect(overflow).toContainText(/The text is \d+px taller than its box/);

  // A finding about several objects selects them all; one about the slide, none.
  await group(page, 's_arrange')
    .locator('li[data-finding="L10"]')
    .getByRole('button')
    .first()
    .click();
  expect(await selection(page)).toEqual({
    slide: 's_arrange',
    elements: ['e_card_1', 'e_card_2', 'e_card_3'],
  });
  expect(errors).toEqual([]);
});

test('"Fix" puts one finding right, as one step that undo takes back', async ({ page }) => {
  await openCheck(page);
  const before = await deck(page);
  const steps = await undoSteps(page);
  await group(page, 's_errors').locator('[data-fix="L01"]').click();
  await checked(page);
  await expect(group(page, 's_errors').locator('li[data-finding="L01"]')).toHaveCount(0);
  expect(await undoSteps(page)).toBe(steps + 1);
  // The other findings of the slide are as they were.
  await expect(group(page, 's_errors').locator('li[data-finding]')).toHaveCount(2);

  await undo(page);
  await checked(page);
  expect(await deck(page)).toEqual(before);
  await expect(group(page, 's_errors').locator('li[data-finding="L01"]')).toHaveCount(1);
});

test('"Fix all" fixes every error and warning that has a fix, as one step', async ({ page }) => {
  await openCheck(page);
  const before = await deck(page);
  const steps = await undoSteps(page);
  await expect(page.getByTestId('fix-all')).toHaveText('תיקון הכול (6)');
  await page.getByTestId('fix-all').click();
  await expect(page.getByTestId('fix-report')).toHaveText(/תוקנו \d+ ממצאים\./);
  await checked(page);
  // What is left is the note: a colour of its own may be meant, and "fix all" leaves it.
  expect(await shown(page)).toEqual(['s_colour L11']);
  await expect(page.getByTestId('fix-all')).toBeDisabled();
  expect(await undoSteps(page)).toBe(steps + 1);

  await undo(page);
  await checked(page);
  expect(await deck(page)).toEqual(before);
  expect(await shown(page)).toHaveLength(7);

  // The note has a fix of its own, for whoever wants it.
  await group(page, 's_colour').locator('[data-fix="L11"]').click();
  await checked(page);
  await expect(group(page, 's_colour')).toHaveCount(0);
});

test('"Fix with AI" sends the fix action to the deck chat, and a slide\'s to the slide chat', async ({
  page,
}) => {
  await openCheck(page);
  await page.getByTestId('fix-with-ai').click();
  // The deck tool, on its chat, with the action as the user's message.
  await expect(page.locator('button[data-panel="ai.deck"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByTestId('chat-user').first()).toHaveAttribute('data-action', 'deck.fix');

  await page.locator('button[data-panel="lint"]').click();
  await group(page, 's_arrange').getByTestId('fix-slide-with-ai').click();
  await expect(page.locator('button[data-panel="ai.slide"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect((await selection(page)).slide).toBe('s_arrange');
  await expect(page.getByTestId('chat-user').first()).toHaveAttribute('data-action', 'slide.fix');
});

test('the status bar counts the findings, and opens the panel', async ({ page }) => {
  await openCheck(page);
  const status = page.getByTestId('status-lint');
  await expect(status).toHaveText('2 שגיאות עיצוב');
  // With the errors fixed it counts what is left to look at; notes are not counted.
  await page.getByTestId('fix-all').click();
  await expect(status).toHaveText('אין ממצאי עיצוב');
  await page.locator('button[data-panel="ai.deck"]').click();
  await expect(panel(page)).toBeHidden();
  await status.click();
  await expect(panel(page)).toBeVisible();
});

test('follows the deck: a change is checked without being asked for', async ({ page }) => {
  await openCheck(page, {
    deck: createDeck({
      lang: 'he',
      slides: [
        createSlide({
          id: 's_one',
          elements: [96, 688, 1280].map((x, i) =>
            createElement.shape({ id: `e_card${i}`, frame: { x, y: 120, w: 544, h: 840 } }),
          ),
        }),
      ],
    }),
  });
  await expect(panel(page)).toContainText('אין ממצאי עיצוב');
  // The last card leaves the slide: nothing of it shows.
  await page.evaluate(() =>
    window.slidr!.bus.dispatch({
      type: 'element.update',
      slideId: 's_one',
      elementId: 'e_card2',
      patch: { frame: { x: 2400, y: 120, w: 544, h: 840 } },
    }),
  );
  await expect(group(page, 's_one').locator('li[data-finding="L02"]')).toHaveCount(1);
  await group(page, 's_one').locator('[data-fix="L02"]').click();
  await expect(group(page, 's_one').locator('li[data-finding="L02"]')).toHaveCount(0);
});

test('in English: the same panel, with no string missing, and notes that can be hidden', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await openCheck(page, { lang: 'en' });
  await expect(page.getByTestId('design-check-summary')).toHaveText('2 errors4 warnings1 note');
  await expect(page.getByTestId('fix-all')).toHaveText('Fix all (6)');
  const overflow = group(page, 's_errors').locator('li[data-finding="L01"]');
  await expect(overflow).toContainText('Text overflows its box');
  await overflow.getByRole('button', { name: /Go to the finding/ }).click();
  await expect(overflow).toContainText('Enlarge the box, shorten the text or shrink it.');

  await page.getByRole('radio', { name: 'Errors and warnings' }).click();
  await expect(group(page, 's_colour')).toHaveCount(0);
  expect(await shown(page)).toHaveLength(6);
  await page.getByRole('radio', { name: 'All' }).click();
  await expect(group(page, 's_colour')).toHaveCount(1);
  await expect(page.getByTestId('status-lint')).toHaveText('2 design errors');
  expect(errors).toEqual([]);
});
