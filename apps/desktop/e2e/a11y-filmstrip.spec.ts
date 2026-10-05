import { expect, test, type Page } from '@playwright/test';
import {
  addBoxes,
  currentSlide,
  focusFilmstrip,
  openApp,
  selectedSlides,
  slideIds,
  thumb,
} from './arrange-helpers';

/*
 * The Filmstrip for the keyboard and for a screen reader (WG13-T06, UI-06, FLM-04): a list with a
 * name that holds slides and nothing else, says which slide the keyboard is on and how many there
 * are, shows that it has the keyboard, opens its menu about the current slide, selects slides
 * that are not next to each other without the pointer, and marks a slide's transition and its
 * animations beside the number.
 */

const strip = (page: Page) => page.locator('[data-filmstrip]');
const list = (page: Page) => page.getByTestId('filmstrip').getByRole('listbox');
const said = (page: Page) => page.getByTestId('stage-keyboard');

/** Slides 2 to `count` after the first one; the first stays the current slide. */
async function slides(page: Page, count: number): Promise<string[]> {
  await page.evaluate((n) => {
    const { bus, selection } = window.slidr!;
    const first = selection.getState().currentSlideId!;
    bus.batch(
      Array.from({ length: n - 1 }, (_, i) => ({
        type: 'slide.add' as const,
        slide: { id: `s_${i + 2}`, name: `Slide ${i + 2}`, elements: [], timeline: [] },
      })),
    );
    selection.getState().setCurrentSlide(first);
  }, count);
  return slideIds(page);
}

for (const lang of ['he', 'en'] as const) {
  test(`the strip is a named list of slides and nothing else, ${lang}`, async ({ page }) => {
    await openApp(page, { lang });
    const [one, two] = await slides(page, 5);
    await expect(list(page)).toHaveAccessibleName(lang === 'he' ? 'שקפים' : 'Slides');
    // Only slides are in the list: the "new slide" button is beside it, not inside it.
    await expect(list(page).locator('button')).toHaveCount(0);
    await expect(list(page).getByRole('option')).toHaveCount(5);
    const add = page.getByTestId('new-slide');
    await expect(add).toBeVisible();
    // It is still the next stop of Tab after the list, and still adds a slide.
    await focusFilmstrip(page);
    await page.keyboard.press('Tab');
    await expect(add).toBeFocused();

    // The list says where the keyboard is, and how long it is: a screen reader says "1 of 5".
    await focusFilmstrip(page);
    const active = async () => {
      const id = await list(page).getAttribute('aria-activedescendant');
      return id ? page.locator(`[id="${id}"]`).getAttribute('data-slide-id') : null;
    };
    expect(await active()).toBe(one);
    await expect(thumb(page, one!)).toHaveAttribute('aria-posinset', '1');
    await expect(thumb(page, one!)).toHaveAttribute('aria-setsize', '5');
    await page.keyboard.press(lang === 'he' ? 'ArrowLeft' : 'ArrowRight');
    expect(await currentSlide(page)).toBe(two);
    expect(await active()).toBe(two);
    await expect(thumb(page, two!)).toHaveAttribute('aria-posinset', '2');
  });
}

test('the strip shows that it has the keyboard, and not after a press of the pointer', async ({
  page,
}) => {
  await openApp(page, { lang: 'en' });
  await slides(page, 3);
  const outline = () => strip(page).evaluate((node) => getComputedStyle(node).outlineStyle);
  expect(await outline()).toBe('none');
  // By Tab from the Stage.
  await page.getByTestId('stage-surface').focus();
  await page.keyboard.press('Tab');
  await expect(list(page)).toBeFocused();
  expect(await outline()).toBe('solid');
  // A press on a slide: the picture's own frame says which slide, and no ring is added.
  const box = (await thumb(page, 's_2').boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + 40);
  await expect(list(page)).toBeFocused();
  expect(await outline()).toBe('none');
  // Once the keys take over, the ring is back.
  await page.keyboard.press('ArrowRight');
  expect(await outline()).toBe('solid');
});

