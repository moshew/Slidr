import { expect, test, type Page } from '@playwright/test';
import { addBoxes, frames, openApp, select, selected, THREE } from './arrange-helpers';
import { addElement, line } from './objects-helpers';
import { addText, edit, element, para } from './text-helpers';

/*
 * The pane key (WG13-T06, UI-06): F6 and Shift+F6 move the keyboard between the regions of the
 * window, and the selection stays. Tab cannot do it from the Stage: past the last element it
 * clears the selection, and the tools of row B, which are the selection's tools, change under it.
 */

const surface = (page: Page) => page.getByTestId('stage-surface');

/** The region the keyboard is in now, by its `data-pane`; null in none. */
const pane = (page: Page) =>
  page.evaluate(
    () => document.activeElement?.closest<HTMLElement>('[data-pane]')?.dataset.pane ?? null,
  );

/** Brings the keyboard to the Stage as a person does, with a key and not a script. */
async function tabToStage(page: Page) {
  await page.getByTestId('top-tools-b').getByRole('button').last().focus();
  await page.keyboard.press('Tab');
  await expect(surface(page)).toBeFocused();
}

test('with a text box selected, the key reaches its tools in row B, and they work', async ({
  page,
}) => {
  await openApp(page, { lang: 'en' });
  await addText(page, 'e_text', [para('Bees')], { frame: { x: 200, y: 200, w: 600, h: 200 } });
  // From nowhere the key goes to the Stage; Tab there selects the text box.
  await page.keyboard.press('F6');
  await expect(surface(page)).toBeFocused();
  await page.keyboard.press('Tab');
  expect(await selected(page)).toEqual(['e_text']);
  const rowB = page.getByTestId('top-tools-b');
  await expect(rowB).toHaveAttribute('data-selection', 'text');

  // Back from the Stage is row B: the tools of the text box, which is still the selection.
  await page.keyboard.press('Shift+F6');
  expect(await pane(page)).toBe('context');
  expect(await selected(page)).toEqual(['e_text']);
  await expect(rowB).toHaveAttribute('data-selection', 'text');

  // Along the row with Tab to the font size, and up a step from the keyboard.
  const size = rowB.getByRole('textbox', { name: 'Font size' });
  for (let presses = 0; presses < 12; presses++) {
    if (await size.evaluate((field) => field === document.activeElement)) break;
    await page.keyboard.press('Tab');
    expect(await pane(page), `Tab ${presses + 1} stays in row B`).toBe('context');
  }
  await expect(size).toBeFocused();
  const before = Number(await size.inputValue());
  await page.keyboard.press('ArrowUp');
  const sizes = async () =>
    (await element(page, 'e_text')).content!.paragraphs[0]!.runs.map((run) => run.marks?.size);
  await expect.poll(sizes).toEqual([before + 1]);
  // The keyboard is still on the field, and the selection is the same.
  await expect(size).toBeFocused();
  expect(await selected(page)).toEqual(['e_text']);

  // On from row B is the Stage again, and the arrows move the text box.
  await page.keyboard.press('F6');
  await expect(surface(page)).toBeFocused();
  expect(await selected(page)).toEqual(['e_text']);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  expect((await frames(page, ['e_text'])).e_text).toEqual({ x: 201, y: 201, w: 600, h: 200 });
});

test('the key goes round every region that can take the keyboard, both ways', async ({ page }) => {
  await openApp(page, { lang: 'en' });
  await addBoxes(page, THREE);
  await select(page, ['e_b']);
  await tabToStage(page);

  // From the Stage: the Filmstrip, the status bar (its count of design findings is a button),
  // and round by the Activity Bar, the panel and the two rows of tools to the Stage again.
  const round = ['filmstrip', 'status', 'activity', 'panel', 'tools', 'context', 'stage'];
  const forward: (string | null)[] = [];
  for (let presses = 0; presses < round.length; presses++) {
    await page.keyboard.press('F6');
    forward.push(await pane(page));
  }
  expect(forward).toEqual(round);
  expect(await selected(page)).toEqual(['e_b']);

  const back: (string | null)[] = [];
  for (let presses = 0; presses < round.length; presses++) {
    await page.keyboard.press('Shift+F6');
    back.push(await pane(page));
  }
  expect(back).toEqual([...round.slice(0, -1)].reverse().concat('stage'));
  expect(await selected(page)).toEqual(['e_b']);
  // Where the keyboard arrives it can be seen: the Stage shows its ring, a control its outline.
  await expect(surface(page)).toBeFocused();
  expect(await surface(page).evaluate((node) => getComputedStyle(node).outlineStyle)).toBe('solid');
  await page.keyboard.press('Shift+F6');
  expect(
    await page.evaluate(() => document.activeElement?.matches(':focus-visible') ?? false),
  ).toBe(true);
});

