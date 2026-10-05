import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { addBoxes, select, THREE } from './arrange-helpers';
import { addText, para } from './text-helpers';

/*
 * Row B when it is narrower than its tools (SPEC 4.4, UI-01): the splitter lets the Tool Panel
 * take up to 45% of the window, and on a small window the row of a text box then has no room for
 * all of its tools. They stay in the row, which scrolls sideways; none is left out of reach.
 */

const OUT = fileURLToPath(new URL('../test-results/fix-editing/', import.meta.url));
const shot = (name: string) => {
  const path = `${OUT}${name}.png`;
  mkdirSync(dirname(path), { recursive: true });
  return path;
};

const rowB = (page: Page) => page.getByTestId('top-tools-b');
const more = (page: Page, side: 'start' | 'end') => page.getByTestId(`row-tools-${side}`);

/** Presses the arrow at an end of the row. It is the pointer's alone, and has no role to be found by. */
const press = (page: Page, side: 'start' | 'end') => more(page, side).locator('button').click();

/** How far the tools reach past what the row shows of them, in pixels. */
const hidden = (page: Page) =>
  rowB(page)
    .locator('[data-row-tools]')
    .evaluate((strip) => strip.scrollWidth - strip.clientWidth);

/** Whether a control of the row is drawn inside what the row shows of its tools. */
const inView = (page: Page, testId: string) =>
  rowB(page).evaluate((bar, id) => {
    const strip = bar.querySelector('[data-row-tools]')!.getBoundingClientRect();
    const box = bar.querySelector(`[data-testid="${id}"]`)!.getBoundingClientRect();
    return box.left >= strip.left - 0.5 && box.right <= strip.right + 0.5;
  }, testId);

async function open(page: Page, lang: 'he' | 'en', theme: 'light' | 'dark' = 'light') {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
  await page.addInitScript((language) => localStorage.setItem('slidr.language', language), lang);
  await page.goto('/');
  await expect(page.getByTestId('stage-frame')).toBeVisible();
  await addBoxes(page, THREE);
  await addText(page, 'e_t', [para('hello')], { frame: { x: 100, y: 500, w: 600, h: 100 } });
  await select(page, ['e_t']);
}

/** Drags the Tool Panel to its widest, as the splitter allows (UI-01). */
async function widen(page: Page) {
  await page.getByTestId('panel-splitter').focus();
  await page.keyboard.press('End');
  await expect.poll(() => hidden(page)).toBeGreaterThan(50);
}

for (const lang of ['he', 'en'] as const) {
  test(`the tools at the end of the row stay in reach when the panel is at its widest, ${lang}`, async ({
    page,
  }) => {
    await open(page, lang);
    // At the width the layout is made for, the row holds all of its tools and nothing scrolls.
    expect(await hidden(page)).toBe(0);
    await expect(more(page, 'start')).toHaveCount(0);
    await expect(more(page, 'end')).toHaveCount(0);

    await widen(page);
    // The row is cut at its end, and says so there; its start is all in view.
    await expect(more(page, 'end')).toBeVisible();
    await expect(more(page, 'start')).toHaveCount(0);
    expect(await inView(page, 'arrange-menu')).toBe(false);
    // The "AI" button is not one of the tools that scroll: it is where it always is.
    await expect(rowB(page).getByRole('button').last()).toBeInViewport({ ratio: 1 });

    // The arrow brings the rest of the row into view, to its very end.
    await press(page, 'end');
    await expect.poll(() => inView(page, 'arrange-menu')).toBe(true);
    await expect(more(page, 'end')).toHaveCount(0);
    await expect(more(page, 'start')).toBeVisible();
    // A tool that was out of sight works as ever, and gives the keyboard back to the Stage.
    await page.getByTestId('arrange-menu').click();
    await expect(page.getByTestId('arrange-menu-content')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('stage-surface')).toBeFocused();

    // And back to the start: by the other arrow, and by the wheel.
    await press(page, 'start');
    await expect(more(page, 'start')).toHaveCount(0);
    await rowB(page).locator('[data-row-tools]').hover();
    await page.mouse.wheel(0, 400);
    await expect.poll(() => inView(page, 'arrange-menu')).toBe(true);
  });
}

