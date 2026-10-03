import { expect, type Locator, type Page } from '@playwright/test';
import { slideFromLayout, type Deck } from '@slidr/model';
import { openApp, openTool, panel, type OpenOptions } from './aitools-helpers';

/*
 * Shared by the suites of the deck's look in the deck tool (WG11-T04, WG7-T11b): a deck of
 * three slides on a built-in template, the Actions tab open, and what the Stage is drawing.
 */

const TITLE = 'תוכנית העבודה של הצוות לשנת 2027';
const SUBTITLE = 'שלושה יעדים, רבעון אחר רבעון';

/** The text of the element with a role on the current slide. */
async function write(page: Page, role: string, text: string): Promise<void> {
  await page.evaluate(
    ([wanted, content]) => {
      const editor = window.slidr!;
      const slideId = editor.selection.getState().currentSlideId ?? '';
      const slide = editor.bus.deck.slides.find((s) => s.id === slideId);
      const element = slide?.elements.find((e) => e.role === wanted);
      if (!element || element.type !== 'text') throw new Error(`No text with the role ${wanted}`);
      const first = element.content.paragraphs[0]!;
      editor.bus.dispatch({
        type: 'text.set',
        slideId,
        elementId: element.id,
        content: { paragraphs: [{ ...first, runs: [{ text: content! }] }] },
      });
    },
    [role, text],
  );
}

/** A new slide on a layout of the deck's template, at the end of the deck, and the Stage on it. */
async function addSlide(page: Page, layoutId: string): Promise<void> {
  const command = slideFromLayout(await deck(page), layoutId);
  await page.evaluate((add) => {
    const editor = window.slidr!;
    editor.bus.dispatch(add);
    editor.selection.getState().setCurrentSlide(add.slide.id);
  }, command);
}

/**
 * Opens the app on a deck of three slides on the Zerem template, with the Stage on the opening
 * slide and the deck tool on its Actions tab.
 */
export async function openLook(
  page: Page,
  options: Pick<OpenOptions, 'lang' | 'theme' | 'speed'> = {},
): Promise<void> {
  await page.addInitScript(() => {
    // As if the user had chosen the template for new decks earlier.
    if (localStorage.getItem('slidr.templates') === null) {
      localStorage.setItem('slidr.templates', JSON.stringify({ defaultId: 'zerem' }));
    }
  });
  await openApp(page, { script: 'text-variations', ...options });
  await write(page, 'title', TITLE);
  await write(page, 'subtitle', SUBTITLE);
  await addSlide(page, 'l_zerem_cards');
  await write(page, 'title', 'שלושת היעדים');
  await addSlide(page, 'l_zerem_big_number');
  await page.evaluate(() => {
    const editor = window.slidr!;
    editor.selection.getState().setCurrentSlide(editor.bus.deck.slides[0]!.id);
  });
  await openTool(page, 'ai.deck', 'actions');
  await expect(look(page, 'template')).toBeVisible();
}

/** A section of the deck's look in the Actions tab. */
export const look = (page: Page, name: 'template' | 'palette' | 'fonts'): Locator =>
  panel(page, 'ai.deck').locator(`section[data-look="${name}"]`);

/** Scrolls the Actions tab so a section of the look starts at its top, heading and all. */
export async function scrollTo(page: Page, name: 'template' | 'palette' | 'fonts'): Promise<void> {
  await look(page, name).evaluate((section) => {
    section.scrollIntoView();
    const viewport = section.closest('[data-radix-scroll-area-viewport]');
    if (viewport) viewport.scrollTop -= 12;
  });
}

export const templateCard = (page: Page, id: string): Locator =>
  look(page, 'template').locator(`[data-template="${id}"]`);
export const paletteCard = (page: Page, id: string): Locator =>
  look(page, 'palette').locator(`[data-palette="${id}"]`);
/** The card of a font pair, by its four families: `heading he|heading latin|body he|body latin`. */
export const fontCard = (page: Page, families: string): Locator =>
  look(page, 'fonts').locator(`[data-fonts="${families}"]`);

export const previewLabel = (page: Page): Locator => page.getByTestId('stage-preview');

/** A theme variable of a slide as the renderer drew it: `--color-bg`, `--font-heading`. */
const themeVariable = (slide: Locator, variable: string): Promise<string> =>
  slide
    .locator('.slidr-slide')
    .first()
    .evaluate((root, name) => getComputedStyle(root).getPropertyValue(name).trim(), variable);

/** A theme variable of the slide the Stage is drawing. */
export const onStage = (page: Page, variable: string): Promise<string> =>
  themeVariable(page.getByTestId('stage-frame'), variable);

/** A theme variable of the first thumbnail of the Filmstrip. */
export const onFilmstrip = (page: Page, variable: string): Promise<string> =>
  themeVariable(page.getByTestId('filmstrip'), variable);

/** The pointer on nothing that previews: the title of the Tool Panel. */
export async function pointAway(page: Page): Promise<void> {
  await panel(page, 'ai.deck').getByRole('heading', { level: 2 }).hover();
}

export function deck(page: Page): Promise<Deck> {
  return page.evaluate(() => window.slidr!.bus.deck as unknown) as Promise<Deck>;
}

export function undoDepth(page: Page): Promise<number> {
  return page.evaluate(() => window.slidr!.bus.undoStack.length);
}

export async function settle(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(250);
}
