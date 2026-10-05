import { expect, test, type Page } from '@playwright/test';
import {
  addBoxes,
  elements,
  focusStage,
  frames,
  openApp,
  select,
  selected,
  THREE,
  undoSteps,
} from './arrange-helpers';
import { addElement, line } from './objects-helpers';

/*
 * Whose a key is, by where it was pressed (`shell/shortcuts.ts`). The shortcuts are the window's:
 * a key pressed in a menu, in a popover or in front of a modal dialog belongs to that first, and
 * a key typed into the text of an `html` element is text, but for the keys the text has no use
 * for, which the app still hears.
 */

const surface = (page: Page) => page.getByTestId('stage-surface');
const onStage = (page: Page, id: string) =>
  page.getByTestId('stage-frame').locator(`[data-element-id="${id}"]`);
const rowA = (page: Page) => page.getByTestId('top-tools-a');
const rowB = (page: Page) => page.getByTestId('top-tools-b');
const types = async (page: Page) => (await elements(page)).map((e) => e.type);
const zoom = (page: Page) => page.getByTestId('status-zoom').textContent();

test.describe('a key pressed in what stands over the window', () => {
  test('a letter typed in an open menu is the menu’s, not the shortcut "T: text box"', async ({
    page,
  }) => {
    await openApp(page, { lang: 'en' });
    await addBoxes(page, THREE);
    await rowA(page).getByRole('button', { name: 'File' }).click();
    await expect(page.getByRole('menu')).toBeVisible();
    await page.keyboard.press('t');
    expect(await types(page)).toEqual(['shape', 'shape', 'shape']);
    // The same in the menu of the Stage, which Shift+F10 opens on the selection.
    await page.keyboard.press('Escape');
    await select(page, ['e_b']);
    await focusStage(page);
    await page.keyboard.press('Shift+F10');
    await expect(page.getByTestId('stage-menu')).toBeVisible();
    await page.keyboard.press('t');
    await page.keyboard.press('Control+d');
    expect(await types(page)).toEqual(['shape', 'shape', 'shape']);
  });

  test('keys pressed while a modal question is on the screen do not reach the deck behind it', async ({
    page,
  }) => {
    await openApp(page, { lang: 'en' });
    await addBoxes(page, THREE);
    await select(page, ['e_a']);
    await focusStage(page);
    const steps = await undoSteps(page);
    // The deck has changes: Ctrl+N asks about them, in a modal dialog.
    await page.keyboard.press('Control+n');
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel' }).focus();

    await page.keyboard.press('Control+z');
    await page.keyboard.press('t');
    await page.keyboard.press('Control+d');
    await page.keyboard.press('Delete');
    await expect(dialog).toBeVisible();
    expect(await types(page)).toEqual(['shape', 'shape', 'shape']);
    expect(await undoSteps(page)).toBe(steps);
    // Not with the focus outside the dialog either: the window behind it is out of reach.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press('Control+z');
    await page.keyboard.press('t');
    expect(await types(page)).toEqual(['shape', 'shape', 'shape']);
    expect(await undoSteps(page)).toBe(steps);

    // Answered, the question is gone and the keys are the window's again.
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toHaveCount(0);
    await focusStage(page);
    await page.keyboard.press('Control+d');
    await expect.poll(async () => (await types(page)).length).toBe(4);
  });

  test('in a popover a plain key is the popover’s, and Ctrl+Z still undoes', async ({ page }) => {
    await openApp(page, { lang: 'en' });
    await addBoxes(page, THREE);
    await onStage(page, 'e_b').click();
    await page.keyboard.press('ArrowRight');
    const moved = (await frames(page, ['e_b'])).e_b!.x;
    await rowB(page).getByRole('button', { name: 'Opacity' }).click();
    const popover = page.getByRole('dialog');
    await expect(popover).toBeVisible();
    // On the popover itself, not in its number field, where a key types.
    await popover.evaluate((node) => (node as HTMLElement).focus());
    await page.keyboard.press('t');
    expect(await types(page)).toEqual(['shape', 'shape', 'shape']);
    await page.keyboard.press('Control+z');
    await expect.poll(async () => (await frames(page, ['e_b'])).e_b!.x).toBe(moved - 1);
  });

  test('Enter on a button presses the button, whatever is selected on the slide', async ({
    page,
  }) => {
    await openApp(page, { lang: 'en' });
    // A selected line has a shortcut of its own on Enter: into its points.
    await addElement(page, line());
    await focusStage(page);
    // The keyboard comes to the Arrange menu as Tab brings it, and Enter opens the menu.
    const arrange = page.getByTestId('arrange-menu');
    await arrange.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('arrange-menu-content')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(arrange).toBeFocused();
    // On the Stage the same key is the line's.
    await focusStage(page);
    await page.keyboard.press('Enter');
    await expect(surface(page).locator('[data-line-point][data-active]')).toHaveCount(1);
  });
});

