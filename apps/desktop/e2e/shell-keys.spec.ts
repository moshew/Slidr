import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import type * as Registry from '../src/shell/registry';
import type * as Settings from '../src/settings';
import { addBoxes, elements, openApp, select, THREE, undo } from './arrange-helpers';

/*
 * Shortcuts the user can change (WG3-T07, UI-06): the shortcut map is where a shortcut gets
 * another key. A key that is taken is named before anything moves, a key that cannot be given
 * says why, one shortcut or all of them go back to the keys they came with, and every place that
 * shows a key shows the user's.
 */

const out = (name: string) =>
  fileURLToPath(new URL(`../test-results/shell/${name}.png`, import.meta.url));

const map = (page: Page) => page.getByTestId('shortcut-map');
const row = (page: Page, id: string) => map(page).locator(`[data-shortcut="${id}"]`);
const key = (page: Page, id: string) => map(page).locator(`[data-binding="${id}"]`).first();
const stage = (page: Page) => page.getByTestId('stage-surface');
const conflict = (page: Page) => map(page).getByTestId('shortcut-conflict');

/** The keys a line of the map shows, as text: `Ctrl Shift K`. */
const shownIn = (page: Page, id: string) =>
  row(page, id)
    .locator('kbd')
    .evaluateAll((caps) => caps.map((cap) => cap.textContent).join(' '));

async function openMap(page: Page) {
  await stage(page).focus();
  await page.keyboard.press('Control+/');
  await expect(map(page)).toBeVisible();
}

async function closeMap(page: Page) {
  await page.keyboard.press('Escape');
  await expect(map(page)).toBeHidden();
  await stage(page).focus();
}

/** Gives a shortcut a new key in the open map: its key is pressed, then the combination. */
async function rebind(page: Page, id: string, combination: string) {
  await key(page, id).click();
  await expect(key(page, id)).toHaveAttribute('data-state', 'listening');
  await page.keyboard.press(combination);
}

/** The user's keys as the settings hold them. */
const stored = (page: Page) =>
  page.evaluate(async (path) => {
    const { pageSettings } = (await import(/* @vite-ignore */ path)) as typeof Settings;
    return (await pageSettings.read()).shortcuts as { keys?: Record<string, string> } | undefined;
  }, '/src/settings/index.ts');

/** A key press as a layout reports it: the character it types, and the place of the key. */
interface Key {
  key: string;
  code: string;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  modifierAltGraph?: boolean;
}

const groups = async (page: Page) => (await elements(page)).filter((e) => e.type === 'group');

test('a shortcut gets a new key in the map, and answers to it from then on', async ({ page }) => {
  await openApp(page);
  await addBoxes(page, THREE);
  await openMap(page);
  expect(await shownIn(page, 'arrange.group')).toBe('Ctrl G');

  await rebind(page, 'arrange.group', 'Control+Shift+K');
  await expect(key(page, 'arrange.group')).toHaveAttribute('data-state', 'changed');
  expect(await shownIn(page, 'arrange.group')).toBe('Ctrl Shift K');
  await expect(map(page).getByTestId('shortcut-changed')).toHaveText('קיצורים ששיניתם: 1');
  // Kept in the settings, as what differs from the registration, and not in the page's storage.
  expect(await stored(page)).toEqual({ keys: { 'arrange.group': 'ctrl+shift+k' } });
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain('ctrl+shift+k');
  await closeMap(page);

  // The key it came with does nothing now; the new one groups.
  await select(page, ['e_a', 'e_b']);
  await page.keyboard.press('Control+g');
  expect(await groups(page)).toHaveLength(0);
  await page.keyboard.press('Control+Shift+K');
  expect(await groups(page)).toHaveLength(1);
});

test('every place that shows the key shows the new one', async ({ page }) => {
  await openApp(page);
  await addBoxes(page, THREE);
  await openMap(page);
  await rebind(page, 'arrange.group', 'Control+Shift+K');
  await rebind(page, 'shell.save', 'Control+Alt+S');
  await closeMap(page);

  // The menu of row B, which writes "Ctrl+G" in its code.
  await select(page, ['e_a', 'e_b']);
  await page.getByTestId('arrange-menu').click();
  const item = page.getByTestId('arrange-menu-content').getByRole('menuitem', { name: 'קיבוץ' });
  await expect(item.locator('kbd')).toHaveText(['Ctrl', 'Shift', 'K']);
  await page.keyboard.press('Escape');

  // The right-click menu of the Stage.
  await stage(page).focus();
  await page.keyboard.press('Shift+F10');
  const menuItem = page.getByRole('menuitem', { name: 'קיבוץ' });
  await expect(menuItem.locator('kbd')).toHaveText(['Ctrl', 'Shift', 'K']);
  await page.keyboard.press('Escape');

  // The File menu.
  await page.getByTestId('title-bar').getByRole('button', { name: 'קובץ' }).click();
  const saveItem = page
    .getByRole('menuitem')
    .filter({ has: page.getByText('שמירה', { exact: true }) });
  await expect(saveItem.locator('kbd')).toHaveText(['Ctrl', 'Alt', 'S']);
  // "Save as" was not moved, and still shows its own key.
  const saveAs = page.getByRole('menuitem').filter({ has: page.getByText('שמירה בשם…') });
  await expect(saveAs.locator('kbd')).toHaveText(['Ctrl', 'Shift', 'S']);
});

