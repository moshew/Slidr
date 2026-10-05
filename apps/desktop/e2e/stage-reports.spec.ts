import { expect, test, type Page } from '@playwright/test';
import { addBoxes, openApp, select } from './arrange-helpers';

/*
 * Two reports of ADR-066 ("ממצאים בשכבות של אחרים", 6 and 7) that nobody had confirmed: the
 * Filmstrip and the vertical wheel, and an object dragged under the Tool Panel.
 */

async function manySlides(page: Page, count: number) {
  await page.evaluate((n) => {
    const { bus } = window.slidr!;
    bus.batch(
      Array.from({ length: n }, (_, i) => ({
        type: 'slide.add' as const,
        slide: { id: `s_many_${i}`, name: `Slide ${i}`, elements: [], timeline: [] },
      })),
    );
  }, count);
}

const strip = (page: Page) => page.locator('[data-filmstrip]');
const scrolled = (page: Page) => strip(page).evaluate((el) => Math.abs(el.scrollLeft));

for (const lang of ['he', 'en'] as const) {
  test(`the vertical wheel scrolls the Filmstrip along, ${lang}`, async ({ page }) => {
    await openApp(page, { lang });
    await manySlides(page, 30);
    const box = (await strip(page).boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    expect(await scrolled(page)).toBe(0);
    // A mouse wheel turned down: the strip moves on to the slides after.
    await page.mouse.wheel(0, 400);
    await expect.poll(() => scrolled(page)).toBeGreaterThan(100);
    const far = await scrolled(page);
    // And back up.
    await page.mouse.wheel(0, -400);
    await expect.poll(() => scrolled(page)).toBeLessThan(far);
    // Ctrl and the wheel is a zoom of the window, not a scroll of the strip.
    const before = await scrolled(page);
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, 400);
    await page.keyboard.up('Control');
    expect(await scrolled(page)).toBe(before);
  });
}

/** Drags with the mouse, in steps, as a hand does. */
async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(from.x + ((to.x - from.x) * i) / 10, from.y + ((to.y - from.y) * i) / 10);
    await page.waitForTimeout(16);
  }
  await page.mouse.up();
}

for (const lang of ['he', 'en'] as const) {
  test(`an object dragged toward the Tool Panel stops at the edge of the Stage, ${lang}`, async ({
    page,
  }) => {
    await openApp(page, { lang });
    // Near the side of the slide that is next to the panel, in either direction of the UI.
    const x = lang === 'en' ? 120 : 1500;
    await addBoxes(page, [{ id: 'e_far', x, y: 400, w: 300, h: 200 }]);
    await select(page, ['e_far']);
    const stage = (await page.getByTestId('stage-surface').boundingBox())!;
    const panel = (await page.getByTestId('tool-panel').boundingBox())!;
    const element = page.getByTestId('stage-frame').locator('[data-element-id="e_far"]');
    const from = (await element.boundingBox())!;
    const grab = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
    // Dragged until the pointer is well over the Tool Panel.
    await drag(page, grab, { x: panel.x + panel.width / 2, y: grab.y });

    // The point it was grabbed by is still on the Stage, if not on the slide: it can be grabbed
    // again there, as a selected element is by any part of its frame.
    const after = (await element.boundingBox())!;
    const held = { x: after.x + after.width / 2, y: after.y + after.height / 2 };
    expect(held.x).toBeGreaterThanOrEqual(stage.x);
    expect(held.x).toBeLessThanOrEqual(stage.x + stage.width);
    const hit = await page.evaluate(
      ({ x, y }) =>
        document.elementFromPoint(x, y)?.closest('[data-testid]')?.getAttribute('data-testid'),
      held,
    );
    expect(hit).toBe('stage-surface');

    // And brought back to the middle, where every handle is on the Stage.
    await drag(page, held, { x: stage.x + stage.width / 2, y: stage.y + stage.height / 2 });
    const handles = await page.locator('[data-handle]').evaluateAll((nodes) =>
      nodes.map((node) => {
        const r = node.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return hit?.closest('[data-testid]')?.getAttribute('data-testid');
      }),
    );
    expect(handles.length).toBeGreaterThan(0);
    expect(new Set(handles)).toEqual(new Set(['stage-surface']));
    expect(
      await page.evaluate(() => window.slidr!.selection.getState().selectedElementIds),
    ).toEqual(['e_far']);
  });
}
