import { expect, test, type Page } from '@playwright/test';
import {
  addText,
  edit,
  move,
  oneUndoStep,
  para,
  paragraphs,
  plain,
  setSelection,
  steps,
} from './text-helpers';

/*
 * Pasting into slide text (WG4-T06, TXT-13, SEC-06; ADR-013), in the app.
 *
 * The clipboard of the machine is shared with every other test run and with the person at the
 * keyboard, so these tests do not touch it: they hand the editor the `paste`, `copy` and `cut`
 * events a browser would, with their own data. Everything from the event on is the real path.
 */

test.describe.configure({ timeout: 90_000 });

const ID = 'e_paste';
const SLIDR_TEXT = 'application/x-slidr-richtext+json';
const editor = (page: Page) => page.locator('[data-text-editor]');

/** A paste event with the given clipboard formats. `plainKey` sends Ctrl+Shift+V before it. */
async function paste(page: Page, data: Record<string, string>, plainKey = false): Promise<void> {
  await editor(page).evaluate(
    (dom, { data, plainKey }) => {
      if (plainKey) {
        dom.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: 'V',
            code: 'KeyV',
            ctrlKey: true,
            shiftKey: true,
            bubbles: true,
            cancelable: true,
          }),
        );
      }
      const clipboardData = new DataTransfer();
      for (const [type, value] of Object.entries(data)) clipboardData.setData(type, value);
      dom.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }),
      );
    },
    { data, plainKey },
  );
}

/** A copy or cut event on the editor; returns what the editor put on the clipboard. */
function copy(page: Page, type: 'copy' | 'cut' = 'copy'): Promise<Record<string, string>> {
  return editor(page).evaluate((dom, eventType) => {
    const clipboardData = new DataTransfer();
    dom.dispatchEvent(
      new ClipboardEvent(eventType, { clipboardData, bubbles: true, cancelable: true }),
    );
    return Object.fromEntries(clipboardData.types.map((t) => [t, clipboardData.getData(t)]));
  }, type);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('stage-frame')).toBeVisible();
});

test('plain text becomes paragraphs; the first and the last join the text around the caret', async ({
  page,
}) => {
  await addText(page, ID, [para('Start end', { align: 'center', styleRef: 'heading' })]);
  await edit(page, ID);
  // The caret is after "Start".
  await setSelection(page, 6);
  const before = await steps(page);
  await paste(page, { 'text/plain': ' one\r\ntwo\n\nthree\n' });
  expect(await plain(page, ID)).toBe('Start one\ntwo\n\nthree end');
  expect(await steps(page)).toBe(before + 1);
  // The new paragraphs are in the style of the paragraph they were pasted into.
  for (const p of await paragraphs(page, ID))
    expect(p).toMatchObject({ align: 'center', styleRef: 'heading' });
  // The caret is after what was pasted: typing goes on from there.
  await page.keyboard.type('!');
  expect(await plain(page, ID)).toBe('Start one\ntwo\n\nthree! end');
  // Undo takes the typing, then the whole paste.
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  expect(await plain(page, ID)).toBe('Start end');
  await expect(editor(page).locator('p')).toHaveCount(1);
});

test('HTML is mapped to rich text in the style of the destination', async ({ page }) => {
  await addText(page, ID, [
    {
      dir: 'rtl',
      align: 'start',
      runs: [{ text: 'כאן: ', marks: { size: 60, color: { token: 'primary' }, font: 'Rubik' } }],
    },
  ]);
  await edit(page, ID);
  const html =
    '<meta charset="utf-8"><p style="color: red; font-size: 12px; font-family: Arial; text-align: right">' +
    'Hello <b>bold</b> <i>italic</i> <u>under</u> <s>gone</s> x<sup>2</sup> ' +
    '<a href="https://slidr.dev">link</a> <a href="javascript:alert(1)">bad</a></p>' +
    '<ul><li>one<ol><li>two</li></ol></li></ul><p>שלום <strong>world</strong>, 100%.</p>';
  await oneUndoStep(page, ID, () => paste(page, { 'text/html': html, 'text/plain': 'ignored' }));

  const base = { size: 60, color: { token: 'primary' }, font: 'Rubik' };
  expect(await paragraphs(page, ID)).toEqual([
    {
      dir: 'rtl',
      align: 'start',
      runs: [
        { text: 'כאן: Hello ', marks: base },
        { text: 'bold', marks: { ...base, weight: 700 } },
        { text: ' ', marks: base },
        { text: 'italic', marks: { ...base, italic: true } },
        { text: ' ', marks: base },
        { text: 'under', marks: { ...base, underline: true } },
        { text: ' ', marks: base },
        { text: 'gone', marks: { ...base, strike: true } },
        { text: ' x', marks: base },
        { text: '2', marks: { ...base, script: 'sup' } },
        { text: ' ', marks: base },
        { text: 'link', marks: { ...base, link: 'https://slidr.dev' } },
        // The link that would run code is gone; its text stays.
        { text: ' bad', marks: base },
      ],
    },
    {
      dir: 'rtl',
      align: 'start',
      list: { kind: 'bullet', level: 0 },
      runs: [{ text: 'one', marks: base }],
    },
    {
      dir: 'rtl',
      align: 'start',
      list: { kind: 'number', level: 1 },
      runs: [{ text: 'two', marks: base }],
    },
    {
      dir: 'rtl',
      align: 'start',
      runs: [
        { text: 'שלום ', marks: base },
        { text: 'world', marks: { ...base, weight: 700 } },
        { text: ', 100%.', marks: base },
      ],
    },
  ]);
});

