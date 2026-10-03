import { expect, type Locator, type Page } from '@playwright/test';
import type { Deck, Element, Slide } from '@slidr/model';

/* Shared by the objects specs (WG5): the app at `/` with `window.slidr`, and ways to fill a slide. */

export interface OpenOptions {
  lang?: 'he' | 'en';
  theme?: 'light' | 'dark';
}

const problems = new WeakMap<Page, string[]>();

/**
 * What the page complained about since it was opened: console errors (a missing string is one,
 * and so is a React warning) and uncaught exceptions. A spec checks that it is empty at the end.
 */
export function pageProblems(page: Page): string[] {
  return problems.get(page) ?? [];
}

/** Opens the app in a UI language and theme, with motion off so popovers are still at once. */
export async function openApp(page: Page, { lang = 'he', theme = 'light' }: OpenOptions = {}) {
  if (!problems.has(page)) {
    const list: string[] = [];
    problems.set(page, list);
    page.on('console', (message) => {
      if (message.type() === 'error') list.push(message.text());
    });
    page.on('pageerror', (error) => list.push(error.message));
  }
  await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
  await page.addInitScript((language) => localStorage.setItem('slidr.language', language), lang);
  await page.goto('/');
  await expect(page.getByTestId('stage-frame')).toBeVisible();
}

export const row = (page: Page) => page.getByTestId('top-tools-b');

/** An element as the Stage draws it (the filmstrip thumbnail draws it too). */
export const onStage = (page: Page, elementId: string) =>
  page.getByTestId('stage-frame').locator(`[data-element-id="${elementId}"]`);

/** The deck as the bus has it now. */
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

/** The selected element of the current slide. */
export async function selected<T extends Element = Element>(page: Page): Promise<T> {
  return page.evaluate(() => {
    const editor = window.slidr!;
    const { currentSlideId, selectedElementIds } = editor.selection.getState();
    const slide = editor.bus.deck.slides.find((s) => s.id === currentSlideId);
    return slide?.elements.find((e) => e.id === selectedElementIds[0]);
  }) as Promise<T>;
}

export function undoDepth(page: Page): Promise<number> {
  return page.evaluate(() => window.slidr!.bus.undoStack.length);
}

/** Adds an element to the current slide and selects it. The history is left as it was found. */
export async function addElement(page: Page, element: Record<string, unknown>): Promise<void> {
  await page.evaluate((el) => {
    const editor = window.slidr!;
    const slideId = editor.selection.getState().currentSlideId ?? '';
    editor.bus.dispatch({
      type: 'element.add',
      slideId,
      element: { rotation: 0, opacity: 1, ...el } as never,
    });
    editor.selection.getState().selectElements([el.id as string]);
  }, element);
}

export const shape = (preset: string, extra: Record<string, unknown> = {}) => ({
  id: `e_${preset.toLowerCase()}`,
  type: 'shape',
  frame: { x: 560, y: 300, w: 480, h: 320 },
  geometry: { kind: 'preset', preset },
  fill: { kind: 'solid', color: { token: 'primary' } },
  ...extra,
});

export const line = (extra: Record<string, unknown> = {}) => ({
  id: 'e_line',
  type: 'line',
  frame: { x: 560, y: 400, w: 480, h: 200 },
  points: [
    { x: 0, y: 0 },
    { x: 480, y: 200 },
  ],
  stroke: { color: { token: 'text' }, width: 4 },
  startHead: 'none',
  endHead: 'none',
  curve: 'straight',
  ...extra,
});

/**
 * A picture file made in the page: a canvas of two halves in the given colours, so it is easy to
 * tell from another and to see which way it is flipped.
 */
export async function importPicture(
  page: Page,
  name: string,
  colors: [string, string] = ['#2f5bea', '#f59e0b'],
  size: [number, number] = [640, 400],
): Promise<string> {
  return page.evaluate(
    async ({ name, colors, size }) => {
      const canvas = document.createElement('canvas');
      [canvas.width, canvas.height] = size;
      const context = canvas.getContext('2d')!;
      context.fillStyle = colors[0];
      context.fillRect(0, 0, size[0] / 2, size[1]);
      context.fillStyle = colors[1];
      context.fillRect(size[0] / 2, 0, size[0] / 2, size[1]);
      const blob = await new Promise<Blob>((resolve) =>
        canvas.toBlob((b) => resolve(b!), 'image/png'),
      );
      const editor = window.slidr!;
      const asset = await editor.assets.import(new File([blob], name, { type: 'image/png' }));
      editor.bus.dispatch({ type: 'asset.add', asset });
      return asset.id;
    },
    { name, colors, size },
  );
}

/** A PNG as bytes, for the file chooser: 2 x 1 pixels would do, but a real size reads better. */
export async function pngBytes(
  page: Page,
  colors: [string, string] = ['#0f9d8a', '#e5484d'],
  size: [number, number] = [800, 500],
): Promise<Buffer> {
  const base64 = await page.evaluate(
    ({ colors, size }) => {
      const canvas = document.createElement('canvas');
      [canvas.width, canvas.height] = size;
      const context = canvas.getContext('2d')!;
      context.fillStyle = colors[0];
      context.fillRect(0, 0, size[0] / 2, size[1]);
      context.fillStyle = colors[1];
      context.fillRect(size[0] / 2, 0, size[0] / 2, size[1]);
      return canvas.toDataURL('image/png').split(',')[1] ?? '';
    },
    { colors, size },
  );
  return Buffer.from(base64, 'base64');
}

/** Drags from the middle of a box by a horizontal distance, in steps, as a hand would. */
export async function dragBy(
  page: Page,
  box: { x: number; y: number; width: number; height: number },
  dx: number,
): Promise<void> {
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx / 2, y, { steps: 4 });
  await page.mouse.move(x + dx, y, { steps: 4 });
  await page.mouse.up();
}

/** Drags the thumb of a slider. In a right-to-left UI a slider grows to the left. */
export async function dragSlider(page: Page, slider: Locator, dx: number): Promise<void> {
  const box = await slider.boundingBox();
  if (!box) throw new Error('the slider is not visible');
  await dragBy(page, box, dx);
}

/** Runs an action and says how many undo steps it left. */
export async function steps(page: Page, action: () => Promise<unknown>): Promise<number> {
  const before = await undoDepth(page);
  await action();
  return (await undoDepth(page)) - before;
}

export const undo = (page: Page) => page.evaluate(() => window.slidr!.bus.undo());