test('the menu opened from the keyboard is about the current slide, and opens beside it', async ({
  page,
}) => {
  await openApp(page, { lang: 'en' });
  const [one] = await slides(page, 5);
  await focusFilmstrip(page);
  // The middle of the strip, where a menu from the keyboard used to be asked for, is not on
  // the current slide: that is what this test needs.
  const whole = (await strip(page).boundingBox())!;
  const first = (await thumb(page, one!).boundingBox())!;
  const middle = whole.x + whole.width / 2;
  expect(middle < first.x || middle > first.x + first.width).toBe(true);

  await page.keyboard.press('Shift+F10');
  const menu = page.getByTestId('slide-menu');
  await expect(menu).toBeVisible();
  // The slide's own items are offered, and the current slide is still the first.
  await expect(menu.getByRole('menuitem', { name: 'Hide' })).toBeVisible();
  expect(await currentSlide(page)).toBe(one);
  expect(await selectedSlides(page)).toEqual([one]);
  // It opens at the slide it is about, not in the middle of the strip.
  const at = (await menu.boundingBox())!;
  expect(at.x).toBeGreaterThanOrEqual(first.x);
  expect(at.x).toBeLessThanOrEqual(first.x + first.width);

  await menu.getByRole('menuitem', { name: 'Hide' }).press('Enter');
  await expect(thumb(page, one!)).toHaveAttribute('data-hidden', 'true');
  expect(
    await page.evaluate(() => window.slidr!.bus.deck.slides.map((slide) => Boolean(slide.hidden))),
  ).toEqual([true, false, false, false, false]);
  // The keyboard is back on the list when the menu closes.
  await expect(list(page)).toBeFocused();
});

test('slides that are not next to each other are selected from the keyboard', async ({ page }) => {
  await openApp(page, { lang: 'en' });
  const [one, two, three, four] = await slides(page, 5);
  await focusFilmstrip(page);

  // Alt with Down goes on along the strip without selecting, as it does on the Stage.
  await page.keyboard.press('Alt+ArrowDown');
  await expect(thumb(page, two!)).toHaveAttribute('data-walk', 'true');
  expect(await selectedSlides(page)).toEqual([one]);
  expect(await currentSlide(page)).toBe(one);
  await expect(said(page)).toHaveText('Slide 2: not in the selection');
  await page.keyboard.press('Alt+ArrowDown');
  await expect(thumb(page, three!)).toHaveAttribute('data-walk', 'true');
  await expect(thumb(page, two!)).not.toHaveAttribute('data-walk');
  // The list says the walked slide is where the keyboard is.
  const id = await list(page).getAttribute('aria-activedescendant');
  expect(await page.locator(`[id="${id}"]`).getAttribute('data-slide-id')).toBe(three);

  // Alt+Enter adds it: the first and the third, and not the second between them.
  await page.keyboard.press('Alt+Enter');
  expect(await selectedSlides(page)).toEqual([one, three]);
  await expect(thumb(page, one!)).toHaveAttribute('aria-selected', 'true');
  await expect(thumb(page, two!)).toHaveAttribute('aria-selected', 'false');
  await expect(thumb(page, three!)).toHaveAttribute('aria-selected', 'true');
  await expect(said(page)).toHaveText('Slide 3: in the selection');

  // What is selected is what the keys of the strip then act on: both go to the end together.
  await page.keyboard.press('Control+End');
  expect(await slideIds(page)).toEqual([two, four, 's_5', one, three]);
  await page.evaluate(() => window.slidr!.bus.undo());
  expect(await slideIds(page)).toEqual([one, two, three, four, 's_5']);

  // Back along the strip, and out of the selection again.
  await page.keyboard.press('Alt+ArrowUp');
  await page.keyboard.press('Alt+ArrowUp');
  await expect(thumb(page, one!)).toHaveAttribute('data-walk', 'true');
  await page.keyboard.press('Alt+Enter');
  expect(await selectedSlides(page)).toEqual([three]);
  // At the start there is nowhere further back: the walk stays.
  await page.keyboard.press('Alt+ArrowUp');
  await expect(thumb(page, one!)).toHaveAttribute('data-walk', 'true');

  // Esc ends the walk and keeps the selection; a plain arrow is a selection of its own.
  await page.keyboard.press('Escape');
  await expect(strip(page).locator('[data-walk]')).toHaveCount(0);
  await expect(said(page)).toHaveText('');
  expect(await selectedSlides(page)).toEqual([three]);
  await page.keyboard.press('Alt+ArrowDown');
  await expect(strip(page).locator('[data-walk]')).toHaveCount(1);
  await page.keyboard.press('ArrowRight');
  await expect(strip(page).locator('[data-walk]')).toHaveCount(0);
  expect(await selectedSlides(page)).toEqual([four]);
});

