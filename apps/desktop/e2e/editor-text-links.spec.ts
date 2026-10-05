import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { editor, open, pressOnHebrewLayout, row, tool } from './editor-text-helpers';
import { show, showState } from './runtime-app-helpers';
import {
  addText,
  caret,
  edit,
  editingId,
  oneUndoStep,
  para,
  paragraphs,
  select,
  setSelection,
  steps,
} from './text-helpers';

/*
 * Links of text (WG4-T09, TXT-09): to a web address and to a slide of the deck. Made in the app
 * with the link tool of row B and Ctrl+K, and followed in present mode and in the exported file.
 */

test.describe.configure({ timeout: 120_000 });

const ID = 'e_link';
const SECOND = 's_second';

const linkButton = (page: Page) => tool(page, 'קישור');
const address = (page: Page) => page.getByRole('textbox', { name: 'כתובת' });
const apply = (page: Page) => page.getByRole('button', { name: 'החלה', exact: true });
const runs = async (page: Page) => (await paragraphs(page, ID))[0]?.runs;

/** The text "ראו את האתר שלנו ואת השקף הבא" on the first slide, and a second slide after it. */
async function deck(page: Page) {
  await addText(page, ID, [para('ראו את האתר שלנו ואת השקף הבא')], {
    frame: { x: 160, y: 200, w: 1600, h: 200 },
  });
  await page.evaluate((slideId) => {
    const { bus } = window.slidr!;
    bus.dispatch({
      type: 'slide.add',
      slide: {
        id: slideId,
        name: 'סיכום',
        timeline: [],
        elements: [
          {
            id: 'e_second',
            type: 'text',
            frame: { x: 160, y: 200, w: 1600, h: 200 },
            rotation: 0,
            opacity: 1,
            autoFit: 'none',
            vAlign: 'top',
            content: { paragraphs: [{ dir: 'auto', align: 'start', runs: [{ text: 'סוף' }] }] },
          },
        ],
      },
    });
  }, SECOND);
}

test.beforeEach(async ({ page }) => {
  await open(page);
  await deck(page);
});

