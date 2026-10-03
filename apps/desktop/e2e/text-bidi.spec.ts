import { expect, test, type Page } from '@playwright/test';
import {
  addText,
  caret,
  edit,
  move,
  para,
  paragraphs,
  plain,
  setSelection,
  type TestParagraph,
} from './text-helpers';

/*
 * The BiDi suite (WG4-T07, TXT-14): mixed Hebrew and English text in the slide text editor.
 *
 * The browser lays the text out and moves the caret (ADR-006 rule 2); what these tests pin is that
 * the editor leaves that alone: the caret, the selection, Home and End behave exactly as in a plain
 * `contenteditable` with the same text, what is typed reaches the model in logical order, and the
 * text is drawn in the order the bidi algorithm gives. The logic that is Slidr's own (which way
 * `dir: auto` resolves) is unit-tested in `src/text/bidi.test.ts`.
 *
 * In Chromium the arrow keys are logical in the paragraph's direction: in a right-to-left
 * paragraph the Left arrow is "forward", also through an English word, where the caret then moves
 * against the arrow (ADR-006, accepted). The UI and the deck are Hebrew, the default.
 */

test.describe.configure({ timeout: 90_000 });

const ID = 'e_bidi';
const editor = (page: Page) => page.locator('[data-text-editor]');

const RTL_TEXT = 'שלום world שוב 123 סוף.';
const LTR_TEXT = 'Hello שלום again 42.';

async function open(page: Page, paragraphList: TestParagraph[], lang: 'he' | 'en' = 'he') {
  await page.addInitScript((language) => localStorage.setItem('slidr.language', language), lang);
  await page.goto('/');
  await expect(page.getByTestId('stage-frame')).toBeVisible();
  await addText(page, ID, paragraphList);
  await edit(page, ID);
}

/** The direction the browser resolved for each paragraph in the editor. */
const directions = (page: Page) =>
  editor(page)
    .locator('p')
    .evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).direction));

/**
 * The horizontal extent of every character of a paragraph in the editor, by its logical index.
 * List markers and other things the editor draws around the text are not characters of it.
 */
function charBoxes(page: Page, paragraph = 0): Promise<{ left: number; right: number }[]> {
  return editor(page)
    .locator('p')
    .nth(paragraph)
    .evaluate((p) => {
      const boxes: { left: number; right: number }[] = [];
      const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (node.parentElement?.closest('[contenteditable="false"]')) continue;
        for (let i = 0; i < (node.nodeValue ?? '').length; i++) {
          const range = document.createRange();
          range.setStart(node, i);
          range.setEnd(node, i + 1);
          const rect = range.getBoundingClientRect();
          boxes.push({ left: rect.left, right: rect.right });
        }
      }
      return boxes;
    });
}

/** A plain `contenteditable` with the same text and direction, to compare the browser's own behaviour. */
async function reference(page: Page, text: string, dir: 'rtl' | 'ltr') {
  await page.evaluate(
    ({ text, dir }) => {
      document.getElementById('bidi-reference')?.remove();
      const p = document.createElement('p');
      p.id = 'bidi-reference';
      p.contentEditable = 'true';
      p.dir = dir;
      p.textContent = text;
      Object.assign(p.style, {
        position: 'fixed',
        insetInlineStart: '0',
        top: '0',
        width: '900px',
        margin: '0',
        font: '24px Heebo, sans-serif',
        background: 'white',
        color: 'black',
        zIndex: '9999',
        userSelect: 'text',
      });
      document.body.append(p);
      p.focus();
      getSelection()?.collapse(p.firstChild, 0);
    },
    { text, dir },
  );
}

const referenceSelection = (page: Page) =>
  page.evaluate(() => {
    const selection = getSelection();
    return { anchor: selection?.anchorOffset ?? -1, head: selection?.focusOffset ?? -1 };
  });

/** Presses a key `times` times and returns where the head of the selection was after each press. */
async function walk(
  page: Page,
  key: string,
  times: number,
  read: () => Promise<number>,
): Promise<number[]> {
  const out: number[] = [];
  for (let i = 0; i < times; i++) {
    await move(page, key);
    out.push(await read());
  }
  return out;
}

const range = (from: number, to: number) =>
  Array.from({ length: Math.abs(to - from) + 1 }, (_, i) => (to >= from ? from + i : from - i));

