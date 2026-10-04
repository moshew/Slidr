import { expect, test, type Page } from '@playwright/test';
import {
  card,
  CARD_MARKUP,
  code,
  codePanel,
  codeText,
  htmlElement,
  HTML_ID,
  openCode,
} from './code-helpers';
import {
  addElement,
  onStage,
  openApp,
  pageProblems,
  row,
  shape,
  undoDepth,
} from './objects-helpers';

// The code editor of an `html` element (WG5-T16b, HTM-04): its HTML and its CSS as text in a
// panel, with the slide on the Stage as the live preview.

test.afterEach(({ page }) => {
  // The frame of an element with scripts reports its own sandbox (the thumbnail runs none).
  expect(pageProblems(page).filter((problem) => !problem.includes('sandboxed'))).toEqual([]);
});

/** What the Stage draws inside the element: the text of its shadow root. */
const drawn = (page: Page) =>
  onStage(page, HTML_ID).evaluate(
    (root) => root.querySelector('[data-slidr-html="shadow"]')?.shadowRoot?.textContent ?? '',
  );

test('the code panel shows the HTML of the selected element, and typing changes the slide', async ({
  page,
}) => {
  await openApp(page, { lang: 'en' });
  await addElement(page, card());
  await openCode(page);
  expect(await codeText(page, 'html')).toBe(CARD_MARKUP);

  const steps = await undoDepth(page);
  await code(page, 'html').click();
  await page.keyboard.press('Control+End');
  await page.keyboard.insertText('<p class="note">Typed in the code</p>');
  // The deck follows what is typed, and the Stage draws it.
  await expect.poll(async () => (await htmlElement(page))?.markup).toContain('Typed in the code');
  await expect.poll(() => drawn(page)).toContain('Typed in the code');

  // More typing right away is the same undo step.
  await page.keyboard.insertText('<!-- more -->');
  await expect.poll(async () => (await htmlElement(page))?.markup).toContain('<!-- more -->');
  expect(await undoDepth(page)).toBe(steps + 1);

  // Ctrl+Z in the editor is the deck's undo: the element and the editor go back together.
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await htmlElement(page))?.markup).toBe(CARD_MARKUP);
  await expect.poll(() => codeText(page, 'html')).toBe(CARD_MARKUP);
  await expect.poll(() => drawn(page)).not.toContain('Typed in the code');
  await page.keyboard.press('Control+y');
  await expect.poll(async () => (await htmlElement(page))?.markup).toContain('<!-- more -->');
  await expect.poll(() => codeText(page, 'html')).toContain('<!-- more -->');
});

test('the CSS of the element is edited on its own tab, and applies inside the element only', async ({
  page,
}) => {
  await openApp(page, { lang: 'en' });
  await addElement(page, card());
  await openCode(page);
  await codePanel(page).getByRole('radio', { name: 'CSS' }).click();
  await expect(code(page, 'css')).toBeVisible();
  expect(await codeText(page, 'css')).toContain('.num { color: #fbbf24; }');

  await code(page, 'css').click();
  await page.keyboard.press('Control+End');
  await page.keyboard.insertText('\n.num { color: rgb(0, 128, 0); }');
  const colour = () =>
    onStage(page, HTML_ID).evaluate((root) => {
      const shadow = root.querySelector('[data-slidr-html="shadow"]')!.shadowRoot!;
      return getComputedStyle(shadow.querySelector('.num')!).color;
    });
  await expect.poll(colour).toBe('rgb(0, 128, 0)');
  expect((await htmlElement(page))?.styles).toContain('rgb(0, 128, 0)');

  // Emptied, the stylesheet is gone from the element, not left as an empty one.
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Delete');
  await expect.poll(async () => (await htmlElement(page))?.styles).toBeUndefined();
});

test('a script typed into the markup makes the element one that runs scripts', async ({ page }) => {
  await openApp(page, { lang: 'en' });
  await addElement(page, card());
  await openCode(page);
  await code(page, 'html').click();
  await page.keyboard.press('Control+End');
  await page.keyboard.insertText('<script>document.title = "ran"</script>');
  await expect.poll(async () => (await htmlElement(page))?.hasScripts).toBe(true);
  // It is drawn in a sandboxed frame now, the panel says so, and it cannot be decomposed.
  await expect(onStage(page, HTML_ID).locator('iframe[data-slidr-html="frame"]')).toBeAttached();
  await expect(codePanel(page).getByTestId('code-scripts')).toBeVisible();
  await expect(
    codePanel(page).getByRole('button', { name: 'Decompose into objects' }),
  ).toBeDisabled();
  await expect(row(page).getByTestId('html-decompose')).toBeDisabled();

  // Taking the script out again turns it back.
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await htmlElement(page))?.hasScripts).toBe(false);
  await expect(codePanel(page).getByTestId('code-scripts')).toHaveCount(0);
});

test('a change from elsewhere shows in the editor, and what was being typed does not overwrite it', async ({
  page,
}) => {
  await openApp(page, { lang: 'en' });
  await addElement(page, card());
  await openCode(page);
  await page.evaluate((id) => {
    const editor = window.slidr!;
    editor.bus.dispatch({
      type: 'element.update',
      slideId: editor.selection.getState().currentSlideId ?? '',
      elementId: id,
      patch: { markup: '<p>Written by the agent</p>' },
    });
  }, HTML_ID);
  await expect.poll(() => codeText(page, 'html')).toBe('<p>Written by the agent</p>');
});

test('without an html element selected the panel says what it is for', async ({ page }) => {
  await openApp(page, { lang: 'en' });
  await addElement(page, card());
  await openCode(page);
  await addElement(page, shape('rect'));
  await expect(codePanel(page).getByText('Select an HTML object')).toBeVisible();
  await expect(codePanel(page).getByTestId('code-editor')).toHaveCount(0);
  // Back on the element, its code is there again.
  await page.evaluate((id) => window.slidr!.selection.getState().selectElements([id]), HTML_ID);
  await expect(codePanel(page).getByTestId('code-editor')).toHaveAttribute('data-state', 'ready');
  expect(await codeText(page, 'html')).toBe(CARD_MARKUP);
});

test('the code panel in Hebrew keeps the code left-to-right', async ({ page }) => {
  await openApp(page, { lang: 'he' });
  await addElement(page, card());
  await openCode(page);
  await expect(codePanel(page).getByRole('radio', { name: 'HTML' })).toBeVisible();
  const direction = await code(page, 'html').evaluate(
    (content) => getComputedStyle(content).direction,
  );
  expect(direction).toBe('ltr');
});
