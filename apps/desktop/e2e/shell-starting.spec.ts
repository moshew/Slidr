import { expect, test, type Page } from '@playwright/test';

/*
 * While the window's first document is on its way (`FileState.starting`: no workspace yet, or
 * the leftovers of a crash not listed yet), the shell under the title bar is drawn and takes no
 * input. The storage layer answers in tens of milliseconds, and in seconds on a busy machine;
 * what was typed in those seconds used to be thrown away or left out of the autosave, and the
 * offer to recover arrived over whatever was on screen.
 *
 * The page here has no storage, so the state is set by hand, as `startDocument` sets it.
 */

type Slidr = { file: { setState: (state: { starting: boolean }) => void } };

const setStarting = (page: Page, starting: boolean) =>
  page.evaluate(
    (value) => (window as unknown as { slidr: Slidr }).slidr.file.setState({ starting: value }),
    starting,
  );
const body = (page: Page) => page.getByTestId('app-body');

test('the welcome screen takes no input until the document has started', async ({ page }) => {
  await page.goto('/?welcome');
  await expect(page.getByTestId('welcome')).toBeVisible();
  await setStarting(page, true);
  await expect(body(page)).toHaveAttribute('aria-busy', 'true');
  expect(await body(page).evaluate((node) => (node as HTMLElement).inert)).toBe(true);

  // A click lands nowhere, and Tab does not go into the screen.
  await page.mouse.click(...(await centre(page, 'welcome-blank')));
  await expect(page.getByTestId('welcome')).toBeVisible();
  await page.keyboard.press('Tab');
  expect(
    await page.evaluate(() => document.activeElement?.closest('[data-testid="app-body"]') !== null),
  ).toBe(false);
  // The title bar is not part of it: the window can still be moved and closed.
  expect(
    await page
      .getByTestId('window-controls')
      .evaluate((node) => node.closest('[data-testid="app-body"]') === null),
  ).toBe(true);

  await setStarting(page, false);
  await expect(body(page)).not.toHaveAttribute('aria-busy');
  await page.mouse.click(...(await centre(page, 'welcome-blank')));
  await expect(page.getByTestId('editor')).toBeVisible();
});

test('the editor is laid out the same with the wrapper, and takes no input while starting', async ({
  page,
}) => {
  await page.goto('/');
  const editor = page.getByTestId('editor');
  await expect(editor).toBeVisible();
  // The wrapper has no box: the regions fill the window under the title bar as before.
  const root = await page.getByTestId('app-root').boundingBox();
  const main = await editor.boundingBox();
  const status = await page.getByTestId('status-bar').boundingBox();
  expect(root && main && status).toBeTruthy();
  expect(Math.round(status!.y + status!.height)).toBe(Math.round(root!.y + root!.height));
  expect(Math.round(status!.width)).toBe(Math.round(root!.width));
  expect(main!.height).toBeGreaterThan(root!.height / 2);

  const slides = () =>
    page.evaluate(
      () =>
        (window as unknown as { slidr: { bus: { deck: { slides: unknown[] } } } }).slidr.bus.deck
          .slides.length,
    );
  const before = await slides();
  await setStarting(page, true);
  await page.mouse.click(...(await centre(page, 'new-slide')));
  expect(await slides()).toBe(before);
  await setStarting(page, false);
  await page.mouse.click(...(await centre(page, 'new-slide')));
  await expect.poll(slides).toBe(before + 1);
});

async function centre(page: Page, testId: string): Promise<[number, number]> {
  const box = await page.getByTestId(testId).boundingBox();
  if (!box) throw new Error(`${testId} is not on the page`);
  return [box.x + box.width / 2, box.y + box.height / 2];
}
