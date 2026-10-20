import { fileURLToPath } from 'node:url';
import { expect, type Page } from '@playwright/test';
import type { Deck } from '@slidr/model';

/*
 * Shared by the suites that drive present mode, the animations panel and the export dialog in the
 * app itself (WG8-T04..T07, WG9-T12): the app at `/` in a plain browser, where `window.slidr` is
 * the editor, with one of the runtime's dev decks loaded into it (src/dev/runtime/decks.ts).
 */

/** The app's regions at full HD (SPEC 4.1); the runtime suites' own default is smaller. */
export const FHD = { width: 1920, height: 1032 } as const;
export const LAPTOP = { width: 1366, height: 768 } as const;

/** Screenshots for the design gate: kept in test-results/present/, outside Playwright's folder. */
export const shot = (name: string) =>
  fileURLToPath(new URL(`../test-results/present/${name}.png`, import.meta.url));

export interface AppOptions {
  lang?: 'he' | 'en';
  theme?: 'light' | 'dark';
  /** A deck of the runtime's dev page: `probe`, `probe-rtl`, `reference`, `auto`, ... */
  deck?: string;
}

/** Opens the app and, when asked, replaces its empty deck with a dev deck. */
export async function openApp(page: Page, options: AppOptions = {}): Promise<void> {
  const { lang = 'he', theme = 'light', deck } = options;
  await page.emulateMedia({ colorScheme: theme });
  await page.addInitScript((language) => localStorage.setItem('slidr.language', language), lang);
  await page.goto('/');
  await expect(page.getByTestId('stage-frame')).toBeVisible();
  if (deck) await loadDeck(page, deck);
  await page.evaluate(() => document.fonts.ready);
}

export async function loadDeck(page: Page, name: string): Promise<void> {
  await page.evaluate(async (deckName) => {
    // Through Vite, like every module of the page; not a path the compiler should resolve.
    const path = '/src/dev/runtime/decks.ts';
    const decks = (await import(/* @vite-ignore */ path)) as {
      deckByName: (name: string) => Deck | undefined;
    };
    const deck = decks.deckByName(deckName);
    if (!deck) throw new Error(`no deck named ${deckName}`);
    window.slidr!.bus.reset(deck);
  }, name);
  await expect(page.getByTestId('stage-frame')).toBeVisible();
}

export const currentSlide = (page: Page) =>
  page.evaluate(() => window.slidr!.selection.getState().currentSlideId);

export const setCurrentSlide = (page: Page, slideId: string) =>
  page.evaluate((id) => window.slidr!.selection.getState().setCurrentSlide(id), slideId);

export const undoSteps = (page: Page) => page.evaluate(() => window.slidr!.bus.undoStack.length);

/** The show, once its player has started. */
export async function show(page: Page) {
  const view = page.getByTestId('present');
  await expect(view).toHaveAttribute('data-ready', 'true');
  return view;
}

/** Where the show stands, as the view reports it. */
export async function showState(page: Page): Promise<{ slide: number; step: number }> {
  const view = page.getByTestId('present');
  return {
    slide: Number(await view.getAttribute('data-slide')),
    step: Number(await view.getAttribute('data-step')),
  };
}

/** Resolves once nothing is animating: what is left are the holds of hidden elements. */
export const idle = (page: Page) =>
  page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'));
