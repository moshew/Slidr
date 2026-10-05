import { expect, test, type Page } from '@playwright/test';
import { addBoxes, openApp, THREE } from './arrange-helpers';
import { addText, para } from './text-helpers';

/*
 * What a screen reader is told (WG13-T06, UI-06), where the app draws its own widgets and
 * axe-core has no opinion: the name of a thing is its name and not everything inside it, a state
 * that only an icon shows is said in words, and what changes by itself is announced once.
 *
 * These read the accessibility tree the browser builds, which is what a screen reader reads. How
 * Narrator speaks it is for a person to hear.
 */

const PANEL = '[data-testid="tool-panel"]';

async function openPanel(page: Page, id: string) {
  const button = page.locator(`[data-testid="activity-bar"] button[data-panel="${id}"]`);
  if ((await button.getAttribute('aria-pressed')) !== 'true') await button.click();
  await expect(page.locator(`${PANEL} [data-panel="${id}"]`)).toBeVisible();
}

test('a row of the Layers panel says what it is, its state, and its place among its rows', async ({
  page,
}) => {
  await openApp(page, { lang: 'en' });
  await addBoxes(page, THREE);
  await addText(page, 'e_text', [para('Bees and flowers')], {
    frame: { x: 1100, y: 80, w: 700, h: 160 },
  });
  await page.evaluate(() => {
    const { bus, selection } = window.slidr!;
    const slideId = selection.getState().currentSlideId!;
    bus.batch([
      { type: 'element.update', slideId, elementId: 'e_a', patch: { locked: true } },
      { type: 'element.update', slideId, elementId: 'e_b', patch: { hidden: true, locked: true } },
      { type: 'element.group', slideId, elementIds: ['e_c', 'e_text'], groupId: 'e_group' },
    ] as never);
  });
  await openPanel(page, 'layers');
  const tree = page.getByTestId('layers');
  await expect(tree).toHaveRole('tree');
  await expect(tree).toHaveAccessibleName('Objects on the slide');
  const row = (id: string) => tree.locator(`[data-layer="${id}"]`);

  // A text box is named by its words; that it is text is said after them.
  await expect(row('e_text')).toHaveAccessibleName('Bees and flowers');
  await expect(row('e_text')).toHaveAccessibleDescription('Text');
  // What the lock and the eye show, in words, with the row itself.
  await expect(row('e_a')).toHaveAccessibleDescription(/Locked$/);
  await expect(row('e_a')).not.toHaveAccessibleDescription(/Hidden/);
  await expect(row('e_b')).toHaveAccessibleDescription(/Locked, Hidden$/);
  // The group is one of three at the top; its two children are one and two of two, a level in.
  await expect(row('e_group')).toHaveAttribute('aria-level', '1');
  await expect(row('e_group')).toHaveAttribute('aria-setsize', '3');
  for (const id of ['e_c', 'e_text']) {
    await expect(row(id)).toHaveAttribute('aria-level', '2');
    await expect(row(id)).toHaveAttribute('aria-setsize', '2');
  }
  const places = await Promise.all(
    ['e_c', 'e_text'].map((id) => row(id).getAttribute('aria-posinset')),
  );
  expect(places.sort()).toEqual(['1', '2']);
  const top = await Promise.all(
    ['e_group', 'e_a', 'e_b'].map((id) => row(id).getAttribute('aria-posinset')),
  );
  expect(top.sort()).toEqual(['1', '2', '3']);

  // Hebrew: the same, in its words.
  await page.evaluate(async (path) => {
    const i18n = (await import(/* @vite-ignore */ path)) as {
      setLanguage: (language: string) => Promise<void>;
    };
    await i18n.setLanguage('he');
  }, '/src/i18n/index.ts');
  await expect(row('e_b')).toHaveAccessibleDescription(/נעול, מוסתר$/);
  await expect(row('e_text')).toHaveAccessibleDescription('טקסט');
});

