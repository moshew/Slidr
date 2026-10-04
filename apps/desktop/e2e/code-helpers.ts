import { expect, type Page } from '@playwright/test';
import type { Element } from '@slidr/model';
import { row } from './objects-helpers';

/* Shared by the specs of the code panel and of "Decompose into objects" (WG5-T16b). */

export const HTML_ID = 'e_html';

export const CARD_MARKUP = [
  '<div class="card">',
  '<h2>Quarterly results</h2>',
  '<p class="lead">Revenue grew by <span class="num">17%</span> this year.</p>',
  '</div>',
].join('');

export const CARD_STYLES = [
  '.card { box-sizing: border-box; width: 900px; height: 420px; padding: 40px; background: #1e3a8a;',
  '  border-radius: 24px; font: 30px/1.4 Arial, sans-serif; color: #ffffff; }',
  'h2 { margin: 0 0 16px; font-size: 56px; line-height: 1.2; }',
  'p { margin: 0; }',
  '.num { color: #fbbf24; }',
].join('\n');

/** An `html` element in the middle of the slide: a card with a heading and a line of text. */
export const card = (extra: Record<string, unknown> = {}) => ({
  id: HTML_ID,
  type: 'html',
  name: 'card',
  frame: { x: 400, y: 260, w: 900, h: 420 },
  markup: CARD_MARKUP,
  styles: CARD_STYLES,
  hasScripts: false,
  natural: { w: 900, h: 420 },
  ...extra,
});

/** The elements of the first slide, as the bus has them now. */
export function elements(page: Page): Promise<Element[]> {
  return page.evaluate(() => window.slidr!.bus.deck.slides[0]!.elements as unknown) as Promise<
    Element[]
  >;
}

export async function htmlElement(page: Page) {
  const all = await elements(page);
  return all.find((element) => element.id === HTML_ID) as
    Extract<Element, { type: 'html' }> | undefined;
}

export const codePanel = (page: Page) => page.locator('[data-panel="code"]');

/** Opens the code panel from row B and waits for the editor to be there. */
export async function openCode(page: Page) {
  await row(page).getByTestId('html-code').click();
  await expect(codePanel(page).getByTestId('code-editor')).toHaveAttribute('data-state', 'ready');
}

/** The editable text of the code editor: `html` or `css`. */
export const code = (page: Page, language: 'html' | 'css') =>
  codePanel(page).getByTestId(`code-${language}`);

/** The text the code editor shows, without the line breaks its wrapping adds. */
export function codeText(page: Page, language: 'html' | 'css'): Promise<string> {
  return code(page, language).evaluate((content) =>
    Array.from(content.querySelectorAll('.cm-line'), (line) => line.textContent ?? '').join('\n'),
  );
}

export const dialog = (page: Page) => page.getByTestId('decompose-dialog');

/** Opens the decompose dialog from row B and waits for the conversion to end. */
export async function openDecompose(page: Page) {
  await row(page).getByTestId('html-decompose').click();
  await expect(dialog(page)).toHaveAttribute('data-phase', 'ready', { timeout: 20_000 });
}
