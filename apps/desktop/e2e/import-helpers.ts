import { fileURLToPath } from 'node:url';
import { expect, type Locator, type Page } from '@playwright/test';

/*
 * Helpers for the import panel's suites. In a plain browser there is no import window: the file
 * runs in a hidden frame of the page, nothing can be pictured, and the fidelity guard accepts
 * whatever was proposed. The agent is the scripted mock, on a script written for the file.
 */

export const HANDWRITTEN = fileURLToPath(new URL('./import-set/handwritten.html', import.meta.url));

export interface ImportOptions {
  speed?: number;
  lang?: 'he' | 'en';
  theme?: 'light' | 'dark';
}

/** Opens the app on the import panel, with the scripted agent that imports the handwritten deck. */
export async function openImportPanel(page: Page, options: ImportOptions = {}): Promise<void> {
  const { speed = 0, lang = 'he', theme = 'light' } = options;
  await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
  await page.addInitScript(
    ([language, settings]) => {
      localStorage.setItem('slidr.language', language!);
      localStorage.setItem('slidr.agent', settings!);
    },
    [lang, JSON.stringify({ harnessId: 'mock', model: 'import-handwritten', mockSpeed: speed })],
  );
  // The file runs in a frame of this page, which the app pages' content policy refuses (it is
  // why the app imports in a window of its own). The dev server serves the page asked for this
  // way with what the import page allows itself (build/csp.ts, ADR-066).
  await page.goto('/?import-in-page');
  await page.locator('[data-testid="activity-bar"] [data-panel="import"]').click();
  await expect(page.getByTestId('import-start')).toBeVisible();
}

/** Chooses the file, as the user does through the picker. */
export async function chooseFile(page: Page, path = HANDWRITTEN): Promise<void> {
  await page.getByTestId('import-file').setInputFiles(path);
  await expect(page.getByTestId('import-session')).toBeVisible({ timeout: 30_000 });
}

export const turns = (page: Page): Locator => page.getByTestId('chat-assistant');

/** Waits until the agent has finished `count` turns. */
export async function turnsDone(page: Page, count: number): Promise<void> {
  await expect(turns(page)).toHaveCount(count, { timeout: 30_000 });
  await expect(turns(page).nth(count - 1)).toHaveAttribute('data-outcome', /.+/, {
    timeout: 60_000,
  });
  await expect(page.getByTestId('chat-working')).toHaveCount(0);
}

export function slideNames(page: Page): Promise<(string | undefined)[]> {
  return page.evaluate(() => window.slidr!.bus.deck.slides.map((slide) => slide.name));
}