test('a key another shortcut has is named first, and moves only when asked to', async ({
  page,
}) => {
  await openApp(page);
  await addBoxes(page, THREE);
  await openMap(page);

  await rebind(page, 'arrange.group', 'Control+d');
  await expect(conflict(page)).toBeVisible();
  await expect(conflict(page)).toContainText('Ctrl+D הוא עכשיו הקיצור של "שכפול"');
  // Nothing has moved yet.
  expect(await stored(page)).toBeUndefined();
  await conflict(page).getByRole('button', { name: 'ביטול' }).click();
  await expect(conflict(page)).toHaveCount(0);
  expect(await shownIn(page, 'arrange.group')).toBe('Ctrl G');
  expect(await shownIn(page, 'arrange.duplicate')).toBe('Ctrl D');

  // Asked again, and moved: "duplicate" is left without a key, and says so.
  await rebind(page, 'arrange.group', 'Control+d');
  await conflict(page).getByRole('button', { name: 'העברה לכאן' }).click();
  expect(await shownIn(page, 'arrange.group')).toBe('Ctrl D');
  await expect(key(page, 'arrange.duplicate')).toHaveText('ללא קיצור');
  expect(await stored(page)).toEqual({
    keys: { 'arrange.group': 'ctrl+d', 'arrange.duplicate': '' },
  });
  // The line of the slides, which is the same shortcut, lost its key with it.
  await expect(row(page, 'slides.duplicate').locator('kbd')).toHaveCount(0);
  await closeMap(page);

  // Ctrl+D groups now, and duplicates nothing.
  await select(page, ['e_a', 'e_b']);
  await page.keyboard.press('Control+d');
  const now = await elements(page);
  expect(now.filter((e) => e.type === 'group')).toHaveLength(1);
  expect(now).toHaveLength(2);
});

test('a key that cannot be given says why, and Esc stops asking without closing the map', async ({
  page,
}) => {
  await openApp(page);
  await openMap(page);
  const refused = map(page).getByTestId('shortcut-refused');

  await rebind(page, 'arrange.group', 'Control+c');
  await expect(refused).toHaveText('Ctrl+C הוא מקש קבוע ("העתקה"), ואי אפשר לקחת אותו.');
  // Still asking: the next combination is the answer.
  await expect(key(page, 'arrange.group')).toHaveAttribute('data-state', 'listening');
  await page.keyboard.press('Control+v');
  await expect(refused).toContainText('הדבקה');
  await page.keyboard.press('Control+ArrowLeft');
  await expect(refused).toContainText('Ctrl+←');
  await page.keyboard.press('PageDown');
  await expect(refused).toHaveText('אי אפשר להשתמש ב-PgDn כקיצור.');

  // "Save" also answers while the user types: a letter alone would take the letter from the text.
  await page.keyboard.press('Escape');
  await expect(key(page, 'arrange.group')).toHaveAttribute('data-state', 'default');
  await expect(map(page)).toBeVisible();
  await rebind(page, 'shell.save', 's');
  await expect(refused).toHaveText('קיצור שפועל גם בזמן הקלדה צריך Ctrl או Alt, או מקש פונקציה.');
  // "Text box" stays out of text, and may be a letter.
  await page.keyboard.press('Escape');
  await rebind(page, 'text.insert', 'r');
  expect(await shownIn(page, 'text.insert')).toBe('R');
  expect(await stored(page)).toEqual({ keys: { 'text.insert': 'r' } });
});

