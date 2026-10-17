import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { card, collectErrors, deck, openTemplates, panel, settle } from './templates-helpers';

/*
 * The slides that show a template: pressing the picture of a template in the library spreads
 * them over the Stage, large, in a card that unfolds from the side of the panel. The
 * screenshots are written to test-results/templates/ to be looked at; nothing is compared.
 */

const out = (name: string) =>
  fileURLToPath(new URL(`../test-results/templates/${name}.png`, import.meta.url));

const cover = (page: Page, id: string) => card(page, id).getByTestId('template-cover');
const slides = (page: Page) => page.getByTestId('template-slides');
const shown = (page: Page) => slides(page).getByTestId('template-slide');

test('pressing the picture of a template spreads its slides over the Stage, and changes no deck', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await openTemplates(page);
  const before = await deck(page);
  await expect(slides(page)).toHaveCount(0);

  await cover(page, 'zerem').click();
  await expect(cover(page, 'zerem')).toHaveAttribute('aria-expanded', 'true');
  await expect(slides(page)).toHaveCount(1);
  // The sample deck of the template: many slides, and its photographs load.
  await expect.poll(() => shown(page).count()).toBeGreaterThan(8);
  const photo = slides(page).locator('img').first();
  await expect
    .poll(() => photo.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0);
  // The card lies over the editor, not in the panel, and every slide is in it: nothing scrolls.
  const [stage, box] = await Promise.all([
    page.getByTestId('stage').boundingBox(),
    slides(page).boundingBox(),
  ]);
  expect(box!.x).toBeGreaterThanOrEqual(stage!.x);
  expect(box!.x + box!.width).toBeLessThanOrEqual(stage!.x + stage!.width);
  expect(box!.width).toBeGreaterThan(stage!.width * 0.9);
  for (const slide of await shown(page).all()) {
    const at = (await slide.boundingBox())!;
    expect(at.x).toBeGreaterThanOrEqual(box!.x);
    expect(at.x + at.width).toBeLessThanOrEqual(box!.x + box!.width);
    expect(at.y + at.height).toBeLessThanOrEqual(box!.y + box!.height);
  }
  // A slide is named by its layout, not by what its sample says.
  await expect(shown(page).first()).toContainText('פתיחה');

  // Another template takes the card; the same picture again, Escape and the button close it.
  await cover(page, 'tzuk').click();
  await expect(cover(page, 'zerem')).toHaveAttribute('aria-expanded', 'false');
  await expect(slides(page)).toHaveCount(1);
  await expect(slides(page)).toHaveAccessibleName(/צוק/);
  await cover(page, 'tzuk').click();
  await expect(slides(page)).toHaveCount(0);
  await cover(page, 'tzuk').click();
  await expect(slides(page)).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(slides(page)).toHaveCount(0);
  await cover(page, 'shvil').click();
  await page.getByTestId('template-slides-close').click();
  await expect(slides(page)).toHaveCount(0);
  await expect(cover(page, 'shvil')).toHaveAttribute('aria-expanded', 'false');

  expect(await deck(page)).toEqual(before);
  expect(errors).toEqual([]);
});

test('the card applies its template and folds away, and does not outlive the panel', async ({
  page,
}) => {
  await openTemplates(page);
  await cover(page, 'zerem').click();
  await page.getByTestId('template-slides-apply').click();
  await expect(slides(page)).toHaveCount(0);
  expect((await deck(page)).theme.id).toBe('zerem');
  await expect(card(page, 'zerem')).toHaveAttribute('data-current', 'true');

  await cover(page, 'shvil').click();
  await expect(slides(page)).toHaveCount(1);
  await page.locator('button[data-panel="transitions"]').click();
  await expect(panel(page)).toBeHidden();
  await expect(slides(page)).toHaveCount(0);
});