test('nothing from the clipboard runs, loads or reaches the document as markup', async ({
  page,
}) => {
  const requests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('pwned')) requests.push(request.url());
  });
  await addText(page, ID, [para('')]);
  await edit(page, ID);
  const html =
    '<p onclick="window.pwned = 1" onmouseover="window.pwned = 2">text' +
    '<script>window.pwned = 3</script>' +
    '<img src="/pwned.png" onerror="window.pwned = 4">' +
    '<iframe src="/pwned.html"></iframe><iframe srcdoc="<script>parent.pwned = 5</script>"></iframe>' +
    '<svg onload="window.pwned = 6"><script>window.pwned = 7</script></svg>' +
    '<object data="/pwned.swf"></object><embed src="/pwned.swf">' +
    '<link rel="stylesheet" href="/pwned.css"><style>body { display: none }</style>' +
    '<a href="javascript:window.pwned = 8">link</a>' +
    '<span style="background: url(/pwned.gif); position: fixed; inset: 0">styled</span></p>';
  await paste(page, { 'text/html': html });
  await page.waitForTimeout(300);

  expect(await paragraphs(page, ID)).toEqual([
    { dir: 'auto', align: 'start', runs: [{ text: 'textlinkstyled' }] },
  ]);
  expect(
    await page.evaluate(() => (window as unknown as { pwned?: number }).pwned),
  ).toBeUndefined();
  expect(requests).toEqual([]);
  // In the editor's DOM there is only the paragraph and its text.
  const dom = await editor(page).evaluate((el) => ({
    elements: Array.from(el.querySelectorAll('*'), (node) => node.localName),
    handlers: Array.from(el.querySelectorAll('*')).flatMap((node) =>
      node.getAttributeNames().filter((name) => name.startsWith('on')),
    ),
  }));
  expect(dom.elements.filter((name) => !['p', 'br', 'span'].includes(name))).toEqual([]);
  expect(dom.handlers).toEqual([]);
  await expect(page.locator('body')).toBeVisible();
});

test('Ctrl+Shift+V pastes plain text', async ({ page }) => {
  await addText(page, ID, [para('A: ')]);
  await edit(page, ID);
  const data = {
    'text/html': '<p>Hello <b>bold</b></p><ul><li>item</li></ul>',
    'text/plain': 'Hello bold\nitem',
  };
  await oneUndoStep(page, ID, () => paste(page, data, true));
  expect(await paragraphs(page, ID)).toEqual([para('A: Hello bold'), para('item')]);

  // The key does not stick: the next paste is a rich one again.
  await move(page, 'Control+End');
  await paste(page, data);
  expect((await paragraphs(page, ID))[1]?.runs).toEqual([
    { text: 'itemHello ' },
    { text: 'bold', marks: { weight: 700 } },
  ]);
  expect((await paragraphs(page, ID))[2]).toMatchObject({ list: { kind: 'bullet', level: 0 } });
});

test('a paste into an empty line keeps the first pasted paragraph whole', async ({ page }) => {
  await addText(page, ID, [para('Title'), para('')]);
  await edit(page, ID);
  await paste(page, { 'text/html': '<ol><li>one</li><li>two</li></ol>' });
  expect(await paragraphs(page, ID)).toEqual([
    para('Title'),
    para('one', { list: { kind: 'number', level: 0 } }),
    para('two', { list: { kind: 'number', level: 0 } }),
  ]);
  await page.keyboard.type('!');
  expect(await plain(page, ID)).toBe('Title\none\ntwo!');
});

test('plain lines pasted into a list become list items', async ({ page }) => {
  await addText(page, ID, [para('first', { list: { kind: 'bullet', level: 1 } })]);
  await edit(page, ID);
  await paste(page, { 'text/plain': ' second\nthird' });
  expect(await paragraphs(page, ID)).toEqual([
    para('first second', { list: { kind: 'bullet', level: 1 } }),
    para('third', { list: { kind: 'bullet', level: 1 } }),
  ]);
});

