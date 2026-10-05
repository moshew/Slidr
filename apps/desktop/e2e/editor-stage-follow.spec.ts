import { expect, test, type Page } from '@playwright/test';
import { openApp as openWithAgent } from './aifinish-helpers';
import { addTitle, collectErrors, input, onStage } from './aitools-helpers';
import { undoSteps } from './arrange-helpers';

/*
 * A gesture on the Stage and the slide it is made on. The Stage follows the slide the agent
 * writes (AID-06), which is how the slide can change by itself: not while the pointer holds
 * something on the slide that is shown. And when the slide does go from under a gesture, the
 * gesture ends there, without writing to a slide its elements are not on.
 */

const titleFrame = (page: Page, slideId: string) =>
  page.evaluate((id) => {
    const slide = window.slidr!.bus.deck.slides.find((s) => s.id === id)!;
    const title = slide.elements.find((e) => e.id === 'e_title')!;
    return { x: title.frame.x, y: title.frame.y };
  }, slideId);
const current = (page: Page) =>
  page.evaluate(() => window.slidr!.selection.getState().currentSlideId!);
const slideCount = (page: Page) => page.evaluate(() => window.slidr!.bus.deck.slides.length);

/** Presses on the middle of the title and drags it a little: the gesture is under way. */
async function grabTitle(page: Page) {
  const box = (await onStage(page, 'e_title').boundingBox())!;
  const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 40, from.y + 30, { steps: 4 });
  return from;
}

test('the Stage does not follow the agent to another slide while an element is dragged', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await openWithAgent(page, { script: 'deck-build', speed: 1.5 });
  await addTitle(page);
  const slide = await current(page);
  const before = await titleFrame(page, slide);
  const slides = await slideCount(page);

  // The agent starts on a slide of its own; meanwhile the user drags the title.
  await input(page).fill('בנה שקף פתיחה');
  await input(page).press('Enter');
  const from = await grabTitle(page);
  await expect.poll(() => slideCount(page), { timeout: 20_000 }).toBeGreaterThan(slides);
  // The agent's slide is in the deck, and the Stage is still where the hand is.
  expect(await current(page)).toBe(slide);
  const held = await titleFrame(page, slide);
  expect(held.x).toBeGreaterThan(before.x);

  // The drag goes on to its end, as one undo step.
  await page.mouse.move(from.x + 120, from.y + 90, { steps: 4 });
  await page.mouse.up();
  await expect.poll(async () => (await titleFrame(page, slide)).x).toBeGreaterThan(held.x);
  expect((await titleFrame(page, slide)).y).toBeGreaterThan(held.y);
  expect(errors).toEqual([]);
});

test('a slide that goes from under a drag ends the drag where it is', async ({ page }) => {
  const errors = collectErrors(page);
  await openWithAgent(page, { script: 'slide-chat' });
  await addTitle(page);
  const slide = await current(page);
  const other = await page.evaluate(() => {
    const editor = window.slidr!;
    editor.bus.dispatch({
      type: 'slide.add',
      slide: { id: 's_other', elements: [], timeline: [] },
    });
    return 's_other';
  });
  const steps = await undoSteps(page);
  const from = await grabTitle(page);
  const held = await titleFrame(page, slide);
  // Something sends the Stage to another slide in the middle of the drag.
  await page.evaluate((id) => window.slidr!.selection.getState().setCurrentSlide(id), other);
  await expect.poll(() => current(page)).toBe(other);
  await page.mouse.move(from.x + 120, from.y + 90, { steps: 4 });
  await page.mouse.up();

  // The title is where the drag had brought it; the moves after that went nowhere.
  expect(await titleFrame(page, slide)).toEqual(held);
  expect(await undoSteps(page)).toBe(steps + 1);
  expect(await page.evaluate(() => window.slidr!.bus.deck.slides[1]!.elements.length)).toBe(0);
  expect(errors).toEqual([]);
});