test('the keys of the controls and of the show are not buttons', async ({ page }) => {
  await openApp(page);
  await openMap(page);
  for (const id of ['edit.copy', 'table.next', 'present.next']) {
    await expect(row(page, id).locator('kbd').first(), id).toBeVisible();
    await expect(row(page, id).getByRole('button'), id).toHaveCount(0);
  }
  // Each says why when it is pointed at.
  await row(page, 'present.next').locator('kbd').first().hover();
  await expect(page.getByRole('tooltip')).toContainText('מקש של מצב ההצגה');
  // The keys the text editor answers itself can be changed like any other.
  for (const id of ['shell.undo', 'text.bold']) {
    await expect(row(page, id).getByRole('button').first(), id).toBeVisible();
  }
});

test('a key given to a command of the text editor holds while typing in the text too', async ({
  page,
}) => {
  await openApp(page);
  const text = () =>
    page.evaluate(() => {
      const element = window.slidr!.bus.deck.slides[0]!.elements.find((e) => e.id === 'e_t') as {
        content: { paragraphs: { runs: { text: string; marks?: { weight?: number } }[] }[] };
      };
      return element.content.paragraphs.flatMap((p) => p.runs);
    });
  await page.evaluate(() => {
    const editor = window.slidr!;
    editor.bus.dispatch({
      type: 'element.add',
      slideId: editor.selection.getState().currentSlideId!,
      element: {
        id: 'e_t',
        type: 'text',
        frame: { x: 160, y: 140, w: 1600, h: 400 },
        rotation: 0,
        opacity: 1,
        autoFit: 'none',
        vAlign: 'top',
        content: { paragraphs: [{ dir: 'auto', align: 'start', runs: [{ text: 'hello' }] }] },
      } as never,
    });
  });
  await openMap(page);
  await rebind(page, 'text.bold', 'Control+Shift+K');
  await rebind(page, 'shell.undo', 'F9');
  await closeMap(page);

  // In the text, with the caret at its end: the key bold came with does nothing now, not the
  // editor's bold and not the browser's own, so what is typed next is as the text was.
  await page.evaluate(() => window.slidr!.selection.getState().startEditing('e_t'));
  const editor = page.locator('[data-text-editor]');
  await expect(editor).toBeFocused();
  await page.keyboard.press('Control+b');
  await page.keyboard.type(' a');
  await expect.poll(text).toEqual([{ text: 'hello a' }]);
  expect(await editor.evaluate((dom) => dom.querySelectorAll('b, strong').length)).toBe(0);
  // The new key of bold makes what is typed next bold.
  await page.keyboard.press('Control+Shift+K');
  await page.keyboard.type('b');
  await expect.poll(text).toEqual([{ text: 'hello a' }, { text: 'b', marks: { weight: 700 } }]);

  // Undo is on its new key there too; Ctrl+Z, which no command has now, undoes nothing.
  await page.keyboard.press('Control+z');
  expect(await text()).toEqual([{ text: 'hello a' }, { text: 'b', marks: { weight: 700 } }]);
  await page.keyboard.press('F9');
  await expect.poll(text).toEqual([{ text: 'hello a' }]);
  // On the selected box the same keys hold, as before.
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+Shift+K');
  await expect.poll(text).toEqual([{ text: 'hello a', marks: { weight: 700 } }]);
});

test('one shortcut goes back to its key, and all of them do', async ({ page }) => {
  await openApp(page);
  await openMap(page);
  const resetAll = map(page).getByTestId('shortcut-reset-all');
  await expect(resetAll).toBeDisabled();

  await rebind(page, 'arrange.group', 'Control+Shift+K');
  await rebind(page, 'arrange.newSlide', 'Control+j');
  await rebind(page, 'shell.zoomFit', 'F8');
  await expect(map(page).getByTestId('shortcut-changed')).toHaveText('קיצורים ששיניתם: 3');

  await map(page).locator('[data-reset="arrange.group"]').click();
  expect(await shownIn(page, 'arrange.group')).toBe('Ctrl G');
  expect(await stored(page)).toEqual({
    keys: { 'arrange.newSlide': 'ctrl+j', 'shell.zoomFit': 'f8' },
  });

  // All of them: asked once more, and Esc is "no".
  await resetAll.click();
  await expect(map(page)).toContainText('להחזיר את כל הקיצורים לברירת המחדל?');
  await page.keyboard.press('Escape');
  await expect(map(page)).toBeVisible();
  expect(await shownIn(page, 'shell.zoomFit')).toBe('F8');
  await resetAll.click();
  await map(page).getByTestId('shortcut-reset-all-yes').click();
  expect(await shownIn(page, 'shell.zoomFit')).toBe('Ctrl 0');
  expect(await shownIn(page, 'arrange.newSlide')).toBe('Ctrl M');
  expect(await stored(page)).toBeUndefined();
  await expect(resetAll).toBeDisabled();
});