test('a paste replaces the selection, and is an undo step apart from the typing around it', async ({
  page,
}) => {
  await addText(page, ID, [para('one two three')]);
  await edit(page, ID);
  const before = await steps(page);
  await page.keyboard.type('!', { delay: 20 });
  await setSelection(page, 5, 8);
  await paste(page, { 'text/plain': '2' });
  await move(page, 'End');
  await page.keyboard.type('?', { delay: 20 });
  expect(await plain(page, ID)).toBe('one 2 three!?');
  // Typing, the paste, typing: three steps, though all within one typing burst.
  expect(await steps(page)).toBe(before + 3);
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  expect(await plain(page, ID)).toBe('one two three!');
  await expect(editor(page)).toHaveText('one two three!');
});

test('copy and paste inside Slidr keeps the formatting of the text', async ({ page }) => {
  const big = { size: 60, color: { token: 'primary' }, italic: true };
  await addText(page, ID, [
    {
      dir: 'rtl',
      align: 'center',
      list: { kind: 'number', level: 0 },
      runs: [{ text: 'כותרת ' }, { text: 'גדולה', marks: big }],
    },
    para('שורה שנייה', { dir: 'rtl' }),
  ]);
  await addText(page, 'e_target', [para('Plain: ', { dir: 'ltr' })], {
    frame: { x: 160, y: 600, w: 1600, h: 200 },
  });
  await edit(page, ID);
  // From the middle of the first paragraph to the end of the second.
  await setSelection(page, 4, 24);
  const copied = await copy(page);
  // One line per paragraph.
  expect(copied['text/plain']).toBe('רת גדולה\nשורה שנייה');
  expect(copied['text/html']).toContain('גדולה');
  expect(JSON.parse(copied[SLIDR_TEXT]!)).toEqual({
    paragraphs: [
      {
        dir: 'rtl',
        align: 'center',
        list: { kind: 'number', level: 0 },
        runs: [{ text: 'רת ' }, { text: 'גדולה', marks: big }],
      },
      { dir: 'rtl', align: 'start', runs: [{ text: 'שורה שנייה' }] },
    ],
  });

  await page.keyboard.press('Escape');
  await edit(page, 'e_target');
  await oneUndoStep(page, 'e_target', () => paste(page, copied));
  await move(page, 'Control+End');
  expect(await paragraphs(page, 'e_target')).toEqual([
    // The first paragraph joined the line it landed on; its text kept its own marks.
    { dir: 'ltr', align: 'start', runs: [{ text: 'Plain: רת ' }, { text: 'גדולה', marks: big }] },
    { dir: 'rtl', align: 'start', runs: [{ text: 'שורה שנייה' }] },
  ]);

  // Ctrl+Shift+V takes the text alone, also from Slidr's own copy.
  await paste(page, copied, true);
  expect((await paragraphs(page, 'e_target')).at(-1)?.runs).toEqual([{ text: 'שורה שנייה' }]);
  expect(await plain(page, 'e_target')).toBe('Plain: רת גדולה\nשורה שנייהרת גדולה\nשורה שנייה');
});

test('cut removes the selection as one undo step and puts it on the clipboard', async ({
  page,
}) => {
  await addText(page, ID, [para('keep cut keep')]);
  await edit(page, ID);
  await setSelection(page, 6, 10);
  let cut: Record<string, string> = {};
  await oneUndoStep(page, ID, async () => {
    cut = await copy(page, 'cut');
  });
  expect(cut['text/plain']).toBe('cut ');
  expect(await plain(page, ID)).toBe('keep keep');
});

test('a clipboard that claims to be Slidr text and is not is pasted as what it is', async ({
  page,
}) => {
  await addText(page, ID, [para('')]);
  await edit(page, ID);
  // Not a rich text: the HTML is used instead.
  await paste(page, {
    [SLIDR_TEXT]: '{"paragraphs":[{"runs":[{"text":"x","html":"<script>"}]}]}',
    'text/html': '<p>from html</p>',
  });
  expect(await plain(page, ID)).toBe('from html');
  // A rich text with a link that would run code: the text comes, the link does not.
  await paste(page, {
    [SLIDR_TEXT]: JSON.stringify({
      paragraphs: [
        {
          dir: 'auto',
          align: 'start',
          runs: [{ text: ' and more', marks: { link: 'javascript:alert(1)', underline: true } }],
        },
      ],
    }),
  });
  expect((await paragraphs(page, ID))[0]?.runs).toEqual([
    { text: 'from html' },
    { text: ' and more', marks: { underline: true } },
  ]);
});

test('a clipboard without text pastes nothing', async ({ page }) => {
  await addText(page, ID, [para('same')]);
  await edit(page, ID);
  const before = await steps(page);
  await paste(page, { 'text/html': '<img src="data:image/png;base64,AAAA">' });
  await paste(page, {});
  expect(await plain(page, ID)).toBe('same');
  expect(await steps(page)).toBe(before);
});