test('a card with a picture of a slide is named by its name, not by the words of the slide', async ({
  page,
}) => {
  // The welcome screen: a template is its name.
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    localStorage.setItem('slidr.language', 'en');
    localStorage.setItem('slidr.templates', JSON.stringify({ defaultId: 'zerem' }));
  });
  await page.goto('/?welcome');
  const welcome = page.getByTestId('welcome');
  await expect(welcome).toBeVisible();
  const template = welcome.locator('[data-welcome-template="zerem"]');
  await expect(template).toHaveAccessibleName('Zerem');
  // The cover is still drawn, with its words: it is only kept out of the name.
  await expect(template.locator('.slidr-slide')).toBeVisible();
  await template.click();
  await expect(page.getByTestId('stage-frame')).toBeVisible();

  // The layouts of "new slide" in the strip, and of the "Layout" tool of row B.
  await page.getByTestId('new-slide').click();
  const choices = page.getByTestId('layout-choices').locator('button[data-layout]');
  await expect(choices.first()).toBeVisible();
  const names = await choices.evaluateAll((buttons) =>
    buttons.map((button) => ({
      name: button.querySelector(':scope > span')?.textContent ?? '',
      words: (button.textContent ?? '').length,
    })),
  );
  expect(names.length).toBeGreaterThan(5);
  for (const [index, { name }] of names.entries()) {
    await expect(choices.nth(index)).toHaveAccessibleName(name);
  }
  await choices.nth(2).click();
  await page.getByTestId('layout-tool').click();
  const layouts = page.getByTestId('layout-tool-choices').locator('button[data-layout-choice]');
  await expect(layouts.first()).toBeVisible();
  const count = await layouts.count();
  for (let index = 0; index < count; index++) {
    const name = (await layouts.nth(index).locator(':scope > span').last().textContent()) ?? '';
    await expect(layouts.nth(index)).toHaveAccessibleName(name);
  }
});

test('the chat says the closing words of a turn once it ends, and who said a message', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.addInitScript(
    (agent) => {
      localStorage.setItem('slidr.language', 'en');
      localStorage.setItem('slidr.agent', agent);
    },
    // Slowly, so the turn can be met while it is at work.
    JSON.stringify({ harnessId: 'mock', model: 'deck-build', mockSpeed: 1 }),
  );
  await page.goto('/');
  await expect(page.getByTestId('stage-frame')).toBeVisible();
  await openPanel(page, 'ai');
  await page.locator(`${PANEL} [role="tab"]`).first().click();
  const said = page.getByTestId('chat-said');
  await expect(said).toHaveAttribute('role', 'status');
  await expect(said).toHaveText('');
  await page.getByTestId('chat-input').fill('A deck about our plan for 2027');
  await page.getByTestId('chat-input').press('Enter');

  // At work: what the agent is doing is a status, and nothing is said of an answer yet.
  const working = page.getByTestId('chat-working');
  await expect(working).toBeVisible();
  await expect(working).toHaveAttribute('role', 'status');
  await expect(said).toHaveText('');
  // The message of the user is theirs by name.
  await expect(page.getByRole('article', { name: 'You' })).toHaveText(
    'A deck about our plan for 2027',
  );

  // Ended: the last words the agent wrote, with who wrote them, and no mark of Markdown.
  const turn = page.getByTestId('chat-assistant').first();
  await expect(turn).toHaveAttribute('data-outcome', /.+/, { timeout: 120_000 });
  await expect(said).toHaveText(/^Agent: \S.+/);
  const words = (await said.textContent()) ?? '';
  expect(words).not.toMatch(/[*_`#]/);
  // They are the turn's own words, not something else.
  const written = ((await turn.textContent()) ?? '').replace(/\s+/g, ' ');
  expect(written).toContain(words.replace(/^Agent: /, '').slice(0, 30));
  // It is not seen: the conversation shows the words where they belong.
  expect(await said.evaluate((node) => node.getBoundingClientRect().width)).toBeLessThanOrEqual(1);
});

test('the status bar says what its number is, and the show says its slide', async ({ page }) => {
  await openApp(page, { lang: 'en' });
  await addBoxes(page, THREE);
  // "Zoom" is words for a screen reader, beside the number that is drawn.
  const zoom = page.getByTestId('status-zoom');
  await expect(zoom).toHaveText(/^\d+%$/);
  const read = await zoom.evaluate((node) => node.parentElement?.textContent ?? '');
  expect(read).toMatch(/^Zoom \d+%$/);
  expect(await zoom.evaluate((node) => node.parentElement?.hasAttribute('aria-label'))).toBe(false);

  // The show: the counter is a status, and reads as "Slide 1 of 2".
  await page.evaluate(() => {
    const { bus, selection } = window.slidr!;
    const first = selection.getState().currentSlideId!;
    bus.dispatch({
      type: 'slide.add',
      slide: { id: 's_two', name: 'Two', elements: [], timeline: [] },
    });
    selection.getState().setCurrentSlide(first);
  });
  await page.keyboard.press('F5');
  const show = page.getByTestId('present');
  await expect(show).toBeVisible();
  const counter = page.getByTestId('present-controls').getByRole('status');
  await expect(counter).toHaveText(/Slide 1 of 2/);
  await page.keyboard.press('ArrowRight');
  await expect(counter).toHaveText(/Slide 2 of 2/);
  await page.keyboard.press('Escape');
  await expect(show).toHaveCount(0);
});