test.describe('typing', () => {
  test('mixed text reaches the model in the order it was typed', async ({ page }) => {
    await open(page, [para('')]);
    const text = 'ה-API החדש עלה ל-production ב-12.10 (גרסה 2.3), ועולה 100% יותר!';
    await page.keyboard.type(text);
    expect(await plain(page, ID)).toBe(text);
    await expect(editor(page).locator('p')).toHaveText(text);
    expect(await directions(page)).toEqual(['rtl']);

    // A second paragraph that starts in English is laid out the other way; the model is as typed.
    await page.keyboard.press('Enter');
    const english = 'Version 2.3 של Slidr (beta): 40% faster.';
    await page.keyboard.type(english);
    expect(await plain(page, ID)).toBe(`${text}\n${english}`);
    expect(await directions(page)).toEqual(['rtl', 'ltr']);
    expect((await paragraphs(page, ID)).map((p) => p.dir)).toEqual(['auto', 'auto']);
  });

  test('dir auto follows the first strong character, as it is typed', async ({ page }) => {
    await open(page, [para('')]);
    const p = editor(page).locator('p');
    // No text yet: the caret starts on the side of the deck's direction.
    await expect(p).toHaveAttribute('dir', 'rtl');

    // Digits and punctuation are not strong: the browser lays such a line out from the left.
    await page.keyboard.type('12. ');
    await expect(p).toHaveAttribute('dir', 'auto');
    expect(await directions(page)).toEqual(['ltr']);
    // The first letter decides.
    await page.keyboard.type('ש');
    expect(await directions(page)).toEqual(['rtl']);
    await page.keyboard.type('לום world');
    expect(await directions(page)).toEqual(['rtl']);
    expect(await plain(page, ID)).toBe('12. שלום world');

    // The same with an English letter first.
    for (let i = 0; i < 14; i++) await page.keyboard.press('Backspace');
    await expect(p).toHaveAttribute('dir', 'rtl');
    await page.keyboard.type('(3) ok שלום');
    expect(await directions(page)).toEqual(['ltr']);
    expect((await paragraphs(page, ID))[0]?.dir).toBe('auto');
  });

  test('in an English deck the caret of an empty line starts on the left', async ({ page }) => {
    await open(page, [para('')], 'en');
    await expect(editor(page).locator('p')).toHaveAttribute('dir', 'ltr');
    await page.keyboard.type('שלום');
    expect(await directions(page)).toEqual(['rtl']);
  });

  test('typing at a direction boundary goes where the caret is, logically', async ({ page }) => {
    await open(page, [para('שלום world', { dir: 'rtl' })]);
    // Between the Hebrew word and the English one, reached with the arrow keys.
    await move(page, 'Home');
    for (let i = 0; i < 5; i++) await move(page, 'ArrowLeft');
    expect((await caret(page)).offset).toBe(5);
    await page.keyboard.type('א');
    await page.keyboard.type('b');
    expect(await plain(page, ID)).toBe('שלום אbworld');
    expect((await caret(page)).offset).toBe(7);

    // At the end of the English word, inside the Hebrew sentence.
    await setSelection(page, 13);
    await page.keyboard.type('s');
    await page.keyboard.type(' ושלום');
    await page.keyboard.type(', 5 פעמים.');
    expect(await plain(page, ID)).toBe('שלום אbworlds ושלום, 5 פעמים.');
    // Backspace takes the character before the caret in logical order, whatever its direction.
    await setSelection(page, 8);
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Backspace');
    expect(await plain(page, ID)).toBe('שלוםworlds ושלום, 5 פעמים.');
    await page.keyboard.press('Delete');
    expect(await plain(page, ID)).toBe('שלוםorlds ושלום, 5 פעמים.');
  });
});

