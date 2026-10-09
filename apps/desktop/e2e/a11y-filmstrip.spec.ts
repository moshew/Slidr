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
 * that are not next to each other without the pointer, and marks a slide's animations beside the
 * number and its transition between it and the slide before, where a press opens it.
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

/** The mark of the transition into a slide, in the gap before it, and the button in it. */
const transitionMark = (page: Page, slideId: string) =>
  strip(page).locator(`[data-testid="slide-transition"][data-into="${slideId}"]`);

for (const lang of ['he', 'en'] as const) {
  test(`a transition is marked between its two slides, and animations beside the number, ${lang}`, async ({
    page,
  }) => {
    await openApp(page, { lang });
    const [one, two, three] = await slides(page, 3);
    // The second slide is the one looked at: no slide is before the first, so nothing is drawn
    // of a transition into it.
    await page.evaluate((id) => window.slidr!.selection.getState().setCurrentSlide(id), two!);
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
      ({ two, three, steps }) => {
        const { bus } = window.slidr!;
        const transition = {
          type: 'fade',
          duration: 400,
          easing: 'ease',
          advance: { onClick: true },
        };
        bus.batch([
          { type: 'slide.update', slideId: two, patch: { transition } },
          { type: 'slide.setTimeline', slideId: two, timeline: steps },
          // A transition of "none" is no transition, and gets no mark.
          {
            type: 'slide.update',
            slideId: three,
            patch: { transition: { ...transition, type: 'none' } },
          },
        ] as never);
      },
      { two: two!, three: three!, steps: [step('a_1'), step('a_2')] },
    );

    const second = thumb(page, two!);
    const transition = transitionMark(page, two!).getByRole('button');
    const animations = second.getByTestId('slide-animations-mark');
    await expect(transition).toBeVisible();
    await expect(transition).toHaveAccessibleName(
      lang === 'he' ? 'המעבר אל שקף 2: עמעום' : 'Transition into slide 2: Fade',
    );
    // It is the picture of its kind, not one picture for every transition.
    await expect(transition.locator('svg')).toHaveClass(/lucide-contrast/);
    await expect(animations).toBeVisible();
    // A screen reader hears both as the description of the slide.
    await expect(second).toHaveAccessibleDescription(
      lang === 'he' ? /יש מעבר.*שתי אנימציות/ : /Has a transition.*2 animations/,
    );
    await expect(thumb(page, three!).getByTestId('slide-animations-mark')).toHaveCount(0);
    await expect(thumb(page, three!)).toHaveAccessibleDescription('');

    // The transition lies where it plays: between the slide before and its own, at their height,
    // in the reading direction of the UI.
    const before = (await thumb(page, one!).locator('.slidr-slide').boundingBox())!;
    const picture = (await second.locator('.slidr-slide').boundingBox())!;
    const at = (await transition.boundingBox())!;
    const [left, right] = lang === 'he' ? [picture, before] : [before, picture];
    const middle = at.x + at.width / 2;
    expect(middle).toBeGreaterThan(left.x + left.width);
    expect(middle).toBeLessThan(right.x);
    expect(at.y).toBeGreaterThan(picture.y);
    expect(at.y + at.height).toBeLessThan(picture.y + picture.height);
    // The animations stay beside the number and not over the picture. By the middle of the mark:
    // the row of the number begins a pixel inside the picture's box, to stay clear of the
    // strip's scrollbar.
    const moving = (await animations.boundingBox())!;
    expect(moving.y + moving.height / 2).toBeGreaterThan(picture.y + picture.height);

    // A gap without a transition keeps an offer of one out of sight until the pointer is near;
    // no slide is before the first one, so no mark is.
    const offer = transitionMark(page, three!).getByRole('button');
    await expect(transitionMark(page, three!)).not.toHaveAttribute('data-transition');
    await expect(offer).toHaveCSS('opacity', '0');
    await transitionMark(page, three!).hover({ position: { x: 2, y: 2 } });
    await expect(offer).toHaveCSS('opacity', '1');
    await expect(offer).toHaveAccessibleName(
      lang === 'he' ? 'הוספת מעבר אל שקף 3' : 'Add a transition into slide 3',
    );
    // The offer has the picture of transitions as such, which the panel of them has too.
    await expect(offer.locator('svg')).toHaveClass(/lucide-blend/);
    await expect(transitionMark(page, one!)).toHaveCount(0);

    // One animation is said as one, in the grammar of the language.
    await page.evaluate(
      ({ two, steps }) =>
        window.slidr!.bus.dispatch({
          type: 'slide.setTimeline',
          slideId: two,
          timeline: steps,
        } as never),
      { two: two!, steps: [step('a_1')] },
    );
    await expect(second).toHaveAccessibleDescription(
      lang === 'he' ? /אנימציה אחת/ : /1 animation$/,
    );
  });
}

test('a press on the mark between two slides opens the transition into the second', async ({
  page,
}) => {
  await openApp(page, { lang: 'en' });
  const [one, two, three] = await slides(page, 3);
  await page.evaluate(
    (ids) => window.slidr!.selection.getState().selectSlides(ids, ids[0]),
    [one!, two!],
  );

  // The offer in the gap before the third slide: the slide is the current one, alone, as by a
  // press on it, and its transition is open in the panel.
  await transitionMark(page, three!).hover();
  await transitionMark(page, three!).getByRole('button').click();
  expect(await currentSlide(page)).toBe(three);
  expect(await selectedSlides(page)).toEqual([three]);
  await expect(list(page)).toBeFocused();
  const panel = page.getByTestId('transitions-panel');
  await expect(panel).toBeVisible();

  // What is chosen there is the transition into that slide, and the mark shows it.
  await panel.locator('[data-transition="push"]').click();
  expect(
    await page.evaluate(() => window.slidr!.bus.deck.slides.map((s) => s.transition?.type ?? null)),
  ).toEqual([null, null, 'push']);
  await expect(transitionMark(page, three!)).toHaveAttribute('data-transition', 'push');
  await expect(transitionMark(page, three!).getByRole('button')).toHaveAccessibleName(
    'Transition into slide 3: Push',
  );
  await expect(transitionMark(page, three!).locator('svg')).toHaveClass(/lucide-chevrons-right/);
  // It stays in sight once the pointer is away, and a press on it leads back to the same place.
  await page.getByTestId('stage-surface').hover();
  await expect(transitionMark(page, three!).getByRole('button')).toHaveCSS('opacity', '1');
  await thumb(page, one!).click();
  await transitionMark(page, three!).getByRole('button').click();
  expect(await currentSlide(page)).toBe(three);
  await expect(panel.locator('[data-transition="push"]')).toHaveAttribute('aria-checked', 'true');

  // The marks are no stops of Tab: the list, then the "new slide" button, as before.
  await focusFilmstrip(page);
  await page.keyboard.press('Tab');
  await expect(page.getByTestId('new-slide')).toBeFocused();

  // No mark is drawn while slides are dragged: the place they would land in is drawn there.
  const from = (await thumb(page, one!).boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + 40);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 30, from.y + 40, { steps: 3 });
  await expect(strip(page).getByTestId('slide-transition')).toHaveCount(0);
  await page.mouse.move(from.x + from.width / 2, from.y + 40, { steps: 3 });
  await page.mouse.up();
  await expect(strip(page).getByTestId('slide-transition')).toHaveCount(2);
  expect(await slideIds(page)).toEqual([one, two, three]);
});
