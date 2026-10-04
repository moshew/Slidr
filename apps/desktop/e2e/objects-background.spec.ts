import { expect, test, type Locator, type Page } from '@playwright/test';
import type { Background } from '@slidr/model';
import {
  currentSlide,
  deck,
  dragSlider,
  openApp,
  pageProblems,
  pngBytes,
  row,
  steps,
  undo,
  undoDepth,
} from './objects-helpers';

/*
 * The slide background (WG5-T07, SLD-03): row B with nothing selected. The theme's background
 * and its variants, a colour, a gradient or a picture with blur and dim, for one slide or for all
 * of them, and back to the theme's.
 */

async function openBackground(page: Page): Promise<Locator> {
  await row(page).getByRole('button', { name: 'רקע', exact: true }).click();
  const editor = page.getByTestId('background-editor');
  await expect(editor).toBeVisible();
  return editor;
}

const backgroundOf = async (page: Page) => (await currentSlide(page)).background;

/** The background layer the Stage draws: the first child of the slide root. */
const drawn = (page: Page) =>
  page.getByTestId('stage-frame').locator('[data-slidr-background] > div').first();

async function addSlides(page: Page, count: number) {
  await page.evaluate((n) => {
    const { bus } = window.slidr!;
    for (let i = 0; i < n; i++) {
      bus.dispatch({ type: 'slide.add', slide: { id: `s_extra${i}`, elements: [], timeline: [] } });
    }
  }, count);
}

test.afterEach(({ page }) => {
  expect(pageProblems(page)).toEqual([]);
});

test.beforeEach(async ({ page }) => {
  await openApp(page);
  await expect(row(page)).toHaveAttribute('data-selection', 'none');
});

test('the real tool replaces the placeholder, beside the layout tool', async ({ page }) => {
  const button = row(page).getByRole('button', { name: 'רקע', exact: true });
  await expect(button).toBeEnabled();
  // The layout is a real tool too (src/templates), and so is the transition (src/animations).
  await expect(row(page).getByRole('button', { name: 'פריסה' })).toBeEnabled();
  await expect(row(page).getByRole('button', { name: 'מעבר' })).toBeEnabled();
  // Background first, as SPEC 4.4 lists the row.
  const names = await row(page).getByRole('button').allInnerTexts();
  expect(names.slice(0, 3)).toEqual(['רקע', 'פריסה', 'מעבר']);
});