test.describe('the caret', () => {
  for (const { name, text, dir, forward, back } of [
    { name: 'right to left', text: RTL_TEXT, dir: 'rtl', forward: 'ArrowLeft', back: 'ArrowRight' },
    { name: 'left to right', text: LTR_TEXT, dir: 'ltr', forward: 'ArrowRight', back: 'ArrowLeft' },
  ] as const) {
    test(`arrows cross direction boundaries one position at a time, in a ${name} paragraph`, async ({
      page,
    }) => {
      await open(page, [para(text, { dir })]);
      const offset = async () => (await caret(page)).offset;
      await move(page, 'Home');
      expect(await offset()).toBe(0);
      // Every press is one logical position on, through the other-direction word and the number;
      // none is skipped and the caret is never stuck.
      const there = await walk(page, forward, text.length, offset);
      expect(there).toEqual(range(1, text.length));
      // At the end, one more press stays at the end.
      expect(await walk(page, forward, 1, offset)).toEqual([text.length]);
      const andBack = await walk(page, back, text.length, offset);
      expect(andBack).toEqual(range(text.length - 1, 0));

      // And it is exactly what a plain contenteditable does with the same keys.
      await reference(page, text, dir);
      const plainOffset = async () => (await referenceSelection(page)).head;
      expect(await walk(page, forward, text.length + 1, plainOffset)).toEqual([
        ...there,
        text.length,
      ]);
      expect(await walk(page, back, text.length, plainOffset)).toEqual(andBack);
    });
  }

  test('Ctrl+arrow moves by words as a plain contenteditable does', async ({ page }) => {
    await open(page, [para(RTL_TEXT, { dir: 'rtl' })]);
    const offset = async () => (await caret(page)).offset;
    await move(page, 'Home');
    // Forward through the text to its end, word by word, and back to its start.
    const words = await walk(page, 'Control+ArrowLeft', 6, offset);
    const back = await walk(page, 'Control+ArrowRight', 6, offset);
    expect(words).toEqual([5, 11, 15, 19, 22, 23]);
    expect(back).toEqual([22, 19, 15, 11, 5, 0]);

    await reference(page, RTL_TEXT, 'rtl');
    const plainOffset = async () => (await referenceSelection(page)).head;
    expect(await walk(page, 'Control+ArrowLeft', 6, plainOffset)).toEqual(words);
    expect(await walk(page, 'Control+ArrowRight', 6, plainOffset)).toEqual(back);
  });

  // In the app, Chromium answers Ctrl+arrow at the very start of the text by jumping to its end
  // (and Ctrl+Shift+arrow by selecting all of it). The editor takes the key there instead.
  for (const { name, text, dir, back, forward } of [
    { name: 'right to left', text: RTL_TEXT, dir: 'rtl', back: 'ArrowRight', forward: 'ArrowLeft' },
    { name: 'left to right', text: LTR_TEXT, dir: 'ltr', back: 'ArrowLeft', forward: 'ArrowRight' },
  ] as const) {
    test(`Ctrl+arrow at the ends of a ${name} text stays there`, async ({ page }) => {
      await open(page, [para(text, { dir })]);
      await move(page, 'Home');
      await move(page, `Control+${back}`);
      expect(await caret(page)).toMatchObject({ offset: 0, empty: true });
      await move(page, `Control+Shift+${back}`);
      expect(await caret(page)).toMatchObject({ offset: 0, empty: true });
      await move(page, 'End');
      await move(page, `Control+${forward}`);
      expect(await caret(page)).toMatchObject({ offset: text.length, empty: true });
      await move(page, `Control+Shift+${forward}`);
      expect(await caret(page)).toMatchObject({ offset: text.length, empty: true });
      // Away from the ends the keys do move and select.
      await move(page, `Control+Shift+${back}`);
      expect((await caret(page)).empty).toBe(false);
    });
  }

  test('Home and End go to the logical ends of the line, on the side the paragraph starts', async ({
    page,
  }) => {
    await open(page, [para(RTL_TEXT, { dir: 'rtl' }), para(LTR_TEXT, { dir: 'ltr' })]);
    const box = await editor(page).boundingBox();
    const middle = box!.x + box!.width / 2;

    // The caret is at the end of the second paragraph (left to right).
    await move(page, 'Home');
    expect(await caret(page)).toMatchObject({ offset: 0, empty: true });
    await move(page, 'End');
    expect((await caret(page)).offset).toBe(LTR_TEXT.length);
    const ltr = await charBoxes(page, 1);
    // Its first character is at the left edge, its last (the full stop) at the right end.
    expect(ltr[0]!.left).toBeLessThan(middle);
    expect(ltr.at(-1)!.left).toBeGreaterThan(ltr[0]!.left);
    expect(Math.abs(ltr[0]!.left - box!.x)).toBeLessThan(2);

    // The first paragraph reads right to left: Home is its right edge, End its left end.
    await setSelection(page, 5);
    await move(page, 'End');
    expect((await caret(page)).offset).toBe(RTL_TEXT.length);
    await move(page, 'Home');
    expect((await caret(page)).offset).toBe(0);
    const rtl = await charBoxes(page, 0);
    expect(Math.abs(rtl[0]!.right - (box!.x + box!.width))).toBeLessThan(2);
    expect(rtl.at(-1)!.right).toBeLessThan(rtl[0]!.left);

    // Ctrl+Home and Ctrl+End are the ends of the whole text.
    await move(page, 'Control+End');
    expect((await caret(page)).head).toBe(RTL_TEXT.length + LTR_TEXT.length + 3);
    await move(page, 'Control+Home');
    expect((await caret(page)).head).toBe(1);
  });
});

