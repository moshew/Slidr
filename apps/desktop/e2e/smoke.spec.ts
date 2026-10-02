import { expect, test } from '@playwright/test';

test('the frontend boots without console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await page.goto('/');

  await expect(page.getByTestId('app-root')).toBeVisible();
  expect(errors).toEqual([]);
});
