import { expect, test, type Page } from '@playwright/test';
import { addBoxes, focusStage, openApp, select, selected, THREE } from './arrange-helpers';
import { addChart, gridCell, openDataEditor, selectChart } from './chart-helpers';
import { addTable, expectSelection, selectCell, stage, texts, typingCell } from './table-helpers';
import { addText, edit, para, paragraphs } from './text-helpers';

/*
 * Ctrl+A on the Stage and in a table, on keyboards that are not QWERTY (ADR-069, finding 12). The
 * shell reads a shortcut by its letter on a Latin layout and by its place on a Hebrew one; the
 * Stage and the table read Ctrl+A by its place only, so on AZERTY the key marked A did nothing and
 * the key marked Q selected everything. A character typed with AltGr, which Windows reports with
 * Ctrl and Alt, is text: on a selected cell it starts the cell's text, as any letter does.
 */

/** A key as a layout reports it, sent to what has the keyboard. */
function press(
  page: Page,
  key: string,
  code: string,
  mods: { ctrl?: boolean; alt?: boolean; altGraph?: boolean } = {},
) {
  return page.evaluate(
    ({ key, code, mods }) => {
      (document.activeElement ?? document.body).dispatchEvent(
        new KeyboardEvent('keydown', {
          key,
          code,
          ctrlKey: Boolean(mods.ctrl),
          altKey: Boolean(mods.alt),
          modifierAltGraph: Boolean(mods.altGraph),
          bubbles: true,
          cancelable: true,
        }),
      );
    },
    { key, code, mods },
  );
}

const ALL = ['e_a', 'e_b', 'e_c'];

test('Ctrl+A selects every object on AZERTY by the key marked A, and on Hebrew by its place', async ({
  page,
}) => {
  await openApp(page);
  await addBoxes(page, THREE);
  await select(page, []);
  await focusStage(page);

  // AZERTY: the key marked Q is where QWERTY has A. It is not Ctrl+A.
  await press(page, 'q', 'KeyA', { ctrl: true });
  expect(await selected(page)).toEqual([]);
  // The key marked A, where QWERTY has Q.
  await press(page, 'a', 'KeyQ', { ctrl: true });
  await expect.poll(() => selected(page)).toEqual(ALL);

  // On a Hebrew layout the letter is ש, and the place decides.
  await select(page, []);
  await focusStage(page);
  await press(page, 'ש', 'KeyA', { ctrl: true });
  await expect.poll(() => selected(page)).toEqual(ALL);
});

test('in a table, Ctrl+A on AZERTY selects every cell, and AltGr types a letter in a cell', async ({
  page,
}) => {
  await openApp(page);
  const id = await addTable(page, {
    texts: [
      ['a', 'b'],
      ['c', 'd'],
    ],
  });
  await selectCell(page, id, 0, 0);
  await press(page, 'a', 'KeyQ', { ctrl: true });
  await expectSelection(page, id, [0, 0], [1, 1]);

  // Polish: AltGr+A types ą, with Ctrl and Alt down. It is typed into the cell, not Ctrl+A.
  await selectCell(page, id, 1, 1);
  await press(page, 'ą', 'KeyA', { ctrl: true, alt: true, altGraph: true });
  await expect.poll(() => typingCell(page)).toBe('1,1');
  await page.keyboard.press('Escape');
  await expect(stage(page).locator('td[data-cell-editing]')).toHaveCount(0);
  expect((await texts(page))[1]![1]).toBe('ą');
});

test('Ctrl+Shift+V pastes plain text by the key marked V, wherever the layout has it', async ({
  page,
}) => {
  await openApp(page);
  await addText(page, 'e_t', [para('')]);
  await edit(page, 'e_t');
  /** A key as a layout reports it, and then the paste the browser makes of it. */
  const paste = (key: string, code: string) =>
    page.locator('[data-text-editor]').evaluate(
      (dom, keys) => {
        dom.dispatchEvent(
          new KeyboardEvent('keydown', {
            ...keys,
            ctrlKey: true,
            shiftKey: true,
            bubbles: true,
            cancelable: true,
          }),
        );
        const clipboardData = new DataTransfer();
        clipboardData.setData('text/html', '<p><b>bold</b></p>');
        clipboardData.setData('text/plain', 'bold');
        dom.dispatchEvent(
          new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }),
        );
      },
      { key, code },
    );
  const runs = async () => (await paragraphs(page, 'e_t')).flatMap((p) => p.runs);

  // Dvorak: the key marked V is where QWERTY has the full stop.
  await paste('V', 'Period');
  expect(await runs()).toEqual([{ text: 'bold' }]);
  // And the key that sits where QWERTY has V is marked K there: it asks for no plain paste, so
  // a paste that follows it keeps what the clipboard says of the text.
  await page.keyboard.press('Control+a');
  await paste('K', 'KeyV');
  expect((await runs())[0]).toMatchObject({ text: 'bold', marks: { weight: 700 } });
});

test('in the data editor of a chart, Ctrl+A is kept from the page by the key marked A', async ({
  page,
}) => {
  await openApp(page, { lang: 'en' });
  await addChart(page);
  await selectChart(page);
  await openDataEditor(page);
  const prevented = (key: string, code: string) =>
    gridCell(page, 0, 0).evaluate(
      (cell, keys) => {
        const event = new KeyboardEvent('keydown', {
          ...keys,
          ctrlKey: true,
          bubbles: true,
          cancelable: true,
        });
        cell.dispatchEvent(event);
        return event.defaultPrevented;
      },
      { key, code },
    );
  // AZERTY: the key marked A is where QWERTY has Q. The browser would select the whole page.
  expect(await prevented('a', 'KeyQ')).toBe(true);
  // The key marked Q, where QWERTY has A, is no "select all" to anybody.
  expect(await prevented('q', 'KeyA')).toBe(false);
  // On a Hebrew layout the place of the key decides.
  expect(await prevented('ש', 'KeyA')).toBe(true);
});
