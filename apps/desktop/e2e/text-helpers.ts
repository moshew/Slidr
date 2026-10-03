import { expect, type Page } from '@playwright/test';

/*
 * Shared by the text specs (WG4-T03..T07): a text box on the app's first slide, the model as the
 * tests read it, and the text editor's own state.
 */

export interface TestRun {
  text: string;
  marks?: Record<string, unknown>;
}

export interface TestParagraph {
  dir: 'rtl' | 'ltr' | 'auto';
  align: 'start' | 'center' | 'end' | 'justify';
  lineHeight?: number;
  spaceBefore?: number;
  spaceAfter?: number;
  indent?: number;
  list?: { kind: 'bullet' | 'number'; level: number; glyph?: string; color?: unknown };
  styleRef?: string;
  runs: TestRun[];
}

export interface TestElement {
  id: string;
  type: string;
  frame: { x: number; y: number; w: number; h: number };
  autoFit?: string;
  vAlign?: string;
  padding?: { top: number; right: number; bottom: number; left: number };
  content?: { paragraphs: TestParagraph[] };
}

/** What both `window.slidr` of the app and of the Stage dev page have. */
interface Harness {
  bus: {
    deck: { slides: { id: string; elements: TestElement[] }[] };
    undoStack: unknown[];
    dispatch(command: unknown, options?: unknown): unknown;
    undo(): boolean;
  };
  selection: {
    getState(): {
      currentSlideId: string | null;
      selectedElementIds: string[];
      editingElementId: string | null;
      selectElements(ids: string[]): void;
      startEditing(id: string): void;
    };
  };
}

export const para = (text: string, extra: Partial<TestParagraph> = {}): TestParagraph => ({
  dir: 'auto',
  align: 'start',
  runs: text ? [{ text }] : [],
  ...extra,
});

/** Adds a text box to the current slide. */
export async function addText(
  page: Page,
  id: string,
  paragraphs: TestParagraph[],
  extra: Record<string, unknown> = {},
): Promise<void> {
  await page.evaluate(
    ({ id, paragraphs, extra }) => {
      const { bus, selection } = (window as unknown as { slidr: Harness }).slidr;
      bus.dispatch({
        type: 'element.add',
        slideId: selection.getState().currentSlideId,
        element: {
          id,
          type: 'text',
          frame: { x: 160, y: 140, w: 1600, h: 400 },
          rotation: 0,
          opacity: 1,
          autoFit: 'none',
          vAlign: 'top',
          content: { paragraphs },
          ...extra,
        },
      });
    },
    { id, paragraphs, extra },
  );
  await page.getByTestId('stage-surface').locator(`[data-element-id="${id}"]`).waitFor();
}

/** Selects an element without editing it: row B formats all of its text. */
export async function select(page: Page, id: string): Promise<void> {
  await page.evaluate((elementId) => {
    const { selection } = (window as unknown as { slidr: Harness }).slidr;
    selection.getState().selectElements([elementId]);
  }, id);
  await page.getByTestId('stage-surface').focus();
}

/** Starts editing an element, with the caret at the end of its text. */
export async function edit(page: Page, id: string): Promise<void> {
  await page.evaluate((elementId) => {
    const { selection } = (window as unknown as { slidr: Harness }).slidr;
    selection.getState().startEditing(elementId);
  }, id);
  await expect(page.locator('[data-text-editor]')).toBeFocused();
  // ProseMirror ignores Home / End within 200ms of a programmatic focus (ADR-006 rule 6).
  await page.waitForTimeout(250);
}

export function element(page: Page, id: string): Promise<TestElement> {
  return page.evaluate((elementId) => {
    const { bus } = (window as unknown as { slidr: Harness }).slidr;
    for (const slide of bus.deck.slides) {
      const found = slide.elements.find((e) => e.id === elementId);
      if (found) return found;
    }
    throw new Error(`No element ${elementId}`);
  }, id);
}

export async function paragraphs(page: Page, id: string): Promise<TestParagraph[]> {
  return (await element(page, id)).content?.paragraphs ?? [];
}

/** The text of an element, paragraphs joined by newlines: the logical order, as the model has it. */
export async function plain(page: Page, id: string): Promise<string> {
  return (await paragraphs(page, id)).map((p) => p.runs.map((r) => r.text).join('')).join('\n');
}

/** The number of undo steps. */
export function steps(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as { slidr: Harness }).slidr.bus.undoStack.length);
}

export function editingId(page: Page): Promise<string | null> {
  return page.evaluate(
    () => (window as unknown as { slidr: Harness }).slidr.selection.getState().editingElementId,
  );
}

/** The editor's selection: document positions, and the offsets inside the paragraph of the head. */
export function caret(page: Page): Promise<{
  from: number;
  to: number;
  anchor: number;
  head: number;
  offset: number;
  empty: boolean;
}> {
  return page.locator('[data-text-editor]').evaluate((dom) => {
    const { state } = (
      dom as unknown as {
        editor: {
          state: {
            selection: {
              from: number;
              to: number;
              anchor: number;
              head: number;
              empty: boolean;
              $head: { parentOffset: number };
            };
          };
        };
      }
    ).editor;
    const { from, to, anchor, head, empty, $head } = state.selection;
    return { from, to, anchor, head, empty, offset: $head.parentOffset };
  });
}

/** Sets the editor's selection by document positions (1 is the start of the first paragraph). */
export async function setSelection(page: Page, from: number, to = from): Promise<void> {
  await page.locator('[data-text-editor]').evaluate(
    (dom, range) => {
      (
        dom as unknown as {
          editor: { commands: { setTextSelection(range: { from: number; to: number }): boolean } };
        }
      ).editor.commands.setTextSelection(range);
    },
    { from, to },
  );
}

/**
 * Presses a key that moves the caret natively (arrows, Home, End), and waits until the editor has
 * seen the move. It hears of it through `selectionchange`, which the browser sends a moment later;
 * a key sent by a machine in that moment would act on the old selection. A person is never that
 * fast.
 */
export async function move(page: Page, key: string): Promise<void> {
  await page.keyboard.press(key);
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0))),
  );
}

/**
 * Runs an action that must be exactly one undo step, and checks that Ctrl+Z takes the element
 * back to what it was. Returns the element as the action left it.
 */
export async function oneUndoStep(
  page: Page,
  id: string,
  action: () => Promise<void>,
): Promise<TestElement> {
  const before = await element(page, id);
  const stepsBefore = await steps(page);
  await action();
  await expect.poll(() => steps(page)).toBe(stepsBefore + 1);
  const after = await element(page, id);
  expect(after).not.toEqual(before);
  await page.keyboard.press('Control+z');
  expect(await element(page, id)).toEqual(before);
  expect(await steps(page)).toBe(stepsBefore);
  await page.keyboard.press('Control+y');
  expect(await element(page, id)).toEqual(after);
  return after;
}
