import { fileURLToPath } from 'node:url';
import { expect, type Locator, type Page } from '@playwright/test';

/*
 * Helpers for the import panel's suites. In a plain browser there is no import window: the file
 * runs in a hidden frame of the page, nothing can be pictured, and the fidelity guard accepts
 * whatever was proposed. The agent is the scripted mock, on a script written for the file.
 */

export const HANDWRITTEN = fileURLToPath(new URL('./import-set/handwritten.html', import.meta.url));

/**
 * What the scripted agent plays. `import-cut`: the same import, cut after three of its six
 * slides and continued; `import-rest`: the turns that go on, for a session that begins there.
 */
export type ImportScript = 'import-handwritten' | 'import-cut' | 'import-rest';

export interface ImportOptions {
  speed?: number;
  lang?: 'he' | 'en';
  theme?: 'light' | 'dark';
  script?: ImportScript;
}

/** Opens the app on the import panel, with the scripted agent that imports the handwritten deck. */
export async function openImportPanel(page: Page, options: ImportOptions = {}): Promise<void> {
  const { speed = 0, lang = 'he', theme = 'light', script = 'import-handwritten' } = options;
  await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
  await page.addInitScript(
    ([language, settings]) => {
      // The page only: the frame an imported file runs in shares the page's storage, and a
      // file that is loaded again must not put back what the test has changed since.
      if (window.top !== window) return;
      localStorage.setItem('slidr.language', language!);
      localStorage.setItem('slidr.agent', settings!);
    },
    [lang, JSON.stringify({ harnessId: 'mock', model: script, mockSpeed: speed })],
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

/** The six slides of the handwritten deck, in the order of the file. */
export const HANDWRITTEN_SLIDES = [
  'פתיחה',
  'למה גינה קהילתית',
  'המגרש',
  'ציטוט',
  'תקציב ההקמה',
  'מצטרפים',
];

/**
 * Imports the handwritten deck on the script that is cut: the plan is approved, three of the six
 * slides come in, and the turn ends badly. At the pace of a real session (`speed` 1 in
 * `openImportPanel`) the turn waits there and `stop` presses Stop; played at once, its usage
 * runs out.
 */
export async function importUntilCut(page: Page, options: { stop: boolean }): Promise<void> {
  await chooseFile(page);
  await turnsDone(page, 1);
  await page.getByTestId('import-approve').getByRole('button').click();
  await expect.poll(() => slideNames(page), { timeout: 30_000 }).toHaveLength(3);
  if (options.stop) {
    await expect(page.getByTestId('chat-working')).toBeVisible();
    await page.getByTestId('chat-stop').click();
  }
  await turnsDone(page, 2);
  await expect(page.getByTestId('import-cut')).toBeVisible();
}

/**
 * Closes the deck and opens it again, as far as a page without files can: another deck takes the
 * window, and then the first one is put back. What a deck file keeps (the chat, the record of
 * the import, the source) is kept by the page meanwhile.
 */
export async function reopenDeck(page: Page, between?: () => Promise<void>): Promise<void> {
  await page.evaluate(async (path) => {
    const { newDeck } = (await import(/* @vite-ignore */ path)) as {
      newDeck: (lang: string) => unknown;
    };
    const editor = window.slidr!;
    (window as unknown as { __closed: unknown }).__closed = editor.bus.deck;
    editor.bus.reset(newDeck('he') as never);
  }, '/src/shell/editor.tsx');
  await expect(page.getByTestId('import-session')).toHaveCount(0);
  await between?.();
  await page.evaluate(() => {
    window.slidr!.bus.reset((window as unknown as { __closed: never }).__closed);
  });
}

/** Has the agent's next session play another script (a session reads its model when it starts). */
export async function playNext(page: Page, script: ImportScript): Promise<void> {
  await page.evaluate((model) => {
    const settings = JSON.parse(localStorage.getItem('slidr.agent') ?? '{}') as object;
    localStorage.setItem('slidr.agent', JSON.stringify({ ...settings, model }));
  }, script);
}
