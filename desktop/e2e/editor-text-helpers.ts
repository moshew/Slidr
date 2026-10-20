import { fileURLToPath } from 'node:url';
import { expect, type Page } from '@playwright/test';

/*
 * Shared by the suites of the P1 text work (WG4-T08 to T10, SHP-04): the app in a language and a
 * colour scheme, row B, and the mouse on the Stage and in the text editor. The model and the
 * editor's own state are read with the helpers of the text suites (text-helpers.ts).
 */

export interface OpenOptions {
  lang?: 'he' | 'en';
  theme?: 'light' | 'dark';
  viewport?: { width: number; height: number };
}

export const FHD = { width: 1920, height: 1032 } as const;
export const LAPTOP = { width: 1366, height: 768 } as const;

/** Opens the app on its empty deck. The UI is Hebrew and light unless asked otherwise. */
export async function open(page: Page, options: OpenOptions = {}): Promise<void> {
  const { lang = 'he', theme = 'light', viewport } = options;
  if (viewport) await page.setViewportSize(viewport);
  await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
  await page.addInitScript((language) => localStorage.setItem('slidr.language', language), lang);
  await page.goto('/');
  await expect(page.getByTestId('stage-frame')).toBeVisible();
}

export const row = (page: Page) => page.getByTestId('top-tools-b');
export const tool = (page: Page, name: string) =>
  row(page).getByRole('button', { name, exact: true });
export const editor = (page: Page) => page.locator('[data-text-editor]');
export const onStage = (page: Page, id: string) =>
  page.getByTestId('stage-surface').locator(`[data-element-id="${id}"]`);

/** Screenshots for the design gate: kept in test-results/editor/, outside Playwright's folder. */
export const shot = (name: string) =>
  fileURLToPath(new URL(`../test-results/editor/${name}.png`, import.meta.url));

/** Adds a shape to the current slide; `content` is its text, when it has any. */
export async function addShape(
  page: Page,
  id: string,
  extra: Record<string, unknown> = {},
): Promise<void> {
  await page.evaluate(
    ({ id, extra }) => {
      const { bus, selection } = window.slidr!;
      bus.dispatch({
        type: 'element.add',
        slideId: selection.getState().currentSlideId!,
        element: {
          id,
          type: 'shape',
          frame: { x: 660, y: 620, w: 600, h: 300 },
          rotation: 0,
          opacity: 1,
          geometry: { kind: 'preset', preset: 'roundRect' },
          fill: { kind: 'solid', color: { token: 'surface' } },
          ...extra,
        } as never,
      });
    },
    { id, extra },
  );
  await onStage(page, id).waitFor();
}

/** Where a position of the text editor's document is on the screen: the middle of its line. */
export async function coords(page: Page, pos: number): Promise<{ x: number; y: number }> {
  return editor(page).evaluate((dom, at) => {
    const { view } = (
      dom as unknown as {
        editor: {
          view: {
            coordsAtPos(pos: number): { left: number; top: number; bottom: number };
          };
        };
      }
    ).editor;
    const box = view.coordsAtPos(at);
    return { x: box.left, y: (box.top + box.bottom) / 2 };
  }, pos);
}

/** Selects text of the editor with the mouse: a drag from one document position to another. */
export async function dragSelect(page: Page, from: number, to: number): Promise<void> {
  const start = await coords(page, from);
  const end = await coords(page, to);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move((start.x + end.x) / 2, (start.y + end.y) / 2, { steps: 4 });
  await page.mouse.move(end.x, end.y, { steps: 4 });
  await page.mouse.up();
}

/**
 * A key as a Hebrew keyboard layout sends it: the physical key (`code`) with the Hebrew letter it
 * types (`key`). Playwright's own keyboard has only the US layout.
 */
export async function pressOnHebrewLayout(
  page: Page,
  code: string,
  key: string,
  modifiers: { ctrl?: boolean; alt?: boolean; shift?: boolean } = {},
): Promise<void> {
  await page.evaluate(
    ({ code, key, modifiers }) => {
      (document.activeElement ?? document.body).dispatchEvent(
        new KeyboardEvent('keydown', {
          key,
          code,
          ctrlKey: Boolean(modifiers.ctrl),
          altKey: Boolean(modifiers.alt),
          shiftKey: Boolean(modifiers.shift),
          bubbles: true,
          cancelable: true,
        }),
      );
    },
    { code, key, modifiers },
  );
}
