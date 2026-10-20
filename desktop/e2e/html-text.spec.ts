import { expect, test, type Page } from '@playwright/test';
import { addElement, onStage, openApp, pageProblems, undoDepth } from './objects-helpers';

// Editing text inside an `html` element in place (WG5-T16a, HTM-03, IMP-13): a double-click
// edits the text where it stands, and the structure of the markup never changes.

const ID = 'e_html';

const MARKUP = [
  '<div class="card">',
  '<h2>Quarterly <b>results</b> are in</h2>',
  '<p class="lead">Revenue grew by <span class="num">17%</span> this year.</p>',
  '<ul><li>First item</li><li>פריט שני בעברית</li></ul>',
  '<script>window.hacked = true;</script>',
  '</div>',
].join('');

const STYLES = `
  .card { box-sizing: border-box; width: 900px; height: 420px; padding: 40px; background: #f3f4f6;
    font: 30px/1.4 Arial, sans-serif; color: #15171a; }
  h2 { margin: 0 0 16px; font-size: 44px; }
  p { margin: 0 0 16px; }
  .num { color: #e5484d; font-weight: 700; }
  ul { margin: 0; padding-inline-start: 32px; }
`;

const html = (extra: Record<string, unknown> = {}) => ({
  id: ID,
  type: 'html',
  frame: { x: 400, y: 260, w: 900, h: 420 },
  markup: MARKUP,
  styles: STYLES,
  hasScripts: false,
  natural: { w: 900, h: 420 },
  ...extra,
});

test.afterEach(({ page }) => {
  // The frame of an element with scripts reports its own sandbox (the thumbnail runs none).
  expect(pageProblems(page).filter((problem) => !problem.includes('sandboxed'))).toEqual([]);
});

const markup = (page: Page) =>
  page.evaluate((id) => {
    const slide = window.slidr!.bus.deck.slides[0]!;
    return (slide.elements.find((e) => e.id === id) as { markup: string }).markup;
  }, ID);

const editingId = (page: Page) =>
  page.evaluate(() => window.slidr!.selection.getState().editingElementId);

/** The tags of a markup, in order: the structure, without its text. */
const structure = (text: string) => text.match(/<[^>]+>/g) ?? [];

/** Double-clicks a point inside an element of the content: its left part, or its right end. */
async function enter(page: Page, selector: string, at: 'start' | 'end' = 'end') {
  const box = (await onStage(page, ID).locator(selector).boundingBox())!;
  const x = at === 'end' ? box.x + box.width - 3 : box.x + 3;
  await page.mouse.dblclick(x, box.y + box.height / 2);
  await expect.poll(() => editingId(page)).toBe(ID);
}

/** Where every line of text of the content is drawn. */
function lines(page: Page) {
  return onStage(page, ID).evaluate((root) => {
    const shadow = root.querySelector('[data-slidr-html="shadow"]')!.shadowRoot!;
    return Array.from(shadow.querySelectorAll('h2, p, li'), (block) => {
      const range = document.createRange();
      range.selectNodeContents(block);
      return Array.from(range.getClientRects(), (r) => [r.left, r.top, r.width, r.height]);
    });
  });
}

test('a double-click edits the text of an html element where it stands', async ({ page }) => {
  await openApp(page, { lang: 'en' });
  await addElement(page, html());
  const before = await lines(page);
  const steps = await undoDepth(page);

  // The caret goes where the double-click was: the end of the paragraph.
  await enter(page, 'p.lead');
  // Nothing moved when the editing started.
  const during = await lines(page);
  expect(during.length).toBe(before.length);
  during.forEach((block, i) =>
    block.forEach((line, n) =>
      line.forEach((value, k) => expect(Math.abs(value - before[i]![n]![k]!)).toBeLessThan(0.6)),
    ),
  );
  await page.screenshot({ path: 'test-results/table/html-text-editing.png' });

  await page.keyboard.type(' So far');
  const typed = await markup(page);
  expect(typed).toContain('<span class="num">17%</span> this year. So far</p>');
  // The structure is the markup's own, script and all: only text changed.
  expect(structure(typed)).toEqual(structure(MARKUP));
  // A burst of typing is one undo step.
  expect(await undoDepth(page)).toBe(steps + 1);

  // The app's shortcuts do not hear what is typed: T adds no text box, Delete removes nothing.
  await page.keyboard.type(' today');
  await page.keyboard.press('Delete');
  expect(await page.evaluate(() => window.slidr!.bus.deck.slides[0]!.elements.length)).toBe(1);
  expect(await markup(page)).toContain('this year. So far today</p>');

  // Ctrl+Z is the deck's, and the editing goes on.
  await page.keyboard.press('Control+z');
  expect(await markup(page)).toBe(MARKUP);
  expect(await editingId(page)).toBe(ID);
  await page.keyboard.press('Control+y');
  expect(await markup(page)).toContain('So far today');

  // Esc ends the editing; the element stays selected, with its handles.
  await page.keyboard.press('Escape');
  expect(await editingId(page)).toBeNull();
  await expect(page.getByTestId('stage-surface').locator('[data-handle="se"]')).toBeVisible();
  // The content is the model's again, and nothing in the page ran the script.
  expect(
    await page.evaluate(() => (window as unknown as { hacked?: boolean }).hacked),
  ).toBeUndefined();
});

