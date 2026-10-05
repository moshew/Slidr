import { closeSync, ftruncateSync, mkdirSync, openSync, readFileSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import type * as Runtime from '../src/ai/runtime';
import { choose, input, LOGO, openApp, say, settle, tab } from './aifinish-helpers';
import { addIcon, openTool } from './aitools-helpers';

/*
 * Screenshots for the design gate (PLAN 1.2) of what the fixes of the chat put on screen: the
 * words under the composer and under the template form for a file that was not taken, the list
 * of conversations when it is longer than the window, and the object tool's chip for an icon.
 * In both themes and both directions, at the smallest supported screen. They are written to
 * test-results/fix-aiui/ to be looked at; nothing is compared.
 */

const out = (name: string) =>
  fileURLToPath(new URL(`../test-results/fix-aiui/${name}.png`, import.meta.url));

const RUNTIME = '/src/ai/runtime.ts';

const themes = ['light', 'dark'] as const;
const languages = [
  { lang: 'he', dir: 'rtl', words: 'בנה מצגת מהמצגת של השנה שעברה' },
  { lang: 'en', dir: 'ltr', words: "Build a deck from last year's deck" },
] as const;

for (const theme of themes) {
  for (const { lang, dir, words } of languages) {
    const name = `${theme}-${dir}`;

    test(`a file that was not taken ${name}`, async ({ page }, testInfo) => {
      const big = testInfo.outputPath('last-year.pptx');
      mkdirSync(dirname(big), { recursive: true });
      const handle = openSync(big, 'w');
      ftruncateSync(handle, 51 * 1024 * 1024);
      closeSync(handle);
      try {
        await page.setViewportSize({ width: 1366, height: 768 });
        await openApp(page, { script: 'template-create', lang, theme });
        // The composer: a file that was taken, and under it the one that was too large.
        await choose(page, () => page.getByTestId('chat-attach').click(), LOGO.path);
        await choose(page, () => page.getByTestId('chat-attach').click(), big);
        await input(page).fill(words);
        await expect(page.getByTestId('files-refused')).toBeVisible();
        await settle(page);
        await page.screenshot({ path: out(`refused-composer-${name}`) });

        // The template form: as many files as it takes, and one more.
        const logo = readFileSync(LOGO.path);
        const picture = (file: string) => ({ name: file, mimeType: 'image/png', buffer: logo });
        await tab(page, 'actions');
        await page.locator('[data-action="template.create"]').click();
        const chooser = page.waitForEvent('filechooser');
        await page.getByTestId('template-files').click();
        await (
          await chooser
        ).setFiles(Array.from({ length: 11 }, (_, i) => picture(`example-${i + 1}.png`)));
        await expect(page.getByTestId('files-refused')).toBeVisible();
        await page.getByTestId('files-refused').scrollIntoViewIfNeeded();
        await settle(page);
        await page.screenshot({ path: out(`refused-template-${name}`) });
      } finally {
        rmSync(big, { force: true });
      }
    });

    test(`more conversations than the window is high ${name}`, async ({ page }) => {
      await page.setViewportSize({ width: 1366, height: 768 });
      await openApp(page, { script: 'outline', lang, theme });
      await say(page, words);
      await page.evaluate(async (path) => {
        const { aiOf } = (await import(/* @vite-ignore */ path)) as typeof Runtime;
        const { agent } = aiOf(window.slidr!);
        for (let i = 0; i < 28; i++) {
          const thread = agent.newConversation({ kind: 'deck' });
          await thread.send(`${i + 2}`);
          await new Promise<void>((resolve) => {
            const check = () => (thread.store.getState().busy ? setTimeout(check, 10) : resolve());
            check();
          });
        }
      }, RUNTIME);
      await page.getByTestId('conversations').click();
      await expect(page.locator('[data-conversation]')).toHaveCount(29);
      // Half way down the list, so the picture shows that it scrolls.
      await page.locator('[data-conversation]').nth(20).hover();
      await page.mouse.wheel(0, 300);
      await settle(page);
      await page.screenshot({ path: out(`conversations-${name}`) });
    });

    test(`the object tool on an icon ${name}`, async ({ page }) => {
      await page.setViewportSize({ width: 1366, height: 768 });
      await openApp(page, { script: 'outline', lang, theme });
      await addIcon(page);
      await openTool(page, 'ai.object', 'actions');
      await expect(page.getByTestId('scope-chip')).toHaveText(lang === 'he' ? /^אייקון/ : /^Icon/);
      await settle(page);
      await page.screenshot({ path: out(`scope-icon-${name}`) });
    });
  }
}
