import { expect, test, type Page } from '@playwright/test';
import { addBoxes, openApp, THREE } from './arrange-helpers';
import { addElement, importPicture, line } from './objects-helpers';

/*
 * Pictures for the design gate (DSN-09) of what the keyboard pass draws on the Stage (WG13-T06):
 * the ring of the Stage itself, the selection walk, the point of a line and the crop handle the
 * keyboard is on. In the light and the dark scheme, in Hebrew and in English. Nothing is compared:
 * the pictures are for a person, under `test-results/a11y/` (not in git).
 */

const DIR = 'test-results/a11y';
const surface = (page: Page) => page.getByTestId('stage-surface');

const combinations = (['he', 'en'] as const).flatMap((lang) =>
  (['light', 'dark'] as const).map((theme) => ({ lang, theme })),
);

/**
 * Brings the keyboard to the Stage the way a person does, with Tab from the tool before it, and
 * not with `focus()` from the test: the Stage shows its ring while the keyboard is what the user
 * works with, which is from a key pressed until the next press of the pointer.
 */
async function tabToStage(page: Page) {
  await page.getByTestId('top-tools-b').getByRole('button').last().focus();
  await page.keyboard.press('Tab');
  await expect(surface(page)).toBeFocused();
}

/** The Stage region with the row of tools above it: where the keyboard is, and what it can do. */
async function shoot(page: Page, name: string) {
  // The rings are drawn a frame after the key.
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  await page.getByTestId('editor').screenshot({ path: `${DIR}/${name}.png` });
}

for (const { lang, theme } of combinations) {
  const tag = `${lang}-${theme}`;

  test(`the selection walk, ${tag}`, async ({ page }) => {
    await openApp(page, { lang, theme });
    await addBoxes(page, THREE);
    await tabToStage(page);
    // A is selected; the walk stands on C, which is not.
    await page.keyboard.press('Tab');
    await page.keyboard.press('Alt+ArrowDown');
    await page.keyboard.press('Alt+ArrowDown');
    await expect(surface(page).locator('[data-walk="e_c"]')).toBeVisible();
    await shoot(page, `walk-${tag}`);
  });

  test(`a point of a line, ${tag}`, async ({ page }) => {
    await openApp(page, { lang, theme });
    await addElement(page, line({ stroke: { color: { token: 'primary' }, width: 6 } }));
    await tabToStage(page);
    await page.keyboard.press('Enter');
    await page.keyboard.press('Insert');
    await expect(surface(page).locator('[data-line-point="1"]')).toHaveAttribute(
      'data-active',
      'true',
    );
    await shoot(page, `line-point-${tag}`);
  });

  test(`a crop handle, ${tag}`, async ({ page }) => {
    await openApp(page, { lang, theme });
    const assetId = await importPicture(page, 'picture.png', ['#2f5bea', '#f59e0b'], [1200, 800]);
    await addElement(page, {
      id: 'e_picture',
      type: 'image',
      frame: { x: 660, y: 340, w: 600, h: 400 },
      assetId,
      fit: 'cover',
    });
    await tabToStage(page);
    await page.keyboard.press('Enter');
    await expect(surface(page)).toHaveAttribute('data-cropping', 'e_picture');
    // The top right corner, brought in a little so the picture outside the frame shows.
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    for (let i = 0; i < 6; i++) await page.keyboard.press('Shift+ArrowLeft');
    for (let i = 0; i < 4; i++) await page.keyboard.press('Shift+ArrowDown');
    await expect(surface(page).locator('[data-crop-handle="ne"]')).toHaveAttribute(
      'data-active',
      'true',
    );
    await shoot(page, `crop-handle-${tag}`);
  });
}

for (const { lang, theme } of combinations) {
  test(`the Filmstrip: its ring, the walk and the marks of a slide, ${lang}-${theme}`, async ({
    page,
  }) => {
    await openApp(page, { lang, theme });
    await addBoxes(page, THREE);
    await page.evaluate(() => {
      const { bus, selection } = window.slidr!;
      const first = selection.getState().currentSlideId!;
      const step = (id: string, elementId: string) => ({
        id,
        elementId,
        trigger: 'onClick' as const,
        category: 'entrance' as const,
        preset: 'fade',
        duration: 400,
        delay: 0,
        easing: 'ease',
      });
      bus.batch([
        ...[2, 3, 4].map((n) => ({
          type: 'slide.add' as const,
          slide: { id: `s_${n}`, name: `Slide ${n}`, elements: [], timeline: [] },
        })),
        {
          type: 'slide.update',
          slideId: first,
          patch: {
            transition: { type: 'fade', duration: 400, easing: 'ease', advance: { onClick: true } },
          },
        },
        {
          type: 'slide.setTimeline',
          slideId: first,
          timeline: [step('a_1', 'e_a'), step('a_2', 'e_b')],
        },
        { type: 'slide.update', slideId: 's_3', patch: { hidden: true } },
      ] as never);
      selection.getState().setCurrentSlide(first);
    });
    // By Tab from the Stage, so the strip shows its ring; then the walk goes on two slides.
    await tabToStage(page);
    await page.keyboard.press('F6');
    await expect(page.getByTestId('filmstrip').getByRole('listbox')).toBeFocused();
    await page.keyboard.press('Alt+ArrowDown');
    await page.keyboard.press('Alt+ArrowDown');
    await expect(page.locator('[data-filmstrip] [data-walk]')).toHaveCount(1);
    await page.evaluate(
      () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
    );
    await page
      .getByTestId('filmstrip')
      .screenshot({ path: `${DIR}/filmstrip-${lang}-${theme}.png` });
  });
}

for (const { lang, theme } of combinations) {
  test(`the panel of a tab with the keyboard on it, and the Stage after a press and a key, ${lang}-${theme}`, async ({
    page,
  }) => {
    await openApp(page, { lang, theme });
    await addBoxes(page, THREE);
    // The panel of a tab is a stop of Tab: it draws a ring inside its edge.
    const open = page.locator('[data-testid="activity-bar"] button[data-panel="ai"]');
    if ((await open.getAttribute('aria-pressed')) !== 'true') await open.click();
    const panel = page.getByTestId('tool-panel');
    await panel.getByRole('tab').first().focus();
    await page.keyboard.press('Tab');
    await expect(panel.getByRole('tabpanel')).toBeFocused();
    await panel.screenshot({ path: `${DIR}/tabpanel-ring-${lang}-${theme}.png` });

    // The Stage, pressed with the pointer and then worked with a key: the ring comes with the key.
    const box = (await surface(page).locator('[data-element-id="e_b"]').boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.keyboard.press('ArrowRight');
    await expect(surface(page)).toBeFocused();
    await shoot(page, `stage-ring-after-press-${lang}-${theme}`);
  });
}
