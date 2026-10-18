import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import {
  card,
  closeProperties,
  collectErrors,
  deck,
  openProperties,
  openTemplates,
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

test("the slide number counts the slides, and the deck's properties hide it and show it again", async ({
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
  const row = (await openProperties(page, 'master')).getByTestId('master-number');
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
  // The slide's own footer is empty, and says on the Stage what it is for.
  const hint = onStage(page, '[data-placeholder-hint="footer"]');
  await expect(hint).toHaveCount(1);
  const field = (await openProperties(page, 'master')).getByTestId('master-footer');
  await field.fill('זרם · סקירת ארכיטקטורה');
  await field.press('Enter');
  const footer = onStage(page, '[data-decoration-id^="d_footer_"]');
  await expect(footer).toHaveText('זרם · סקירת ארכיטקטורה');
  expect(await undoSteps(page)).toBe(steps + 1);
  // The deck's footer stands in that seat now: no hint is drawn over its words. The other
  // empty placeholders of the slide keep theirs.
  await expect(hint).toHaveCount(0);
  await expect(onStage(page, '[data-placeholder-hint="title"]')).toHaveCount(1);

  await closeProperties(page);

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
  await card(page, 'tzuk').getByTestId('template-cover').click();
  await page.getByTestId('template-slides-apply').click();
  await expect(card(page, 'tzuk')).toHaveAttribute('data-current', 'true');
  await expect(footer).toHaveText('זרם · סקירת ארכיטקטורה');
  await openProperties(page, 'master');
  await expect(field).toHaveValue('זרם · סקירת ארכיטקטורה');
  // One undo takes the switch back, the footer with it still on the first template.
  await undo(page);
  expect((await deck(page)).theme.id).toBe('zerem');
  await expect(footer).toHaveText('זרם · סקירת ארכיטקטורה');

  // An empty field takes the footer away, and the hint of the slide's own is back.
  await field.fill('');
  await field.blur();
  await expect(footer).toHaveCount(0);
  await expect(hint).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('a template is applied without the slide number when its button is let up', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await openTemplates(page);
  await card(page, 'zerem').getByTestId('template-cover').click();
  const slides = page.getByTestId('template-slides');
  const numbers = slides.locator('[data-decoration-id$="_number"]');
  const toggle = page.getByTestId('template-slides-numbers');
  // The slides of the template show the number, as the pressed button beside "Apply" says.
  await expect(toggle).toHaveText('מיספור שקפים');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(numbers.first()).toBeVisible();
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(numbers).toHaveCount(0);

  const steps = await undoSteps(page);
  await page.getByTestId('template-slides-apply').click();
  await expect(card(page, 'zerem')).toHaveAttribute('data-current', 'true');
  expect(await undoSteps(page)).toBe(steps + 1);
  const numbered = (await deck(page)).layouts.flatMap((layout) =>
    layout.decorations.filter((decoration) => decoration.role === 'slideNumber'),
  );
  expect(numbered.length).toBeGreaterThan(0);
  expect(numbered.every((decoration) => decoration.hidden)).toBe(true);
  await expect((await openProperties(page, 'master')).getByTestId('master-number')).toContainText(
    'מוסתר',
  );
  await closeProperties(page);

  // On the template the deck is on, the button is the deck's own: it shows the number at once.
  await card(page, 'zerem').getByTestId('template-cover').click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await toggle.click();
  await expect((await openProperties(page, 'master')).getByTestId('master-number')).toContainText(
    'מוצג בשקפי התוכן',
  );
  await expect(numbers.first()).toBeVisible();
  expect(await undoSteps(page)).toBe(steps + 2);
  expect(errors).toEqual([]);
});

for (const { lang, theme, viewport, name } of [
  { lang: 'he', theme: 'light', viewport: { width: 1920, height: 1032 }, name: 'light-rtl-1920' },
  { lang: 'en', theme: 'dark', viewport: { width: 1366, height: 768 }, name: 'dark-ltr-1366' },
] as const) {
  test(`the choice of the slide number beside "Apply" ${name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openTemplates(page, { lang, theme });
    await card(page, 'zerem').getByTestId('template-cover').click();
    await expect(page.getByTestId('template-slide').first()).toBeVisible();
    await settle(page);
    await page.screenshot({ path: out(`template-numbers-on-${name}`) });
    await page.getByTestId('template-slides-numbers').click();
    // Off as it rests, not under the pointer that pressed it.
    await page.mouse.move(0, viewport.height - 1);
    await settle(page);
    await page.screenshot({ path: out(`template-numbers-off-${name}`) });
  });

  test(`the master components in the deck's properties, and on a slide ${name}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await openTemplates(page, { lang, theme, defaultTemplate: 'tzuk' });
    await addSlide(page, 'l_tzuk_cards');
    const field = (await openProperties(page, 'master')).getByTestId('master-footer');
    await field.fill(lang === 'he' ? 'צוק רובוטיקה · רבעון שלישי 2026' : 'Tzuk Robotics · Q3 2026');
    await field.press('Enter');
    await settle(page);
    await page.screenshot({ path: out(`master-${name}`) });
  });
}