test('the card unfolds beside the panel with its slides in it, and folds back towards it', async ({
  page,
}) => {
  await openTemplates(page);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  // Every animation of the card itself, as it starts, and how many slides it held as it opened.
  await page.evaluate(() => {
    const record = window as unknown as { started: string[]; slidesAtOpening: number };
    record.started = [];
    window.addEventListener('animationstart', (event) => {
      const target = event.target as Element;
      if (!target.matches('[data-testid="template-slides"]')) return;
      record.started.push(event.animationName);
      if (event.animationName === 'template-slides-unfold')
        record.slidesAtOpening = target.querySelectorAll('[data-testid="template-slide"]').length;
    });
  });
  const started = () => page.evaluate(() => (window as unknown as { started: string[] }).started);

  await cover(page, 'ariach').click();
  await expect.poll(started).toEqual(['template-slides-unfold']);
  // Not an empty card that the slides fill a moment later.
  expect(
    await page.evaluate(() => (window as unknown as { slidesAtOpening: number }).slidesAtOpening),
  ).toBeGreaterThan(8);
  await page.waitForTimeout(80);
  await page.screenshot({ path: out('slides-unfolding') });
  await expect.poll(() => shown(page).count()).toBeGreaterThan(8);
  // It does not reach over the panel.
  const [panelBox, cardBox] = await Promise.all([
    panel(page).boundingBox(),
    slides(page).boundingBox(),
  ]);
  expect(cardBox!.x + cardBox!.width).toBeLessThanOrEqual(panelBox!.x);

  await page.keyboard.press('Escape');
  await expect.poll(started).toEqual(['template-slides-unfold', 'template-slides-fold']);
  await expect(slides(page)).toHaveCount(0);
});

for (const theme of ['light', 'dark'] as const) {
  for (const lang of ['he', 'en'] as const) {
    for (const viewport of [
      { width: 1920, height: 1032 },
      { width: 1366, height: 768 },
    ]) {
      test(`the slides of a template ${theme}-${lang}-${viewport.width}`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await openTemplates(page, { lang, theme });
        for (const [id, name] of [
          ['ariach', lang === 'he' ? 'אריח' : 'Tile'],
          ['shvil', lang === 'he' ? 'שביל' : 'Trail'],
        ] as const) {
          await cover(page, id).click();
          await expect(slides(page)).toHaveAccessibleName(new RegExp(name));
          await expect.poll(() => shown(page).count()).toBeGreaterThan(8);
          await settle(page);
          await page.screenshot({ path: out(`slides-${id}-${theme}-${lang}-${viewport.width}`) });
        }
      });
    }
  }
}

for (const lang of ['he', 'en'] as const) {
  test(`every built-in template is shown by finished slides, not by placeholders, in ${lang}`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    // A sample that cannot be read is said to the console, and its layouts are shown instead.
    const errors = collectErrors(page);
    await openTemplates(page, { lang });
    const ids = await panel(page)
      .locator('[data-template]')
      .evaluateAll((cards) => cards.map((element) => element.getAttribute('data-template')!));
    expect(ids.length).toBeGreaterThan(10);
    for (const id of ids) {
      await cover(page, id).click();
      await expect(slides(page)).toHaveCount(1);
      // Sixteen slides: one for each layout of the template and one more section divider, the
      // text slide among them.
      await expect.poll(() => shown(page).count(), { message: id }).toBe(16);
      await expect(
        shown(page)
          .locator('figcaption')
          .getByText(lang === 'he' ? 'טקסט' : 'Text', { exact: true }),
        id,
      ).toHaveCount(1);
      // No slide of the app's own words for a role, and no picture frame left empty.
      await expect(slides(page).getByText(/^(כותרת השקף|Slide title)$/)).toHaveCount(0);
      await expect(slides(page).locator('[data-slidr-placeholder]')).toHaveCount(0);
      await cover(page, id).click();
      await expect(slides(page)).toHaveCount(0);
    }
    expect(errors).toEqual([]);
  });
}
