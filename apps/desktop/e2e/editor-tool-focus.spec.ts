import { expect, test, type Page } from '@playwright/test';
import { addBoxes, elements, frames, openApp, select, selected, THREE } from './arrange-helpers';
import { addText, edit, para, plain } from './text-helpers';

/*
 * Where the keyboard is after a tool of Top Tools was used (`shell/toolFocus.ts`). A tool that is
 * used with the pointer never keeps the keyboard: it stays in the text that is being edited, or
 * goes back to the Stage. A tool that was reached with the keyboard keeps it, so the next Tab
 * goes on to the next tool.
 */

const surface = (page: Page) => page.getByTestId('stage-surface');
const onStage = (page: Page, id: string) =>
  page.getByTestId('stage-frame').locator(`[data-element-id="${id}"]`);
const rowA = (page: Page) => page.getByTestId('top-tools-a');
const rowB = (page: Page) => page.getByTestId('top-tools-b');

/** The text of an element of the first slide, a line for each paragraph. */
const textOf = (page: Page, id: string) =>
  page.evaluate((elementId) => {
    const slide = window.slidr!.bus.deck.slides[0]!;
    const element = slide.elements.find((e) => e.id === elementId) as unknown as {
      content?: { paragraphs: { runs: { text: string }[] }[] };
    };
    return (element.content?.paragraphs ?? [])
      .map((p) => p.runs.map((r) => r.text).join(''))
      .join('\n');
  }, id);

