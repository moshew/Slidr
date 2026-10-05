import { expect, type Locator, type Page } from '@playwright/test';
import type { Deck, Element, Slide } from '@slidr/model';
import type * as Runtime from '../src/ai/runtime';

/** The app's own module, as the page has it: a specifier that is not a literal stays unbundled. */
const RUNTIME = '/src/ai/runtime.ts';

/*
 * Helpers for the suites of the AI chat, its actions and the variations gallery (WG11-T04 to
 * T10, ADR-072). The agent is the scripted mock of a plain browser page: `script` names what every
 * session plays, and `speed` multiplies its recorded delays (0 plays a turn at once).
 */

export type Script =
  | 'text-variations'
  | 'slide-redesign'
  | 'image-alternatives'
  | 'deck-build'
  // The actions of a chart and of a table (e2e/aitools-scripts).
  | 'chart-actions'
  | 'table-actions'
  | 'table-on-slide'
  // The actions of a shape and of an icon.
  | 'shape-actions'
  | 'icon-actions'
  // An image call that is refused, and the one that follows it.
  | 'image-retry';

export interface OpenOptions {
  script: Script;
  speed?: number;
  lang?: 'he' | 'en';
  theme?: 'light' | 'dark';
}

export const TITLE = 'תוכנית העבודה של הצוות לשנת 2027';

/** Opens the app with the mock agent on a script. The Tool Panel shows the AI chat. */
export async function openApp(page: Page, options: OpenOptions): Promise<void> {
  const { script, speed = 0, lang = 'he', theme = 'light' } = options;
  await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
  await page.addInitScript(
    ([language, settings]) => {
      localStorage.setItem('slidr.language', language!);
      localStorage.setItem('slidr.agent', settings!);
    },
    [lang, JSON.stringify({ harnessId: 'mock', model: script, mockSpeed: speed })],
  );
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

/** A title on the current slide, selected. */
export async function addTitle(page: Page, text = TITLE): Promise<string> {
  return page.evaluate((content) => {
    const editor = window.slidr!;
    const slideId = editor.selection.getState().currentSlideId ?? '';
    editor.bus.dispatch({
      type: 'element.add',
      slideId,
      element: {
        id: 'e_title',
        type: 'text',
        role: 'title',
        frame: { x: 160, y: 160, w: 1600, h: 220 },
        rotation: 0,
        opacity: 1,
        autoFit: 'none',
        vAlign: 'top',
        content: {
          paragraphs: [
            {
              dir: 'rtl',
              align: 'start',
              styleRef: 'heading',
              runs: [{ text: content, marks: { color: { token: 'primary' } } }],
            },
          ],
        },
      } as never,
    });
    editor.selection.getState().selectElements(['e_title']);
    return 'e_title';
  }, text);
}

/** A second text on the slide, under the title; the selection is left as it was. */
export async function addBody(page: Page, text: string): Promise<string> {
  return page.evaluate((content) => {
    const editor = window.slidr!;
    const slideId = editor.selection.getState().currentSlideId ?? '';
    editor.bus.dispatch({
      type: 'element.add',
      slideId,
      element: {
        id: 'e_body',
        type: 'text',
        role: 'body',
        frame: { x: 160, y: 440, w: 1600, h: 320 },
        rotation: 0,
        opacity: 1,
        autoFit: 'none',
        vAlign: 'top',
        content: {
          paragraphs: [{ dir: 'rtl', align: 'start', styleRef: 'body', runs: [{ text: content }] }],
        },
      } as never,
    });
    return 'e_body';
  }, text);
}

/** A picture on the current slide, cropped, selected. Returns the id of its asset. */
export async function addImage(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 400;
    const g = canvas.getContext('2d')!;
    g.fillStyle = 'teal';
    g.fillRect(0, 0, 320, 400);
    g.fillStyle = 'orange';
    g.fillRect(320, 0, 320, 400);
    const blob = await new Promise<Blob>((resolve) =>
      canvas.toBlob((b) => resolve(b!), 'image/png'),
    );
    const editor = window.slidr!;
    const slideId = editor.selection.getState().currentSlideId ?? '';
    const asset = await editor.assets.import(new File([blob], 'first.png', { type: 'image/png' }));
    editor.bus.batch([
      { type: 'asset.add', asset },
      {
        type: 'element.add',
        slideId,
        element: {
          id: 'e_picture',
          type: 'image',
          frame: { x: 1000, y: 200, w: 760, h: 520 },
          rotation: 0,
          opacity: 1,
          assetId: asset.id,
          fit: 'cover',
          crop: { x: 0.1, y: 0.1, w: 0.8, h: 0.8 },
        } as never,
      },
    ]);
    editor.selection.getState().selectElements(['e_picture']);
    return asset.id;
  });
}

