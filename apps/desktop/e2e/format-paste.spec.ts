import { expect, test, type Locator, type Page } from '@playwright/test';
import { coords, editor } from './editor-text-helpers';
import { fakeClipboard, menu, menuItem, openSub, clickInSub } from './format-helpers';
import { openApp, pageProblems } from './objects-helpers';
import {
  addText,
  edit,
  oneUndoStep,
  para,
  paragraphs,
  plain,
  setSelection,
  steps,
} from './text-helpers';

/*
 * Pasting from outside with a choice (TXT-13; PLAN WG4 left "keep the source's formatting"
 * undone): keep the formatting of the source, take the formatting of where the text lands, or
 * the text alone; by key, and from the menu of the text.
 *
 * The clipboard of this computer is shared with the person at it and with every other run, so no
 * test touches it. A key is followed by the paste event the browser would send, with the test's
 * own data; a menu reads a clipboard the test puts in the page (`fakeClipboard`). Everything
 * from the event, or from the read, on is the real path.
 */

test.describe.configure({ timeout: 90_000 });

const ID = 'e_paste';

/** A line from a word processor: centred, in Rubik at 14pt, dark red, its first word bold. */
const FROM_OUTSIDE = {
  'text/html':
    "<meta charset='utf-8'><p style='text-align:center'>" +
    '<span style=\'font-family:"Rubik",sans-serif; font-size:14.0pt; color:rgb(192, 0, 0)\'>' +
    '<b>Bold</b> red</span></p>',
  'text/plain': 'Bold red',
};

/** As it lands with its source formatting: 14pt is 28 pixels of a slide. */
const KEPT = { font: 'Rubik', size: 28, color: { value: '#c00000' } };

type Key = 'ctrl-v' | 'ctrl-shift-v' | 'shift-insert';

/** A key that pastes, and the paste event the browser sends after it, with the given clipboard. */
async function paste(page: Page, data: Record<string, string>, key: Key = 'ctrl-v') {
  await editor(page).evaluate(
    (dom, { data, key }) => {
      const insert = key === 'shift-insert';
      dom.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: insert ? 'Insert' : 'V',
          code: insert ? 'Insert' : 'KeyV',
          ctrlKey: !insert,
          shiftKey: key !== 'ctrl-v',
          bubbles: true,
          cancelable: true,
        }),
      );
      const clipboardData = new DataTransfer();
      for (const [type, value] of Object.entries(data)) clipboardData.setData(type, value);
      dom.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }),
      );
    },
    { data, key },
  );
}

const runs = async (page: Page) => (await paragraphs(page, ID))[0]?.runs;

/**
 * A right click in the text, at a position of the editor's document: the caret goes there, as
 * the browser's own does, and the menu of the text opens.
 */
async function rightClickText(page: Page, pos = 7): Promise<Locator> {
  const at = await coords(page, pos);
  await page.mouse.click(at.x, at.y, { button: 'right' });
  await expect(menu(page)).toBeVisible();
  return menu(page);
}

/** Picks one of the three kinds of paste from the sub-menu of the text's menu, opened at `pos`. */
async function pasteSpecial(page: Page, name: string, pos = 7): Promise<void> {
  await rightClickText(page, pos);
  const sub = await openSub(page, 'הדבקה מיוחדת', 'text-menu-paste');
  await clickInSub(page, menuItem(page, 'הדבקה מיוחדת'), sub.getByRole('menuitem', { name }));
}

test.afterEach(({ page }) => {
  expect(pageProblems(page)).toEqual([]);
});

test.beforeEach(async ({ page }) => {
  await openApp(page);
  await addText(page, ID, [para('Start end', { styleRef: 'heading' })]);
  await edit(page, ID);
  // The caret is after "Start ".
  await setSelection(page, 7);
});

