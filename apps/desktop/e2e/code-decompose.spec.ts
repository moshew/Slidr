import { expect, test, type Page } from '@playwright/test';
import { card, dialog, elements, HTML_ID, openDecompose } from './code-helpers';
import { addElement, openApp, pageProblems, row, undoDepth } from './objects-helpers';

// "Decompose into objects" (WG5-T16b, HTM-05): an `html` element becomes regular elements in
// its place, after the user saw what changes. In a plain browser the conversion engine sees no
// pictures (see `agent/conversion.ts`), so the differences here are the ones it finds by
// measuring: text whose lines come out elsewhere. The pixel differences are checked in the
// engine's own browser tests and in the real app.

test.afterEach(({ page }) => {
  // The engine's sandbox says so itself when it keeps the frame it measures in from running.
  expect(pageProblems(page).filter((problem) => !problem.includes('sandboxed'))).toEqual([]);
});

const selectedIds = (page: Page) =>
  page.evaluate(() => window.slidr!.selection.getState().selectedElementIds);

test('an html element is taken apart into regular elements, as one undo step', async ({ page }) => {
  await openApp(page, { lang: 'en' });
  await addElement(page, card());
  const steps = await undoDepth(page);

  await openDecompose(page);
  // Nothing has changed yet: the dialog shows what would.
  expect((await elements(page)).map((element) => element.type)).toEqual(['html']);
  await expect(dialog(page).getByTestId('decompose-parts')).toContainText('3 objects will be made');
  await expect(dialog(page).getByTestId('decompose-parts')).toContainText('Shapes: 1 · Text: 2');
  await expect(dialog(page).getByTestId('decompose-same')).toBeVisible();
  await expect(dialog(page).getByTestId('decompose-preview')).toHaveAttribute('data-view', 'after');

  await dialog(page).getByTestId('decompose-apply').click();
  await expect(dialog(page)).toHaveCount(0);
  const parts = await elements(page);
  expect(parts.map((element) => element.type)).toEqual(['shape', 'text', 'text']);
  // In the element's place: the box is where the card was.
  expect(parts[0]!.frame).toEqual({ x: 400, y: 260, w: 900, h: 420 });
  expect(await selectedIds(page)).toEqual(parts.map((element) => element.id));
  expect(await undoDepth(page)).toBe(steps + 1);

  await page.keyboard.press('Control+z');
  await expect
    .poll(async () => (await elements(page)).map((e) => [e.id, e.type]))
    .toEqual([[HTML_ID, 'html']]);
  await page.keyboard.press('Control+y');
  await expect
    .poll(async () => (await elements(page)).map((element) => element.type))
    .toEqual(['shape', 'text', 'text']);
});

test('cancelling leaves the deck as it was', async ({ page }) => {
  await openApp(page, { lang: 'en' });
  await addElement(page, card());
  const steps = await undoDepth(page);
  await openDecompose(page);
  await dialog(page).getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog(page)).toHaveCount(0);
  expect((await elements(page)).map((element) => element.type)).toEqual(['html']);
  expect(await undoDepth(page)).toBe(steps);
});

test('where the parts look different is told and marked before anything changes', async ({
  page,
}) => {
  await openApp(page, { lang: 'en' });
  // Tabs and runs of spaces: text the model lays out differently, so its lines end elsewhere.
  await addElement(
    page,
    card({
      markup:
        '<pre style="margin:0;font:48px/1.2 Consolas,monospace;color:#111">a\tb\tc\n  two  spaces</pre>',
      styles: undefined,
      frame: { x: 400, y: 260, w: 800, h: 300 },
      natural: { w: 800, h: 300 },
    }),
  );
  await openDecompose(page);
  await expect(dialog(page).getByTestId('decompose-differences')).toContainText(
    'One place looks different from the original',
  );
  await expect(dialog(page).getByTestId('decompose-differences')).toContainText(
    'Text that wraps or sits differently',
  );
  // The part that differs is marked on what the slide would look like, and on the differences.
  const preview = dialog(page).getByTestId('decompose-preview');
  await expect(preview).toHaveAttribute('data-view', 'after');
  await expect(preview.getByTestId('decompose-mark')).toHaveCount(1);
  await dialog(page).getByRole('radio', { name: 'Differences' }).click();
  await expect(preview).toHaveAttribute('data-view', 'diff');
  await expect(preview.getByTestId('decompose-mark')).toHaveCount(1);
  await dialog(page).getByRole('radio', { name: 'Before' }).click();
  await expect(preview).toHaveAttribute('data-view', 'before');
  await expect(preview.getByTestId('decompose-mark')).toHaveCount(0);

  // The user may still go on: the text becomes a text box.
  await dialog(page).getByTestId('decompose-apply').click();
  expect((await elements(page)).map((element) => element.type)).toEqual(['text']);
});

test('what no regular element can stand for stays html, and the dialog says so', async ({
  page,
}) => {
  await openApp(page, { lang: 'en' });
  await addElement(
    page,
    card({
      markup:
        '<p style="margin:0;font:48px/1.2 Arial,sans-serif;color:#111">Above the drawing</p><canvas style="display:block;width:300px;height:100px;background:#fde68a"></canvas>',
      styles: undefined,
    }),
  );
  await openDecompose(page);
  await expect(dialog(page).getByTestId('decompose-kept')).toContainText('One part stays HTML');
  await dialog(page).getByTestId('decompose-apply').click();
  expect((await elements(page)).map((element) => element.type).sort()).toEqual(['html', 'text']);
});

test('an element that cannot come apart at all says so, and offers nothing to apply', async ({
  page,
}) => {
  await openApp(page, { lang: 'en' });
  await addElement(
    page,
    card({
      markup: '<canvas style="display:block;width:300px;height:100px;background:#fde68a"></canvas>',
      styles: undefined,
    }),
  );
  await openDecompose(page);
  await expect(dialog(page).getByText('Nothing to decompose')).toBeVisible();
  await expect(dialog(page).getByTestId('decompose-apply')).toHaveCount(0);
  await dialog(page).getByRole('button', { name: 'Close' }).last().click();
  await expect(dialog(page)).toHaveCount(0);
});

test('an element that runs scripts, or is mirrored, is not offered for decomposing', async ({
  page,
}) => {
  await openApp(page, { lang: 'en' });
  await addElement(page, card({ flipH: true }));
  const button = row(page).getByTestId('html-decompose');
  await expect(button).toBeDisabled();
  await button.locator('..').hover();
  await expect(page.getByRole('tooltip')).toContainText('A mirrored object cannot be decomposed');
});
