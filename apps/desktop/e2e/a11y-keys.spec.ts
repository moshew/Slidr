import { expect, test, type Page } from '@playwright/test';
import {
  addBoxes,
  currentSlide,
  focusStage,
  select,
  selected,
  focusFilmstrip,
  openApp,
  selectedSlides,
  slideIds,
  undo,
  undoSteps,
} from './arrange-helpers';
import { addText, edit, paragraphs, para, steps } from './text-helpers';

/*
 * The keyboard pass (WG13-T06, UI-06): what ADR-060 listed as having no keyboard path, each
 * reached from the keyboard now.
 */

test('Shift+Enter breaks the line inside a paragraph, as one undo step with the typing', async ({
  page,
}) => {
  await openApp(page);
  await addText(page, 'e_text', [para('שורה ראשונה')]);
  await edit(page, 'e_text');
  const before = await steps(page);
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.type('שנייה');
  await expect.poll(async () => (await paragraphs(page, 'e_text')).length).toBe(1);
  await expect
    .poll(async () => (await paragraphs(page, 'e_text'))[0]!.runs.map((r) => r.text).join(''))
    .toBe('שורה ראשונה\nשנייה');
  // Still one paragraph on the slide, of two lines.
  const box = page.getByTestId('stage-frame').locator('[data-element-id="e_text"]');
  await expect(box.locator('p')).toHaveCount(1);
  await expect(box.locator('br')).toHaveCount(1);
  await page.keyboard.press('Escape');
  expect(await steps(page)).toBe(before + 1);
  // Enter is still a new paragraph.
  await edit(page, 'e_text');
  await page.keyboard.press('Enter');
  await page.keyboard.type('פסקה');
  await expect.poll(async () => (await paragraphs(page, 'e_text')).length).toBe(2);
});

/** Three more slides after the first one. */
async function fourSlides(page: Page): Promise<string[]> {
  await page.evaluate(() => {
    const { bus } = window.slidr!;
    bus.batch(
      [2, 3, 4].map((n) => ({
        type: 'slide.add' as const,
        slide: { id: `s_${n}`, name: `Slide ${n}`, elements: [], timeline: [] },
      })),
    );
  });
  return slideIds(page);
}

for (const lang of ['he', 'en'] as const) {
  test(`Ctrl and an arrow moves the selected slides along the Filmstrip, ${lang}`, async ({
    page,
  }) => {
    await openApp(page, { lang });
    const [one, two, three, four] = await fourSlides(page);
    await page.evaluate((id) => window.slidr!.selection.getState().setCurrentSlide(id), one!);
    await focusFilmstrip(page);
    // On is to the left in a right-to-left strip, as the plain arrows walk it.
    const on = lang === 'he' ? 'Control+ArrowLeft' : 'Control+ArrowRight';
    const back = lang === 'he' ? 'Control+ArrowRight' : 'Control+ArrowLeft';
    const before = await undoSteps(page);

    await page.keyboard.press(on);
    expect(await slideIds(page)).toEqual([two, one, three, four]);
    expect(await undoSteps(page)).toBe(before + 1);
    // The moved slide stays the current one, for the next press.
    expect(await currentSlide(page)).toBe(one);
    await page.keyboard.press(on);
    expect(await slideIds(page)).toEqual([two, three, one, four]);
    await page.keyboard.press(back);
    expect(await slideIds(page)).toEqual([two, one, three, four]);

    await page.keyboard.press('Control+End');
    expect(await slideIds(page)).toEqual([two, three, four, one]);
    // At the end there is nowhere further: no step.
    const atEnd = await undoSteps(page);
    await page.keyboard.press(on);
    expect(await undoSteps(page)).toBe(atEnd);

    // Two slides selected move together.
    await page.keyboard.press('Control+Home');
    expect(await slideIds(page)).toEqual([one, two, three, four]);
    await page.keyboard.press(lang === 'he' ? 'Shift+ArrowLeft' : 'Shift+ArrowRight');
    expect(await selectedSlides(page)).toEqual([one, two]);
    await page.keyboard.press(on);
    expect(await slideIds(page)).toEqual([three, one, two, four]);
    await undo(page);
    expect(await slideIds(page)).toEqual([one, two, three, four]);
  });
}