test.describe('selection', () => {
  test('Shift+arrow selects a contiguous stretch of the text across a boundary', async ({
    page,
  }) => {
    await open(page, [para(RTL_TEXT, { dir: 'rtl' })]);
    // From inside the Hebrew word, over the space and into the English one: "ום wor".
    await setSelection(page, 3);
    const heads = await walk(page, 'Shift+ArrowLeft', 6, async () => (await caret(page)).head);
    expect(heads).toEqual(range(4, 9));
    expect(await caret(page)).toMatchObject({ anchor: 3, head: 9, from: 3, to: 9 });

    // The same keys in a plain contenteditable select the same characters.
    await reference(page, RTL_TEXT, 'rtl');
    await page.evaluate(() => {
      const p = document.getElementById('bidi-reference')!;
      getSelection()?.collapse(p.firstChild, 2);
    });
    await walk(page, 'Shift+ArrowLeft', 6, async () => (await referenceSelection(page)).head);
    expect(await referenceSelection(page)).toEqual({ anchor: 2, head: 8 });
    await page.evaluate(() => document.getElementById('bidi-reference')?.remove());

    // What is selected is one logical range: formatting it splits the text at its two ends,
    await editor(page).evaluate((dom) =>
      (dom as unknown as { editor: { view: { focus(): void } } }).editor.view.focus(),
    );
    await page.keyboard.press('Control+b');
    expect((await paragraphs(page, ID))[0]?.runs).toEqual([
      { text: 'של' },
      { text: 'ום wor', marks: { weight: 700 } },
      { text: 'ld שוב 123 סוף.' },
    ]);
    // and typing replaces exactly it.
    await page.keyboard.type('X');
    expect(await plain(page, ID)).toBe('שלXld שוב 123 סוף.');
  });

  test('Shift+Home and Shift+End select to the logical ends of the line', async ({ page }) => {
    await open(page, [para(RTL_TEXT, { dir: 'rtl' })]);
    await setSelection(page, 12);
    await move(page, 'Shift+End');
    expect(await caret(page)).toMatchObject({ from: 12, to: RTL_TEXT.length + 1, head: 24 });
    await page.keyboard.press('Control+i');
    expect((await paragraphs(page, ID))[0]?.runs).toEqual([
      { text: 'שלום world ' },
      { text: 'שוב 123 סוף.', marks: { italic: true } },
    ]);
    await setSelection(page, 12);
    await move(page, 'Shift+Home');
    expect(await caret(page)).toMatchObject({ from: 1, to: 12, head: 1 });
  });

  test('a double click selects a word of either direction', async ({ page }) => {
    await open(page, [para(RTL_TEXT, { dir: 'rtl' })]);
    const boxes = await charBoxes(page);
    const line = await editor(page).locator('p').boundingBox();
    const y = line!.y + line!.height / 2;
    const selected = async () => {
      const { from, to } = await caret(page);
      return RTL_TEXT.slice(from - 1, to - 1).trim();
    };
    // The middle of "world", and the middle of "שוב".
    await page.mouse.dblclick((boxes[7]!.left + boxes[7]!.right) / 2, y);
    await expect.poll(selected).toBe('world');
    await page.mouse.dblclick((boxes[12]!.left + boxes[12]!.right) / 2, y);
    await expect.poll(selected).toBe('שוב');
  });
});

