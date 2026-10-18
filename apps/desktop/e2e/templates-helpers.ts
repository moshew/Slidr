import { expect, type Locator, type Page } from '@playwright/test';
import type { Deck } from '@slidr/model';

/* Shared by the templates specs (WG7): the app with the Templates panel open, and the deck as the model has it. */

interface Harness {
  bus: { deck: Deck; undoStack: unknown[]; undo(): boolean; redo(): boolean };
}

/** The editor of the page. Functions passed to `page.evaluate` run there, so they cast in place. */
type Page_ = { slidr: Harness };

export interface OpenOptions {
  lang?: 'he' | 'en';
  theme?: 'light' | 'dark';
  /** The template new decks open with, as the user would have chosen it earlier. */
  defaultTemplate?: string;
}

/** Opens the app and its Templates panel. */
export async function openTemplates(page: Page, options: OpenOptions = {}): Promise<void> {
  const { lang = 'he', theme = 'light', defaultTemplate } = options;
  await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
  await page.addInitScript(
    ([language, chosen]) => {
      // Only where nothing was chosen yet: a reload in the same test keeps what the test set.
      if (localStorage.getItem('slidr.language') === null) {
        localStorage.setItem('slidr.language', language!);
        if (chosen) {
          localStorage.setItem('slidr.templates', JSON.stringify({ defaultId: chosen }));
        }
      }
    },
    [lang, defaultTemplate ?? ''],
  );
  await page.goto('/');
  // The button: the panel itself, hidden, is drawn ahead and has the same mark.
  await page.getByTestId('activity-bar').locator('[data-panel="templates"]').click();
  await expect(panel(page)).toBeVisible();
}

export const panel = (page: Page): Locator => page.getByTestId('templates-panel');

/** A template's card in the library. */
export const card = (page: Page, id: string): Locator =>
  panel(page).locator(`[data-template="${id}"]`);

/** The deck's properties: the dialog of the File menu that holds the design of the deck. */
export const properties = (page: Page): Locator => page.getByTestId('deck-properties');

/** Opens the deck's properties, unless they are open, on one of their pages. */
export async function openProperties(page: Page, tab = 'general'): Promise<Locator> {
  const dialog = properties(page);
  if (!(await dialog.isVisible())) {
    await page.getByTestId('file-menu-trigger').click();
    await page.getByTestId('file-properties').click();
    await expect(dialog).toBeVisible();
  }
  await dialog.locator(`[data-properties-tab="${tab}"]`).click();
  return dialog;
}

/** Closes the deck's properties. */
export async function closeProperties(page: Page): Promise<void> {
  await properties(page)
    .getByRole('button', { name: /^(סגירה|Close)$/ })
    .last()
    .click();
  await expect(properties(page)).toBeHidden();
}

/** Opens the fields of a text style of the theme: they are under the style's row. */
export async function openTextStyle(page: Page, style: string): Promise<void> {
  const dialog = await openProperties(page, 'styles');
  await dialog.locator(`[data-text-style="${style}"]`).getByRole('button').click();
}

/** The deck as the editor holds it. */
export const deck = (page: Page): Promise<Deck> =>
  page.evaluate(() => (window as unknown as Page_).slidr.bus.deck);

export const undo = (page: Page): Promise<boolean> =>
  page.evaluate(() => (window as unknown as Page_).slidr.bus.undo());
export const redo = (page: Page): Promise<boolean> =>
  page.evaluate(() => (window as unknown as Page_).slidr.bus.redo());
export const undoSteps = (page: Page): Promise<number> =>
  page.evaluate(() => (window as unknown as Page_).slidr.bus.undoStack.length);

/** Console errors and uncaught exceptions, including missing translations (src/i18n). */
export function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

export async function settle(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
}
