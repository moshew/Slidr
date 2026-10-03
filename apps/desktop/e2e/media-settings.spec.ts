import { expect, test, type Page } from '@playwright/test';
import {
  addPlaceholders,
  collectErrors,
  deck,
  enterKey,
  openApp,
  openMedia,
  openPanel,
} from './media-helpers';

/*
 * The settings screen (WG3-T08): the image provider and its key, the photo libraries and their
 * keys. In a plain browser the keys are kept in the page's memory and the providers are the
 * stand-ins, so what is checked here is the screen and what it changes; the credential store of
 * the operating system is checked in the real window (ADR-051).
 */

const KEY = 'sk-test-e2e-0123456789abcdefghij';

const provider = (page: Page, id: string) => page.locator(`[data-provider="${id}"]`);

/** Everything the page keeps or shows: the DOM, and the two web storages. */
function everywhere(page: Page): Promise<string> {
  return page.evaluate(() =>
    [
      document.documentElement.outerHTML,
      JSON.stringify({ ...localStorage }),
      JSON.stringify({ ...sessionStorage }),
    ].join('\n'),
  );
}

test('the settings screen lists the providers, and a key is entered once and never shown', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await openApp(page);
  const settings = await openPanel(page, 'settings');
  await expect(settings.locator('[data-settings-section="images"]')).toBeVisible();
  await expect(settings.locator('[data-settings-section="stock"]')).toBeVisible();

  // The provider that needs no key is ready and chosen; the other says what it needs.
  await expect(provider(page, 'mock')).toHaveAttribute('aria-checked', 'true');
  await expect(provider(page, 'mock')).toHaveAttribute('data-state', 'ready');
  await expect(provider(page, 'mock-api')).toHaveAttribute('data-state', 'needs_key');
  // No key field until the provider that needs one is chosen.
  await expect(page.getByTestId('key-openai-api')).toHaveCount(0);

  await provider(page, 'mock-api').click();
  await expect(provider(page, 'mock-api')).toHaveAttribute('aria-checked', 'true');
  const field = page.getByTestId('key-openai-api');
  await expect(field).toHaveAttribute('data-stored', 'false');
  await expect(field.locator('input')).toHaveAttribute('type', 'password');

  // What cannot be a key is turned back, with the reason.
  await field.locator('input').fill('two words');
  await field.getByRole('button').first().click();
  await expect(field.getByRole('alert')).toBeVisible();
  await expect(field).toHaveAttribute('data-stored', 'false');

  await enterKey(page, 'openai-api', KEY);
  await expect(provider(page, 'mock-api')).toHaveAttribute('data-state', 'ready');
  // Once stored, the key is in no field, no attribute and no storage of the page.
  await expect(page.getByTestId('key-openai-api').locator('input')).toHaveCount(0);
  expect(await everywhere(page)).not.toContain(KEY);

  // Removing the key takes the provider back to "needs a key".
  await page.getByTestId('key-openai-api').getByRole('button').nth(1).click();
  await expect(page.getByTestId('key-openai-api')).toHaveAttribute('data-stored', 'false');
  await expect(provider(page, 'mock-api')).toHaveAttribute('data-state', 'needs_key');
  expect(errors).toEqual([]);
});

test('the provider chosen in the settings is where an image is made', async ({ page }) => {
  const errors = collectErrors(page);
  await openApp(page);
  await openPanel(page, 'settings');
  await provider(page, 'mock-api').click();
  await enterKey(page, 'openai-api', KEY);

  // The agent's image service, as `image_generate` calls it, with no provider named.
  const made = (prompt: string) =>
    page.evaluate(
      async ([text, path]) => {
        const { aiOf } = (await import(/* @vite-ignore */ path!)) as {
          aiOf: (editor: unknown) => {
            images: {
              service: {
                generate: (
                  request: unknown,
                ) => Promise<{ asset: { lineage?: { provider?: string } } }[]>;
                describe: () => Promise<{ name: string; edit: string }>;
              };
            };
          };
        };
        const { service } = aiOf(window.slidr).images;
        const [image] = await service.generate({ prompt: text, count: 1, aspect: '1:1' });
        return { provider: image?.asset.lineage?.provider, described: await service.describe() };
      },
      [prompt, '/src/ai/runtime.ts'],
    );

  expect(await made('a red barn')).toMatchObject({
    provider: 'mock-api',
    described: { name: 'Mock API', edit: 'exact' },
  });

  // The app's own "generate" goes the same way.
  const [placeholder] = await addPlaceholders(page, ['נמל דייגים קטן בזריחה']);
  await openMedia(page, 'ai');
  await page.locator(`[data-placeholder="${placeholder}"]`).getByRole('button').last().click();
  await expect(page.locator(`[data-placeholder="${placeholder}"]`)).toHaveCount(0);
  const filled = (await deck(page)).slides[0]?.elements.find((e) => e.id === placeholder);
  const assetId = filled?.type === 'image' ? filled.assetId : undefined;
  expect((await deck(page)).assets[assetId ?? '']?.lineage).toMatchObject({
    provider: 'mock-api',
    prompt: 'נמל דייגים קטן בזריחה',
  });

  // Back to the first provider: the next image is made there.
  await openPanel(page, 'settings');
  await provider(page, 'mock').click();
  await expect(provider(page, 'mock')).toHaveAttribute('aria-checked', 'true');
  expect(await made('a blue barn')).toMatchObject({ provider: 'mock' });
  expect(errors).toEqual([]);
});

test('a provider that takes a quality offers it, and the choice is kept in the settings', async ({
  page,
}) => {
  await openApp(page, { lang: 'en' });
  const settings = await openPanel(page, 'settings');
  // Only the provider that takes a quality shows the control.
  await expect(settings.getByRole('radiogroup', { name: 'Image quality' })).toHaveCount(0);
  await provider(page, 'mock-api').click();
  const quality = settings.getByRole('radiogroup', { name: 'Image quality' });
  await expect(quality.getByRole('radio', { name: 'Medium' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await quality.getByRole('radio', { name: 'High' }).click();
  await expect(quality.getByRole('radio', { name: 'High' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  const stored = await page.evaluate(async (path) => {
    const { settingsClient } = (await import(/* @vite-ignore */ path)) as {
      settingsClient: () => { read: () => Promise<Record<string, unknown>> };
    };
    return settingsClient().read();
  }, '/src/settings/store.ts');
  expect(stored.images).toEqual({ defaultProvider: 'mock-api', quality: 'high' });
});

test('a photo library is searched once its key is entered', async ({ page }) => {
  const errors = collectErrors(page);
  await openApp(page);
  await openPanel(page, 'settings');
  const stock = page.getByTestId('stock-sources');
  await expect(stock.getByTestId('key-unsplash')).toHaveAttribute('data-stored', 'false');
  // One library is ready without a key: there is nothing to choose between yet.
  await expect(stock.getByRole('combobox')).toHaveCount(0);

  await enterKey(page, 'unsplash', 'unsplash-key-0123456789');
  await expect(stock.getByRole('combobox')).toBeVisible();
  await stock.getByRole('combobox').click();
  await page.getByRole('option', { name: 'Keyed photos' }).click();

  // The media panel searches the library the settings name.
  await openMedia(page, 'stock');
  await page.getByTestId('stock-query').fill('harbour');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('stock-results').locator('button')).toHaveCount(20);
  await expect(page.getByTestId('stock-provided-by')).toContainText('Keyed photos');
  expect(errors).toEqual([]);
});
