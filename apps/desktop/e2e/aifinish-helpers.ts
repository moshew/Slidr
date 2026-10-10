import { fileURLToPath } from 'node:url';
import { expect, type Locator, type Page } from '@playwright/test';
import type { Deck } from '@slidr/model';
import type * as Runtime from '../src/ai/runtime';
import type * as Settings from '../src/settings';
import type * as TemplatesApp from '../src/templates/app';

/*
 * Helpers for the suites of the rest of the AI side (WG7-T11a, WG11-T05, WG11-T11): templates
 * the agent drafts, the outline flow, and the chat's picker, usage, conversations and files. The
 * agent is the scripted mock of a plain browser page: `script` is the "model" every session
 * starts on, and `speed` multiplies its recorded delays (0 plays a turn at once).
 */

export type Script = 'template-create' | 'outline' | 'deck-build' | 'slide-chat';

export interface OpenOptions {
  script: Script;
  speed?: number;
  lang?: 'he' | 'en';
  theme?: 'light' | 'dark';
  /** More of the agent's settings, as `slidr.agent` holds them. */
  settings?: Record<string, unknown>;
}

/** Opens the app with the mock agent on a script, and the deck tool on its chat. */
export async function openApp(page: Page, options: OpenOptions): Promise<void> {
  const { script, speed = 0, lang = 'he', theme = 'light', settings = {} } = options;
  await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
  await page.addInitScript(
    ([language, agent]) => {
      // Only where nothing was chosen yet: a reload in the same test keeps what the test set.
      if (localStorage.getItem('slidr.language') === null) {
        localStorage.setItem('slidr.language', language!);
        localStorage.setItem('slidr.agent', agent!);
      }
    },
    [lang, JSON.stringify({ harnessId: 'mock', model: script, mockSpeed: speed, ...settings })],
  );
  await page.goto('/');
  await expect(page.getByTestId('chat')).toBeVisible();
}

export const chat = (page: Page): Locator => page.getByTestId('chat');
export const input = (page: Page): Locator => page.getByTestId('chat-input');
export const turns = (page: Page): Locator => page.getByTestId('chat-assistant');
export const messages = (page: Page): Locator => page.getByTestId('chat-user');
export const draft = (page: Page): Locator => page.getByTestId('template-draft');
export const outline = (page: Page): Locator => page.getByTestId('outline');

/** The tab of the deck tool: its chat, or its actions. */
export async function tab(page: Page, name: 'chat' | 'actions'): Promise<void> {
  const label = name === 'chat' ? /^(צ'אט|Chat)$/ : /^(פעולות|Actions)$/;
  await page.locator('section[data-panel="ai"]').getByRole('tab', { name: label }).click();
}

/** Waits for the latest turn, with every round of the design check, to end. */
export async function turnEnds(page: Page, count: number): Promise<Locator> {
  const turn = turns(page).nth(count - 1);
  await expect(turn).toHaveAttribute('data-outcome', /.+/, { timeout: 30_000 });
  await expect(page.getByTestId('chat-working')).toHaveCount(0);
  return turn;
}

/** Sends a message in the chat and waits for its turn to end. */
export async function say(page: Page, message: string): Promise<Locator> {
  const before = await turns(page).count();
  await input(page).fill(message);
  await input(page).press('Enter');
  return turnEnds(page, before + 1);
}

export function deck(page: Page): Promise<Deck> {
  return page.evaluate(() => window.slidr!.bus.deck as unknown) as Promise<Deck>;
}

export function undoDepth(page: Page): Promise<number> {
  return page.evaluate(() => window.slidr!.bus.undoStack.length);
}

/**
 * What the app's own settings of the agent hold now: the section `agent` of the settings, where
 * the value the page was opened with (`slidr.agent`) was carried to.
 */
export function agentSettings(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(async (path) => {
    const { pageSettings } = (await import(/* @vite-ignore */ path)) as typeof Settings;
    return ((await pageSettings.read()).agent ?? {}) as Record<string, unknown>;
  }, '/src/settings/index.ts');
}

/** The logo the template suites attach: a small picture with a known asset id. */
export const LOGO = {
  path: fileURLToPath(new URL('./fixtures/aifinish-logo.png', import.meta.url)),
  assetId: '373af45eb91ba778476dcc03de7dfd7cc554216bfd56b4e6947541ace2f77832',
};

/** Answers the file dialog the next click opens. */
export async function choose(page: Page, click: () => Promise<void>, path: string): Promise<void> {
  const chooser = page.waitForEvent('filechooser');
  await click();
  await (await chooser).setFiles(path);
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

export async function settle(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
}

/*
 * Modules of the app as the page has them: the instances the app itself runs, served by Vite.
 * A specifier that is not a literal keeps the bundler of the test runner out of it.
 */
const RUNTIME = '/src/ai/runtime.ts';
const TEMPLATES = '/src/templates/app.ts';

/** What the deck chat was sent last: for an action, its `<slidr_action>` block. */
export function lastSent(page: Page): Promise<string> {
  return page.evaluate(async (path) => {
    const { aiOf } = (await import(/* @vite-ignore */ path)) as typeof Runtime;
    const { entries } = aiOf(window.slidr!).agent.thread({ kind: 'deck' }).store.getState();
    return entries.findLast((entry) => entry.type === 'user')?.text ?? '';
  }, RUNTIME);
}

/** The drafts the agent made in this window: how many, and the primary colour of two of them. */
export function draftColours(
  page: Page,
): Promise<{ count: number; shown: string | undefined; first: string | undefined }> {
  return page.evaluate(async (path) => {
    const { drafts } = (await import(/* @vite-ignore */ path)) as typeof TemplatesApp;
    const { drafts: all, shown } = drafts.state.getState();
    return {
      count: all.length,
      shown: all.find((d) => d.id === shown)?.template.theme.colors.primary,
      first: all[0]?.template.theme.colors.primary,
    };
  }, TEMPLATES);
}

/** The heights of the placeholders of a role in a layout of the draft the chat shows. */
export function draftHeights(page: Page, archetype: string, role: string): Promise<number[]> {
  return page.evaluate(
    async ([path, kind, wanted]) => {
      const { drafts } = (await import(/* @vite-ignore */ path!)) as typeof TemplatesApp;
      const { drafts: all, shown } = drafts.state.getState();
      const layout = all
        .find((d) => d.id === shown)
        ?.template.layouts.find((l) => l.archetype === kind);
      return (layout?.placeholders ?? []).filter((p) => p.role === wanted).map((p) => p.frame.h);
    },
    [TEMPLATES, archetype, role],
  );
}