/** The revenue of three years: one series over time, as the chart scripts read it. */
export const REVENUE = {
  categories: ['2024', '2025', '2026'],
  series: [{ name: 'הכנסות', values: [120, 180, 260] }],
};

/** A column chart under where the title goes, on the current slide, selected. */
export async function addChart(page: Page): Promise<string> {
  await page.evaluate((data) => {
    const editor = window.slidr!;
    editor.bus.dispatch({
      type: 'element.add',
      slideId: editor.selection.getState().currentSlideId ?? '',
      element: {
        id: 'e_chart',
        type: 'chart',
        frame: { x: 360, y: 420, w: 1200, h: 560 },
        rotation: 0,
        opacity: 1,
        chartType: 'column',
        data,
        options: {
          legend: { show: false, position: 'bottom' },
          axes: { x: { show: true }, y: { show: true } },
          labels: false,
        },
      } as never,
    });
    editor.selection.getState().selectElements(['e_chart']);
  }, REVENUE);
  await expect(onStage(page, 'e_chart').locator('[data-slidr-chart-box] svg')).toBeVisible();
  return 'e_chart';
}

/** What the chart on the Stage is drawn from: its type, its title and its categories. */
export async function chartDrawn(
  page: Page,
): Promise<{ type: string; title?: string; categories: string[] }> {
  const spec = await onStage(page, 'e_chart')
    .locator('[data-slidr-chart]')
    .getAttribute('data-slidr-chart');
  return JSON.parse(spec ?? '{}') as { type: string; title?: string; categories: string[] };
}

/** The customers of three regions, as the table scripts fill them in. */
export const REGIONS = [
  ['אזור', 'לקוחות'],
  ['צפון', '340'],
  ['מרכז', '520'],
  ['דרום', '210'],
];

/** A table of the regions under where the title goes, on the current slide, selected. */
export async function addTable(page: Page): Promise<string> {
  await page.evaluate((texts) => {
    const editor = window.slidr!;
    const frame = { x: 360, y: 520, w: 1200, h: 360 };
    const cell = (text: string) => ({
      content: { paragraphs: [{ dir: 'auto', align: 'start', runs: [{ text }] }] },
    });
    editor.bus.dispatch({
      type: 'element.add',
      slideId: editor.selection.getState().currentSlideId ?? '',
      element: {
        id: 'e_table',
        type: 'table',
        frame,
        rotation: 0,
        opacity: 1,
        rows: texts.map(() => frame.h / texts.length),
        cols: texts[0]!.map(() => frame.w / texts[0]!.length),
        dir: 'rtl',
        style: { headerRow: true, bandedRows: false, firstColumn: false },
        cells: texts.map((row) => row.map(cell)),
      } as never,
    });
    editor.selection.getState().selectElements(['e_table']);
  }, REGIONS);
  await expect(onStage(page, 'e_table')).toBeVisible();
  return 'e_table';
}

/** The texts of the cells of the table on the current slide, row by row. */
export async function cellTexts(page: Page): Promise<string[][]> {
  const table = await element(page, 'e_table');
  if (table?.type !== 'table') return [];
  return table.cells.map((row) =>
    row.map((cell) =>
      cell.content.paragraphs.map((p) => p.runs.map((r) => r.text).join('')).join('\n'),
    ),
  );
}

/** A rectangle with a word in it and a colour that is not the theme's, selected. */
export async function addShape(page: Page): Promise<string> {
  await page.evaluate(() => {
    const editor = window.slidr!;
    editor.bus.dispatch({
      type: 'element.add',
      slideId: editor.selection.getState().currentSlideId ?? '',
      element: {
        id: 'e_shape',
        type: 'shape',
        frame: { x: 360, y: 460, w: 520, h: 220 },
        rotation: 0,
        opacity: 1,
        geometry: { kind: 'preset', preset: 'rect' },
        fill: { kind: 'solid', color: { value: 'orange' } },
        content: {
          paragraphs: [
            { dir: 'rtl', align: 'center', styleRef: 'body', runs: [{ text: 'תכנון' }] },
          ],
        },
      } as never,
    });
    editor.selection.getState().selectElements(['e_shape']);
  });
  await expect(onStage(page, 'e_shape')).toBeVisible();
  return 'e_shape';
}

/** The drawing of the icon the suites start from: one stroke, in the colour of the element. */
export const ICON_MARKUP =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20 L20 4"/></svg>';

/** An icon in a colour that is not the theme's, on the current slide, selected. */
export async function addIcon(page: Page): Promise<string> {
  await page.evaluate((markup) => {
    const editor = window.slidr!;
    editor.bus.dispatch({
      type: 'element.add',
      slideId: editor.selection.getState().currentSlideId ?? '',
      element: {
        id: 'e_icon',
        type: 'svg',
        frame: { x: 1100, y: 470, w: 200, h: 200 },
        rotation: 0,
        opacity: 1,
        markup,
        colorOverrides: { currentColor: { value: 'orange' } },
      } as never,
    });
    editor.selection.getState().selectElements(['e_icon']);
  }, ICON_MARKUP);
  await expect(onStage(page, 'e_icon')).toBeVisible();
  return 'e_icon';
}

