import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { collectErrors, deck, openTemplates, settle, undo, undoSteps } from './templates-helpers';

/* The "Layout" tool of row B (SLD-02): an existing slide moves to another layout of its deck. */

const out = (name: string) =>
  fileURLToPath(new URL(`../test-results/design/${name}.png`, import.meta.url));

/** A cards slide with text in its title and in its first card, as a user would have written. */
async function cardsSlide(page: Page): Promise<void> {
  await page.getByTestId('new-slide').click();
  await page.getByTestId('layout-choices').locator('[data-layout="l_zerem_cards"]').click();
  await page.evaluate(() => {
    const { bus, selection } = window.slidr!;
    const slide = bus.deck.slides.find((s) => s.id === selection.getState().currentSlideId)!;
    const write = (role: string, text: string) => {
      const element = slide.elements.find((e) => e.role === role)!;
      bus.dispatch({
        type: 'text.set',
        slideId: slide.id,
        elementId: element.id,
        content: { paragraphs: [{ dir: 'rtl', align: 'start', runs: [{ text }] }] },
      });
    };
    write('title', 'שלושה עקרונות');
    write('subtitle', 'פשוט');
  });
}

const tool = (page: Page) => page.getByTestId('layout-tool');
const choice = (page: Page, id: string) =>
  page.getByTestId('layout-tool-choices').locator(`[data-layout-choice="${id}"]`);

test('moves the slide to another layout with its content, as one step', async ({ page }) => {
  const errors = collectErrors(page);
  await openTemplates(page, { defaultTemplate: 'zerem' });
  await cardsSlide(page);
  const before = await deck(page);
  const steps = await undoSteps(page);

  await tool(page).click();
  // Every layout of the deck, each drawn with this slide on it; the slide's own is marked.
  await expect(page.getByTestId('layout-tool-choices').locator('[data-layout-choice]')).toHaveCount(
    14,
  );
  await expect(choice(page, 'l_zerem_cards')).toHaveAttribute('aria-pressed', 'true');
  await expect(choice(page, 'l_zerem_timeline')).toContainText('ציר זמן');

  await choice(page, 'l_zerem_timeline').click();
  const after = await deck(page);
  const slide = after.slides[1]!;
  expect(slide.layoutId).toBe('l_zerem_timeline');
  expect(await undoSteps(page)).toBe(steps + 1);
  // The title went to the timeline's title seat, with its words.
  const seat = after.layouts
    .find((l) => l.id === 'l_zerem_timeline')!
    .placeholders.find((p) => p.role === 'title')!;
  expect(slide.elements.find((e) => e.role === 'title')!.frame).toEqual(seat.frame);
  await expect(choice(page, 'l_zerem_timeline')).toHaveAttribute('aria-pressed', 'true');

  await undo(page);
  expect(await deck(page)).toEqual(before);
  expect(errors).toEqual([]);
});

test('a slide without a layout takes one; a deck without layouts says so', async ({ page }) => {
  await openTemplates(page);
  // A plain new deck: one empty slide and no layouts.
  await tool(page).click();
  await expect(page.getByRole('dialog')).toContainText('במצגת הזו אין פריסות');
  await page.keyboard.press('Escape');

  await page
    .locator('[data-template="tzuk"]')
    .getByRole('button', { name: 'החלה על המצגת' })
    .click();
  await expect(page.locator('[data-template="tzuk"]')).toHaveAttribute('data-current', 'true');
  await tool(page).click();
  await choice(page, 'l_tzuk_quote').click();
  const slide = (await deck(page)).slides[0]!;
  expect(slide.layoutId).toBe('l_tzuk_quote');
  // The empty slide got what "new slide" would have given it.
  expect(slide.elements.map((e) => e.role)).toEqual(['quote', 'attribution', 'caption', 'footer']);
});

for (const { lang, theme, viewport, name } of [
  { lang: 'he', theme: 'light', viewport: { width: 1920, height: 1032 }, name: 'light-rtl-1920' },
  { lang: 'en', theme: 'dark', viewport: { width: 1366, height: 768 }, name: 'dark-ltr-1366' },
] as const) {
  test(`the layout tool open over a slide ${name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openTemplates(page, { lang, theme, defaultTemplate: 'zerem' });
    await cardsSlide(page);
    await tool(page).click();
    await expect(page.getByTestId('layout-tool-choices')).toBeVisible();
    await settle(page);
    await page.screenshot({ path: out(`layout-tool-${name}`) });
  });
}
