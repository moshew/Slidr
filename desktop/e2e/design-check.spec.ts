import { expect, test } from '@playwright/test';
import { createDeck, createElement, createSlide } from '@slidr/model';
import {
  checked,
  collectErrors,
  group,
  openCheck,
  panel,
  selection,
  shown,
} from './design-helpers';

test('one status control explains the automatic check and leads to each issue', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await openCheck(page);
  await expect(page.locator('[data-panel="lint"]')).toHaveCount(0);
  await expect(page.getByTestId('slide-findings-mark')).toHaveCount(0);
  await expect(panel(page)).toContainText('הבדיקה רצה אוטומטית אחרי כל שינוי במצגת.');
  expect(await shown(page)).toEqual([
    's_errors L01',
    's_errors L03',
    's_errors L05',
    's_arrange L09',
    's_arrange L10',
    's_arrange L15',
  ]);
  await expect(group(page, 's_clean')).toHaveCount(0);
  await expect(group(page, 's_colour')).toHaveCount(0);
  await expect(page.getByTestId('status-lint')).toHaveText('6 ממצאי עיצוב');

  const overflow = panel(page).locator('li[data-slide="s_errors"][data-finding="L01"]');
  await expect(overflow).toContainText('טקסט גולש מהתיבה שלו');
  await expect(overflow).toContainText('שקף 2 · פסקת הפתיחה');
  await overflow.getByRole('button').click();
  expect(await selection(page)).toEqual({ slide: 's_errors', elements: ['e_overflow'] });
  await expect(panel(page)).toBeHidden();
  await expect(page.getByTestId('stage-surface')).toBeFocused();
  expect(errors).toEqual([]);
});

test('a finding with several objects selects them together', async ({ page }) => {
  await openCheck(page);
  await panel(page).locator('li[data-slide="s_arrange"][data-finding="L10"] button').click();
  expect(await selection(page)).toEqual({
    slide: 's_arrange',
    elements: ['e_card_1', 'e_card_2', 'e_card_3'],
  });
});

test('the repair button sends the deck to the AI chat', async ({ page }) => {
  await openCheck(page);
  await page.getByTestId('fix-with-ai').click();
  await expect(panel(page)).toBeHidden();
  await expect(page.locator('button[data-panel="ai"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('chat-user').first()).toHaveAttribute('data-action', 'deck.fix');
});

test('the status follows edits without a manual run', async ({ page }) => {
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
  await page.evaluate(() =>
    window.slidr!.bus.dispatch({
      type: 'element.update',
      slideId: 's_one',
      elementId: 'e_card2',
      patch: { frame: { x: 2400, y: 120, w: 544, h: 840 } },
    }),
  );
  await checked(page);
  await expect(panel(page).locator('li[data-finding="L02"]')).toHaveCount(1);
  await expect(page.getByTestId('status-lint')).toHaveText('ממצא עיצוב אחד');
  await expect(page.getByTestId('status-lint')).toHaveAttribute('data-errors', '1');
});

test('English status and popover use the same simple flow', async ({ page }) => {
  const errors = collectErrors(page);
  await openCheck(page, { lang: 'en' });
  await expect(panel(page)).toContainText('The deck is checked automatically after every change.');
  await expect(page.getByTestId('status-lint')).toHaveText('6 design findings');
  expect(await shown(page)).toHaveLength(6);
  const overflow = panel(page).locator('li[data-slide="s_errors"][data-finding="L01"]');
  await expect(overflow).toContainText('Text overflows its box');
  await overflow.getByRole('button').click();
  expect((await selection(page)).slide).toBe('s_errors');
  expect(errors).toEqual([]);
});

test('filmstrip thumbnails have no design markers after the deck changes', async ({ page }) => {
  await openCheck(page);
  await expect(page.getByTestId('slide-findings-mark')).toHaveCount(0);
  await page.evaluate(() => {
    const { bus } = window.slidr!;
    const slide = bus.deck.slides.find((item) => item.id === 's_errors')!;
    bus.dispatch({
      type: 'element.remove',
      slideId: slide.id,
      elementIds: slide.elements.map((element) => element.id),
    });
  });
  await checked(page);
  await expect(page.getByTestId('slide-findings-mark')).toHaveCount(0);
});
