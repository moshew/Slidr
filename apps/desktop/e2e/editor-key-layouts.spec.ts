import { expect, test, type Page } from '@playwright/test';
import { addBoxes, focusStage, openApp, select, selected, THREE } from './arrange-helpers';
import { addTable, expectSelection, selectCell, stage, texts, typingCell } from './table-helpers';

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
