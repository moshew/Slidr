import { expect, test, type Page } from '@playwright/test';
import { openApp } from './arrange-helpers';
import {
  bar,
  buildDeck,
  count,
  find,
  marks,
  place,
  query,
  replacement,
  status,
  WORD,
} from './editor-find-helpers';
import { edit, setSelection } from './text-helpers';

/*
 * The find bar (WG4-T09, TXT-12) in the app: how it opens and closes, the count, stepping through
 * the matches of the whole deck, the options, and the marks on the Stage. Replacing is
 * `editor-find-replace.spec.ts`.
 */

const stage = (page: Page) => page.getByTestId('stage-surface');

let first: string;

test.beforeEach(async ({ page }) => {
  await openApp(page);
  first = await buildDeck(page);
});

test('Ctrl+F opens the bar on the find field, and Esc gives the keyboard back to the Stage', async ({
  page,
}) => {
  await stage(page).focus();
  // The key is the app's: the webview's own find must not open for it.
  await page.evaluate(() => {
    const seen: boolean[] = [];
    Object.assign(window, { findKeys: seen });
    window.addEventListener('keydown', (event) => seen.push(event.defaultPrevented));
  });
  await page.keyboard.press('Control+f');
  await expect(bar(page)).toBeVisible();
  await expect(bar(page)).toHaveAttribute('role', 'search');
  await expect(query(page)).toBeFocused();
  await expect(replacement(page)).toHaveCount(0);
  expect(
    await page.evaluate(() => (window as unknown as { findKeys: boolean[] }).findKeys),
  ).toEqual(
    // Control, then F.
    [false, true],
  );
  // Nothing is counted before something is looked for.
  await expect(count(page)).toHaveCount(0);
  await page.keyboard.type('Slidr');
  await expect(count(page)).toHaveText('1');

  await page.keyboard.press('Escape');
  await expect(bar(page)).toHaveCount(0);
  await expect(stage(page)).toBeFocused();

  // What was looked for is there the next time, selected, so typing starts over.
  await page.keyboard.press('Control+f');
  await expect(query(page)).toHaveValue('Slidr');
  await page.keyboard.type('12%');
  await expect(query(page)).toHaveValue('12%');
  await expect(count(page)).toHaveText('1');

  await page.getByTestId('find-close').click();
  await expect(bar(page)).toHaveCount(0);
  await expect(stage(page)).toBeFocused();
});

test('Ctrl+H opens the bar with the replace row, and the toggle shows and hides the row', async ({
  page,
}) => {
  const toggle = page.getByTestId('find-toggle-replace');
  await page.keyboard.press('Control+h');
  await expect(query(page)).toBeFocused();
  await expect(replacement(page)).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  // Tab goes from what is looked for to what replaces it.
  await page.keyboard.press('Tab');
  await expect(replacement(page)).toBeFocused();

  // Ctrl+F on the open bar goes back to the find field and keeps the row.
  await page.keyboard.press('Control+f');
  await expect(query(page)).toBeFocused();
  await expect(replacement(page)).toBeVisible();

  await toggle.click();
  await expect(replacement(page)).toHaveCount(0);
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();
  await expect(replacement(page)).toBeVisible();

  // Closed and opened again with Ctrl+F, it is the find row alone.
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+f');
  await expect(replacement(page)).toHaveCount(0);
});