test('on the Stage the same keys still walk the elements, not the slides', async ({ page }) => {
  await openApp(page, { lang: 'en' });
  await slides(page, 3);
  await addBoxes(page, [
    { id: 'e_a', x: 100, y: 100, w: 100, h: 100 },
    { id: 'e_b', x: 400, y: 300, w: 200, h: 100 },
  ]);
  await page.getByTestId('stage-surface').focus();
  await page.keyboard.press('Alt+ArrowDown');
  await expect(page.getByTestId('stage-surface').locator('[data-walk="e_a"]')).toBeVisible();
  await expect(strip(page).locator('[data-walk]')).toHaveCount(0);
});

for (const lang of ['he', 'en'] as const) {
  test(`a slide's transition and its animations are marked beside its number, ${lang}`, async ({
    page,
  }) => {
    await openApp(page, { lang });
    const [one, two, three] = await slides(page, 3);
    await addBoxes(page, [{ id: 'e_a', x: 100, y: 100, w: 300, h: 200 }]);
    const step = (id: string) => ({
      id,
      elementId: 'e_a',
      trigger: 'onClick' as const,
      category: 'entrance' as const,
      preset: 'fade',
      duration: 400,
      delay: 0,
      easing: 'ease',
    });
    await page.evaluate(
      ({ one, two, steps }) => {
        const { bus } = window.slidr!;
        const transition = {
          type: 'fade',
          duration: 400,
          easing: 'ease',
          advance: { onClick: true },
        };
        bus.batch([
          { type: 'slide.update', slideId: one, patch: { transition } },
          { type: 'slide.setTimeline', slideId: one, timeline: steps },
          // A transition of "none" is no transition, and gets no mark.
          {
            type: 'slide.update',
            slideId: two,
            patch: { transition: { ...transition, type: 'none' } },
          },
        ] as never);
      },
      { one: one!, two: two!, steps: [step('a_1'), step('a_2')] },
    );

    const first = thumb(page, one!);
    const transition = first.getByTestId('slide-transition-mark');
    const animations = first.getByTestId('slide-animations-mark');
    await expect(transition).toBeVisible();
    await expect(animations).toBeVisible();
    // A screen reader hears both as the description of the slide.
    await expect(first).toHaveAccessibleDescription(
      lang === 'he' ? /יש מעבר.*שתי אנימציות/ : /Has a transition.*2 animations/,
    );
    await expect(thumb(page, two!).getByTestId('slide-transition-mark')).toHaveCount(0);
    await expect(thumb(page, three!).getByTestId('slide-animations-mark')).toHaveCount(0);
    await expect(thumb(page, three!)).toHaveAccessibleDescription('');

    // Beside the number and not over the picture: the thumbnail stays the slide as it is drawn.
    const picture = (await first.locator('.slidr-slide').boundingBox())!;
    for (const mark of [transition, animations]) {
      const box = (await mark.boundingBox())!;
      expect(box.y).toBeGreaterThanOrEqual(picture.y + picture.height);
    }

    // One animation is said as one, in the grammar of the language.
    await page.evaluate(
      ({ one, steps }) =>
        window.slidr!.bus.dispatch({
          type: 'slide.setTimeline',
          slideId: one,
          timeline: steps,
        } as never),
      { one: one!, steps: [step('a_1')] },
    );
    await expect(first).toHaveAccessibleDescription(lang === 'he' ? /אנימציה אחת/ : /1 animation$/);
  });
}
