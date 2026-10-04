import { expect, type Page } from '@playwright/test';

/*
 * Shared by the find and replace specs (WG4-T09, TXT-12): the app at `/` in a plain browser, where
 * `window.slidr` is the editor, a deck with one word in every kind of place, and the find bar as
 * the tests read it.
 */

type Run = { text: string; marks?: Record<string, unknown> };
type Paragraph = { dir: 'auto'; align: 'start' | 'center'; styleRef?: string; runs: Run[] };

const para = (text: string | Run[], extra: Partial<Paragraph> = {}): Paragraph => ({
  dir: 'auto',
  align: 'start',
  runs: typeof text === 'string' ? [{ text }] : text,
  ...extra,
});

const base = { rotation: 0, opacity: 1 };

const textBox = (
  id: string,
  frame: { x: number; y: number; w: number; h: number },
  paragraphs: Paragraph[],
  extra: Record<string, unknown> = {},
) => ({
  id,
  type: 'text',
  frame,
  ...base,
  autoFit: 'none',
  vAlign: 'top',
  content: { paragraphs },
  ...extra,
});

const cell = (text: string) => ({ content: { paragraphs: [para(text)] } });

/** The word the specs look for, and how often it stands where. */
export const WORD = 'רבעון';

/**
 * Three slides with "רבעון" on each:
 * - the first: a title where the word crosses three runs and carries a prefix letter, and a body
 *   of two paragraphs (three matches, one of them a whole word);
 * - the second: a card inside a group, a table with the word in two cells, and speaker notes
 *   (four matches, the last with nothing on the Stage);
 * - the third, hidden: a locked text box and a plain one (two matches).
 * Nine in all.
 */
export const DECK = {
  first: [
    textBox('e_title', { x: 160, y: 120, w: 1600, h: 160 }, [
      para([{ text: 'תוכנית ה' }, { text: 'רבע', marks: { weight: 800 } }, { text: 'ון' }], {
        styleRef: 'title',
      }),
    ]),
    textBox('e_body', { x: 160, y: 340, w: 1600, h: 400 }, [
      para('רבעון ראשון: צמיחה של 12%'),
      para('ברבעון השני נשיק את Slidr'),
    ]),
  ],
  slides: [
    {
      id: 's_two',
      timeline: [],
      notes: { paragraphs: [para('לציין את הרבעון החזק')] },
      elements: [
        {
          id: 'e_group',
          type: 'group',
          frame: { x: 160, y: 120, w: 700, h: 300 },
          ...base,
          children: [
            {
              id: 'e_card',
              type: 'shape',
              frame: { x: 0, y: 0, w: 700, h: 300 },
              ...base,
              geometry: { kind: 'preset', preset: 'roundRect' },
              fill: { kind: 'solid', color: { token: 'surface' } },
              content: { paragraphs: [para('יעדי רבעון', { align: 'center' })] },
            },
          ],
        },
        {
          id: 'e_table',
          type: 'table',
          frame: { x: 160, y: 520, w: 1200, h: 240 },
          ...base,
          rows: [120, 120],
          cols: [600, 600],
          dir: 'rtl',
          style: { headerRow: true, bandedRows: false, firstColumn: false },
          cells: [
            [cell('רבעון'), cell('הכנסות')],
            [cell('רבעון טוב'), cell('1.2M')],
          ],
        },
      ],
    },
    {
      id: 's_three',
      timeline: [],
      hidden: true,
      elements: [
        textBox('e_locked', { x: 160, y: 120, w: 1600, h: 160 }, [para('רבעון נעול')], {
          locked: true,
        }),
        textBox('e_last', { x: 160, y: 340, w: 1600, h: 160 }, [para('סוף רבעון')]),
      ],
    },
  ],
};

/** Builds `DECK` on the app's one empty slide, as one undo step. Returns the id of that slide. */
export async function buildDeck(page: Page): Promise<string> {
  const firstId = await page.evaluate(({ first, slides }) => {
    const { bus, selection } = window.slidr!;
    const slideId = selection.getState().currentSlideId!;
    type Add = Parameters<typeof bus.batch>[0][number];
    bus.batch([
      ...first.map((element) => ({ type: 'element.add', slideId, element }) as Add),
      ...slides.map((slide) => ({ type: 'slide.add', slide }) as Add),
    ]);
    return slideId;
  }, DECK);
  await page.getByTestId('stage-surface').locator('[data-element-id="e_body"]').waitFor();
  return firstId;
}

export const bar = (page: Page) => page.getByTestId('find-bar');
export const query = (page: Page) => page.getByTestId('find-query');
export const replacement = (page: Page) => page.getByTestId('find-replacement');
export const count = (page: Page) => page.getByTestId('find-count');
export const status = (page: Page) => page.getByTestId('find-status');

/** Opens the bar with Ctrl+F and types what to look for. */
export async function find(page: Page, text: string): Promise<void> {
  await page.keyboard.press('Control+f');
  await expect(query(page)).toBeFocused();
  await query(page).fill(text);
}

/** Where the editor stands: the slide on the Stage and what is selected and edited on it. */
export const place = (page: Page) =>
  page.evaluate(() => {
    const s = window.slidr!.selection.getState();
    return { slide: s.currentSlideId, selected: s.selectedElementIds, editing: s.editingElementId };
  });

/** The text of an element by id, of one of its table cells, or of a slide's notes. */
export const textOf = (page: Page, id: string, at?: { row: number; col: number }) =>
  page.evaluate(
    ({ id, at }) => {
      type Text = { paragraphs: { runs: { text: string }[] }[] };
      type Node = { id: string; content?: Text; cells?: { content: Text }[][]; children?: Node[] };
      const plain = (text: Text | undefined) =>
        (text?.paragraphs ?? []).map((p) => p.runs.map((r) => r.text).join('')).join('\n');
      const walk = (list: Node[]): Node | undefined => {
        for (const node of list) {
          if (node.id === id) return node;
          const inside = node.children && walk(node.children);
          if (inside) return inside;
        }
        return undefined;
      };
      for (const slide of window.slidr!.bus.deck.slides) {
        if (slide.id === id) return plain(slide.notes);
        const node = walk(slide.elements);
        if (node) return plain(at ? node.cells?.[at.row]?.[at.col]?.content : node.content);
      }
      throw new Error(`No text in ${id}`);
    },
    { id, at },
  );

/** What the Stage marks: the text under every soft mark, and under the mark of the current match. */
export const marks = (page: Page) =>
  page.evaluate(() => {
    const texts = (name: string) =>
      [...(CSS.highlights.get(name) ?? [])].map((range) => (range as Range).toString());
    return { soft: texts('slidr-find'), current: texts('slidr-find-current') };
  });

export const undoSteps = (page: Page) => page.evaluate(() => window.slidr!.bus.undoStack.length);

export const deckJson = (page: Page) => page.evaluate(() => JSON.stringify(window.slidr!.bus.deck));