test.describe('how mixed text is drawn', () => {
  /** The left edge of the character at a logical index. */
  const x = (boxes: { left: number }[], index: number) => boxes[index]!.left;

  test('punctuation at the end of a line goes to the end side of the paragraph', async ({
    page,
  }) => {
    await open(page, [para('שלום world!', { dir: 'rtl' }), para('Hello שלום!', { dir: 'ltr' })]);
    // Right to left: the "!" after the English word is at the far left, not next to the "d".
    const rtl = await charBoxes(page, 0);
    const bang = x(rtl, 10);
    for (let i = 0; i < 10; i++) expect(bang).toBeLessThan(x(rtl, i));
    // The English word itself reads from the left: w, o, r, l, d.
    expect([5, 6, 7, 8, 9].map((i) => x(rtl, i))).toEqual(
      [5, 6, 7, 8, 9].map((i) => x(rtl, i)).sort((a, b) => a - b),
    );
    // And the Hebrew word from the right.
    expect(x(rtl, 0)).toBeGreaterThan(x(rtl, 3));

    // Left to right: the "!" after the Hebrew word is at the far right.
    const ltr = await charBoxes(page, 1);
    for (let i = 0; i < 10; i++) expect(x(ltr, 10)).toBeGreaterThan(x(ltr, i));
    // The Hebrew word reads from the right inside the English line: ש is to the right of ם.
    expect(x(ltr, 6)).toBeGreaterThan(x(ltr, 9));
  });

  test('numbers read from the left inside Hebrew, with their own punctuation', async ({ page }) => {
    const text = 'מחיר 1,250.50 שקל (כולל 17%) עד 12.10.';
    await open(page, [para(text, { dir: 'rtl' })]);
    const boxes = await charBoxes(page);
    const at = (part: string) => text.indexOf(part);

    // "1,250.50": the digits, the comma and the point run left to right as one number.
    const number = range(at('1,250.50'), at('1,250.50') + 7).map((i) => x(boxes, i));
    expect(number).toEqual([...number].sort((a, b) => a - b));
    // The number sits between the words around it: left of "מחיר", right of "שקל".
    expect(Math.max(...number)).toBeLessThan(x(boxes, at('מחיר') + 3));
    expect(Math.min(...number)).toBeGreaterThan(x(boxes, at('שקל')));

    // "17%": the percent sign stays with its number, after it.
    expect(x(boxes, at('17%') + 2)).toBeGreaterThan(x(boxes, at('17%') + 1));
    // The brackets enclose their content: "(" is on the right of it, ")" on its left.
    expect(x(boxes, at('('))).toBeGreaterThan(x(boxes, at('כולל')));
    expect(x(boxes, at(')'))).toBeLessThan(x(boxes, at('17%')));

    // "12.10." at the end: the date reads from the left, and the full stop that ends the
    // sentence is to its left, at the end of the line.
    const date = range(at('12.10'), at('12.10') + 4).map((i) => x(boxes, i));
    expect(date).toEqual([...date].sort((a, b) => a - b));
    expect(x(boxes, text.length - 1)).toBeLessThan(Math.min(...date));
  });

  test('a hyphenated Hebrew prefix stays with its English word', async ({ page }) => {
    const text = 'ה-API עלה ל-production';
    await open(page, [para(text, { dir: 'rtl' })]);
    const boxes = await charBoxes(page);
    // ה, then the hyphen, then API to their left, reading A, P, I from the left.
    expect(x(boxes, 0)).toBeGreaterThan(x(boxes, 1));
    expect(x(boxes, 1)).toBeGreaterThan(x(boxes, 4));
    expect(x(boxes, 2)).toBeLessThan(x(boxes, 3));
    expect(x(boxes, 3)).toBeLessThan(x(boxes, 4));
    // "production" is the leftmost thing on the line.
    expect(x(boxes, text.indexOf('production'))).toBeLessThan(x(boxes, text.indexOf('עלה') + 2));
  });

  test('turning a paragraph the other way moves its neutral ends, not its text', async ({
    page,
  }) => {
    await open(page, [para('שלום world!')]);
    const before = await charBoxes(page);
    expect(x(before, 10)).toBeLessThan(x(before, 5));
    // Ctrl+Shift+X: the paragraph resolved right to left, so it becomes left to right.
    await page.keyboard.press('Control+Shift+x');
    expect((await paragraphs(page, ID))[0]?.dir).toBe('ltr');
    expect(await directions(page)).toEqual(['ltr']);
    const after = await charBoxes(page);
    // The "!" now ends the line on the right; the model's text is what it was.
    expect(x(after, 10)).toBeGreaterThan(x(after, 9));
    expect(await plain(page, ID)).toBe('שלום world!');
    await page.keyboard.press('Control+Shift+x');
    expect((await paragraphs(page, ID))[0]?.dir).toBe('rtl');
  });
});

