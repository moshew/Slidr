import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

/*
 * Pictures for the design gate of what the document area tells the user: the message after a
 * save that went through without some of the deck's files (`describeMissingAssets`). The page
 * has no storage, so the message is built from the app's own strings and shown in the app's own
 * dialog, as the save flow shows it. Written to test-results/fix-doc/ to be looked at; nothing
 * is compared.
 */

const out = (name: string) =>
  fileURLToPath(new URL(`../test-results/fix-doc/${name}.png`, import.meta.url));

const FAILURES = '/src/document/failures.ts';
const DIALOGS = '/src/shell/dialogs.tsx';

for (const theme of ['light', 'dark'] as const) {
  for (const lang of ['he', 'en'] as const) {
    test(`a save without some of the deck's files: ${lang}-${theme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
      await page.addInitScript((l) => localStorage.setItem('slidr.language', l), lang);
      await page.goto('/');
      await expect(page.getByTestId('editor')).toBeVisible();

      const said = await page.evaluate(
        async ([failures, dialogs]) => {
          const { describeMissingAssets } = (await import(/* @vite-ignore */ failures!)) as {
            describeMissingAssets: (
              deck: unknown,
              files: string[],
            ) => { title: string; body: string };
          };
          const { tell } = (await import(/* @vite-ignore */ dialogs!)) as {
            tell: (title: string, body: string) => Promise<void>;
          };
          const editor = (
            window as unknown as { slidr: { bus: { deck: { assets: Record<string, unknown> } } } }
          ).slidr;
          const asset = (id: string, name?: string) => ({
            id,
            file: `${id}.png`,
            mime: 'image/png',
            kind: 'image',
            bytes: 1,
            origin: 'upload',
            ...(name ? { name } : {}),
          });
          const deck = {
            ...editor.bus.deck,
            assets: { logo: asset('logo', 'logo.png'), team: asset('team', 'team photo.jpg') },
          };
          const message = describeMissingAssets(deck, ['logo.png', 'team.png']);
          void tell(message.title, message.body);
          return message;
        },
        [FAILURES, DIALOGS],
      );

      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await expect(dialog).toContainText(said.title);
      await expect(dialog).toContainText('logo.png, team photo.jpg');
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(300);
      await page.screenshot({ path: out(`saved-without-files-${lang}-${theme}`) });
      await dialog.getByRole('button').last().click();
      await expect(dialog).toBeHidden();
    });
  }
}
