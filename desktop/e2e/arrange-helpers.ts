import { expect, type Page } from '@playwright/test';

/*
 * Shared by the arrange and slides specs (WG5-T06, T08): the app at `/` in a plain browser, where
 * `window.slidr` is the editor. The deck is built and the selection is set through the editor, so
 * these specs do not depend on how the Stage picks things with the pointer.
 */

export interface Frame {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** What the clipboard helpers carry between a copy and a paste: MIME type to text. */
export type ClipData = Record<string, string>;

export const SLIDR_MIME = 'application/x-slidr+json';

export async function openApp(
  page: Page,
  options: { lang?: 'he' | 'en'; theme?: 'light' | 'dark' } = {},
): Promise<void> {
  const { lang = 'he', theme = 'light' } = options;
  await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
  await page.addInitScript((language) => localStorage.setItem('slidr.language', language), lang);
  await page.goto('/');
  await expect(page.getByTestId('stage-frame')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

export interface Box extends Frame {
  id: string;
  name?: string;
  text?: string;
  token?: 'primary' | 'secondary' | 'accent' | 'surface' | 'muted';
}

/** Adds rectangles to the current slide, the first at the bottom, and forgets the undo of it. */
export async function addBoxes(page: Page, boxes: Box[]): Promise<void> {
  await page.evaluate((list) => {
    const editor = window.slidr!;
    const slideId = editor.selection.getState().currentSlideId!;
    editor.bus.batch(
      list.map(({ id, name, text, token, ...frame }) => ({
        type: 'element.add' as const,
        slideId,
        element: {
          id,
          type: 'shape' as const,
          ...(name ? { name } : {}),
          frame,
          rotation: 0,
          opacity: 1,
          geometry: { kind: 'preset' as const, preset: 'rect' },
          fill: { kind: 'solid' as const, color: { token: token ?? 'primary' } },
          ...(text
            ? {
                content: {
                  paragraphs: [
                    { dir: 'auto' as const, align: 'center' as const, runs: [{ text }] },
                  ],
                },
              }
            : {}),
        },
      })),
    );
  }, boxes);
}

/** Three boxes that share no edge and no centre line: a, b, c from the bottom up. */
export const THREE: Box[] = [
  { id: 'e_a', name: 'A', x: 100, y: 100, w: 100, h: 100, token: 'primary' },
  { id: 'e_b', name: 'B', x: 400, y: 300, w: 200, h: 100, token: 'secondary' },
  { id: 'e_c', name: 'C', x: 900, y: 600, w: 100, h: 300, token: 'accent' },
];

export const select = (page: Page, ids: string[]) =>
  page.evaluate((list) => window.slidr!.selection.getState().selectElements(list), ids);

export const selected = (page: Page) =>
  page.evaluate(() => window.slidr!.selection.getState().selectedElementIds);

interface Node {
  id: string;
  type: string;
  frame: Frame;
  name?: string;
  locked?: boolean;
  hidden?: boolean;
  assetId?: string;
  children?: Node[];
}

/** The elements of the current slide, bottom to top. */
export const elements = (page: Page): Promise<Node[]> =>
  page.evaluate(() => {
    const editor = window.slidr!;
    const slideId = editor.selection.getState().currentSlideId;
    const slide = editor.bus.deck.slides.find((s) => s.id === slideId);
    return JSON.parse(JSON.stringify(slide?.elements ?? [])) as Node[];
  });

export const order = async (page: Page) => (await elements(page)).map((e) => e.id);

/** The frames of elements of the current slide by id, at any depth. */
export async function frames(page: Page, ids: string[]): Promise<Record<string, Frame>> {
  const all: Node[] = [];
  const walk = (list: Node[]) => {
    for (const e of list) {
      all.push(e);
      if (e.children) walk(e.children);
    }
  };
  walk(await elements(page));
  return Object.fromEntries(ids.map((id) => [id, all.find((e) => e.id === id)!.frame]));
}

export const slideIds = (page: Page) =>
  page.evaluate(() => window.slidr!.bus.deck.slides.map((s) => s.id));

export const currentSlide = (page: Page) =>
  page.evaluate(() => window.slidr!.selection.getState().currentSlideId);

export const selectedSlides = (page: Page) =>
  page.evaluate(() => window.slidr!.selection.getState().selectedSlideIds);

export const undoSteps = (page: Page) => page.evaluate(() => window.slidr!.bus.undoStack.length);

export const undo = (page: Page) => page.evaluate(() => window.slidr!.bus.undo());

/**
 * Runs an action and checks that it was exactly one undo step, and that undoing it brings the
 * deck back to what it was. The action is then redone, so the test goes on from its result.
 */
export async function expectOneStep(page: Page, action: () => Promise<unknown>): Promise<void> {
  const before = await page.evaluate(() => JSON.stringify(window.slidr!.bus.deck));
  const steps = await undoSteps(page);
  await action();
  await expect.poll(() => undoSteps(page)).toBe(steps + 1);
  const selection = await page.evaluate(() => {
    const s = window.slidr!.selection.getState();
    return {
      slides: s.selectedSlideIds,
      current: s.currentSlideId,
      elements: s.selectedElementIds,
    };
  });
  await undo(page);
  expect(await page.evaluate(() => JSON.stringify(window.slidr!.bus.deck))).toBe(before);
  await page.evaluate((was) => {
    const editor = window.slidr!;
    editor.bus.redo();
    // Undo trims the selection to what exists; put it back as the action left it.
    if (was.current) editor.selection.getState().selectSlides(was.slides, was.current);
    editor.selection.getState().selectElements(was.elements);
  }, selection);
}

/* ---------------------------------------------------------------- clipboard */

/**
 * Sends a `copy` or `cut` event to the focused element, as Ctrl+C would, and returns what the
 * app put on it. The event carries its own data, so the system clipboard, which every test and
 * every other program shares, is not involved.
 */
export function copy(page: Page, type: 'copy' | 'cut' = 'copy'): Promise<ClipData> {
  return page.evaluate((eventType) => {
    const data = new DataTransfer();
    const target = document.activeElement ?? document.body;
    target.dispatchEvent(
      new ClipboardEvent(eventType, { clipboardData: data, bubbles: true, cancelable: true }),
    );
    return Object.fromEntries(data.types.map((t) => [t, data.getData(t)]));
  }, type);
}

/** Sends a `paste` event with the given data to the focused element, as Ctrl+V would. */
export function paste(page: Page, clip: ClipData): Promise<boolean> {
  return page.evaluate((entries) => {
    const data = new DataTransfer();
    for (const [type, text] of Object.entries(entries)) data.setData(type, text);
    const target = document.activeElement ?? document.body;
    // False when the app took the paste (it prevents the default).
    return target.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
    );
  }, clip);
}

/** Puts the keyboard focus on the Stage, where element shortcuts and the clipboard act. */
export const focusStage = (page: Page) => page.getByTestId('stage-surface').focus();

/** Puts the keyboard focus in the Filmstrip, where they act on slides. */
export const focusFilmstrip = (page: Page) =>
  page.getByTestId('filmstrip').getByRole('listbox').focus();

export const thumb = (page: Page, slideId: string) =>
  page.locator(`[data-testid="filmstrip"] [role="option"][data-slide-id="${slideId}"]`);
