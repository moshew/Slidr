import { expect, test, type Page } from '@playwright/test';

/** Console errors and uncaught exceptions, including missing translations (src/i18n). */
function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

test('the frontend boots without console errors', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');

  await expect(page.getByTestId('app-root')).toBeVisible();
  await expect(page.getByTestId('stage-frame')).toBeVisible();
  expect(errors).toEqual([]);
});

test('the English UI and every panel render without console errors', async ({ page }) => {
  const errors = collectErrors(page);
  await page.addInitScript(() => localStorage.setItem('slidr.language', 'en'));
  await page.goto('/');
  const bar = page.getByTestId('activity-bar');
  await expect(bar).toBeVisible();
  for (const button of await bar.getByRole('button').all()) {
    await button.click();
    await expect(page.getByTestId('tool-panel')).toHaveAttribute('data-open', /true|false/);
  }
  expect(errors).toEqual([]);
});

test('the component gallery boots without console errors', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/dev/gallery.html');

  await expect(page.getByTestId('gallery-light-rtl')).toBeVisible();
  await expect(page.getByTestId('gallery-dark-ltr')).toBeVisible();
  expect(errors).toEqual([]);
});