test('a shortcut that goes back to a key someone took asks before it takes it back', async ({
  page,
}) => {
  await openApp(page);
  await openMap(page);
  await rebind(page, 'arrange.group', 'Control+Shift+K');
  await rebind(page, 'arrange.newSlide', 'Control+g');
  expect(await shownIn(page, 'arrange.newSlide')).toBe('Ctrl G');

  await map(page).locator('[data-reset="arrange.group"]').click();
  await expect(conflict(page)).toContainText('Ctrl+G הוא עכשיו הקיצור של "שקף חדש"');
  await conflict(page).getByRole('button', { name: 'העברה לכאן' }).click();
  expect(await shownIn(page, 'arrange.group')).toBe('Ctrl G');
  await expect(key(page, 'arrange.newSlide')).toHaveText('ללא קיצור');
  expect(await stored(page)).toEqual({ keys: { 'arrange.newSlide': '' } });
});

test('a shortcut an area registers later can be changed like any other', async ({ page }) => {
  await openApp(page);
  // An area the map has never heard of registers a shortcut, as any area does.
  await page.evaluate(async (path) => {
    const { registerShortcut } = (await import(/* @vite-ignore */ path)) as typeof Registry;
    const state = window as unknown as { laterRuns: number };
    state.laterRuns = 0;
    registerShortcut({
      id: 'later.thing',
      keys: 'Ctrl+J',
      label: 'keys.group',
      section: 'view',
      run: () => void (state.laterRuns += 1),
    });
  }, '/src/shell/registry.ts');
  const runs = () => page.evaluate(() => (window as unknown as { laterRuns: number }).laterRuns);

  await openMap(page);
  expect(await shownIn(page, 'later.thing')).toBe('Ctrl J');
  await rebind(page, 'later.thing', 'Alt+F9');
  expect(await shownIn(page, 'later.thing')).toBe('Alt F9');
  await closeMap(page);

  await page.keyboard.press('Control+j');
  expect(await runs()).toBe(0);
  await page.keyboard.press('Alt+F9');
  expect(await runs()).toBe(1);
});

test('the new key is read by its place on a Hebrew layout, and AltGr is not a key', async ({
  page,
}) => {
  await openApp(page);
  await addBoxes(page, THREE);
  await openMap(page);
  await key(page, 'arrange.group').click();
  await expect(key(page, 'arrange.group')).toHaveAttribute('data-state', 'listening');
  const press = (init: Key) =>
    page.evaluate(
      (options) =>
        void window.dispatchEvent(
          new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...options }),
        ),
      init,
    );

  // A character typed with AltGr (Windows reports Ctrl and Alt with it) is text, not an answer.
  await press({ key: '€', code: 'KeyE', ctrlKey: true, altKey: true, modifierAltGraph: true });
  await expect(key(page, 'arrange.group')).toHaveAttribute('data-state', 'listening');
  // The key marked K on a Hebrew layout reports the letter lamed.
  await press({ key: 'ל', code: 'KeyK', ctrlKey: true, shiftKey: true });
  expect(await shownIn(page, 'arrange.group')).toBe('Ctrl Shift K');
  await closeMap(page);

  // And it answers from the same key, whichever letter the layout gives it.
  await select(page, ['e_a', 'e_b']);
  await press({ key: 'ל', code: 'KeyK', ctrlKey: true, shiftKey: true });
  expect(await groups(page)).toHaveLength(1);
  await undo(page);
  await select(page, ['e_a', 'e_b']);
  await stage(page).focus();
  await page.keyboard.press('Control+Shift+K');
  expect(await groups(page)).toHaveLength(1);
});

/* ---------------------------------------------------------------- pictures for the design gate */

for (const theme of ['light', 'dark'] as const) {
  for (const lang of ['he', 'en'] as const) {
    test(`the map while a shortcut is changed: ${lang}, ${theme}`, async ({ page }) => {
      await openApp(page, { lang, theme });
      await openMap(page);
      await rebind(page, 'shell.saveAs', 'Control+Alt+S');
      await rebind(page, 'shell.save', 'Control+Shift+K');
      // One key waiting for its combination, with a key that was refused.
      await rebind(page, 'shell.new', 'Control+c');
      await expect(map(page).getByTestId('shortcut-refused')).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: out(`keys-listening-${lang}-${theme}`) });

      await page.keyboard.press('Control+o');
      await expect(conflict(page)).toBeVisible();
      await page.screenshot({ path: out(`keys-conflict-${lang}-${theme}`) });
    });
  }
}
