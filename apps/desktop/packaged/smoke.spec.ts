import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { answerDialog, invoke, launchApp, watchProblems, type RunningApp } from './app';

/*
 * The smoke suite of the packaged app (WG13-T02): one pass through what a user does with a deck,
 * in the build a user gets. Create, edit, save, reopen, present, export. Every step goes through
 * the window; only the file dialogs of the operating system are answered for it.
 */

let app: RunningApp;
let files: string;
let problems: string[];

test.beforeAll(async () => {
  files = mkdtempSync(join(tmpdir(), 'slidr-smoke-'));
  app = await launchApp();
  problems = watchProblems(app.page);
});

test.afterAll(async () => {
  await app?.kill();
  rmSync(files, { recursive: true, force: true });
});

test.describe.configure({ mode: 'serial' });

const TITLE = 'בדיקת עשן 2026';
const toolA = (name: string) =>
  app.page.getByTestId('top-tools-a').getByRole('button', { name, exact: true });
const onStage = () => app.page.getByTestId('stage-frame').locator('[data-element-id]');

test('the app starts on an empty deck, with no development hooks', async () => {
  const { page } = app;
  await expect(page.getByTestId('stage-frame')).toBeVisible();
  await expect(page.getByTestId('document-name')).toHaveText('מצגת ללא שם');
  expect(await page.evaluate(() => typeof (window as { slidr?: unknown }).slidr)).toBe('undefined');
  expect(page.url()).toBe('http://tauri.localhost/');
  // The scripted harness is compiled in, and offered only to a run that asks for it.
  const harnesses = await invoke<{ id: string }[]>(page, 'agent_harnesses');
  expect(harnesses.map((harness) => harness.id)).toEqual([
    'claude-code',
    'codex-cli',
    'copilot-cli',
  ]);
});

test('edit: a text box is added and typed into, and a second slide is added', async () => {
  const { page } = app;
  await toolA('תיבת טקסט').click();
  await expect(onStage()).toHaveCount(1);
  // The new box opens for typing; an empty box that is left is removed.
  await expect(page.locator('[data-text-editor]')).toBeFocused();
  await page.keyboard.insertText(TITLE);
  await expect(page.locator('[data-text-editor]')).toContainText(TITLE);
  await page.keyboard.press('Escape');
  await expect(onStage().first()).toContainText(TITLE);

  await page.getByTestId('new-slide').click();
  await expect(page.getByTestId('status-slide')).toHaveText('שקף 2 מתוך 2');
});

test('save: Ctrl+S writes a .slidr file', async () => {
  const { page } = app;
  const target = join(files, 'smoke.slidr');
  await answerDialog(page, 'save', target);
  await page.getByTestId('stage-surface').focus();
  await page.keyboard.press('Control+s');
  await expect(page.getByTestId('document-name')).toHaveText('smoke');
  await expect(page.getByTestId('status-save')).toHaveText('נשמר');
  expect(existsSync(target)).toBe(true);
  // A ZIP archive (SPEC 5.8).
  expect(readFileSync(target).subarray(0, 2).toString('latin1')).toBe('PK');
});

test('reopen: a new deck replaces it, and the file brings it back', async () => {
  const { page } = app;
  await page.getByTestId('stage-surface').focus();
  await page.keyboard.press('Control+n');
  await expect(page.getByTestId('document-name')).toHaveText('מצגת ללא שם');
  await expect(page.getByTestId('status-slide')).toHaveText('שקף 1 מתוך 1');
  await expect(onStage()).toHaveCount(0);

  await answerDialog(page, 'open', join(files, 'smoke.slidr'));
  await page.keyboard.press('Control+o');
  await expect(page.getByTestId('document-name')).toHaveText('smoke');
  await expect(page.getByTestId('status-slide')).toHaveText('שקף 1 מתוך 2');
  await expect(onStage().first()).toContainText(TITLE);
});

test('present: the show opens on the slide, moves on, and closes', async () => {
  const { page } = app;
  await toolA('הצגה').click();
  const show = page.getByTestId('present');
  await expect(show).toHaveAttribute('data-ready', 'true');
  await expect(show).toContainText(TITLE);
  await expect(show).toHaveAttribute('data-slide', '0');
  await page.keyboard.press('ArrowRight');
  await expect(show).toHaveAttribute('data-slide', '1');
  await page.keyboard.press('Escape');
  await expect(show).toHaveCount(0);
});

test('export: the dialog writes one HTML file that holds the deck', async () => {
  const { page } = app;
  const target = join(files, 'smoke.html');
  await toolA('ייצוא').click();
  await expect(page.getByTestId('export-dialog')).toBeVisible();
  await answerDialog(page, 'save', target);
  await page.getByTestId('export-run').click();
  await expect(page.getByTestId('export-report')).toBeVisible({ timeout: 30_000 });
  expect(statSync(target).size).toBeGreaterThan(10_000);
  const html = readFileSync(target, 'utf8');
  expect(html.slice(0, 15).toLowerCase()).toBe('<!doctype html>');
  expect(html).toContain(TITLE);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('export-dialog')).toHaveCount(0);
});

test('nothing was reported to the console along the way', () => {
  expect(problems).toEqual([]);
});