test('a region is come back to where the keyboard left it, and a collapsed panel is passed over', async ({
  page,
}) => {
  await openApp(page, { lang: 'en' });
  await tabToStage(page);
  // To row A, and along it to the second control.
  await page.keyboard.press('Shift+F6');
  await page.keyboard.press('Shift+F6');
  expect(await pane(page)).toBe('tools');
  await page.keyboard.press('Tab');
  const left = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
  expect(left).toBeTruthy();
  await page.keyboard.press('F6');
  expect(await pane(page)).toBe('context');
  await page.keyboard.press('Shift+F6');
  expect(await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))).toBe(left);

  // With the panel collapsed, back from row A is the Activity Bar: the panel has no control.
  await page.getByTestId('panel-collapse').click();
  await expect(page.getByTestId('tool-panel')).toHaveAttribute('data-open', 'false');
  await surface(page).focus();
  await page.keyboard.press('Shift+F6');
  await page.keyboard.press('Shift+F6');
  expect(await pane(page)).toBe('tools');
  await page.keyboard.press('Shift+F6');
  expect(await pane(page)).toBe('activity');
});

test('from the text of a text box the key reaches row B and comes back to the caret', async ({
  page,
}) => {
  await openApp(page, { lang: 'en' });
  await addText(page, 'e_text', [para('Bees')]);
  await edit(page, 'e_text');
  await page.keyboard.press('End');
  await page.keyboard.type(' fly');
  await page.keyboard.press('Shift+F6');
  expect(await pane(page)).toBe('context');
  // The text is still being edited, and row B shows the tools of text.
  await expect(page.getByTestId('top-tools-b')).toHaveAttribute('data-selection', 'text');
  await page.keyboard.press('F6');
  // Back in the text, where the caret was: typing goes on from there.
  await page.keyboard.type('!');
  await expect
    .poll(async () =>
      (await element(page, 'e_text')).content!.paragraphs[0]!.runs.map((run) => run.text).join(''),
    )
    .toBe('Bees fly!');
});

test('in a layer of its own the key does nothing: a dialog, a popover, the show', async ({
  page,
}) => {
  await openApp(page, { lang: 'en' });
  await tabToStage(page);
  // A dialog keeps the keyboard anyway; the key must not fight it.
  await page.keyboard.press('Control+/');
  const map = page.getByTestId('shortcut-map');
  await expect(map).toBeVisible();
  await page.keyboard.press('F6');
  await page.keyboard.press('Shift+F6');
  expect(
    await page.evaluate(() =>
      Boolean(document.activeElement?.closest('[data-testid="shortcut-map"]')),
    ),
  ).toBe(true);
  await page.keyboard.press('Escape');
  await expect(map).toBeHidden();

  // The show covers the window: the key must not send the keyboard to what is behind it.
  await page.keyboard.press('F5');
  const show = page.getByTestId('present');
  await expect(show).toBeVisible();
  await page.keyboard.press('F6');
  await page.keyboard.press('Shift+F6');
  expect(await pane(page)).toBeNull();
  await expect(show).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(show).toHaveCount(0);

  // A popover does not hold the keyboard itself: without the rule the key would walk out of it.
  await page.getByTestId('top-tools-a').getByRole('button', { name: 'Shape' }).focus();
  await page.keyboard.press('Enter');
  const popover = page.getByRole('dialog');
  await expect(popover).toBeVisible();
  const inPopover = () =>
    page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]')));
  expect(await inPopover()).toBe(true);
  await page.keyboard.press('F6');
  await expect(popover).toBeVisible();
  expect(await inPopover()).toBe(true);
});

