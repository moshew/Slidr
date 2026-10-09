import { expect, test, type Page } from '@playwright/test';
import { collectErrors } from './agent-helpers';
import {
  aiPanel,
  chooseFile,
  deckChat,
  HANDWRITTEN_SLIDES,
  importChat,
  importUntilCut,
  openForImport,
  playNext,
  reopenDeck,
  slideNames,
  turns,
  turnsDone,
} from './import-helpers';

/*
 * An import that was cut goes on from the last captured slide (IMP-09), the deck keeps what the
 * import left (IMP-07), and the conversation shows the size of the plan as a number (IMP-11).
 * Against the scripted agent, whose capture turn brings in three of six slides and then ends
 * badly: by Stop, or because its usage ran out.
 */

/** Another panel of the Activity Bar: the user is elsewhere than in the AI chat. */
const elsewhere = (page: Page) =>
  page.locator('[data-testid="activity-bar"] [data-panel="templates"]').click();

const brief = (page: Page, fresh = false) =>
  page.evaluate((isFresh) => window.slidrImport!.brief(isFresh), fresh);
const state = (page: Page) => page.evaluate(() => window.slidrImport!.state.getState());

test('a stopped import is offered to continue, and goes on with the slides that are missing', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await openForImport(page, { script: 'import-cut', speed: 1 });
  await importUntilCut(page, { stop: true });

  // The size of the plan is a number in the conversation from the first capture on (IMP-11).
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

  await page.getByTestId('import-report-toggle').click();
  await expect(page.getByTestId('import-report').getByTestId('import-row')).toHaveCount(6);
  await expect(page.getByTestId('import-report')).toContainText('6 מתוך 6');
  expect(errors).toEqual([]);
});

test('a capture call ends with its turn: the slide the page was working on stays out', async ({
  page,
}) => {
  await openForImport(page, { script: 'import-cut', speed: 1 });
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
  await openForImport(page, { script: 'import-cut', speed: 1 });
  await importUntilCut(page, { stop: true });
  await page.getByTestId('import-report-toggle').click();
  const figures = await page.getByTestId('import-report').innerText();

  // The deck is closed, and the user is elsewhere when it is opened again. The deck that took
  // its place has a chat of its own, with nothing of the import in it.
  await reopenDeck(page, async () => {
    await expect(deckChat(page)).toBeVisible();
    await expect(page.getByTestId('chat-user')).toHaveCount(0);
    await elsewhere(page);
    await expect(aiPanel(page)).toHaveCount(0);
  });

  // An import that was cut opens the AI chat by itself, on its conversation, with the way on.
  await expect(importChat(page)).toBeVisible();
  const cut = page.getByTestId('import-cut');
  await expect(cut).toContainText('נלכדו 3 מתוך 6');
  await expect(page.getByTestId('import-count')).toHaveText('נלכדו 3 מתוך 6');
  // The chat is the one that was held: the request, the plan, the approval, the turn that was cut.
  await expect(page.getByTestId('chat-user')).toHaveCount(2);
  await expect(turns(page)).toHaveCount(2);
  await expect(turns(page).first()).toContainText('6 שקפים');
  // The report is there again, with the same figures: the slides, the time and the usage.
  await page.getByTestId('import-report-toggle').click();
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
  await cut.getByRole('button').click();
  await turnsDone(page, 3);
  expect(await state(page)).toMatchObject({ open: true, phase: 'idle' });
  expect(await slideNames(page)).toEqual(HANDWRITTEN_SLIDES);
  await expect(page.getByTestId('import-count')).toHaveText('נלכדו 6 מתוך 6');
  await expect(cut).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('an import whose usage ran out is continued the same way', async ({ page }) => {
  await openForImport(page, { script: 'import-cut', lang: 'en' });
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
  await openForImport(page);
  await chooseFile(page);
  await turnsDone(page, 1);
  await page.getByTestId('import-approve').getByRole('button').click();
  await turnsDone(page, 2);
  expect(await slideNames(page)).toEqual(HANDWRITTEN_SLIDES);

  await reopenDeck(page, () => elsewhere(page));
  // Nothing was cut: the chat is not opened over what the user is doing.
  await expect.poll(async () => (await state(page)).file).toBe('handwritten.html');
  await expect(aiPanel(page)).toHaveCount(0);
  // The AI chat is where it was left, on the conversation of the import, which was the last
  // one written in. It offers nothing to continue.
  await page.locator('[data-testid="activity-bar"] [data-panel="ai"]').click();
  await expect(importChat(page)).toBeVisible();
  await expect(page.getByTestId('chat-user')).toHaveCount(2);
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

test('the source file can be taken out of the deck, and then there is no way back to it', async ({
  page,
}) => {
  await openForImport(page, { script: 'import-cut', speed: 1 });
  await importUntilCut(page, { stop: true });
  // The report says that the deck carries the file, where it can be taken out.
  await page.getByTestId('import-report-toggle').click();
  const source = page.getByTestId('import-source');
  await expect(source).toContainText('handwritten.html');
  await expect(source).toContainText('שמור בתוך קובץ המצגת');

  // Asked first, and nothing happens on "cancel".
  await page.getByTestId('import-source-remove').click();
  const question = page.getByRole('dialog');
  await expect(question).toContainText('להסיר את קובץ המקור מהמצגת?');
  await question.getByRole('button', { name: 'ביטול' }).click();
  await expect(source).toBeVisible();
  expect((await state(page)).kept).toBe(true);

  await page.getByTestId('import-source-remove').click();
  await page.getByRole('dialog').getByRole('button', { name: 'הסרה', exact: true }).click();
  await expect(source).toHaveCount(0);
  expect(await state(page)).toMatchObject({ kept: false, open: true });
  // The page that is open still works, and the report is as it was.
  await expect(page.getByTestId('import-report').getByTestId('import-row')).toHaveCount(3);

  // Once the deck was closed, the page cannot be opened again: the conversation says so, the
  // next turn is told, and a tool of the import answers that the page is closed.
  await reopenDeck(page);
  await expect(page.getByTestId('import-cut')).toBeVisible();
  await expect(page.getByTestId('import-closed')).toContainText('הדף המבודד נסגר');
  expect(await state(page)).toMatchObject({ kept: false, open: false, phase: 'cut' });
  expect(await brief(page)).toMatch(/keeps no copy of the file to open it from/);
  const refused = await page.evaluate(() =>
    window.slidrImport!.call('import_eval', { code: 'return 1' }),
  );
  expect(refused).toMatchObject({ ok: false });
  await page.getByTestId('import-report-toggle').click();
  await expect(page.getByTestId('import-report').getByTestId('import-row')).toHaveCount(3);
  await expect(page.getByTestId('import-source')).toHaveCount(0);
});
