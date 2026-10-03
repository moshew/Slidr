import { expect, test } from '@playwright/test';
import type { Element } from '@slidr/model';
import { referenceDeck } from '@slidr/renderer/fixtures';
import { openApp, pageProblems, row } from './objects-helpers';

/*
 * Row B over the renderer's reference deck: every element type and every odd case it holds (masked
 * images, path geometry, lines of many points, tables, charts, media, HTML, groups). Each element
 * is selected in turn and every popover of this area is opened: none may throw, miss a string or
 * leave the row empty-handed.
 */

/** The row B buttons this area draws, by their Hebrew names. */
const mine = [
  'מילוי',
  'קו מתאר',
  'סגנון הקו',
  'ראשי חץ',
  'צורת הקו',
  'מסגרת',
  'פינות',
  'צל',
  'אטימות',
  'אפקטים',
];

const deck = referenceDeck();

test('every element of the reference deck gets its tools, and every popover opens', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await openApp(page);
  await page.evaluate((d) => window.slidr!.bus.reset(d as never), deck);

  const seen = new Set<string>();
  for (const slide of deck.slides) {
    await page.evaluate((id) => window.slidr!.selection.getState().setCurrentSlide(id), slide.id);
    // One element of each distinct look is enough: the first of every type and geometry.
    const picks = new Map<string, Element>();
    for (const element of slide.elements) {
      const look =
        element.type === 'shape'
          ? `shape:${element.geometry.kind === 'preset' ? element.geometry.preset : 'path'}`
          : element.type === 'image'
            ? `image:${element.mask?.kind ?? 'plain'}:${element.assetId ? 'asset' : 'pending'}`
            : element.type === 'line'
              ? `line:${element.curve}:${element.points.length}`
              : element.type;
      if (!seen.has(look)) picks.set(look, element);
    }
    for (const [look, element] of picks) {
      seen.add(look);
      await page.evaluate(
        (id) => window.slidr!.selection.getState().selectElements([id]),
        element.id,
      );
      await expect(row(page)).not.toHaveAttribute('data-selection', 'none');
      let opened = 0;
      for (const name of mine) {
        const button = row(page).getByRole('button', { name, exact: true });
        if ((await button.count()) === 0) continue;
        await button.click();
        await expect(page.getByRole('dialog'), `${look}: ${name}`).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(page.getByRole('dialog')).toHaveCount(0);
        opened++;
      }
      // Every element has at least its opacity, alone or inside "effects".
      expect(opened, look).toBeGreaterThan(0);
    }
  }
  // The deck was only looked at.
  expect(await page.evaluate(() => window.slidr!.bus.undoStack.length)).toBe(0);
  expect(seen.size).toBeGreaterThan(40);
  // Not ours: the reference deck's assets are not on disk here, so its pictures fail to load, and
  // its scripted HTML element is sandboxed in the thumbnail and says so.
  const problems = pageProblems(page).filter(
    (text) => !/Failed to load resource|net::ERR|sandboxed/.test(text),
  );
  expect(problems).toEqual([]);
});