test('a variant of the theme, and back to the theme background', async ({ page }) => {
  const editor = await openBackground(page);
  const theme = (await deck(page)).theme;
  // One choice for the theme background and one for each of its variants.
  await expect(editor.locator('button[aria-pressed]')).toHaveCount(
    1 + theme.backgroundVariants.length,
  );
  await expect(editor.getByRole('button', { name: 'רקע התבנית', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(editor.getByRole('button', { name: 'חזרה לרקע התבנית' })).toBeDisabled();

  expect(await steps(page, () => editor.getByRole('button', { name: 'וריאנט 2' }).click())).toBe(1);
  expect(await backgroundOf(page)).toEqual(theme.backgroundVariants[1]);
  await expect(editor.getByRole('button', { name: 'וריאנט 2' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(drawn(page)).toHaveCSS('background-color', 'rgb(47, 91, 234)');

  expect(
    await steps(page, () => editor.getByRole('button', { name: 'חזרה לרקע התבנית' }).click()),
  ).toBe(1);
  expect(await currentSlide(page)).not.toHaveProperty('background');
  await undo(page);
  expect(await backgroundOf(page)).toEqual(theme.backgroundVariants[1]);
  await undo(page);
  expect(await currentSlide(page)).not.toHaveProperty('background');
});

test('a colour and a gradient for this slide only', async ({ page }) => {
  await addSlides(page, 2);
  const editor = await openBackground(page);
  // A slide always has a background: "none" is not offered.
  await expect(editor.getByRole('radio', { name: 'ללא' })).toHaveCount(0);
  await expect(editor.getByRole('radio', { name: 'מלא' })).toHaveAttribute('data-state', 'on');

  await editor.getByRole('button', { name: 'צבע' }).click();
  const picker = page.getByRole('dialog').last();
  expect(await steps(page, () => picker.getByRole('button', { name: 'הדגשה' }).click())).toBe(1);
  await page.keyboard.press('Escape');
  expect(await backgroundOf(page)).toEqual({ fill: { kind: 'solid', color: { token: 'accent' } } });

  // A drag in the picker is one step.
  await editor.getByRole('button', { name: 'צבע' }).click();
  const area = page.getByRole('dialog').last().getByTestId('color-area');
  const box = (await area.boundingBox())!;
  const dragged = await steps(page, async () => {
    await page.mouse.move(box.x + 30, box.y + 30);
    await page.mouse.down();
    await page.mouse.move(box.x + 90, box.y + 60, { steps: 8 });
    await page.mouse.up();
  });
  expect(dragged).toBe(1);
  await page.keyboard.press('Escape');
  await undo(page);
  expect(await backgroundOf(page)).toEqual({ fill: { kind: 'solid', color: { token: 'accent' } } });

  // The colour becomes the first stop of the gradient.
  expect(await steps(page, () => editor.getByRole('radio', { name: 'הדרגתי' }).click())).toBe(1);
  expect(await backgroundOf(page)).toMatchObject({
    fill: {
      kind: 'linear',
      stops: [
        { color: { token: 'accent' }, at: 0 },
        { color: { token: 'primary' }, at: 1 },
      ],
    },
  });
  await expect(drawn(page)).toHaveCSS('background-image', /linear-gradient/);

  // Only this slide.
  const slides = (await deck(page)).slides;
  expect(slides.map((slide) => Boolean(slide.background))).toEqual([true, false, false]);
  expect((await deck(page)).theme.background).toEqual({
    fill: { kind: 'solid', color: { token: 'bg' } },
  });
});

test('a picture with blur and dim', async ({ page }) => {
  const bytes = await pngBytes(page, ['#0f9d8a', '#15171a'], [1600, 900]);
  const editor = await openBackground(page);
  const chooser = page.waitForEvent('filechooser');
  const before = await undoDepth(page);
  await editor.getByRole('radio', { name: 'תמונה' }).click();
  await (await chooser).setFiles({ name: 'sky.png', mimeType: 'image/png', buffer: bytes });
  await expect(editor.getByRole('slider', { name: 'טשטוש' })).toBeVisible();

  let background = (await backgroundOf(page)) as Background;
  expect(background.fill).toMatchObject({ kind: 'image', fit: 'cover' });
  expect(await undoDepth(page)).toBe(before + 1);
  await expect(drawn(page)).toHaveCSS('background-image', /^url\("blob:/);

  expect(
    await steps(page, () => dragSlider(page, editor.getByRole('slider', { name: 'טשטוש' }), -50)),
  ).toBe(1);
  background = (await backgroundOf(page)) as Background;
  expect(background.blur).toBeGreaterThan(0);
  await expect(drawn(page)).toHaveCSS('filter', /blur/);

  const dim = editor.getByRole('textbox', { name: 'הכהיה' });
  await dim.fill('40');
  expect(await steps(page, () => dim.press('Enter'))).toBe(1);
  background = (await backgroundOf(page)) as Background;
  expect(background.dim).toBe(0.4);

  // Zero is stored as absent.
  const blur = editor.getByRole('textbox', { name: 'טשטוש' });
  await blur.fill('0');
  await blur.press('Enter');
  expect(await backgroundOf(page)).not.toHaveProperty('blur');

  // With the photo go its blur and dim.
  await editor.getByRole('radio', { name: 'מלא' }).click();
  expect(await backgroundOf(page)).toEqual({ fill: { kind: 'solid', color: { token: 'bg' } } });
  await expect(editor.getByRole('slider', { name: 'הכהיה' })).toHaveCount(0);

  while ((await undoDepth(page)) > before) await undo(page);
  expect(await currentSlide(page)).not.toHaveProperty('background');
  expect(Object.keys((await deck(page)).assets)).toHaveLength(0);
});

test('apply to all slides, and undo it as one step', async ({ page }) => {
  await addSlides(page, 2);
  // Another slide has a background of its own, which "all" replaces.
  await page.evaluate(() =>
    window.slidr!.bus.dispatch({
      type: 'slide.update',
      slideId: 's_extra1',
      patch: { background: { fill: { kind: 'solid', color: { token: 'surface' } } } },
    }),
  );
  const editor = await openBackground(page);
  const all = editor.getByRole('button', { name: 'החלה על כל השקפים' });

  await editor.getByRole('button', { name: 'וריאנט 2' }).click();
  const chosen = await backgroundOf(page);
  const before = await deck(page);
  expect(await steps(page, () => all.click())).toBe(1);

  const after = await deck(page);
  // It is the deck's background now: the theme has it, and no slide overrides it.
  expect(after.theme.background).toEqual(chosen);
  expect(after.slides.map((slide) => slide.background)).toEqual([undefined, undefined, undefined]);
  await expect(all).toBeDisabled();

  await undo(page);
  expect(await deck(page)).toEqual(before);
  await expect(all).toBeEnabled();

  // Again, and then a new slide: it gets the background too.
  await all.click();
  await page.keyboard.press('Escape');
  await page.getByTestId('new-slide').click();
  await expect.poll(async () => (await deck(page)).slides.length).toBe(4);
  await expect(drawn(page)).toHaveCSS('background-color', 'rgb(47, 91, 234)');
});

test('the background of another slide is edited after going to it', async ({ page }) => {
  await addSlides(page, 1);
  await page.evaluate(() => window.slidr!.selection.getState().setCurrentSlide('s_extra0'));
  const editor = await openBackground(page);
  await editor.getByRole('button', { name: 'וריאנט 1' }).click();
  const slides = (await deck(page)).slides;
  expect(slides.map((slide) => Boolean(slide.background))).toEqual([false, true]);
});

test('in English', async ({ page }) => {
  await openApp(page, { lang: 'en' });
  await row(page).getByRole('button', { name: 'Background', exact: true }).click();
  const editor = page.getByTestId('background-editor');
  await expect(editor.getByText('Theme backgrounds')).toBeVisible();
  await expect(editor.getByRole('button', { name: 'Apply to all slides' })).toBeDisabled();
  await editor.getByRole('radio', { name: 'Gradient' }).click();
  await expect(editor.getByRole('radio', { name: 'Linear' })).toHaveAttribute('data-state', 'on');
  await expect(editor.getByRole('button', { name: 'Back to the theme background' })).toBeEnabled();
});
