import { expect, test, type Page } from '@playwright/test';
import { collectErrors } from './agent-helpers';
import {
  chooseFile,
  HANDWRITTEN_SLIDES,
  importUntilCut,
  openImportPanel,
  playNext,
  reopenDeck,
  slideNames,
  turns,
  turnsDone,
} from './import-helpers';

/*
 * An import that was cut goes on from the last captured slide (IMP-09), the deck keeps what the
 * import left (IMP-07), and the panel shows the size of the plan as a number (IMP-11). Against
 * the scripted agent, whose capture turn brings in three of six slides and then ends badly: by
 * Stop, or because its usage ran out.
 */

const brief = (page: Page, fresh = false) =>
  page.evaluate((isFresh) => window.slidrImport!.brief(isFresh), fresh);
const state = (page: Page) => page.evaluate(() => window.slidrImport!.state.getState());

test('a stopped import is offered to continue, and goes on with the slides that are missing', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await openImportPanel(page, { script: 'import-cut', speed: 1 });
  await importUntilCut(page, { stop: true });

  // The size of the plan is a number in the panel from the first capture on (IMP-11).
  await expect(page.getByTestId('import-count')).toHaveText('נלכדו 3 מתוך 6');
  await expect(turns(page).nth(1)).toHaveAttribute('data-outcome', 'interrupted');
  const cut = page.getByTestId('import-cut');
  await expect(cut).toContainText('הייבוא נקטע לפני שהסתיים');
  await expect(cut).toContainText('נלכדו 3 מתוך 6');
  expect(await slideNames(page)).toEqual(HANDWRITTEN_SLIDES.slice(0, 3));

  // What the next turn is told: the three slides, what each was captured from, and no more.
  const told = await brief(page);
  expect(told).toContain('planned_slides: 6');
  expect(told).toContain('captured_slides: 3');
  expect(told).toContain(`"from":{"js":"document.querySelectorAll('section')[2]"`);
  expect(told).toMatch(/The isolated page is still open/);

  await cut.getByRole('button').click();
  // The message is the user's, in the language of the UI.
  await expect(page.getByTestId('chat-user').last()).toHaveText('המשך את הייבוא מהמקום שבו נעצר.');
  await turnsDone(page, 3);
  await expect(turns(page).nth(2)).toHaveAttribute('data-outcome', 'completed');
  // Six slides, in the order of the file, none of them twice.
  expect(await slideNames(page)).toEqual(HANDWRITTEN_SLIDES);
  await expect(page.getByTestId('filmstrip').getByRole('option')).toHaveCount(6);
  await expect(page.getByTestId('import-count')).toHaveText('נלכדו 6 מתוך 6');
  await expect(cut).toHaveCount(0);
  // And nothing more to tell a turn that follows.
  expect(await brief(page)).toBe('');

  await page.getByTestId('import-report-tab').click();
  await expect(page.getByTestId('import-report').getByTestId('import-row')).toHaveCount(6);
  await expect(page.getByTestId('import-report')).toContainText('6 מתוך 6');
  expect(errors).toEqual([]);
});

test('a capture call ends with its turn: the slide the page was working on stays out', async ({
  page,
}) => {
  await openImportPanel(page, { script: 'import-cut', speed: 1 });
  await importUntilCut(page, { stop: true });
  // A call for the three slides that are left, whose turn ends while the page is still busy
  // with the first of them (its script waits before it shows the slide).
  const result = await page.evaluate(async () => {
    const handle = window.slidrImport!;
    const slide = (n: number) => ({
      js: `document.querySelectorAll('section')[${n}]`,
      before: `await new Promise((done) => setTimeout(done, 500)); show(${n});`,
    });
    const running = handle.call('import_capture', { slides: [slide(3), slide(4), slide(5)] });
    setTimeout(() => handle.turnEnded(false), 150);
    return running;
  });
  expect(result).toMatchObject({
    ok: true,
    data: {
      captured: [],
      notCaptured: 'The turn was stopped: the last 3 of this call were not captured.',
    },
  });
  expect(await slideNames(page)).toEqual(HANDWRITTEN_SLIDES.slice(0, 3));
  await expect(page.getByTestId('import-cut')).toContainText('נלכדו 3 מתוך 6');
});

