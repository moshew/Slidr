import { expect, test, type Page } from '@playwright/test';
import {
  currentSlide,
  FHD,
  idle,
  LAPTOP,
  openApp,
  setCurrentSlide,
  shot,
  show,
  showState,
  undoSteps,
} from './runtime-app-helpers';

// Present mode in the app (WG8-T06, T07): the row A button and F5 start a show of the open deck
// over the whole window, played by the runtime; Esc ends it. The deck is the runtime's `probe`
// deck, whose steps the runtime's own suite names (runtime-player.spec.ts).

test.use({ viewport: FHD });

const visibility = (page: Page, id: string) =>
  page.evaluate(
    (elementId) =>
      getComputedStyle(
        document.querySelector(
          `[data-testid="present"] [data-element-id="${elementId}"]`,
        ) as Element,
      ).visibility,
    id,
  );

test('the Present button shows the slide on the Stage, over the whole window', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await openApp(page, { deck: 'probe' });
  await setCurrentSlide(page, 's_probe_b');
  await page.getByRole('button', { name: 'הצגה' }).click();
  const view = await show(page);
  expect(await showState(page)).toEqual({ slide: 1, step: 0 });
  const box = await view.boundingBox();
  expect(box).toMatchObject({ x: 0, y: 0 });
  // The stage is fitted into the screen and centred, with black around it.
  const stage = await view.locator('> div').first().boundingBox();
  expect(stage?.width).toBeCloseTo(Math.min(box!.width, (box!.height * 16) / 9), 0);
  expect(stage!.x + stage!.width / 2).toBeCloseTo(box!.width / 2, 0);
  // The slide is played in from its start: its lead-in brings the title in word by word.
  await idle(page);
  expect(await visibility(page, 'q_title')).toBe('visible');
  expect(await visibility(page, 'q_mixed')).toBe('hidden');

  await page.keyboard.press('Escape');
  await expect(view).toHaveCount(0);
  await expect(page.getByTestId('stage-surface')).toBeFocused();
  expect(errors).toEqual([]);
});

test('F5 starts from the first slide, Shift+F5 from the current one', async ({ page }) => {
  await openApp(page, { deck: 'probe' });
  await setCurrentSlide(page, 's_probe_c');
  await page.getByTestId('stage-surface').focus();
  await page.keyboard.press('F5');
  await show(page);
  expect(await showState(page)).toEqual({ slide: 0, step: 0 });
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('present')).toHaveCount(0);
  // Ended on the first slide: the editor is on it now.
  expect(await currentSlide(page)).toBe('s_probe_a');

  await setCurrentSlide(page, 's_probe_c');
  await page.keyboard.press('Shift+F5');
  await show(page);
  expect(await showState(page)).toEqual({ slide: 3, step: 0 });
  await page.keyboard.press('Escape');
});

test('the keys are the show’s: steps, transitions, and nothing reaches the editor', async ({
  page,
}) => {
  await openApp(page, { deck: 'probe' });
  // One change, so there is something Ctrl+Z could undo.
  await page.evaluate(() =>
    window.slidr!.bus.dispatch({
      type: 'slide.update',
      slideId: 's_probe_a',
      patch: { name: 'Renamed' },
    }),
  );
  const steps = await undoSteps(page);
  await page.keyboard.press('F5');
  await show(page);
  await idle(page);
  expect(await visibility(page, 'p_box1')).toBe('hidden');
  await page.keyboard.press('ArrowRight');
  expect(await showState(page)).toEqual({ slide: 0, step: 1 });
  await idle(page);
  expect(await visibility(page, 'p_box1')).toBe('visible');
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+d');
  await page.keyboard.press('Delete');
  expect(await undoSteps(page)).toBe(steps);
  expect(await page.evaluate(() => window.slidr!.bus.deck.slides[0]?.name)).toBe('Renamed');

  // Through the six clicks of the slide and on, with the push into the next one.
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight');
  expect(await showState(page)).toEqual({ slide: 0, step: 6 });
  await page.keyboard.press('PageDown');
  expect(await showState(page)).toEqual({ slide: 1, step: 0 });
  await idle(page);
  // The hidden slide is skipped.
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  expect(await showState(page)).toEqual({ slide: 3, step: 0 });
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('present')).toHaveCount(0);
  expect(await currentSlide(page)).toBe('s_probe_c');
  // The editor has its keys back.
  await page.keyboard.press('Control+z');
  expect(await undoSteps(page)).toBe(steps - 1);
});