/** What the chat that is open was sent last: the message of an action is its `<slidr_action>`. */
export function lastSent(page: Page): Promise<string> {
  return page.evaluate(async (path) => {
    const { aiOf } = (await import(/* @vite-ignore */ path)) as typeof Runtime;
    const id = document.querySelector('[data-testid="chat"]')?.getAttribute('data-thread');
    const ai = aiOf(window.slidr!);
    const selection = window.slidr!.selection.getState();
    const slideId = selection.currentSlideId ?? '';
    const scope = id?.startsWith('slide-')
      ? ({ kind: 'slide', slideId } as const)
      : id?.startsWith('object-')
        ? ({ kind: 'object', slideId, elementIds: selection.selectedElementIds } as const)
        : ({ kind: 'deck' } as const);
    const { entries } = ai.agent.thread(scope, id ?? undefined).store.getState();
    return entries.findLast((entry) => entry.type === 'user')?.text ?? '';
  }, RUNTIME);
}

export function deck(page: Page): Promise<Deck> {
  return page.evaluate(() => window.slidr!.bus.deck as unknown) as Promise<Deck>;
}

export async function currentSlide(page: Page): Promise<Slide> {
  return page.evaluate(() => {
    const editor = window.slidr!;
    const id = editor.selection.getState().currentSlideId;
    return editor.bus.deck.slides.find((s) => s.id === id);
  }) as Promise<Slide>;
}

export async function element<T extends Element = Element>(page: Page, id: string): Promise<T> {
  return (await currentSlide(page)).elements.find((e) => e.id === id) as T;
}

/** The plain text of a text element of the current slide. */
export async function textOf(page: Page, id: string): Promise<string> {
  const el = await element(page, id);
  if (el.type !== 'text') return '';
  return el.content.paragraphs.map((p) => p.runs.map((r) => r.text).join('')).join('\n');
}

export function undoDepth(page: Page): Promise<number> {
  return page.evaluate(() => window.slidr!.bus.undoStack.length);
}

export function select(page: Page, ids: string[]): Promise<void> {
  return page.evaluate((elementIds) => {
    window.slidr!.selection.getState().selectElements(elementIds);
  }, ids);
}

/** The Tool Panel while it shows the AI chat (ADR-072). */
export const panel = (page: Page): Locator => page.locator('section[data-panel="ai"]');

/** What the next message is about, beside the composer. */
export const focusChip = (page: Page): Locator => page.getByTestId('focus-chip');

export const chat = (page: Page): Locator => page.getByTestId('chat');
export const input = (page: Page): Locator => page.getByTestId('chat-input');
export const turns = (page: Page): Locator => page.getByTestId('chat-assistant');
export const chips = (page: Page): Locator => page.getByTestId('tool-chip');
export const gallery = (page: Page): Locator => page.getByTestId('gallery');
export const cards = (page: Page): Locator => page.getByTestId('option-card');

/** An element as the Stage draws it. */
export const onStage = (page: Page, elementId: string): Locator =>
  page.getByTestId('stage-frame').locator(`[data-element-id="${elementId}"]`);

/** Opens the AI chat from the Activity Bar, on a tab. */
export async function openTool(page: Page, tab: 'chat' | 'actions' = 'chat'): Promise<void> {
  const button = page.getByTestId('activity-bar').locator('[data-panel="ai"]');
  if ((await button.getAttribute('aria-pressed')) !== 'true') await button.click();
  await expect(panel(page)).toBeVisible();
  const name = tab === 'chat' ? /^(צ'אט|Chat)$/ : /^(פעולות|Actions)$/;
  await panel(page).getByRole('tab', { name }).click();
}

/** Waits for the turn that is running, with every round of the design check, to end. */
export async function turnEnds(page: Page, index = 0): Promise<Locator> {
  const turn = turns(page).nth(index);
  await expect(turn).toHaveAttribute('data-outcome', /.+/, { timeout: 30_000 });
  await expect(page.getByTestId('chat-working')).toHaveCount(0);
  return turn;
}

/** Sends a message in the chat that is open and waits for its turn to end. */
export async function say(page: Page, message: string): Promise<Locator> {
  const before = await turns(page).count();
  await input(page).fill(message);
  await input(page).press('Enter');
  return turnEnds(page, before);
}

/** Presses an action of the Actions tab that is open, and waits for its turn in the chat. */
export async function runAction(page: Page, action: string): Promise<Locator> {
  await page.locator(`[data-action="${action}"]`).click();
  // The panel turns to the chat, where the action is a message.
  await expect(chat(page)).toBeVisible();
  const count = await turns(page).count();
  return turnEnds(page, Math.max(0, count - 1));
}