test('Enter and Shift+Enter go through the matches of every slide, and the count follows', async ({
  page,
}) => {
  await find(page, WORD);
  // Counted at once, and nothing moves until a step.
  await expect(count(page)).toHaveText('9');
  expect(await place(page)).toEqual({ slide: first, selected: [], editing: null });

  const steps = [
    { count: '1 / 9', slide: first, selected: ['e_title'] },
    { count: '2 / 9', slide: first, selected: ['e_body'] },
    { count: '3 / 9', slide: first, selected: ['e_body'] },
    { count: '4 / 9', slide: 's_two', selected: ['e_card'] },
    { count: '5 / 9', slide: 's_two', selected: ['e_table'] },
    { count: '6 / 9', slide: 's_two', selected: ['e_table'] },
    // Speaker notes: nothing on the Stage to select.
    { count: '7 / 9', slide: 's_two', selected: [] },
    // A hidden slide is searched too, and so is a locked element.
    { count: '8 / 9', slide: 's_three', selected: ['e_locked'] },
    { count: '9 / 9', slide: 's_three', selected: ['e_last'] },
    { count: '1 / 9', slide: first, selected: ['e_title'] },
  ];
  for (const step of steps) {
    await page.keyboard.press('Enter');
    await expect(count(page)).toHaveText(step.count);
    expect(await place(page)).toMatchObject({ slide: step.slide, selected: step.selected });
    // The keyboard stays in the field, for the next Enter.
    await expect(query(page)).toBeFocused();
    if (step.count === '4 / 9') {
      // The card is inside a group: the Stage went into the group for it (ADR-016).
      await expect(stage(page)).toHaveAttribute('data-entered', 'e_group');
    }
    if (step.count === '7 / 9') {
      await expect(status(page)).toHaveText('התוצאה בהערות הדובר של השקף');
    } else {
      await expect(status(page)).toHaveCount(0);
    }
  }

  await page.keyboard.press('Shift+Enter');
  await expect(count(page)).toHaveText('9 / 9');
  expect(await place(page)).toMatchObject({ slide: 's_three', selected: ['e_last'] });
  await page.keyboard.press('Shift+Enter');
  await expect(count(page)).toHaveText('8 / 9');
});

test('F3 and Shift+F3 step from anywhere, and the buttons of the bar do the same', async ({
  page,
}) => {
  await find(page, WORD);
  await stage(page).focus();
  await page.keyboard.press('F3');
  await expect(count(page)).toHaveText('1 / 9');
  // The keyboard stays where it was.
  await expect(stage(page)).toBeFocused();
  await page.keyboard.press('Shift+F3');
  await expect(count(page)).toHaveText('9 / 9');
  expect(await place(page)).toMatchObject({ slide: 's_three', selected: ['e_last'] });

  await page.getByTestId('find-next').click();
  await expect(count(page)).toHaveText('1 / 9');
  await page.getByTestId('find-previous').click();
  await expect(count(page)).toHaveText('9 / 9');
  await page.getByTestId('find-previous').click();
  await expect(count(page)).toHaveText('8 / 9');

  // With the bar closed, F3 opens it and goes on with what was looked for.
  await page.keyboard.press('Escape');
  await expect(bar(page)).toHaveCount(0);
  await page.keyboard.press('F3');
  await expect(bar(page)).toBeVisible();
  await expect(query(page)).toHaveValue(WORD);
  // From the slide on the Stage, the third: its first match.
  await expect(count(page)).toHaveText('8 / 9');
});

test('the search goes on from the slide the user moved to', async ({ page }) => {
  await find(page, WORD);
  await page.keyboard.press('Enter');
  await expect(count(page)).toHaveText('1 / 9');
  await page.evaluate(() => window.slidr!.selection.getState().setCurrentSlide('s_two'));
  // The bar stands on no match of this slide.
  await expect(count(page)).toHaveText('9');
  await page.keyboard.press('F3');
  await expect(count(page)).toHaveText('4 / 9');
});

test('the Stage marks every match of its slide, and the current one apart', async ({ page }) => {
  await find(page, WORD);
  await expect.poll(() => marks(page)).toEqual({ soft: [WORD, WORD, WORD], current: [] });

  // The first match crosses three runs of the title: one range over three text nodes.
  await page.keyboard.press('Enter');
  await expect.poll(() => marks(page)).toEqual({ soft: [WORD, WORD], current: [WORD] });
  const spans = await page.evaluate(() => {
    const [range] = [...CSS.highlights.get('slidr-find-current')!] as Range[];
    const title = document.querySelector(
      '[data-testid="stage-surface"] [data-element-id="e_title"]',
    );
    return {
      inTitle: title?.contains(range!.commonAncestorContainer) ?? false,
      nodes: range!.startContainer !== range!.endContainer,
    };
  });
  expect(spans).toEqual({ inTitle: true, nodes: true });

  await page.keyboard.press('Enter');
  await expect.poll(() => marks(page)).toEqual({ soft: [WORD, WORD], current: [WORD] });

  // The next slide: the card and two cells of the table. The notes are not drawn.
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await expect(count(page)).toHaveText('4 / 9');
  await expect.poll(() => marks(page)).toEqual({ soft: [WORD, WORD], current: [WORD] });
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await expect(count(page)).toHaveText('7 / 9');
  await expect.poll(() => marks(page)).toEqual({ soft: [WORD, WORD, WORD], current: [] });

  // The marks follow the query, and a change of the deck.
  await query(page).fill('רבעון טוב');
  await expect.poll(() => marks(page)).toEqual({ soft: ['רבעון טוב'], current: [] });
  await page.evaluate(() =>
    window.slidr!.bus.dispatch({
      type: 'text.set',
      slideId: 's_two',
      elementId: 'e_table',
      cell: { row: 0, col: 1 },
      content: { paragraphs: [{ dir: 'auto', align: 'start', runs: [{ text: 'עוד רבעון טוב' }] }] },
    }),
  );
  await expect(count(page)).toHaveText('2');
  await expect.poll(() => marks(page)).toEqual({ soft: ['רבעון טוב', 'רבעון טוב'], current: [] });

  // Closing the bar takes the marks away.
  await page.keyboard.press('Escape');
  await expect.poll(() => marks(page)).toEqual({ soft: [], current: [] });
});

