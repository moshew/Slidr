import { expect, test, type Page } from '@playwright/test';
import {
  currentSlide,
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