test('B and W blank the screen, and a number with Enter jumps to that slide', async ({ page }) => {
  await openApp(page, { deck: 'probe' });
  await page.keyboard.press('F5');
  const view = await show(page);
  await page.keyboard.press('b');
  const blank = view.locator('[data-slidr-blank]');
  await expect(blank).toHaveAttribute('data-slidr-blank', 'black');
  expect(await blank.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(0, 0, 0)');
  expect(await blank.boundingBox()).toEqual(await view.boundingBox());
  await page.keyboard.press('w');
  await expect(blank).toHaveAttribute('data-slidr-blank', 'white');
  // A click brings the show back, and is not a step.
  await view.click({ position: { x: 300, y: 300 } });
  await expect(blank).toHaveCount(0);
  expect(await showState(page)).toEqual({ slide: 0, step: 0 });

  await page.keyboard.press('4');
  await expect(view.locator('[data-slidr-goto]')).toHaveText('4 / 4');
  await page.keyboard.press('Enter');
  expect(await showState(page)).toEqual({ slide: 3, step: 0 });
  await expect(view.locator('[data-slidr-goto]')).toHaveCount(0);
  // By number the hidden slide is shown too.
  await page.keyboard.press('3');
  await page.keyboard.press('Enter');
  expect(await showState(page)).toEqual({ slide: 2, step: 0 });
  await page.keyboard.press('Escape');
});

test('a click is a step, and the bar shows while the pointer moves', async ({ page }) => {
  await openApp(page, { deck: 'probe' });
  await page.keyboard.press('F5');
  const view = await show(page);
  await idle(page);
  const bar = page.getByTestId('present-controls');
  await expect(bar).toHaveAttribute('data-visible', 'false');
  expect(await view.evaluate((el) => getComputedStyle(el).cursor)).toBe('none');
  await view.click({ position: { x: 600, y: 600 } });
  expect(await showState(page)).toEqual({ slide: 0, step: 1 });

  await page.mouse.move(700, 500);
  await page.mouse.move(720, 520);
  await expect(bar).toHaveAttribute('data-visible', 'true');
  await expect(bar).toContainText('1 / 4');
  await bar.getByRole('button', { name: 'קדימה' }).click();
  expect(await showState(page)).toEqual({ slide: 0, step: 2 });
  await bar.getByRole('button', { name: 'אחורה' }).click();
  expect(await showState(page)).toEqual({ slide: 0, step: 1 });
  // After a click on the bar the keys still drive the show.
  await page.keyboard.press('ArrowRight');
  expect(await showState(page)).toEqual({ slide: 0, step: 2 });
  await page.mouse.move(700, 500);
  await bar.getByRole('button', { name: 'סיום ההצגה' }).click();
  await expect(view).toHaveCount(0);
});

test('the show takes the whole screen, and leaving full screen ends it', async ({ page }) => {
  await openApp(page, { deck: 'probe' });
  await page.getByRole('button', { name: 'הצגה' }).click();
  const view = await show(page);
  await expect
    .poll(() => page.evaluate(() => document.fullscreenElement?.getAttribute('data-testid')))
    .toBe('present');
  // What Esc does in a browser's full screen, where the key never reaches the page.
  await page.evaluate(() => document.exitFullscreen());
  await expect(view).toHaveCount(0);
});

test('an RTL deck plays mirrored, in a window whose UI is English', async ({ page }) => {
  await openApp(page, { deck: 'probe-rtl', lang: 'en' });
  await page.keyboard.press('F5');
  await show(page);
  await idle(page);
  const from = await page.evaluate(() => {
    const view = document.querySelector('[data-testid="present"]') as HTMLElement;
    view.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    const box = view.querySelector('[data-element-id="p_box1"]') as HTMLElement;
    const frames = (box.getAnimations()[0]?.effect as KeyframeEffect).getKeyframes();
    return parseFloat(String(frames[0]?.translate));
  });
  // `start` is rightwards in RTL: the box that flies towards the start comes from the left.
  expect(from).toBeLessThan(0);
  await page.keyboard.press('Escape');
});

for (const theme of ['light', 'dark'] as const) {
  for (const lang of ['he', 'en'] as const) {
    test(`the bar over a slide: ${theme}, ${lang}`, async ({ page }) => {
      await openApp(page, { deck: 'probe', lang, theme });
      await page.keyboard.press('F5');
      const view = await show(page);
      await idle(page);
      await page.keyboard.press('ArrowRight');
      await idle(page);
      await page.mouse.move(900, 900);
      await page.mouse.move(960, 990);
      const bar = page.getByTestId('present-controls');
      await expect(bar).toHaveAttribute('data-visible', 'true');
      await bar.getByRole('button').last().hover();
      await expect(page.getByRole('tooltip')).toBeVisible();
      // The bar is dark in both themes, and reads left to right in both languages.
      expect(await bar.evaluate((el) => getComputedStyle(el).direction)).toBe('ltr');
      await view.screenshot({ path: shot(`show-${theme}-${lang}`) });
      await page.keyboard.press('Escape');
    });
  }
}

test('the show at 1366x768', async ({ page }) => {
  await page.setViewportSize(LAPTOP);
  await openApp(page, { deck: 'probe' });
  await page.keyboard.press('F5');
  const view = await show(page);
  await idle(page);
  await page.mouse.move(600, 600);
  await page.mouse.move(640, 640);
  await expect(page.getByTestId('present-controls')).toHaveAttribute('data-visible', 'true');
  await view.screenshot({ path: shot('show-light-he-1366') });
  await page.keyboard.press('Escape');
});