test.describe('the link tool', () => {
  test('links the selected text to a web address, and adds https:// when none was typed', async ({
    page,
  }) => {
    await edit(page, ID);
    // "האתר שלנו": positions 8 to 17.
    await setSelection(page, 8, 17);
    await expect(linkButton(page)).toHaveAttribute('data-linked', 'false');
    const after = await oneUndoStep(page, ID, async () => {
      await linkButton(page).click();
      await expect(address(page)).toBeFocused();
      await page.keyboard.type('example.com/about');
      await page.keyboard.press('Enter');
    });
    expect(after.content?.paragraphs[0]?.runs).toEqual([
      { text: 'ראו את ' },
      { text: 'האתר שלנו', marks: { link: 'https://example.com/about', underline: true } },
      { text: ' ואת השקף הבא' },
    ]);
    // The popover is closed, and the text has the keyboard and its selection again.
    await expect(address(page)).toHaveCount(0);
    await expect(editor(page)).toBeFocused();
    expect(await caret(page)).toMatchObject({ from: 8, to: 17 });
    await expect(linkButton(page)).toHaveAttribute('data-linked', 'true');
    // In the editor it is drawn as a link, underlined, in the colour of its text.
    const drawn = editor(page).locator('a');
    await expect(drawn).toHaveText('האתר שלנו');
    await expect(drawn).toHaveAttribute('href', 'https://example.com/about');
  });

  test('with the caret inside a link, Ctrl+K edits the whole link, and "remove" takes it away', async ({
    page,
  }) => {
    await edit(page, ID);
    await setSelection(page, 8, 17);
    await page.keyboard.press('Control+k');
    await page.keyboard.type('https://example.com/');
    await page.keyboard.press('Enter');
    await expect(editor(page)).toBeFocused();

    // A caret in the middle of the link, nothing selected.
    await setSelection(page, 12);
    await page.keyboard.press('Control+k');
    await expect(address(page)).toHaveValue('https://example.com/');
    await oneUndoStep(page, ID, async () => {
      await address(page).fill('mailto:team@example.com');
      await apply(page).click();
    });
    expect(await runs(page)).toEqual([
      { text: 'ראו את ' },
      { text: 'האתר שלנו', marks: { link: 'mailto:team@example.com', underline: true } },
      { text: ' ואת השקף הבא' },
    ]);
    expect(await caret(page)).toMatchObject({ from: 12, to: 12 });

    await oneUndoStep(page, ID, async () => {
      await page.keyboard.press('Control+k');
      await page.getByRole('button', { name: 'הסרת הקישור' }).click();
    });
    expect(await runs(page)).toEqual([{ text: 'ראו את האתר שלנו ואת השקף הבא' }]);
    expect(await editingId(page)).toBe(ID);
  });

  test('with the caret in a plain word, the word is linked; beside no word there is nothing to link', async ({
    page,
  }) => {
    await edit(page, ID);
    // Inside "האתר".
    await setSelection(page, 10);
    await page.keyboard.press('Control+k');
    await page.keyboard.type('example.com');
    await page.keyboard.press('Enter');
    expect((await runs(page))?.[1]).toEqual({
      text: 'האתר',
      marks: { link: 'https://example.com', underline: true },
    });

    // A new line after the text (the caret is put at its end: position 30). On the empty line
    // the tool is off, and Ctrl+K opens nothing.
    await expect(editor(page)).toBeFocused();
    await setSelection(page, 30);
    await page.keyboard.press('Enter');
    expect(await paragraphs(page, ID)).toHaveLength(2);
    await expect(linkButton(page)).toBeDisabled();
    await page.keyboard.press('Control+k');
    await expect(address(page)).toHaveCount(0);
  });

  test('Ctrl+K with nothing to link is forgotten: the popover does not open later, while typing', async ({
    page,
  }) => {
    await edit(page, ID);
    // A new line after the text: nothing to link there, and the tool is off.
    await setSelection(page, 30);
    await page.keyboard.press('Enter');
    await page.keyboard.press('Control+k');
    await expect(address(page)).toHaveCount(0);
    // The first letter makes a word of the line. The request of a moment ago is not waiting for it.
    await page.keyboard.type('abc', { delay: 40 });
    await expect(address(page)).toHaveCount(0);
    await expect(editor(page)).toBeFocused();
    expect((await paragraphs(page, ID))[1]!.runs.map((run) => run.text).join('')).toBe('abc');
    // Asked for now, with the caret in the word, it opens.
    await page.keyboard.press('Control+k');
    await expect(address(page)).toBeVisible();
  });

  test('refuses an address that is not a page, a mail or a phone number', async ({ page }) => {
    await edit(page, ID);
    await setSelection(page, 8, 17);
    const before = await steps(page);
    await linkButton(page).click();
    await page.keyboard.type('javascript:alert(1)');
    await page.keyboard.press('Enter');
    await expect(page.getByText('אי אפשר לקשר לכתובת הזו')).toBeVisible();
    await expect(address(page)).toHaveAttribute('aria-invalid', 'true');
    expect(await steps(page)).toBe(before);
    expect(await runs(page)).toEqual([{ text: 'ראו את האתר שלנו ואת השקף הבא' }]);
    // Esc closes the popover and leaves the text as it was, still being edited.
    await page.keyboard.press('Escape');
    await expect(address(page)).toHaveCount(0);
    await expect(editor(page)).toBeFocused();
    expect(await editingId(page)).toBe(ID);
  });

  test('links to a slide, chosen by its number and title', async ({ page }) => {
    await edit(page, ID);
    // "השקף הבא": positions 22 to 30.
    await setSelection(page, 22, 30);
    const after = await oneUndoStep(page, ID, async () => {
      await linkButton(page).click();
      await page.getByRole('radio', { name: 'שקף', exact: true }).click();
      await page.getByRole('combobox', { name: 'שקף' }).click();
      // A slide without a name goes by its first text.
      await expect(page.getByRole('option')).toHaveText([
        '1. ראו את האתר שלנו ואת השקף הבא',
        '2. סיכום',
      ]);
      await page.getByRole('option', { name: '2. סיכום' }).click();
      await apply(page).click();
    });
    expect(after.content?.paragraphs[0]?.runs).toEqual([
      { text: 'ראו את האתר שלנו ואת ' },
      { text: 'השקף הבא', marks: { link: `#slide=${SECOND}`, underline: true } },
    ]);
    // Opened again on the link, the popover shows the slide it goes to.
    await setSelection(page, 25);
    await page.keyboard.press('Control+k');
    await expect(page.getByRole('combobox', { name: 'שקף' })).toHaveText('2. סיכום');
    // The editor draws it as the renderer does: no address for a browser to open.
    const drawn = editor(page).locator('a');
    await expect(drawn).toHaveAttribute('data-link-target', SECOND);
    expect(await drawn.getAttribute('href')).toBeNull();
  });

  test('on a selected box all of its text is linked; Ctrl+K arrives on a Hebrew layout too', async ({
    page,
  }) => {
    await select(page, ID);
    await expect(row(page)).toHaveAttribute('data-selection', 'text');
    const after = await oneUndoStep(page, ID, async () => {
      // On a Hebrew layout the K key types lamed.
      await pressOnHebrewLayout(page, 'KeyK', 'ל', { ctrl: true });
      await expect(address(page)).toBeFocused();
      await page.keyboard.type('tel:+97235551234');
      await page.keyboard.press('Enter');
    });
    expect(after.content?.paragraphs[0]?.runs).toEqual([
      {
        text: 'ראו את האתר שלנו ואת השקף הבא',
        marks: { link: 'tel:+97235551234', underline: true },
      },
    ]);
    // The box is still the selection, and the Stage has the keyboard.
    await expect(page.getByTestId('stage-surface')).toBeFocused();
  });
});

