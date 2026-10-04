import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { answerDialog, launchApp, welcomeNextTime, type RunningApp } from './app';

/*
 * The welcome screen in the packaged app (DOC-05, ADR-060): what a user's launch opens on. The
 * other suites start in the editor (`launchApp` sees to it); this one asks for the screen, finds
 * on it the file that was saved in the launch before, and opens that file from it.
 */

let app: RunningApp | undefined;
let files: string;

test.beforeAll(() => {
  files = mkdtempSync(join(tmpdir(), 'slidr-welcome-'));
});

test.afterAll(async () => {
  await app?.kill();
  rmSync(files, { recursive: true, force: true });
});

test('a launch opens on the welcome screen, and a recent file opens from it', async () => {
  // A launch in the editor first: it saves a file, and asks for the screen next time.
  app = await launchApp();
  await answerDialog(app.page, 'save', join(files, 'welcome.slidr'));
  await app.page.getByTestId('stage-surface').focus();
  await app.page.keyboard.press('Control+s');
  await expect(app.page.getByTestId('document-name')).toHaveText('welcome');
  await expect(app.page.getByTestId('status-save')).toHaveText('נשמר');
  await welcomeNextTime(app.page);
  await app.kill();

  app = await launchApp({ welcome: true });
  const { page } = app;
  await expect(page.getByTestId('welcome')).toBeVisible();
  await expect(page.getByTestId('stage')).toHaveCount(0);
  // Every way in is offered, the import among them; in the app itself a file can be opened.
  for (const way of ['welcome-ai', 'welcome-blank', 'welcome-open', 'welcome-import']) {
    await expect(page.getByTestId(way)).toBeEnabled();
  }
  await expect(page.locator('[data-welcome-template]')).toHaveCount(4);

  const recent = page.locator('[data-welcome-recent]').filter({ hasText: 'welcome.slidr' });
  await expect(recent).toHaveCount(1);
  await recent.click();
  await expect(page.getByTestId('welcome')).toHaveCount(0);
  await expect(page.getByTestId('stage-frame')).toBeVisible();
  await expect(page.getByTestId('document-name')).toHaveText('welcome');
});
