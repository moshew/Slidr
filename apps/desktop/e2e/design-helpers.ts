import { expect, type Locator, type Page } from '@playwright/test';
import { createDeck, createElement, createSlide, richText, type Deck } from '@slidr/model';

/*
 * Shared by the suites of the design check (WG7-T07, T08): the app with the panel open over a
 * deck whose findings are known, and the deck as the model has it. The agent is the scripted
 * mock of a plain browser page, as in the suites of the AI tools.
 */

export interface OpenOptions {
  lang?: 'he' | 'en';
  theme?: 'light' | 'dark';
  /** The deck the app opens on. Default: the deck with a finding of each kind. */
  deck?: Deck;
}

const card = (id: string, x: number, y: number, w = 544, h = 560) =>
  createElement.shape({ id, frame: { x, y, w, h } });

const title = (id: string, text: string) =>
  createElement.text({
    id,
    frame: { x: 96, y: 80, w: 1728, h: 110 },
    content: richText(text, { dir: 'rtl', styleRef: 'title' }),
  });

/**
 * Four slides: one the check has nothing to say about, one with errors (text that overflows,
 * faint text, text in the margin), one whose cards nearly line up and are unevenly spaced, with
 * a paragraph set the wrong way, and one with a colour that is not the theme's.
 */
export function flawedDeck(): Deck {
  return createDeck({
    lang: 'he',
    slides: [
      createSlide({
        id: 's_clean',
        name: 'שלושה עמודים',
        elements: [
          title('e_clean_title', 'שלושה עמודי תווך'),
          card('e_clean_1', 96, 260),
          card('e_clean_2', 688, 260),
          card('e_clean_3', 1280, 260),
        ],
      }),
      createSlide({
        id: 's_errors',
        name: 'תוכנית העבודה',
        elements: [
          title('e_errors_title', 'תוכנית העבודה'),
          card('e_errors_card', 96, 260, 1728, 560),
          createElement.text({
            id: 'e_overflow',
            name: 'פסקת הפתיחה',
            frame: { x: 1184, y: 300, w: 600, h: 60 },
            content: richText(
              'הטקסט הזה ארוך מדי בשביל התיבה שלו, ולכן הוא נשבר לכמה שורות ויוצא ממנה.',
              { dir: 'rtl', marks: { color: { token: 'bg' } } },
            ),
          }),
          createElement.text({
            id: 'e_pale',
            frame: { x: 136, y: 300, w: 700, h: 60 },
            content: richText('טקסט בהיר מדי', {
              dir: 'rtl',
              marks: { color: { token: 'text', alpha: 0.35 } },
            }),
          }),
          createElement.text({
            id: 'e_margin',
            frame: { x: 1224, y: 980, w: 600, h: 60 },
            content: richText('הערה בשולי השקף', { dir: 'rtl' }),
          }),
        ],
      }),
      createSlide({
        id: 's_arrange',
        name: 'שלושה כרטיסים',
        elements: [
          title('e_arrange_title', 'שלושה כרטיסים'),
          card('e_card_1', 96, 260),
          card('e_card_2', 672, 262),
          card('e_card_3', 1280, 260),
          createElement.text({
            id: 'e_turned',
            frame: { x: 96, y: 860, w: 1728, h: 60 },
            content: richText('המשפט הזה כתוב בעברית.', { dir: 'ltr' }),
          }),
        ],
      }),
      createSlide({
        id: 's_colour',
        name: 'צבע משלו',
        elements: [
          title('e_colour_title', 'צבע שאינו מהתבנית'),
          card('e_colour_1', 96, 260),
          createElement.shape({
            id: 'e_orange',
            frame: { x: 688, y: 260, w: 544, h: 560 },
            fill: { kind: 'solid', color: { value: '#ff7a00' } },
          }),
          card('e_colour_3', 1280, 260),
        ],
      }),
    ],
  });
}

/** Opens the app on a deck, with the Design check panel open and its first check done. */
export async function openCheck(page: Page, options: OpenOptions = {}): Promise<void> {
  const { lang = 'he', theme = 'light', deck = flawedDeck() } = options;
  await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
  await page.addInitScript(
    ([language, settings]) => {
      // Only where nothing was chosen yet: a reload in the same test keeps what the test set.
      if (localStorage.getItem('slidr.language') !== null) return;
      localStorage.setItem('slidr.language', language!);
      localStorage.setItem('slidr.agent', settings!);
    },
    [lang, JSON.stringify({ harnessId: 'mock', model: 'deck-build', mockSpeed: 0 })],
  );
  await page.goto('/');
  await expect(page.getByTestId('stage-frame')).toBeVisible();
  await page.evaluate((d) => window.slidr!.bus.reset(d as never), deck);
  await page.locator('[data-panel="lint"]').click();
  await expect(panel(page)).toBeVisible();
  await checked(page);
}

export const panel = (page: Page): Locator => page.getByTestId('design-check');

/** Resolves once the findings shown are those of the deck as it is. */
export async function checked(page: Page): Promise<void> {
  await expect(page.getByTestId('design-check-summary')).not.toHaveAttribute(
    'data-pending',
    'true',
  );
}

/** The findings of a slide, as the panel lists them. */
export const group = (page: Page, slideId: string): Locator =>
  panel(page).locator(`section[data-slide="${slideId}"]`);

/** The rules of the findings the panel shows, slide by slide: `slide rule`. */
export const shown = (page: Page): Promise<string[]> =>
  panel(page)
    .locator('li[data-finding]')
    .evaluateAll((rows) =>
      rows.map(
        (row) =>
          `${row.closest('section')?.getAttribute('data-slide')} ${row.getAttribute('data-finding')}`,
      ),
    );

export const deck = (page: Page): Promise<Deck> => page.evaluate(() => window.slidr!.bus.deck);
export const undoSteps = (page: Page): Promise<number> =>
  page.evaluate(() => window.slidr!.bus.undoStack.length);
export const undo = (page: Page): Promise<boolean> => page.evaluate(() => window.slidr!.bus.undo());
export const selection = (page: Page) =>
  page.evaluate(() => {
    const { currentSlideId, selectedElementIds } = window.slidr!.selection.getState();
    return { slide: currentSlideId, elements: selectedElementIds };
  });

/** Console errors and uncaught exceptions; a missing translation is one (src/i18n). */
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