/* ---------------------------------------------------------------- following a link */

/** Both kinds of link on the first slide: the site, and the second slide. */
async function linkBoth(page: Page, url: string) {
  await page.evaluate(
    ({ id, url, second }) => {
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
              runs: [
                { text: 'ראו את ' },
                { text: 'האתר שלנו', marks: { link: url, underline: true } },
                { text: ' ואת ' },
                { text: 'השקף הבא', marks: { link: `#slide=${second}`, underline: true } },
              ],
            },
          ],
        },
      });
    },
    { id: ID, url, second: SECOND },
  );
}

/** A page of the dev server: an address that opens without the network. */
const siteUrl = () => `${test.info().project.use.baseURL}/capture.html`;

test('in present mode a link to a slide goes to it, and a web link opens its page', async ({
  page,
}) => {
  const url = siteUrl();
  await linkBoth(page, url);
  await page.getByTestId('stage-surface').focus();
  await page.keyboard.press('F5');
  const view = await show(page);
  expect(await showState(page)).toMatchObject({ slide: 0 });

  // The web link: the browser opens it in a window of its own, and the show stays where it is.
  const site = view.locator('a', { hasText: 'האתר שלנו' });
  await expect(site).toHaveAttribute('href', url);
  const popup = page.waitForEvent('popup');
  await site.click();
  const opened = await popup;
  await opened.waitForURL(url);
  await opened.close();
  expect(await showState(page)).toMatchObject({ slide: 0 });

  // The link to the slide.
  const next = view.locator('a', { hasText: 'השקף הבא' });
  await expect(next).toHaveAttribute('data-link-kind', 'slide');
  expect(await next.evaluate((a) => getComputedStyle(a).cursor)).toBe('pointer');
  await next.click();
  await expect.poll(async () => (await showState(page)).slide).toBe(1);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('present')).toHaveCount(0);
});

test('in the exported file both kinds of link work', async ({ page, context }) => {
  const url = siteUrl();
  await linkBoth(page, url);
  const html = await page.evaluate(async (path) => {
    // Through Vite, like every module of the page; not a path the compiler should resolve.
    const mod = (await import(/* @vite-ignore */ path)) as {
      exportDeck: (
        editor: unknown,
        deck: unknown,
        choices: { range: null; animations: boolean },
      ) => Promise<{ html: string }>;
    };
    const app = window.slidr!;
    return (await mod.exportDeck(app, app.bus.deck, { range: null, animations: true })).html;
  }, '/src/export/exportDeck.ts');
  const file = fileURLToPath(new URL('../test-results/editor/links.html', import.meta.url));
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, html);

  const exported = await context.newPage();
  const errors: string[] = [];
  exported.on('pageerror', (error) => errors.push(error.message));
  await exported.goto(pathToFileURL(file).href);
  await exported.waitForSelector('html.slidr-ready');
  const slide = () =>
    exported.evaluate(
      () => (window as unknown as { slidr: { state: { slide: number } } }).slidr.state.slide,
    );
  expect(await slide()).toBe(0);

  const site = exported.locator('a', { hasText: 'האתר שלנו' });
  await expect(site).toHaveAttribute('href', url);
  const popup = exported.waitForEvent('popup');
  await site.click();
  const opened = await popup;
  await opened.waitForURL(url);
  await opened.close();
  expect(await slide()).toBe(0);

  const next = exported.locator('a', { hasText: 'השקף הבא' });
  await expect(next).toHaveAttribute('data-link-target', SECOND);
  await next.click();
  await expect.poll(slide).toBe(1);
  expect(errors).toEqual([]);
});

test('from the keyboard: Tab reaches a link of the slide shown, and Enter follows it (UI-06)', async ({
  page,
}) => {
  await linkBoth(page, siteUrl());
  await page.getByTestId('stage-surface').focus();
  await page.keyboard.press('F5');
  const view = await show(page);
  expect(await showState(page)).toMatchObject({ slide: 0 });
  const next = view.locator('a', { hasText: 'השקף הבא' });
  await expect(next).toHaveAttribute('role', 'link');
  // The web link first, then the link to the slide: the order of the text.
  await page.keyboard.press('Tab');
  await expect(view.locator('a', { hasText: 'האתר שלנו' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(next).toBeFocused();
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await showState(page)).slide).toBe(1);
  // Not a step on: the show went to the slide the link names, and no further.
  expect(await showState(page)).toMatchObject({ slide: 1, step: 0 });
  await page.keyboard.press('Escape');
});