test('a deck that is opened again has its import: the report, the chat, and the way on', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await openImportPanel(page, { script: 'import-cut', speed: 1 });
  await importUntilCut(page, { stop: true });
  await page.getByTestId('import-report-tab').click();
  const figures = await page.getByTestId('import-report').innerText();

  // The deck is closed, and the user is elsewhere when it is opened again.
  await reopenDeck(page, async () => {
    await expect(page.getByTestId('import-start')).toBeVisible();
    await page.locator('[data-testid="activity-bar"] [data-panel="ai.deck"]').click();
    await expect(page.getByTestId('import-start')).toHaveCount(0);
  });

  // An import that was cut opens the panel by itself, on the session, with the way on.
  const cut = page.getByTestId('import-cut');
  await expect(cut).toContainText('נלכדו 3 מתוך 6');
  await expect(page.getByTestId('import-count')).toHaveText('נלכדו 3 מתוך 6');
  // The chat is the one that was held: the request, the plan, the approval, the turn that was cut.
  await expect(page.getByTestId('chat-user')).toHaveCount(2);
  await expect(turns(page)).toHaveCount(2);
  await expect(turns(page).first()).toContainText('6 שקפים');
  // The report is there again, with the same figures: the slides, the time and the usage.
  await page.getByTestId('import-report-tab').click();
  const report = page.getByTestId('import-report');
  await expect(report.getByTestId('import-row')).toHaveCount(3);
  expect(await report.innerText()).toBe(figures);
  // And the source file is in the deck.
  await expect(page.getByTestId('import-source')).toContainText('handwritten.html');

  // The page was closed with the deck. The session that goes on does not remember: it is told
  // what the deck holds, and that the page it will find is a new one.
  expect(await state(page)).toMatchObject({ open: false, kept: true, phase: 'cut' });
  const told = await brief(page, true);
  expect(told).toMatch(/this session has no memory of it/);
  expect(told).toContain('captured_slides: 3');
  expect(told).toMatch(/The isolated page was closed\./);

  await playNext(page, 'import-rest');
  await page.getByRole('tab').first().click();
  await cut.getByRole('button').click();
  await turnsDone(page, 3);
  expect(await state(page)).toMatchObject({ open: true, phase: 'idle' });
  expect(await slideNames(page)).toEqual(HANDWRITTEN_SLIDES);
  await expect(page.getByTestId('import-count')).toHaveText('נלכדו 6 מתוך 6');
  await expect(cut).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('an import whose usage ran out is continued the same way', async ({ page }) => {
  await openImportPanel(page, { script: 'import-cut', lang: 'en' });
  await importUntilCut(page, { stop: false });
  await expect(turns(page).nth(1)).toHaveAttribute('data-outcome', 'failed');
  const cut = page.getByTestId('import-cut');
  await expect(cut).toContainText('The import was cut before it finished');
  await expect(cut).toContainText('3 of 6 captured');

  await cut.getByRole('button', { name: 'Continue the import' }).click();
  await expect(page.getByTestId('chat-user').last()).toHaveText(
    'Continue the import from where it stopped.',
  );
  await turnsDone(page, 3);
  expect(await slideNames(page)).toEqual(HANDWRITTEN_SLIDES);
  await expect(cut).toHaveCount(0);

  // The import is finished. A later turn that is stopped, over something else, cuts nothing.
  await page.getByTestId('chat-input').fill('thanks');
  await page.getByTestId('chat-input').press('Enter');
  await turnsDone(page, 4);
  await page.evaluate(() => window.slidrImport!.turnEnded(false));
  expect((await state(page)).phase).toBe('idle');
  await expect(cut).toHaveCount(0);
});

test('a finished import that is opened again is not offered to continue, and its tools work', async ({
  page,
}) => {
  await openImportPanel(page);
  await chooseFile(page);
  await turnsDone(page, 1);
  await page.getByTestId('import-approve').getByRole('button').click();
  await turnsDone(page, 2);
  expect(await slideNames(page)).toEqual(HANDWRITTEN_SLIDES);

  const deckPanel = page.locator('[data-testid="activity-bar"] [data-panel="ai.deck"]');
  await reopenDeck(page, () => deckPanel.click());
  // Nothing was cut: the panel is not opened over what the user is doing.
  await expect.poll(async () => (await state(page)).file).toBe('handwritten.html');
  await expect(page.getByTestId('import-session')).toHaveCount(0);
  // The import is there for whoever looks, and offers nothing to continue.
  await page.locator('[data-testid="activity-bar"] [data-panel="import"]').click();
  await expect(page.getByTestId('import-session')).toBeVisible();
  await expect(page.getByTestId('import-cut')).toHaveCount(0);
  await expect(page.getByTestId('import-count')).toHaveText('נלכדו 6');
  expect(await state(page)).toMatchObject({ open: false, kept: true, phase: 'idle' });

  // A tool of the import that is called now opens the page again from the kept source.
  const outline = await page.evaluate(() =>
    window.slidrImport!.call('import_eval', {
      code: 'return document.querySelectorAll("section").length',
    }),
  );
  expect(outline).toMatchObject({ ok: true, data: { result: '6' } });
  expect(await state(page)).toMatchObject({ open: true, stale: false });
});