test('editing keeps the elements of the markup: no joining, no deleting, no new lines', async ({
  page,
}) => {
  await openApp(page, { lang: 'en' });
  await addElement(page, html());
  await enter(page, 'h2', 'end');

  // Enter adds no line.
  await page.keyboard.press('Enter');
  expect(await markup(page)).toBe(MARKUP);

  // Backspace goes through the text, also the text of the <b>; the <b> itself stays.
  for (let i = 0; i < ' are in'.length + 3; i++) await page.keyboard.press('Backspace');
  const shorter = await markup(page);
  expect(shorter).toContain('<h2>Quarterly <b>resu</b></h2>');
  expect(structure(shorter)).toEqual(structure(MARKUP));
  // And on, past the last letter of the <b> and into the text before it: no element goes.
  for (let i = 0; i < 8; i++) await page.keyboard.press('Backspace');
  expect(structure(await markup(page))).toEqual(structure(MARKUP));

  // Text typed where the text ran out is text of the same heading.
  await page.keyboard.type(' 2026');
  expect(structure(await markup(page))).toEqual(structure(MARKUP));
  expect(await markup(page)).toContain('2026');

  // A selection across elements is not replaced by typing.
  const now = await markup(page);
  await page.keyboard.press('Control+a');
  await page.keyboard.type('x');
  expect(structure(await markup(page))).toEqual(structure(now));
  await page.keyboard.press('Escape');
});

test('Hebrew text in an html element is typed in its own place and direction', async ({ page }) => {
  await openApp(page);
  await addElement(page, html());
  await enter(page, 'li:nth-child(2)', 'start');
  await page.keyboard.press('End');
  await page.keyboard.type(' ועוד API אחד');
  expect(await markup(page)).toContain('<li>פריט שני בעברית ועוד API אחד</li>');
  expect(structure(await markup(page))).toEqual(structure(MARKUP));
  await page.screenshot({ path: 'test-results/table/html-text-hebrew.png' });
});

test('pasted text goes in as plain text on one line', async ({ page }) => {
  await openApp(page, { lang: 'en' });
  await addElement(page, html());
  await enter(page, 'li:nth-child(1)', 'end');
  await page.evaluate(() => {
    const root = document.querySelector(
      '[data-testid="stage-surface"] [data-slidr-html="shadow"]',
    )!.shadowRoot!;
    const clipboardData = new DataTransfer();
    clipboardData.setData('text/plain', ' and\nmore');
    clipboardData.setData('text/html', '<b onclick="window.hacked = true"> and</b><p>more</p>');
    root.querySelector('li')!.dispatchEvent(
      new ClipboardEvent('paste', {
        clipboardData,
        bubbles: true,
        cancelable: true,
        composed: true,
      }),
    );
  });
  expect(await markup(page)).toContain('<li>First item and more</li>');
  expect(structure(await markup(page))).toEqual(structure(MARKUP));
  // The paste did not land on the slide as a text box of its own.
  expect(await page.evaluate(() => window.slidr!.bus.deck.slides[0]!.elements.length)).toBe(1);
});

test('a press outside the element ends the editing, and an element with scripts is not edited', async ({
  page,
}) => {
  await openApp(page, { lang: 'en' });
  await addElement(page, html());
  await enter(page, 'p.lead');
  const frame = (await page.getByTestId('stage-frame').boundingBox())!;
  await page.mouse.click(frame.x + 40, frame.y + 40);
  expect(await editingId(page)).toBeNull();

  // With scripts the content runs in a sandboxed frame: a double-click selects, and no more.
  await page.evaluate((id) => {
    const editor = window.slidr!;
    const slideId = editor.selection.getState().currentSlideId!;
    editor.bus.dispatch({
      type: 'element.update',
      slideId,
      elementId: id,
      patch: { hasScripts: true },
    });
  }, ID);
  const box = (await onStage(page, ID).boundingBox())!;
  await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(100);
  expect(await editingId(page)).toBeNull();
  await page.keyboard.press('Enter');
  expect(await editingId(page)).toBeNull();
});