test.describe('by key', () => {
  test('Shift+Insert keeps the font, the size, the colour and the weight of the source', async ({
    page,
  }) => {
    const after = await oneUndoStep(page, ID, () => paste(page, FROM_OUTSIDE, 'shift-insert'));
    expect(after.content?.paragraphs).toEqual([
      // The line it is pasted into stays the line it was: its style, and its alignment.
      para('', {
        styleRef: 'heading',
        runs: [
          { text: 'Start ' },
          { text: 'Bold', marks: { ...KEPT, weight: 700 } },
          { text: ' red', marks: KEPT },
          { text: 'end' },
        ],
      }),
    ]);
    // The editor draws it so: in the source's colour and size.
    const drawn = editor(page).getByText('Bold', { exact: true });
    await expect(drawn).toHaveCSS('color', 'rgb(192, 0, 0)');
    await expect(drawn).toHaveCSS('font-family', /Rubik/);
  });

  test('Ctrl+V takes the formatting of where the text lands, and Ctrl+Shift+V the text alone', async ({
    page,
  }) => {
    await oneUndoStep(page, ID, () => paste(page, FROM_OUTSIDE));
    // The emphasis is kept; the font, the size and the colour are the destination's.
    expect(await runs(page)).toEqual([
      { text: 'Start ' },
      { text: 'Bold', marks: { weight: 700 } },
      { text: ' redend' },
    ]);
    await page.keyboard.press('Control+z');
    await setSelection(page, 7);
    await paste(page, FROM_OUTSIDE, 'ctrl-shift-v');
    expect(await runs(page)).toEqual([{ text: 'Start Bold redend' }]);
  });

  test('on an empty line the source keeps its alignment too', async ({ page }) => {
    await setSelection(page, 10);
    await page.keyboard.press('Enter');
    await paste(page, FROM_OUTSIDE, 'shift-insert');
    const [first, second] = await paragraphs(page, ID);
    expect(first).toMatchObject({ align: 'start', runs: [{ text: 'Start end' }] });
    expect(second).toMatchObject({ align: 'center', styleRef: 'heading' });
    expect(second?.runs[0]).toEqual({ text: 'Bold', marks: { ...KEPT, weight: 700 } });
  });

  test('a key the browser does not turn into a paste reads the clipboard itself', async ({
    page,
  }) => {
    await fakeClipboard(page, FROM_OUTSIDE);
    const before = await steps(page);
    // The key alone: no paste event follows it, as when the user gave the command another key.
    await editor(page).evaluate((dom) => {
      dom.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Insert',
          code: 'Insert',
          shiftKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    await expect.poll(() => plain(page, ID)).toBe('Start Bold redend');
    expect(await steps(page)).toBe(before + 1);
    expect((await runs(page))?.[1]).toEqual({ text: 'Bold', marks: { ...KEPT, weight: 700 } });
  });

  test('the shortcut map lists the key', async ({ page }) => {
    await page.keyboard.press('Escape');
    await page.keyboard.press('Control+/');
    const row = page.getByRole('dialog').getByText('הדבקה עם עיצוב המקור');
    await expect(row).toBeVisible();
  });
});

test.describe('from the menu of the text', () => {
  test('"paste special" offers the three kinds, and each reads the clipboard on the click', async ({
    page,
  }) => {
    await fakeClipboard(page, FROM_OUTSIDE);
    await rightClickText(page);
    const sub = await openSub(page, 'הדבקה מיוחדת', 'text-menu-paste');
    await expect(sub.getByRole('menuitem')).toHaveText([
      /שמירת עיצוב המקור/,
      /התאמה לעיצוב היעד/,
      /טקסט בלבד/,
    ]);
    // Esc closes the menu, and the text is still being edited, with the keyboard in it.
    await page.keyboard.press('Escape');
    await expect(menu(page)).toHaveCount(0);
    await expect(editor(page)).toBeFocused();

    const kept = await oneUndoStep(page, ID, async () => {
      await pasteSpecial(page, 'שמירת עיצוב המקור');
      await expect.poll(() => plain(page, ID)).toBe('Start Bold redend');
    });
    expect(kept.content?.paragraphs[0]?.runs[1]).toEqual({
      text: 'Bold',
      marks: { ...KEPT, weight: 700 },
    });

    await page.keyboard.press('Control+z');
    await pasteSpecial(page, 'התאמה לעיצוב היעד');
    await expect.poll(() => plain(page, ID)).toBe('Start Bold redend');
    expect(await runs(page)).toEqual([
      { text: 'Start ' },
      { text: 'Bold', marks: { weight: 700 } },
      { text: ' redend' },
    ]);

    await page.keyboard.press('Control+z');
    await pasteSpecial(page, 'טקסט בלבד');
    await expect.poll(() => plain(page, ID)).toBe('Start Bold redend');
    expect(await runs(page)).toEqual([{ text: 'Start Bold redend' }]);
    // The text has the keyboard again, and the caret is after what was pasted.
    await expect(editor(page)).toBeFocused();
    await page.keyboard.type('!');
    expect(await plain(page, ID)).toBe('Start Bold red!end');
  });

  test('"paste" pastes as Ctrl+V does', async ({ page }) => {
    await fakeClipboard(page, FROM_OUTSIDE);
    await rightClickText(page);
    await menuItem(page, 'הדבקה').click();
    await expect.poll(() => plain(page, ID)).toBe('Start Bold redend');
    expect((await runs(page))?.[1]).toEqual({ text: 'Bold', marks: { weight: 700 } });
  });

  test('when the clipboard may not be read, what was copied in this window is pasted, with its formatting', async ({
    page,
  }) => {
    // Bold, at 60: text of Slidr's own.
    await page.evaluate((id) => {
      const { bus, selection } = window.slidr!;
      bus.dispatch({
        type: 'text.set',
        slideId: selection.getState().currentSlideId!,
        elementId: id,
        content: {
          paragraphs: [
            {
              dir: 'auto',
              align: 'start',
              runs: [{ text: 'Own', marks: { size: 60, weight: 700 } }, { text: ' text' }],
            },
          ],
        },
      });
    }, ID);
    await fakeClipboard(page, null);
    await setSelection(page, 1, 4);
    // A right click inside what is selected leaves it selected: the copy is of "Own".
    await rightClickText(page, 2);
    await menuItem(page, 'העתקה').click();
    await expect(menu(page)).toHaveCount(0);
    // The copy went through the editor, in all its formats.
    await expect
      .poll(() => page.evaluate(() => Object.keys(window.__copied ?? {})))
      .toEqual(['text/html', 'text/plain', 'application/x-slidr-richtext+json']);

    // A right click elsewhere moves the caret there: the paste lands at the end of the line.
    await rightClickText(page, 9);
    await menuItem(page, 'הדבקה').click();
    await expect.poll(() => plain(page, ID)).toBe('Own textOwn');
    expect((await runs(page))?.at(-1)).toEqual({ text: 'Own', marks: { size: 60, weight: 700 } });

    // The formatting of where it lands, for Slidr's own text too: in the plain text after it,
    // bold stays bold and the size is the one of that text.
    await pasteSpecial(page, 'התאמה לעיצוב היעד', 6);
    await expect.poll(() => plain(page, ID)).toBe('Own tOwnextOwn');
    expect(await runs(page)).toEqual([
      { text: 'Own', marks: { size: 60, weight: 700 } },
      { text: ' t' },
      { text: 'Own', marks: { weight: 700 } },
      { text: 'ext' },
      { text: 'Own', marks: { size: 60, weight: 700 } },
    ]);
  });

  test('when there is nothing to paste the user is told, and told the key that always works', async ({
    page,
  }) => {
    await fakeClipboard(page, null);
    const before = await steps(page);
    await rightClickText(page);
    await menuItem(page, 'הדבקה').click();
    const dialog = page.getByRole('dialog', { name: 'לא הודבק דבר' });
    await expect(dialog).toContainText('Ctrl+V');
    await dialog.getByRole('button').last().click();
    await expect(dialog).toHaveCount(0);
    expect(await steps(page)).toBe(before);
    expect(await plain(page, ID)).toBe('Start end');
  });
});

test.describe('from the menu of the slide', () => {
  /** A right click where nothing is, and one of the kinds of "paste text". */
  async function pasteText(page: Page, name: string): Promise<void> {
    const frame = (await page.getByTestId('stage-frame').boundingBox())!;
    await page.mouse.click(frame.x + frame.width - 30, frame.y + frame.height - 30, {
      button: 'right',
    });
    await expect(menu(page)).toBeVisible();
    const sub = await openSub(page, 'הדבקת טקסט', 'stage-menu-paste-text');
    await clickInSub(page, menuItem(page, 'הדבקת טקסט'), sub.getByRole('menuitem', { name }));
  }

  const added = (page: Page) =>
    page.evaluate((id) => {
      const { bus, selection } = window.slidr!;
      const slide = bus.deck.slides.find((s) => s.id === selection.getState().currentSlideId);
      const others = slide?.elements.filter((element) => element.id !== id) ?? [];
      return { elements: others, selected: selection.getState().selectedElementIds };
    }, ID);

  test('"paste text" puts the text of the clipboard on the slide as a text box, in the kind chosen', async ({
    page,
  }) => {
    await fakeClipboard(page, FROM_OUTSIDE);
    await page.keyboard.press('Escape');
    const before = await steps(page);

    await pasteText(page, 'שמירת עיצוב המקור');
    await expect.poll(async () => (await added(page)).elements.length).toBe(1);
    let { elements, selected } = await added(page);
    // In the middle of the slide and half as wide, growing with its text, and selected.
    expect(elements[0]).toMatchObject({
      type: 'text',
      autoFit: 'growHeight',
      frame: { x: 480, w: 960 },
      content: {
        paragraphs: [
          {
            dir: 'auto',
            align: 'center',
            styleRef: 'body',
            runs: [
              { text: 'Bold', marks: { ...KEPT, weight: 700 } },
              { text: ' red', marks: KEPT },
            ],
          },
        ],
      },
    });
    expect(selected).toEqual([elements[0]?.id]);
    expect(await steps(page)).toBe(before + 1);
    await expect(page.getByTestId('stage-surface')).toBeFocused();
    await page.keyboard.press('Control+z');
    expect((await added(page)).elements).toEqual([]);

    await pasteText(page, 'בעיצוב של המצגת');
    await expect.poll(async () => (await added(page)).elements.length).toBe(1);
    ({ elements, selected } = await added(page));
    expect(elements[0]).toMatchObject({
      content: {
        paragraphs: [
          para('', {
            styleRef: 'body',
            runs: [{ text: 'Bold', marks: { weight: 700 } }, { text: ' red' }],
          }),
        ],
      },
    });
    await page.keyboard.press('Control+z');

    await pasteText(page, 'טקסט בלבד');
    await expect.poll(async () => (await added(page)).elements.length).toBe(1);
    expect((await added(page)).elements[0]).toMatchObject({
      content: { paragraphs: [para('Bold red', { styleRef: 'body' })] },
    });
  });
});

test('keeping the source runs nothing and loads nothing of what is pasted', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('paste.test')) requests.push(request.url());
  });
  page.on('dialog', (dialog) => {
    throw new Error(`a script ran: ${dialog.message()}`);
  });
  const html =
    '<style>@import url(https://paste.test/sheet.css); p { color: #008000; background: url(https://paste.test/bg.png) }</style>' +
    '<p onclick="alert(1)" style="font-size:20px">Hello<script>alert(2)</script>' +
    '<img src="https://paste.test/pixel.png" onerror="alert(3)">' +
    '<iframe src="https://paste.test/frame.html"></iframe>' +
    '<a href="javascript:alert(4)"> world</a></p>';
  await paste(page, { 'text/html': html, 'text/plain': 'Hello world' }, 'shift-insert');
  expect(await plain(page, ID)).toBe('Start Hello worldend');
  // What the stylesheet and the style state is kept; what would run or load is not there.
  expect(await runs(page)).toEqual([
    { text: 'Start ' },
    { text: 'Hello world', marks: { size: 30, color: { value: '#008000' } } },
    { text: 'end' },
  ]);
  await expect(editor(page).locator('script, img, iframe, style, [onclick]')).toHaveCount(0);
  await page.waitForTimeout(300);
  expect(requests).toEqual([]);
  expect(await page.evaluate(() => (window as { pwned?: boolean }).pwned)).toBeUndefined();
});
