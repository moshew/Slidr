import { expect, type Locator, type Page } from '@playwright/test';

/*
 * Helpers for the AI panels' suites. The agent here is the scripted mock of a plain browser
 * page: `script` names what it plays, and `speed` multiplies the script's recorded delays
 * (0 plays a turn at once; 1 is the pace of a real session).
 */

export interface ChatOptions {
  script: 'deck-build' | 'slide-chat' | 'errors' | 'quality-gate' | 'gate-stuck';
  speed?: number;
  lang?: 'he' | 'en';
  theme?: 'light' | 'dark';
}

/** Opens the app with the deck chat on the given script. */
export async function openChat(page: Page, options: ChatOptions): Promise<void> {
  const { script, speed = 0, lang = 'he', theme = 'light' } = options;
  await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
  await page.addInitScript(
    ([language, settings]) => {
      // Only where nothing was chosen yet: a reload in the same test keeps what the test set.
      localStorage.setItem('slidr.language', language!);
      localStorage.setItem('slidr.agent', settings!);
    },
    [lang, JSON.stringify({ harnessId: 'mock', model: script, mockSpeed: speed })],
  );
  await page.goto('/');
  await expect(page.getByTestId('chat')).toBeVisible();
}

export const chat = (page: Page): Locator => page.getByTestId('chat');
export const input = (page: Page): Locator => page.getByTestId('chat-input');
export const turns = (page: Page): Locator => page.getByTestId('chat-assistant');
export const chips = (page: Page): Locator => page.getByTestId('tool-chip');

/** Sends a message and waits for the turn, with every round of the design check, to end. */
export async function say(page: Page, message: string): Promise<Locator> {
  const before = await turns(page).count();
  await input(page).fill(message);
  await input(page).press('Enter');
  const turn = turns(page).nth(before);
  await expect(turn).toHaveAttribute('data-outcome', /.+/, { timeout: 30_000 });
  await expect(page.getByTestId('chat-working')).toHaveCount(0);
  return turn;
}

/** The deck as the editor holds it. */
export function slides(page: Page): Promise<{ id: string; name?: string; archetype?: string }[]> {
  return page.evaluate(() =>
    window.slidr!.bus.deck.slides.map(({ id, name, archetype }) => ({ id, name, archetype })),
  );
}

export function currentSlide(page: Page): Promise<string | null> {
  return page.evaluate(() => window.slidr!.selection.getState().currentSlideId);
}

/**
 * Console errors and uncaught exceptions, including missing translations (src/i18n). One
 * message is the test's own doing and is left out: Playwright adds its init script to every
 * frame, and the frame HTML is converted in runs no scripts, which is the point of it.
 */
export function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    if (message.text().startsWith("Blocked script execution in 'about:srcdoc'")) return;
    errors.push(message.text());
  });
  return errors;
}
