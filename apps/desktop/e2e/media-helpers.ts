import { expect, type Locator, type Page } from '@playwright/test';
import type { Deck, Element } from '@slidr/model';

/*
 * Helpers for the suites of the media side (WG3-T08, WG5-T11, T13, WG12-T03 to T07). In a plain
 * browser page the keys, the image providers and the photo libraries are the stand-ins of each
 * area (`memorySettings`, `memoryImages`, `memoryStock`); the icon library is the real one.
 */

export interface OpenOptions {
  lang?: 'he' | 'en';
  theme?: 'light' | 'dark';
}

/** Opens the app on an empty deck. */
export async function openApp(page: Page, options: OpenOptions = {}): Promise<void> {
  const { lang = 'he', theme = 'light' } = options;
  await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
  await page.addInitScript((language) => {
    localStorage.setItem('slidr.language', language);
  }, lang);
  await page.goto('/');
  await expect(page.getByTestId('stage-frame')).toBeVisible();
}

/** Console errors and uncaught exceptions; a missing translation is one (src/i18n). */
export function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    // Playwright adds its init script to every frame, and the frame HTML is converted in runs
    // no scripts, which is the point of it.
    if (message.text().startsWith("Blocked script execution in 'about:srcdoc'")) return;
    errors.push(message.text());
  });
  return errors;
}

/** Shows a panel of the Tool Panel by its Activity Bar button. */
export async function openPanel(page: Page, id: 'media' | 'settings'): Promise<Locator> {
  const button = page.getByTestId('activity-bar').locator(`[data-panel="${id}"]`);
  if ((await button.getAttribute('aria-pressed')) !== 'true') await button.click();
  const panel = page.getByTestId('tool-panel').locator(`[data-panel="${id}"]`);
  await expect(panel).toBeVisible();
  return panel;
}

export type MediaTab = 'uploads' | 'stock' | 'icons' | 'ai';

/** Shows a tab of the media panel. */
export async function openMedia(page: Page, tab: MediaTab): Promise<Locator> {
  if (tab === 'icons') {
    await page.getByTestId('top-tools-a').locator('[data-tool="insert.elements"]').click();
    await page.getByTestId('elements-panel').locator('[data-collection="icons"]').click();
    const icons = page.getByTestId('elements-icons');
    await expect(icons).toBeVisible();
    return icons;
  }
  await openPanel(page, 'media');
  await page.getByTestId(`media-tab-${tab}`).click();
  const body = page.getByTestId(`media-${tab}`);
  await expect(body).toBeVisible();
  return body;
}

export function deck(page: Page): Promise<Deck> {
  return page.evaluate(() => window.slidr!.bus.deck as unknown) as Promise<Deck>;
}

/** The elements of the current slide, in z-order. */
export async function elements(page: Page): Promise<Element[]> {
  return page.evaluate((): unknown => {
    const editor = window.slidr!;
    const slideId = editor.selection.getState().currentSlideId;
    const slide = editor.bus.deck.slides.find((s) => s.id === slideId);
    return slide?.elements ?? [];
  }) as Promise<Element[]>;
}

export function undoDepth(page: Page): Promise<number> {
  return page.evaluate(() => window.slidr!.bus.undoStack.length);
}

export async function undo(page: Page): Promise<void> {
  await page.evaluate(() => window.slidr!.bus.undo());
}

export async function redo(page: Page): Promise<void> {
  await page.evaluate(() => window.slidr!.bus.redo());
}

/** A slide whose HTML left image placeholders with prompts, as the agent's HTML does. */
export async function addPlaceholders(page: Page, prompts: readonly string[]): Promise<string[]> {
  return page.evaluate((list) => {
    const editor = window.slidr!;
    const slideId = editor.selection.getState().currentSlideId ?? '';
    const ids = list.map((_, i) => `e_placeholder_${i + 1}`);
    editor.bus.batch(
      list.map((prompt, i) => ({
        type: 'element.add' as const,
        slideId,
        element: {
          id: ids[i]!,
          type: 'image',
          frame: { x: 120 + i * 620, y: 240, w: 560, h: 315 },
          rotation: 0,
          opacity: 1,
          fit: 'cover',
          prompt,
        } as never,
      })),
    );
    return ids;
  }, prompts);
}

/** Stores a key through the settings screen, as the user does. */
export async function enterKey(page: Page, name: string, value: string): Promise<void> {
  const field = page.getByTestId(`key-${name}`);
  await field.locator('input').fill(value);
  await field.getByRole('button').first().click();
  await expect(page.getByTestId(`key-${name}`)).toHaveAttribute('data-stored', 'true');
}
