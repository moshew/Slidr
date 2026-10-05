import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';
import type { Element } from '@slidr/model';
import { onStage, row } from './objects-helpers';
import type { TestParagraph } from './text-helpers';

/*
 * Shared by the suites of the format track (m8-finish): several elements selected together, and
 * the screenshots of the design gate. The app is opened, and the history counted, with the
 * helpers of the objects suites.
 */

/** Screenshots for the design gate: kept in test-results/format/, outside Playwright's folder. */
export const shot = (name: string) =>
  fileURLToPath(new URL(`../test-results/format/${name}.png`, import.meta.url));

/** A text box, by its place down the slide. */
export const box = (
  id: string,
  y: number,
  paragraphs: TestParagraph[],
  extra: Record<string, unknown> = {},
) => ({
  id,
  type: 'text',
  frame: { x: 160, y, w: 700, h: 120 },
  autoFit: 'none',
  vAlign: 'top',
  content: { paragraphs },
  ...extra,
});

/** A rectangle, by its place across the slide. */
export const rect = (id: string, x: number, extra: Record<string, unknown> = {}) => ({
  id,
  type: 'shape',
  frame: { x, y: 620, w: 300, h: 220 },
  geometry: { kind: 'preset', preset: 'rect' },
  fill: { kind: 'solid', color: { token: 'primary' } },
  ...extra,
});

/** Adds elements to the current slide and selects them all, with the keyboard on the Stage. */
export async function addSelected(page: Page, elements: { id: string }[]): Promise<void> {
  await page.evaluate((list) => {
    const { bus, selection } = window.slidr!;
    const slideId = selection.getState().currentSlideId!;
    for (const element of list) {
      bus.dispatch({
        type: 'element.add',
        slideId,
        element: { rotation: 0, opacity: 1, ...element } as never,
      });
    }
    selection.getState().selectElements(list.map((element) => element.id));
  }, elements);
  for (const { id } of elements) await onStage(page, id).waitFor();
  await page.getByTestId('stage-surface').focus();
}

/** An element of the deck as the bus has it now. */
export function elementOf<T extends Element = Element>(page: Page, id: string): Promise<T> {
  return page.evaluate((elementId) => {
    for (const slide of window.slidr!.bus.deck.slides) {
      const found = slide.elements.find((e) => e.id === elementId);
      if (found) return found;
    }
    throw new Error(`No element ${elementId}`);
  }, id) as Promise<T>;
}

/** How far the content of row B reaches past the room it has; 0 when it fits. */
export function rowOverflow(page: Page): Promise<number> {
  return row(page).evaluate((toolbar) => {
    const style = getComputedStyle(toolbar);
    const outer = toolbar.getBoundingClientRect();
    const left = outer.left + parseFloat(style.paddingLeft);
    const right = outer.right - parseFloat(style.paddingRight);
    const boxes = [...toolbar.children]
      .map((child) => child.getBoundingClientRect())
      .filter((rect) => rect.width > 0);
    const from = Math.min(...boxes.map((rect) => rect.left));
    const to = Math.max(...boxes.map((rect) => rect.right));
    return Math.max(0, Math.round(Math.max(left - from, to - right)));
  });
}
