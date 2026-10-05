import { expect, test, type Page } from '@playwright/test';
import { addBoxes, frames, openApp, select, selected, THREE } from './arrange-helpers';

/*
 * Focus (WG13-T06, UI-06, DSN-08), which axe-core does not judge: a layer that opens keeps the
 * keyboard while it is open and gives it back to what opened it; and wherever the keyboard is,
 * it can be seen.
 */

const surface = (page: Page) => page.getByTestId('stage-surface');
const rowA = (page: Page) => page.getByTestId('top-tools-a');

/** What has the keyboard: its name, and whether it is inside the layer the selector names. */
const focused = (page: Page, layer = '[role="dialog"], [role="menu"]') =>
  page.evaluate((selector) => {
    const el = document.activeElement;
    return {
      name: el?.getAttribute('aria-label') ?? el?.textContent?.trim().slice(0, 40) ?? '',
      tag: el?.tagName.toLowerCase() ?? '',
      inLayer: Boolean(el?.closest(selector)),
      nowhere: el === document.body,
    };
  }, layer);

/** Presses Tab `times` times and says whether the keyboard was in the layer after every one. */
async function tabsStayIn(page: Page, times: number, layer?: string): Promise<boolean> {
  for (let i = 0; i < times; i++) {
    await page.keyboard.press('Tab');
    if (!(await focused(page, layer)).inLayer) return false;
  }
  return true;
}

