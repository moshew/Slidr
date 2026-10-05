import { fileURLToPath } from 'node:url';
import { expect, type Locator, type Page } from '@playwright/test';
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

/**
 * The buttons of row B that reach past the row itself, by name: the measure the table suite
 * holds its row to at 1366 (`table-more.spec.ts`), where the row runs into its own padding.
 */
export function toolsOutsideRow(page: Page): Promise<(string | null)[]> {
  return row(page).evaluate((bar) => {
    const outer = bar.getBoundingClientRect();
    return [...bar.querySelectorAll('button')]
      .filter((button) => {
        const box = button.getBoundingClientRect();
        return box.width > 0 && (box.left < outer.left - 0.5 || box.right > outer.right + 0.5);
      })
      .map((button) => button.getAttribute('aria-label') ?? button.textContent);
  });
}

/* ---------------------------------------------------------------- the menu of the Stage */

export const menu = (page: Page) => page.getByTestId('stage-menu');

/** An item of the menu by its label: the accessible name of an item also holds its shortcut. */
export const menuItem = (page: Page, name: string) =>
  menu(page)
    .getByRole('menuitem')
    .filter({ has: page.getByText(name, { exact: true }) });

/** The labels of the menu's items, top to bottom, checkbox items among them. */
export const menuLabels = (page: Page) =>
  menu(page)
    .locator('[role^="menuitem"]')
    .evaluateAll((nodes) =>
      nodes.map((n) => n.querySelector('span.truncate')?.textContent?.trim() ?? ''),
    );

/** Opens a sub-menu as a hand does, and returns its content. */
export async function openSub(page: Page, name: string, testId: string): Promise<Locator> {
  await menuItem(page, name).hover();
  const sub = page.getByTestId(testId);
  await expect(sub).toBeVisible();
  return sub;
}

/** Clicks an item of an open sub-menu, travelling along the row into it. */
export async function clickInSub(page: Page, trigger: Locator, target: Locator): Promise<void> {
  await expect(target).toBeInViewport();
  const row = (await trigger.boundingBox())!;
  const box = (await target.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, row.y + row.height / 2, { steps: 8 });
  await target.click();
}

/* ---------------------------------------------------------------- a clipboard of the test's own */

declare global {
  interface Window {
    /** What the last copy or cut of the page put on the test's clipboard, by format. */
    __copied?: Record<string, string>;
  }
}

/**
 * Gives the page a clipboard of the test's own, in place of the computer's, which the person at
 * it and every other run share:
 * - what a click on a menu reads (`navigator.clipboard.read`) is `data`, by format; with null
 *   the read is refused, as when the webview does not let the page see the clipboard;
 * - a copy or a cut the app asks the browser for (`document.execCommand`) sends the event to the
 *   element that has the keyboard, as the browser does, and keeps what the app's listeners put on
 *   it in `window.__copied`.
 */
export async function fakeClipboard(
  page: Page,
  data: Record<string, string> | null,
): Promise<void> {
  await page.evaluate((formats) => {
    const read = () => {
      if (!formats) return Promise.reject(new DOMException('Read denied.', 'NotAllowedError'));
      return Promise.resolve([
        {
          types: Object.keys(formats),
          getType: (type: string) => Promise.resolve(new Blob([formats[type] ?? ''], { type })),
        },
      ]);
    };
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { read } });
    document.execCommand = (command: string) => {
      const clipboardData = new DataTransfer();
      (document.activeElement ?? document.body).dispatchEvent(
        new ClipboardEvent(command, { clipboardData, bubbles: true, cancelable: true }),
      );
      window.__copied = Object.fromEntries(
        clipboardData.types.map((type) => [type, clipboardData.getData(type)]),
      );
      return true;
    };
  }, data);
}
