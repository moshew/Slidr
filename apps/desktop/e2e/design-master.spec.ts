import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import {
  card,
  collectErrors,
  deck,
  openTemplates,
  panel,
  settle,
  undo,
  undoSteps,
} from './templates-helpers';

/* The master components (SLD-04): the slide number, the deck's footer and the logo. */

const out = (name: string) =>
  fileURLToPath(new URL(`../test-results/design/${name}.png`, import.meta.url));

/** Adds a slide of a layout through "New slide", as a user does. */
async function addSlide(page: Page, layout: string): Promise<void> {
  await page.getByTestId('new-slide').click();
  await page.getByTestId('layout-choices').locator(`[data-layout="${layout}"]`).click();
}

const onStage = (page: Page, selector: string) => page.getByTestId('stage-frame').locator(selector);

test('the slide number counts the slides, and the panel hides it and shows it again', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await openTemplates(page, { defaultTemplate: 'zerem' });
  await addSlide(page, 'l_zerem_cards');
  await addSlide(page, 'l_zerem_chart');
  // The third slide is on the Stage, and says so; the opening slide draws no number.
  const number = onStage(page, '[data-decoration-id="d_zerem_chart_number"]');
  await expect(number).toHaveText('3');
  // A slide that moves takes the number of its new place.
  await page.evaluate(() =>
    window.slidr!.bus.dispatch({
      type: 'slide.move',
      slideIds: [window.slidr!.selection.getState().currentSlideId!],
      toIndex: 1,
    }),
  );
  await expect(number).toHaveText('2');

  const steps = await undoSteps(page);
  const row = panel(page).getByTestId('master-number');
  await expect(row).toContainText('מוצג בשקפי התוכן');
  await row.getByRole('button', { name: 'הסתרת מספר השקף' }).click();
  await expect(number).toHaveCount(0);
  await expect(row).toContainText('מוסתר');
  expect(await undoSteps(page)).toBe(steps + 1);
  await row.getByRole('button', { name: 'הצגת מספר השקף' }).click();
  await expect(number).toHaveText('2');
  expect(errors).toEqual([]);
});

test('the footer of the deck is on every slide with a place for one, and stays when the template is switched', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await openTemplates(page, { defaultTemplate: 'zerem' });
  await addSlide(page, 'l_zerem_cards');
  const steps = await undoSteps(page);
  const field = panel(page).getByTestId('master-footer');
  await field.fill('זרם · סקירת ארכיטקטורה');
  await field.press('Enter');
  const footer = onStage(page, '[data-decoration-id^="d_footer_"]');
  await expect(footer).toHaveText('זרם · סקירת ארכיטקטורה');
  expect(await undoSteps(page)).toBe(steps + 1);

  // A slide that writes a footer of its own shows its own in the same place.
  const own = (await deck(page)).slides[1]!.elements.find((e) => e.role === 'footer')!;
  await page.evaluate(
    ([slideId, elementId]) =>
      window.slidr!.bus.dispatch({
        type: 'text.set',
        slideId: slideId!,
        elementId: elementId!,
        content: { paragraphs: [{ dir: 'rtl', align: 'end', runs: [{ text: 'נספח' }] }] },
      }),
    [(await deck(page)).slides[1]!.id, own.id],
  );
  await expect(footer).toHaveCount(0);
  await undo(page);
  await expect(footer).toHaveText('זרם · סקירת ארכיטקטורה');

  // The business template, and the same footer on its layouts.
  await card(page, 'tzuk').getByRole('button', { name: 'החלה על המצגת' }).click();
  await expect(card(page, 'tzuk')).toHaveAttribute('data-current', 'true');
  await expect(footer).toHaveText('זרם · סקירת ארכיטקטורה');
  await expect(field).toHaveValue('זרם · סקירת ארכיטקטורה');
  // One undo takes the switch back, the footer with it still on the first template.
  await undo(page);
  expect((await deck(page)).theme.id).toBe('zerem');
  await expect(footer).toHaveText('זרם · סקירת ארכיטקטורה');

  // An empty field takes the footer away.
  await field.fill('');
  await field.blur();
  await expect(footer).toHaveCount(0);
  expect(errors).toEqual([]);
});

for (const { lang, theme, viewport, name } of [
  { lang: 'he', theme: 'light', viewport: { width: 1920, height: 1032 }, name: 'light-rtl-1920' },
  { lang: 'en', theme: 'dark', viewport: { width: 1366, height: 768 }, name: 'dark-ltr-1366' },
] as const) {
  test(`the master components in the panel, and on a slide ${name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openTemplates(page, { lang, theme, defaultTemplate: 'tzuk' });
    await addSlide(page, 'l_tzuk_cards');
    const field = panel(page).getByTestId('master-footer');
    await field.scrollIntoViewIfNeeded();
    await field.fill(lang === 'he' ? 'צוק רובוטיקה · רבעון שלישי 2026' : 'Tzuk Robotics · Q3 2026');
    await field.press('Enter');
    await settle(page);
    await page.screenshot({ path: out(`master-${name}`) });
  });
}