test.describe('a key typed into the text of an html element', () => {
  const HTML = {
    id: 'e_html',
    type: 'html',
    frame: { x: 400, y: 260, w: 900, h: 300 },
    markup: '<div class="card"><p>Revenue grew this year.</p></div>',
    styles: '.card { font: 40px/1.4 Arial, sans-serif; }',
    hasScripts: false,
    natural: { w: 900, h: 300 },
  };
  const markup = (page: Page) =>
    page.evaluate(
      () =>
        (
          window.slidr!.bus.deck.slides[0]!.elements.find((e) => e.id === 'e_html') as {
            markup: string;
          }
        ).markup,
    );

  async function editHtml(page: Page) {
    await openApp(page, { lang: 'en' });
    await addBoxes(page, THREE);
    await addElement(page, HTML);
    const box = (await onStage(page, 'e_html').locator('p').boundingBox())!;
    await page.mouse.dblclick(box.x + box.width - 3, box.y + box.height / 2);
    await expect
      .poll(() => page.evaluate(() => window.slidr!.selection.getState().editingElementId))
      .toBe('e_html');
  }

  test('Ctrl+F and the zoom reach the app, as from a text box', async ({ page }) => {
    await editHtml(page);
    const fit = await zoom(page);
    await page.keyboard.press('Control+Equal');
    await expect.poll(() => zoom(page)).not.toBe(fit);
    await page.keyboard.press('Control+f');
    await expect(page.getByTestId('find-bar')).toBeVisible();
  });

  test('the keys of the text stay the text’s, and no shortcut of the slide answers', async ({
    page,
  }) => {
    await editHtml(page);
    const before = await frames(page, ['e_html']);
    // "T" is a letter, and Delete a character: neither is the app's.
    await page.keyboard.type(' Tt');
    await expect.poll(() => markup(page)).toContain('Revenue grew this year. Tt');
    await page.keyboard.press('Backspace');
    // Ctrl+A is all of this text, not every element of the slide; Ctrl+D copies no element;
    // Ctrl with an arrow moves the caret by a word and does not size the element.
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Control+d');
    await page.keyboard.press('Control+ArrowLeft');
    await page.keyboard.press('Control+Shift+ArrowRight');
    expect(await selected(page)).toEqual(['e_html']);
    expect(await types(page)).toEqual(['shape', 'shape', 'shape', 'html']);
    expect(await frames(page, ['e_html'])).toEqual(before);
    expect(await page.evaluate(() => window.slidr!.selection.getState().editingElementId)).toBe(
      'e_html',
    );
  });

  test('undo is the key marked Z on every layout', async ({ page }) => {
    await editHtml(page);
    await page.keyboard.type(' more');
    await expect.poll(() => markup(page)).toContain('this year. more');
    // A QWERTZ keyboard: the key marked Z is where QWERTY has Y.
    const press = (init: { key: string; code: string; ctrlKey: boolean }) =>
      page.evaluate((keys) => {
        const host = document
          .querySelector('[data-testid="stage-frame"] [data-element-id="e_html"]')!
          .querySelector('[data-slidr-html="shadow"]')!;
        const target = host.shadowRoot!.querySelector('p')!;
        target.dispatchEvent(
          new KeyboardEvent('keydown', {
            bubbles: true,
            composed: true,
            cancelable: true,
            ...keys,
          }),
        );
      }, init);
    await press({ key: 'z', code: 'KeyY', ctrlKey: true });
    await expect.poll(() => markup(page)).not.toContain('more');
    expect(await page.evaluate(() => window.slidr!.bus.canRedo)).toBe(true);
    await press({ key: 'y', code: 'KeyZ', ctrlKey: true });
    await expect.poll(() => markup(page)).toContain('this year. more');
  });
});

test.describe('Ctrl and plus', () => {
  test('zooms in by each of the keys that are a plus, and the minus of the number pad zooms out', async ({
    page,
  }) => {
    await openApp(page, { lang: 'en' });
    await focusStage(page);
    const fit = await zoom(page);
    await page.keyboard.press('Control+Equal');
    const closer = await zoom(page);
    expect(closer).not.toBe(fit);
    for (const keys of ['Control+Shift+Equal', 'Control+NumpadAdd']) {
      await page.keyboard.press('Control+0');
      await expect.poll(() => zoom(page)).toBe(fit);
      await page.keyboard.press(keys);
      await expect.poll(() => zoom(page), keys).toBe(closer);
    }
    await page.keyboard.press('Control+NumpadSubtract');
    await expect.poll(() => zoom(page)).toBe(fit);
    await expect(surface(page)).toBeFocused();
  });
});