test.describe('a tool that is used with the pointer', () => {
  test('a click on Undo in row A leaves the keyboard in the text that is edited', async ({
    page,
  }) => {
    await openApp(page, { lang: 'en' });
    await addText(page, 'e_t', [para('hello')]);
    await edit(page, 'e_t');
    await page.keyboard.type(' big world');
    // A pause: the next words are an undo step of their own.
    await page.waitForTimeout(800);
    await page.keyboard.type(' again');
    await expect.poll(() => plain(page, 'e_t')).toBe('hello big world again');

    await rowA(page).getByRole('button', { name: 'Undo' }).click();
    await expect.poll(() => plain(page, 'e_t')).toBe('hello big world');
    await expect(page.locator('[data-text-editor]')).toBeFocused();
    // The space is typed, not a second press of the button; the "t" is a letter, not "text box".
    await page.keyboard.type(' the end', { delay: 20 });
    await expect.poll(() => plain(page, 'e_t')).toBe('hello big world the end');
    expect(await elements(page)).toHaveLength(1);
  });

  test('a click on Redo, too, and what was undone is still there to redo', async ({ page }) => {
    await openApp(page, { lang: 'en' });
    await addText(page, 'e_t', [para('hello')]);
    await edit(page, 'e_t');
    await page.keyboard.type(' world');
    await expect.poll(() => plain(page, 'e_t')).toBe('hello world');

    await rowA(page).getByRole('button', { name: 'Undo' }).click();
    await expect.poll(() => plain(page, 'e_t')).toBe('hello');
    await rowA(page).getByRole('button', { name: 'Redo' }).click();
    await expect.poll(() => plain(page, 'e_t')).toBe('hello world');
    await expect(page.locator('[data-text-editor]')).toBeFocused();
  });

  test('a click on Undo with an element selected leaves the keyboard on the Stage', async ({
    page,
  }) => {
    await openApp(page, { lang: 'en' });
    await addBoxes(page, THREE);
    await onStage(page, 'e_b').click();
    await page.keyboard.press('ArrowRight');
    const moved = (await frames(page, ['e_b'])).e_b!.x;
    await rowA(page).getByRole('button', { name: 'Undo' }).click();
    await expect.poll(async () => (await frames(page, ['e_b'])).e_b!.x).toBe(moved - 1);
    await expect(surface(page)).toBeFocused();
    await page.keyboard.press('Delete');
    await expect.poll(async () => (await elements(page)).length).toBe(2);
  });

  test('after a choice in the Arrange menu the keys are still the slide’s', async ({ page }) => {
    await openApp(page, { lang: 'en' });
    await addBoxes(page, THREE);
    await onStage(page, 'e_b').click();
    await expect(surface(page)).toBeFocused();
    await page.getByTestId('arrange-menu').click();
    await page
      .getByTestId('arrange-menu-content')
      .getByRole('menuitem')
      .filter({ hasText: 'Duplicate' })
      .click();
    await expect(surface(page)).toBeFocused();
    const [copy] = await selected(page);
    const before = (await frames(page, [copy!]))[copy!]!;
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect.poll(async () => (await frames(page, [copy!]))[copy!]!.x).toBe(before.x + 2);
    await page.keyboard.press('Delete');
    await expect.poll(async () => (await elements(page)).length).toBe(3);
  });

  test('a menu that is closed with Esc gives the keyboard back to the Stage too', async ({
    page,
  }) => {
    await openApp(page, { lang: 'en' });
    await addBoxes(page, THREE);
    await onStage(page, 'e_b').click();
    await page.getByTestId('arrange-menu').click();
    await expect(page.getByTestId('arrange-menu-content')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('arrange-menu-content')).toHaveCount(0);
    await expect(surface(page)).toBeFocused();
    // The element is still selected: Esc closed the menu and nothing more.
    expect(await selected(page)).toEqual(['e_b']);
  });

  test('typing on a selected shape reaches it after one of its row B tools was used (SHP-04)', async ({
    page,
  }) => {
    await openApp(page, { lang: 'en' });
    await addBoxes(page, THREE);
    await onStage(page, 'e_b').click();
    // A tool of another area, which says nothing about the focus itself: opened, and closed
    // again with Esc.
    await rowB(page).getByRole('button', { name: 'Opacity' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(surface(page)).toBeFocused();
    await page.keyboard.type('Title', { delay: 20 });
    await expect.poll(() => textOf(page, 'e_b')).toBe('Title');
    expect(await elements(page)).toHaveLength(3);
  });

  test('a popover opened after typing shows no keyboard focus, and one Esc closes it', async ({
    page,
  }) => {
    await openApp(page, { lang: 'en' });
    await addBoxes(page, THREE);
    await onStage(page, 'e_b').click();
    // Keys on the Stage: from here on a focus that a script moves looks like the keyboard's.
    await page.keyboard.press('ArrowRight');
    const opacity = rowB(page).getByRole('button', { name: 'Opacity' });
    for (let round = 0; round < 2; round++) {
      await opacity.click();
      const popover = page.getByRole('dialog');
      await expect(popover).toBeVisible();
      // The control the popover hands the focus to was not reached with the keyboard: it shows
      // no tooltip, which would take the Esc that is meant for the popover.
      await expect(page.getByRole('tooltip')).toHaveCount(0);
      expect(await popover.evaluate((node) => Boolean(node.querySelector(':focus-visible')))).toBe(
        false,
      );
      await page.keyboard.press('Escape');
      await expect(popover).toHaveCount(0);
      await expect(page.getByRole('tooltip')).toHaveCount(0);
      await expect(surface(page)).toBeFocused();
    }
  });

  test('a popover that is closed by a press on its own button leaves the keys with the Stage', async ({
    page,
  }) => {
    await openApp(page, { lang: 'en' });
    await addBoxes(page, THREE);
    await onStage(page, 'e_b').click();
    const opacity = rowB(page).getByRole('button', { name: 'Opacity' });
    await opacity.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await opacity.click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(surface(page)).toBeFocused();
    await page.keyboard.press('Delete');
    await expect.poll(async () => (await elements(page)).length).toBe(2);
  });

  test('a press on the room between the tools does not take the keyboard from the Stage', async ({
    page,
  }) => {
    await openApp(page, { lang: 'en' });
    await addBoxes(page, THREE);
    await onStage(page, 'e_b').click();
    await page.getByTestId('selection-label').click();
    await expect(surface(page)).toBeFocused();
  });

  test('a field of the row still takes the keyboard when it is pressed', async ({ page }) => {
    await openApp(page, { lang: 'en' });
    await addText(page, 'e_t', [para('hello')]);
    await select(page, ['e_t']);
    await surface(page).focus();
    const size = rowB(page).getByRole('textbox', { name: 'Font size' });
    await size.click();
    await expect(size).toBeFocused();
  });

  test('a show that a menu of row A started keeps the keyboard, not the slide behind it', async ({
    page,
  }) => {
    await openApp(page, { lang: 'en' });
    await addBoxes(page, THREE);
    await onStage(page, 'e_b').click();
    const before = (await frames(page, ['e_b'])).e_b!;
    await rowA(page).getByRole('button', { name: 'Start from' }).click();
    await page.getByRole('menuitem', { name: 'Present from the current slide' }).click();
    const show = page.getByTestId('present');
    await expect(show).toBeVisible();
    // The menu closes while the show comes up: the keyboard must not be handed to the Stage,
    // where the arrows of the show would move what is selected and Delete would delete it.
    await page.waitForTimeout(300);
    await expect(surface(page)).not.toBeFocused();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Delete');
    await page.keyboard.press('Escape');
    await expect(show).toHaveCount(0);
    expect((await frames(page, ['e_b'])).e_b).toEqual(before);
    expect(await elements(page)).toHaveLength(3);
    await expect(surface(page)).toBeFocused();
  });
});

test.describe('a tool that was reached with the keyboard', () => {
  /** Brings the keyboard into row B the way Tab does, from the last control of row A. */
  async function tabIntoRowB(page: Page) {
    await rowA(page).getByRole('button').last().focus();
    await page.keyboard.press('Tab');
    await expect
      .poll(() =>
        page.evaluate(() =>
          Boolean(document.activeElement?.closest('[data-testid="top-tools-b"]')),
        ),
      )
      .toBe(true);
  }

  /** Walks with Tab until the focus is on `name`; fails when the row ends first. */
  async function tabTo(page: Page, target: ReturnType<Page['locator']>) {
    for (let i = 0; i < 40; i++) {
      if (await target.evaluate((node) => node === document.activeElement)) return;
      await page.keyboard.press('Tab');
    }
    await expect(target).toBeFocused();
  }

  test('a menu closes back onto its button, and Tab goes on to the next tool', async ({ page }) => {
    await openApp(page, { lang: 'en' });
    await addBoxes(page, THREE);
    await select(page, ['e_a']);
    await tabIntoRowB(page);
    const arrange = page.getByTestId('arrange-menu');
    await tabTo(page, arrange);
    await page.keyboard.press('Enter');
    const menu = page.getByTestId('arrange-menu-content');
    await expect(menu).toBeVisible();
    // "Bring to front": the first item of the menu.
    await page.keyboard.press('Enter');
    await expect(menu).toHaveCount(0);
    await expect(arrange).toBeFocused();
    expect((await elements(page)).at(-1)!.id).toBe('e_a');
    // The keyboard goes on along the row: the "AI" button comes after the Arrange menu.
    await page.keyboard.press('Tab');
    await expect(
      rowB(page).getByRole('button', { name: 'Ask AI about the selection' }),
    ).toBeFocused();
  });

  test('a popover closes back onto its button', async ({ page }) => {
    await openApp(page, { lang: 'en' });
    await addBoxes(page, THREE);
    await select(page, ['e_b']);
    await tabIntoRowB(page);
    const opacity = rowB(page).getByRole('button', { name: 'Opacity' });
    await tabTo(page, opacity);
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(opacity).toBeFocused();
  });

  test('a text tool that hands the focus back itself hands it to its button', async ({ page }) => {
    await openApp(page, { lang: 'en' });
    await addText(page, 'e_t', [para('hello')]);
    await select(page, ['e_t']);
    await tabIntoRowB(page);
    const spacing = rowB(page).getByRole('button', { name: 'Spacing', exact: true });
    await tabTo(page, spacing);
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(spacing).toBeFocused();
  });

  test('a button that is pressed with Enter keeps the keyboard', async ({ page }) => {
    await openApp(page, { lang: 'en' });
    await addText(page, 'e_t', [para('hello')]);
    await select(page, ['e_t']);
    await tabIntoRowB(page);
    const bold = rowB(page).getByRole('button', { name: 'Bold', exact: true });
    await tabTo(page, bold);
    await page.keyboard.press('Enter');
    await expect(bold).toBeFocused();
    await expect(bold).toHaveAttribute('aria-pressed', 'true');
  });

  test('Ctrl+K from the text closes back to the text, not onto the link button', async ({
    page,
  }) => {
    await openApp(page, { lang: 'en' });
    await addText(page, 'e_t', [para('hello world')]);
    await edit(page, 'e_t');
    await page.keyboard.press('Control+k');
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('[data-text-editor]')).toBeFocused();
  });
});