test('both marks are painted on the Stage, each in its own colours', async ({ page }) => {
  await find(page, WORD);
  await expect.poll(async () => (await marks(page)).soft).toHaveLength(3);
  // The word in the title, a little inside its mark, clear of the outline its box gets.
  const clip = await page.evaluate(() => {
    const [range] = [...CSS.highlights.get('slidr-find')!] as Range[];
    const { x, y, width, height } = range!.getBoundingClientRect();
    return { x: x + 4, y: y + 8, width: width - 8, height: height - 16 };
  });
  const soft = await page.screenshot({ clip });
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await marks(page)).current).toEqual([WORD]);
  const current = await page.screenshot({ clip });
  await page.keyboard.press('Escape');
  await expect.poll(() => marks(page)).toEqual({ soft: [], current: [] });
  const plain = await page.screenshot({ clip });
  expect(soft.equals(plain)).toBe(false);
  expect(current.equals(plain)).toBe(false);
  expect(current.equals(soft)).toBe(false);
});

test('the marks follow what the Stage draws while text is edited under the open bar', async ({
  page,
}) => {
  await find(page, WORD);
  await expect.poll(() => marks(page)).toEqual({ soft: [WORD, WORD, WORD], current: [] });
  // The text editor draws the body anew, with nodes of its own.
  await edit(page, 'e_body');
  await expect(bar(page)).toBeVisible();
  await expect.poll(() => marks(page)).toEqual({ soft: [WORD, WORD, WORD], current: [] });
  // Typing changes the deck, and the count and the marks are those of the new text.
  await page.keyboard.type(' Q4, another ');
  await page.keyboard.insertText(WORD);
  await expect(count(page)).toHaveText('10');
  await expect.poll(() => marks(page)).toEqual({ soft: [WORD, WORD, WORD, WORD], current: [] });
  // Esc in the text leaves the editor, not the bar; the renderer draws the body again.
  await page.keyboard.press('Escape');
  expect((await place(page)).editing).toBeNull();
  await expect(bar(page)).toBeVisible();
  await expect.poll(() => marks(page)).toEqual({ soft: [WORD, WORD, WORD, WORD], current: [] });
});

test('a right click on the bar opens neither the menu of the Stage nor the webview menu', async ({
  page,
}) => {
  await find(page, WORD);
  const prevented = (testId: string) =>
    page.getByTestId(testId).evaluate((target) => {
      const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 });
      return !target.dispatchEvent(event);
    });
  expect(await prevented('find-bar')).toBe(true);
  expect(await prevented('find-next')).toBe(true);
  // A text field keeps its own menu, as everywhere in the app.
  expect(await prevented('find-query')).toBe(false);
  await bar(page).click({ button: 'right', position: { x: 6, y: 6 } });
  await expect(page.getByTestId('stage-menu')).toHaveCount(0);
});