test('a popover opened from the keyboard keeps it, closes with Esc, and gives it back', async ({
  page,
}) => {
  await openApp(page, { lang: 'en' });
  const trigger = rowA(page).getByRole('button', { name: 'Shape' });
  await trigger.focus();
  await page.keyboard.press('Enter');
  const popover = page.getByRole('dialog');
  await expect(popover).toBeVisible();
  // It has the name of the button that opened it, and the keyboard is inside it.
  await expect(popover).toHaveAccessibleName('Shape');
  expect((await focused(page)).inLayer).toBe(true);
  // Tab goes round inside it: past its last control it comes back to its first.
  const controls = await popover.locator('button').count();
  expect(await tabsStayIn(page, controls + 2)).toBe(true);
  // Esc closes it: once for the hint of the control the keyboard is on, and once for the
  // popover. It is never a place the keyboard cannot leave. (The hints of the controls Tab ran
  // through are on their way out for a few frames; a person's Esc does not come that soon.)
  await expect(page.getByRole('tooltip')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  await expect(popover).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(popover).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test('a menu keeps the keyboard, closes with Esc, and gives it back', async ({ page }) => {
  await openApp(page, { lang: 'en' });
  const trigger = rowA(page).getByRole('button', { name: 'File' });
  await trigger.focus();
  await page.keyboard.press('Enter');
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  expect((await focused(page)).inLayer).toBe(true);
  await page.keyboard.press('ArrowDown');
  // Tab does not walk out of an open menu.
  expect(await tabsStayIn(page, 3)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test('a dialog keeps the keyboard, closes with Esc, and gives it back to its button', async ({
  page,
}) => {
  await openApp(page, { lang: 'en' });
  const trigger = rowA(page).getByRole('button', { name: 'Export' });
  await trigger.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByTestId('export-dialog');
  await expect(dialog).toBeVisible();
  expect((await focused(page)).inLayer).toBe(true);
  const controls = await dialog.locator('button, input, [role="combobox"]').count();
  expect(await tabsStayIn(page, controls + 3)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test('the shortcut map gives the keyboard back: to the Stage, and to the File menu', async ({
  page,
}) => {
  await openApp(page, { lang: 'en' });
  await addBoxes(page, THREE);
  await select(page, ['e_b']);
  // From the Stage, by its key.
  await surface(page).focus();
  await page.keyboard.press('Control+/');
  const map = page.getByTestId('shortcut-map');
  await expect(map).toBeVisible();
  expect(await tabsStayIn(page, 6)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(map).toHaveCount(0);
  await expect(surface(page)).toBeFocused();

  // From the File menu, by the keyboard: the menu is gone when the dialog closes, and the
  // keyboard goes to the button of the menu, not to nowhere.
  const file = rowA(page).getByRole('button', { name: 'File' });
  await file.focus();
  await page.keyboard.press('Enter');
  await page.getByRole('menuitem', { name: 'Keyboard shortcuts' }).focus();
  await page.keyboard.press('Enter');
  await expect(map).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(map).toHaveCount(0);
  expect((await focused(page)).nowhere).toBe(false);
  await expect(file).toBeFocused();
});

test('a question of the app and the menu of the Stage give the keyboard back to the Stage', async ({
  page,
}) => {
  await openApp(page, { lang: 'en' });
  await addBoxes(page, THREE);
  await select(page, ['e_b']);
  await surface(page).focus();
  await page.keyboard.press('Shift+F10');
  const menu = page.getByTestId('stage-menu');
  await expect(menu).toBeVisible();
  expect((await focused(page)).inLayer).toBe(true);
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(surface(page)).toBeFocused();

  await page.evaluate(async (path) => {
    const dialogs = (await import(/* @vite-ignore */ path)) as {
      ask: (request: unknown) => Promise<string>;
    };
    void dialogs.ask({
      title: 'Save the changes?',
      actions: [
        { id: 'cancel', label: 'Cancel', variant: 'ghost' },
        { id: 'save', label: 'Save', variant: 'primary' },
      ],
      cancelId: 'cancel',
    });
  }, '/src/shell/dialogs.tsx');
  const question = page.getByRole('dialog');
  await expect(question).toBeVisible();
  expect((await focused(page)).inLayer).toBe(true);
  expect(await tabsStayIn(page, 4)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(question).toHaveCount(0);
  await expect(surface(page)).toBeFocused();
});

test('the show gives the keyboard back when it ends, started from its menu by key or by pointer', async ({
  page,
}) => {
  await openApp(page, { lang: 'en' });
  await addBoxes(page, THREE);
  const more = page.getByTestId('present-button').getByRole('button').last();
  const show = page.getByTestId('present');
  // By the keyboard.
  await more.focus();
  await page.keyboard.press('Enter');
  await page.getByRole('menuitem').first().press('Enter');
  await expect(show).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(show).toHaveCount(0);
  await expect.poll(async () => (await focused(page)).nowhere).toBe(false);
  // By the pointer: the keyboard is on the slide, where the next key is meant.
  await more.click();
  await page.getByRole('menuitem').first().click();
  await expect(show).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(show).toHaveCount(0);
  await expect(surface(page)).toBeFocused();
});

test('a press on a part of the window that is no control does not take the keyboard from the slide', async ({
  page,
}) => {
  await openApp(page, { lang: 'en' });
  await addBoxes(page, THREE);
  const status = (await page.getByTestId('status-bar').boundingBox())!;
  const ground = { x: status.x + status.width / 2, y: status.y + status.height / 2 };
  const box = (await surface(page).locator('[data-element-id="e_b"]').boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(surface(page)).toBeFocused();
  const before = (await frames(page, ['e_b'])).e_b!;

  // The status bar, between its controls: the arrows still move what is selected.
  await page.mouse.click(ground.x, ground.y);
  await expect(surface(page)).toBeFocused();
  await page.keyboard.press('ArrowRight');
  expect((await frames(page, ['e_b'])).e_b!.x).toBeGreaterThan(before.x);
  expect(await selected(page)).toEqual(['e_b']);

  // The ground of a panel, which Tab stops at and a press would otherwise give the focus to.
  const panel = (await page.locator('[data-pane="panel"]').boundingBox())!;
  await page.mouse.click(panel.x + panel.width / 2, panel.y + panel.height - 12);
  await expect(surface(page)).toBeFocused();

  // Text that is being typed on the slide keeps its caret, and the typing goes on.
  await page.keyboard.press('Escape');
  await page.keyboard.press('t');
  const editor = surface(page).locator('[contenteditable="true"]');
  await expect(editor).toBeFocused();
  await page.keyboard.type('bees');
  await page.mouse.click(ground.x, ground.y);
  await expect(editor).toBeFocused();
  await page.keyboard.type(' and flowers');
  await expect(editor).toHaveText('bees and flowers');
  await page.keyboard.press('Escape');

  // The same for the strip of slides.
  const strip = page.locator('[data-pane="filmstrip"] [role="listbox"]');
  await strip.focus();
  await page.mouse.click(ground.x, ground.y);
  await expect(strip).toBeFocused();
});

test('a key that makes its own control go away leaves the keyboard in the region it was in', async ({
  page,
}) => {
  await openApp(page, { lang: 'en' });
  await addBoxes(page, THREE);
  await page.evaluate(() => {
    const { bus, selection } = window.slidr!;
    const slideId = selection.getState().currentSlideId!;
    const step = (id: string, elementId: string) => ({
      id,
      elementId,
      trigger: 'onClick',
      category: 'entrance',
      preset: 'fade',
      duration: 400,
      delay: 0,
      easing: 'ease',
    });
    bus.batch([
      { type: 'slide.setTimeline', slideId, timeline: [step('a_1', 'e_a'), step('a_2', 'e_b')] },
    ] as never);
  });
  await page.locator('[data-testid="activity-bar"] button[data-panel="animations"]').click();
  const remove = page.locator('[data-step="a_2"]').getByRole('button', { name: 'Remove' });
  await remove.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-step="a_2"]')).toHaveCount(0);
  // The list gives the keyboard to the row that takes the place of the one removed.
  await expect(page.locator('[data-step="a_1"] [data-row]')).toBeFocused();
  // The last step: nothing of the list is left to take the keyboard. It is not nowhere, from
  // which Tab would start again at the top of the window: it stays in the panel.
  await page.keyboard.press('Tab');
  await expect(
    page.locator('[data-step="a_1"]').getByRole('button', { name: 'Remove' }),
  ).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-step]')).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(() =>
        document.activeElement?.closest('[data-pane]')?.getAttribute('data-pane'),
      ),
    )
    .toBe('panel');
});

test('the Stage shows its ring once keys follow a press of the pointer', async ({ page }) => {
  await openApp(page, { lang: 'en' });
  await addBoxes(page, THREE);
  const ring = () => surface(page).evaluate((node) => getComputedStyle(node).outlineStyle);
  const box = (await surface(page).locator('[data-element-id="e_b"]').boundingBox())!;
  // A press on an element: the Stage has the keyboard, and what is selected says so.
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(surface(page)).toBeFocused();
  expect(await ring()).toBe('none');
  // The keys take over: from here on the keyboard is what works the Stage, and it shows.
  await page.keyboard.press('ArrowRight');
  expect(await ring()).toBe('solid');
  // A tool pressed with the pointer hands the keyboard back by script: no ring comes of that.
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  expect(await ring()).toBe('none');
  await page.evaluate(() => {
    const stage = document.querySelector<HTMLElement>('[data-testid="stage-surface"]');
    stage?.blur();
    stage?.focus();
  });
  expect(await ring()).toBe('none');
  // And with nothing selected, a key still shows where the keyboard is.
  await page.keyboard.press('Escape');
  expect(await ring()).toBe('solid');
});

test('wherever Tab takes the keyboard in the editor, it can be seen', async ({ page }) => {
  await openApp(page, { lang: 'en' });
  await addBoxes(page, THREE);
  // From the top of the window, once round every stop of Tab.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  const unseen: string[] = [];
  const stops: string[] = [];
  for (let i = 0; i < 200; i++) {
    await page.keyboard.press('Tab');
    const stop = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      // A colour that fades in is read once it has arrived.
      for (const animation of document.getAnimations())
        if (animation instanceof CSSTransition) animation.finish();
      // The ring is on the control, or on the frame around it that draws it for the control
      // (a field in its frame, the list of slides in its strip).
      let shown = false;
      for (
        let node: HTMLElement | null = el, up = 0;
        node && up < 4;
        node = node.parentElement, up++
      ) {
        const style = getComputedStyle(node);
        if (style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) >= 1.5) shown = true;
      }
      // The splitter of the panel is a line, and the line itself takes the colour of the focus.
      const line = getComputedStyle(el, '::after');
      if (el.getAttribute('role') === 'separator' && line.backgroundColor !== 'rgba(0, 0, 0, 0)')
        shown = true;
      const name =
        el.getAttribute('aria-label') ??
        el.getAttribute('data-testid') ??
        el.textContent?.trim().slice(0, 30) ??
        '';
      return {
        key: `${el.tagName.toLowerCase()}${el.getAttribute('role') ? `[${el.getAttribute('role')}]` : ''} "${name}"`,
        shown,
      };
    });
    if (!stop) continue;
    // Round: the first stop again.
    if (stops.length > 0 && stop.key === stops[0]) break;
    stops.push(stop.key);
    if (!stop.shown) unseen.push(stop.key);
  }
  // The walk went through the window: the title bar, both rows of tools, the Stage and its
  // elements, the strip, the panel.
  expect(stops.length).toBeGreaterThan(30);
  expect(unseen).toEqual([]);
});