for (const lang of ['he', 'en'] as const) {
  test(`Alt+F10 takes the keyboard to the toolbar beside the selection, ${lang}`, async ({
    page,
  }) => {
    await openApp(page, { lang });
    await addBoxes(page, [{ id: 'e_box', x: 700, y: 400, w: 400, h: 300 }]);
    await select(page, ['e_box']);
    await focusStage(page);
    const bar = page.getByTestId('selection-toolbar');
    await expect(bar).toBeVisible();
    await expect(bar).toHaveRole('toolbar');

    await page.keyboard.press('Alt+F10');
    const buttons = bar.getByRole('button');
    await expect(buttons.first()).toBeFocused();
    // Along the toolbar with the arrows, in the direction it reads.
    await page.keyboard.press(lang === 'he' ? 'ArrowLeft' : 'ArrowRight');
    await expect(buttons.nth(1)).toBeFocused();
    await page.keyboard.press('End');
    await expect(buttons.last()).toBeFocused();
    await page.keyboard.press('Home');
    await expect(buttons.first()).toBeFocused();

    // Enter on the first tool duplicates, and the keyboard stays with the toolbar.
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await selected(page)).length).toBe(1);
    expect(await selected(page)).not.toEqual(['e_box']);
    await expect(bar.locator(':focus')).toHaveCount(1);
    // Esc gives it back to the slide.
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('stage-surface')).toBeFocused();
  });
}

test('the Stage says what it is and what Tab selects on it', async ({ page }) => {
  await openApp(page, { lang: 'en' });
  await addBoxes(page, [
    { id: 'e_a', x: 200, y: 200, w: 300, h: 200, name: 'Logo' },
    { id: 'e_b', x: 800, y: 400, w: 300, h: 200 },
  ]);
  const stage = page.getByTestId('stage-surface');
  await expect(stage).toHaveRole('application');
  await expect(stage).toHaveAccessibleName('Slide 1 of 1');
  const said = page.getByTestId('stage-selection');
  await expect(said).toHaveRole('status');
  await expect(said).toHaveText('');
  await stage.focus();
  await page.keyboard.press('Tab');
  await expect(said).toHaveText('Selected: Shape · Logo');
  await page.keyboard.press('Control+a');
  await expect(said).toHaveText('Selected: 2 objects');
});

for (const motion of ['reduce', 'no-preference'] as const) {
  test(`the Filmstrip goes to the current slide ${motion === 'reduce' ? 'at once, with reduced motion' : 'smoothly'}`, async ({
    page,
  }) => {
    await openApp(page, { lang: 'en' });
    await page.emulateMedia({ reducedMotion: motion });
    await page.evaluate(() => {
      const { bus } = window.slidr!;
      bus.batch(
        Array.from({ length: 30 }, (_, i) => ({
          type: 'slide.add' as const,
          slide: { id: `s_far_${i}`, elements: [], timeline: [] },
        })),
      );
    });
    const strip = page.locator('[data-filmstrip]');
    // The strip has room for the new slides before the current one changes.
    await expect.poll(() => strip.evaluate((el) => el.scrollWidth)).toBeGreaterThan(5000);
    // Two frames after the change, and a second after it.
    const soon = await page.evaluate(async () => {
      window.slidr!.selection.getState().setCurrentSlide('s_far_25');
      const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
      await frame();
      await frame();
      return Math.abs(document.querySelector('[data-filmstrip]')!.scrollLeft);
    });
    await page.waitForTimeout(1000);
    const later = await strip.evaluate((el) => Math.abs(el.scrollLeft));
    expect(later).toBeGreaterThan(1000);
    if (motion === 'reduce') expect(soon).toBe(later);
    else expect(soon).toBeLessThan(later);
  });
}