test('in a browser without the Custom Highlight API the bar works, without the marks', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => Reflect.deleteProperty(window, 'Highlight'));
  await openApp(page);
  const firstId = await buildDeck(page);
  expect(await page.evaluate(() => typeof Highlight)).toBe('undefined');

  await find(page, WORD);
  await expect(count(page)).toHaveText('9');
  await page.keyboard.press('Enter');
  await expect(count(page)).toHaveText('1 / 9');
  expect(await place(page)).toMatchObject({ slide: firstId, selected: ['e_title'] });
  expect(await page.evaluate(() => CSS.highlights.size)).toBe(0);
  await page.keyboard.press('Escape');
  await expect(bar(page)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('whole word and match case narrow the search, in Hebrew and in Latin text', async ({
  page,
}) => {
  const wholeWord = page.getByTestId('find-whole-word');
  const matchCase = page.getByTestId('find-match-case');
  await find(page, WORD);
  await expect(count(page)).toHaveText('9');
  // "הרבעון" and "ברבעון" are other words.
  await wholeWord.click();
  await expect(wholeWord).toHaveAttribute('aria-pressed', 'true');
  await expect(count(page)).toHaveText('6');
  await expect.poll(() => marks(page)).toEqual({ soft: [WORD], current: [] });
  await wholeWord.click();
  await expect(count(page)).toHaveText('9');

  await query(page).fill('slidr');
  await expect(count(page)).toHaveText('1');
  await matchCase.click();
  await expect(matchCase).toHaveAttribute('aria-pressed', 'true');
  await expect(count(page)).toHaveText('אין תוצאות');
  await query(page).fill('Slidr');
  await expect(count(page)).toHaveText('1');
});

test('without a match the bar says so, and there is nowhere to step', async ({ page }) => {
  await find(page, 'אין כזה');
  await expect(count(page)).toHaveText('אין תוצאות');
  await expect(page.getByTestId('find-next')).toBeDisabled();
  await expect(page.getByTestId('find-previous')).toBeDisabled();
  await page.keyboard.press('Enter');
  expect(await place(page)).toEqual({ slide: first, selected: [], editing: null });
  await expect.poll(() => marks(page)).toEqual({ soft: [], current: [] });
});

test('text selected in the text editor becomes what is looked for, when it is one line', async ({
  page,
}) => {
  await edit(page, 'e_body');
  // The first word of the first paragraph.
  await setSelection(page, 1, 6);
  await page.keyboard.press('Control+f');
  await expect(query(page)).toHaveValue(WORD);
  await expect(count(page)).toHaveText('9');
  // The bar is not modal: the text is still being edited, until a step shows a match.
  expect((await place(page)).editing).toBe('e_body');
  await page.keyboard.press('Enter');
  expect(await place(page)).toEqual({ slide: first, selected: ['e_title'], editing: null });
  await expect(count(page)).toHaveText('1 / 9');
  await page.keyboard.press('Escape');

  // A selection across two paragraphs is not a thing to look for: the query stays.
  await edit(page, 'e_body');
  await setSelection(page, 1, 40);
  await page.keyboard.press('Control+h');
  await expect(query(page)).toHaveValue(WORD);
});

test('F3 works while text is typed, and leaves the editor for the match', async ({ page }) => {
  await find(page, 'Slidr');
  await page.keyboard.press('Escape');
  await edit(page, 'e_title');
  await page.keyboard.press('F3');
  await expect(bar(page)).toBeVisible();
  await expect(count(page)).toHaveText('1 / 1');
  expect(await place(page)).toEqual({ slide: first, selected: ['e_body'], editing: null });
  await expect(query(page)).toBeFocused();

  // With the bar open and the caret in a text, F3 gives the keyboard to the Stage.
  await edit(page, 'e_title');
  await page.keyboard.press('F3');
  expect((await place(page)).editing).toBeNull();
  await expect(stage(page)).toBeFocused();
});

test('the shortcuts carry a name and a section, for the shortcut map', async ({ page }) => {
  const listed = await page.evaluate(async (path) => {
    const { registries } = (await import(/* @vite-ignore */ path)) as {
      registries: {
        shortcuts: {
          getState(): { items: { id: string; keys: string; label?: string; section?: string }[] };
        };
      };
    };
    return registries.shortcuts
      .getState()
      .items.filter((s) => s.id.startsWith('find.'))
      .map(({ keys, label, section }) => ({ keys, label, section }));
  }, '/src/shell/registry.ts');
  expect(listed).toEqual([
    { keys: 'Ctrl+F', label: 'find:shortcut.open', section: 'edit' },
    { keys: 'Ctrl+H', label: 'find:shortcut.replace', section: 'edit' },
    { keys: 'F3', label: 'find:shortcut.next', section: 'edit' },
    { keys: 'Shift+F3', label: 'find:shortcut.previous', section: 'edit' },
  ]);
});