test.describe('list markers', () => {
  const lettered = (dir: TestParagraph['dir']): TestParagraph[] => [
    para('ראשון', { dir, list: { kind: 'number', level: 0 } }),
    // The second level of a numbered list is lettered: "a.", "b.".
    para('פריט בעברית', { dir, list: { kind: 'number', level: 1 } }),
    para('English item', { dir, list: { kind: 'number', level: 1 } }),
  ];

  test('a lettered marker does not turn a Hebrew dir-auto item around', async ({ page }) => {
    await open(page, lettered('auto'));
    // "a." is not part of the text: the item is still right to left, by its own first letter.
    expect(await directions(page)).toEqual(['rtl', 'rtl', 'ltr']);
    const markers = editor(page).locator('[data-slidr-marker]');
    await expect(markers).toHaveText(['1.', 'a.', 'b.']);
    // The marker is on the start side of its item: right of Hebrew text, left of English text.
    const marker = await markers.nth(1).boundingBox();
    const hebrew = await charBoxes(page, 1);
    expect(marker!.x).toBeGreaterThan(hebrew[0]!.left);
    const englishMarker = await markers.nth(2).boundingBox();
    const english = await charBoxes(page, 2);
    expect(englishMarker!.x).toBeLessThan(english[0]!.left);
  });

  // The renderer draws the marker inside the `dir="auto"` item without a direction of its own, so
  // the "a" of the marker is the first strong character and the Hebrew item is laid out left to
  // right; the editor then moves it when editing starts. To fix in packages/renderer (text.tsx,
  // `Marker`): give the marker the resolved direction of its paragraph. See the report of WG4.
  test.fixme('the Stage draws a lettered Hebrew dir-auto item right to left, as the editor does', async ({
    page,
  }) => {
    await open(page, lettered('auto'));
    await page.keyboard.press('Escape');
    const item = page.getByTestId('stage-surface').locator(`[data-element-id="${ID}"] li`).nth(1);
    expect(await item.evaluate((node) => getComputedStyle(node).direction)).toBe('rtl');
  });
});

test.describe('the editor draws mixed text where the Stage drew it', () => {
  /** Line boxes of every paragraph and marker in an element, in page pixels. */
  const lineBoxes = (page: Page, id: string) =>
    page
      .getByTestId('stage-surface')
      .locator(`[data-element-id="${id}"]`)
      .evaluate((root) =>
        Array.from(root.querySelectorAll('p, li, [data-slidr-marker]'), (el) => {
          const r = el.getBoundingClientRect();
          return { left: r.left, top: r.top, width: r.width, height: r.height };
        }),
      );

  for (const { slide, ids } of [
    { slide: 0, ids: ['e_mx_summary_title', 'e_mx_summary_body'] },
    { slide: 1, ids: ['e_mx_quote_he', 'e_mx_quote_en'] },
  ]) {
    test(`nothing moves when editing starts: the mixed deck, slide ${slide + 1}`, async ({
      page,
    }) => {
      await page.goto(`/dev/stage.html?deck=mixed&slide=${slide}`);
      await page.getByTestId('stage-surface').locator(`[data-element-id="${ids[0]}"]`).waitFor();
      await page.evaluate(() => document.fonts.ready);
      for (const id of ids) {
        const before = await lineBoxes(page, id);
        const text = await plain(page, id);
        await edit(page, id);
        const after = await lineBoxes(page, id);
        expect(after.length).toBe(before.length);
        after.forEach((box, i) => {
          expect(Math.abs(box.left - before[i]!.left)).toBeLessThan(0.6);
          expect(Math.abs(box.top - before[i]!.top)).toBeLessThan(0.6);
          expect(Math.abs(box.width - before[i]!.width)).toBeLessThan(0.6);
          expect(Math.abs(box.height - before[i]!.height)).toBeLessThan(0.6);
        });
        await page.keyboard.press('Escape');
        // Opening and closing the editor changes nothing in the model.
        expect(await plain(page, id)).toBe(text);
      }
    });
  }
});