test('Tab brings a tool that is out of sight into view', async ({ page }) => {
  await open(page, 'en');
  await widen(page);
  // From the last tool that shows, onwards: the keyboard is never on a tool that cannot be seen.
  await rowB(page).getByRole('button', { name: 'Bold', exact: true }).focus();
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press('Tab');
    const at = await page.evaluate(() => {
      const active = document.activeElement!;
      const strip = active.closest('[data-row-tools]');
      if (!strip) return 'outside';
      const box = active.getBoundingClientRect();
      const room = strip.getBoundingClientRect();
      return box.left >= room.left - 0.5 && box.right <= room.right + 0.5 ? 'seen' : 'hidden';
    });
    if (at === 'outside') break;
    expect(at).toBe('seen');
  }
  expect(await inView(page, 'arrange-menu')).toBe(true);
});

test('another selection starts its row from the first tool', async ({ page }) => {
  await open(page, 'en');
  await widen(page);
  await press(page, 'end');
  await expect(more(page, 'start')).toBeVisible();
  // A shape has a short row: it fits, and nothing of it is scrolled away.
  await select(page, ['e_b']);
  await expect.poll(() => hidden(page)).toBe(0);
  await expect(more(page, 'start')).toHaveCount(0);
  await select(page, ['e_t']);
  await expect(more(page, 'end')).toBeVisible();
  await expect(more(page, 'start')).toHaveCount(0);
});

for (const lang of ['he', 'en'] as const) {
  test(`row A keeps "Present" and the document's menu in the window, and its insert buttons scroll, ${lang}`, async ({
    page,
  }) => {
    await open(page, lang);
    const rowA = page.getByTestId('top-tools-a');
    const arrow = (side: 'start' | 'end') => page.getByTestId(`row-inserts-${side}`);
    const names = lang === 'he' ? { file: 'קובץ', icon: 'אייקון' } : { file: 'File', icon: 'Icon' };
    // At the width the layout is made for every insert button shows.
    await expect(arrow('end')).toHaveCount(0);
    await widen(page);

    // The ends of the row are where they were: the File menu, undo, the zoom, and the three
    // buttons at the end, "Present" last. Before, the row ran out of the window with them.
    await expect(page.getByTestId('present-button')).toBeInViewport({ ratio: 1 });
    await expect(rowA.getByRole('button', { name: names.file })).toBeInViewport({ ratio: 1 });
    // What gave way is the insert buttons: the last of them is reached by the arrow.
    const last = rowA.getByRole('button', { name: names.icon, exact: true });
    const seen = () =>
      last.evaluate((button) => {
        const room = button.closest('[data-row-tools]')!.getBoundingClientRect();
        const box = button.getBoundingClientRect();
        return box.left >= room.left - 0.5 && box.right <= room.right + 0.5;
      });
    expect(await seen()).toBe(false);
    // The strip is short here, and a press brings a part of it: as many presses as it takes.
    for (let i = 0; i < 6 && (await arrow('end').count()) > 0; i++) {
      await arrow('end').locator('button').click();
      await page.waitForTimeout(100);
    }
    await expect.poll(seen).toBe(true);
    await expect(arrow('end')).toHaveCount(0);
    await expect(arrow('start')).toBeVisible();
  });
}

for (const theme of ['light', 'dark'] as const) {
  for (const lang of ['he', 'en'] as const) {
    test(`the row that scrolls, for the design gate: ${lang}, ${theme}`, async ({ page }) => {
      await open(page, lang, theme);
      await widen(page);
      await page.screenshot({
        path: shot(`row-scroll-start-${lang}-${theme}`),
        clip: { x: 0, y: 0, width: 1366, height: 200 },
      });
      await press(page, 'end');
      await expect(more(page, 'start')).toBeVisible();
      await page.screenshot({
        path: shot(`row-scroll-end-${lang}-${theme}`),
        clip: { x: 0, y: 0, width: 1366, height: 200 },
      });
    });
  }
}