for (const lang of ['he', 'en'] as const) {
  test(`the shortcut map lists the pane key, ${lang}`, async ({ page }) => {
    await openApp(page, { lang });
    await page.keyboard.press('Control+/');
    const map = page.getByTestId('shortcut-map');
    await expect(map.locator('[data-shortcut="a11y.pane.next"] dt')).toHaveText(
      lang === 'he' ? 'אל האזור הבא של החלון' : 'To the next region of the window',
    );
    await expect(map.locator('[data-shortcut="a11y.pane.previous"] dt')).toHaveText(
      lang === 'he' ? 'אל האזור הקודם של החלון' : 'To the region of the window before',
    );
    await expect(map.locator('[data-shortcut="a11y.pane.next"] kbd').first()).toHaveText('F6');
    await expect(map).not.toContainText('a11y:');
  });
}

test('the pane key is the user’s to change, like any registered shortcut', async ({ page }) => {
  await openApp(page, { lang: 'en' });
  await page.keyboard.press('Control+/');
  const map = page.getByTestId('shortcut-map');
  const binding = map.locator('[data-binding="a11y.pane.next"]');
  await expect(binding).toHaveAttribute('data-state', 'default');
  await binding.click();
  await expect(binding).toHaveAttribute('data-state', 'listening');
  await page.keyboard.press('F8');
  await expect(binding).toHaveAttribute('data-state', 'changed');
  await page.keyboard.press('Escape');
  await expect(map).toBeHidden();

  await tabToStage(page);
  // The old key no longer moves, and the new one does.
  await page.keyboard.press('F6');
  expect(await pane(page)).toBe('stage');
  await page.keyboard.press('F8');
  expect(await pane(page)).toBe('filmstrip');
});

test('Enter on a tool of row B presses that tool, also when a line is selected', async ({
  page,
}) => {
  await openApp(page, { lang: 'en' });
  await addElement(page, line());
  await page.keyboard.press('F6');
  await expect(surface(page)).toBeFocused();
  expect(await selected(page)).toEqual(['e_line']);
  // Enter on the Stage goes into the points of the line; on a tool it must not.
  await page.keyboard.press('Shift+F6');
  expect(await pane(page)).toBe('context');
  const tool = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
  expect(tool).toBeTruthy();
  await page.keyboard.press('Enter');
  // The tool was pressed: its popover is open, and the keyboard did not go to the Stage.
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(surface(page)).not.toBeFocused();
  await expect(surface(page).locator('[data-line-point][data-active]')).toHaveCount(0);
});

test('the key does not take the keyboard into a window that is not ready, or under what covers it', async ({
  page,
}) => {
  await openApp(page, { lang: 'en' });
  const nowhere = () => page.evaluate(() => document.activeElement === document.body);
  // While the window waits for its first document it is inert: nothing in it takes the keyboard.
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
    document.getElementById('root')!.setAttribute('inert', '');
  });
  await page.keyboard.press('F6');
  expect(await nowhere()).toBe(true);
  await page.keyboard.press('Shift+F6');
  expect(await nowhere()).toBe(true);
  // Ready: from nowhere the key goes to the Stage.
  await page.evaluate(() => document.getElementById('root')!.removeAttribute('inert'));
  await page.keyboard.press('F6');
  await expect(surface(page)).toBeFocused();

  // One region that is inert is passed over, like a collapsed panel.
  await page.evaluate(() =>
    document.querySelector('[data-pane="filmstrip"]')!.setAttribute('inert', ''),
  );
  await page.keyboard.press('F6');
  expect(await pane(page)).toBe('status');
  await page.evaluate(() =>
    document.querySelector('[data-pane="filmstrip"]')!.removeAttribute('inert'),
  );

  // The show has lost the keyboard to nowhere: the key does not send it to the Stage under it.
  await page.keyboard.press('F5');
  const show = page.getByTestId('present');
  await expect(show).toBeVisible();
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('F6');
  await expect(surface(page)).not.toBeFocused();
  expect(await pane(page)).toBeNull();
});
