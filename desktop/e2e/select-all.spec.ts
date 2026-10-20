import { expect, test } from '@playwright/test';
import {
  addBoxes,
  openApp,
  selected,
  selectedSlides,
  slideIds,
  THREE,
  thumb,
} from './arrange-helpers';

test('Ctrl+A selects slides in the Filmstrip and objects on the Stage', async ({ page }) => {
  await openApp(page);
  await addBoxes(page, THREE);
  await page.evaluate(() => {
    window.slidr!.bus.batch(
      Array.from({ length: 3 }, (_, i) => ({
        type: 'slide.add' as const,
        slide: { id: `s_select_${i}`, elements: [], timeline: [] },
      })),
    );
  });

  const allSlides = await slideIds(page);
  await thumb(page, allSlides[0]!).click({ position: { x: 20, y: 20 } });
  await expect(page.getByTestId('filmstrip').getByRole('listbox')).toBeFocused();
  await page.keyboard.press('Control+a');
  await expect.poll(() => selectedSlides(page)).toEqual(allSlides);
  await expect(page.getByTestId('filmstrip').getByRole('option', { selected: true })).toHaveCount(
    allSlides.length,
  );
  expect(await page.evaluate(() => getSelection()?.toString())).toBe('');
  // It is the slides that show it, each framed like the current one, and not the strip: the
  // key that follows a press of the pointer draws no ring around it.
  const frames = await page
    .getByTestId('filmstrip')
    .getByRole('option')
    .evaluateAll((options) => {
      for (const animation of document.getAnimations())
        if (animation instanceof CSSTransition) animation.finish();
      return options.map((option) => getComputedStyle(option.firstElementChild!).boxShadow);
    });
  expect(frames).toHaveLength(allSlides.length);
  expect(new Set(frames).size).toBe(1);
  expect(
    await page.locator('[data-filmstrip]').evaluate((node) => getComputedStyle(node).outlineStyle),
  ).toBe('none');

  const stage = page.getByTestId('stage-surface');
  await stage.click({ position: { x: 10, y: 10 } });
  await expect(stage).toBeFocused();
  await page.keyboard.press('Control+a');
  await expect.poll(() => selected(page)).toEqual(THREE.map((box) => box.id));
  expect(await page.evaluate(() => getSelection()?.toString())).toBe('');
  // Here too it is the elements that show it, and no ring is drawn around the Stage.
  expect(await stage.evaluate((node) => getComputedStyle(node).outlineStyle)).toBe('none');
});
