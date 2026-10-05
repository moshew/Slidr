import { expect, test } from '@playwright/test';
import { collectErrors } from './agent-helpers';
import { chooseFile, openImportPanel, slideNames, turns, turnsDone } from './import-helpers';

/*
 * The import panel (SPEC 13.3, IMP-03; WG9-T18) against the scripted agent: a file is chosen,
 * the agent shows its plan and waits, the slides come in when it is approved, the report is
 * the app's own, the chat goes on, and the whole import is one undo step per turn.
 */

test('imports a file: plan, approval, slides, report, and the chat goes on', async ({ page }) => {
  const errors = collectErrors(page);
  await openImportPanel(page);
  await expect(page.getByText('ייבוא מצגת מקובץ HTML')).toBeVisible();

  await chooseFile(page);
  // The panel sent the first message for the user, asking for the plan first.
  await expect(page.getByTestId('chat-user').first()).toContainText(
    'ייבא את הקובץ "handwritten.html" כמצגת.',
  );
  await expect(page.getByTestId('chat-user').first()).toContainText('חכה לאישור שלי');
  await turnsDone(page, 1);
  await expect(turns(page).first()).toContainText('6 שקפים');
  // Nothing was captured: the deck is still the blank one, and the panel offers to approve.
  expect(await slideNames(page)).toEqual([undefined]);
  await expect(page.getByTestId('import-count')).toHaveCount(0);
  const approve = page.getByTestId('import-approve');
  await expect(approve).toContainText('ה-Agent מחכה לאישור התוכנית');

  await approve.getByRole('button').click();
  await turnsDone(page, 2);
  await expect(approve).toHaveCount(0);
  // Six slides replaced the blank one, in the file's order, and show in the filmstrip.
  expect(await slideNames(page)).toEqual([
    'פתיחה',
    'למה גינה קהילתית',
    'המגרש',
    'ציטוט',
    'תקציב ההקמה',
    'מצטרפים',
  ]);
  await expect(page.getByTestId('filmstrip').getByRole('option')).toHaveCount(6);
  await expect(page.getByTestId('import-count')).toHaveText('נלכדו 6');
  expect(await page.evaluate(() => window.slidr!.bus.deck.meta.title)).toBe(
    'גינה קהילתית ברחוב הדקל',
  );
  // The chips say what was done in plain words.
  await expect(page.getByTestId('tool-chip').filter({ hasText: 'לכידת שקפים' })).toHaveCount(1);

  // The report is built from the app's record of each slide.
  await page.getByTestId('import-report-tab').click();
  const report = page.getByTestId('import-report');
  await expect(report.getByTestId('import-row')).toHaveCount(6);
  await expect(report).toContainText('6 מתוך 6');
  await expect(report.getByTestId('import-row').nth(4)).toContainText('תקציב ההקמה');
  // The agent's time and the usage come from the turns, as the harness reported them.
  await expect(report).toContainText('0:31');
  await expect(report).toContainText('$0.06');
  // A row takes the Stage to its slide.
  await report.getByTestId('import-row').nth(2).getByRole('button').first().click();
  const third = await page.evaluate(() => window.slidr!.bus.deck.slides[2]!.id);
  expect(await page.evaluate(() => window.slidr!.selection.getState().currentSlideId)).toBe(third);

  // The session stays open: the chat goes on.
  await page.getByRole('tab').first().click();
  await page.getByTestId('chat-input').fill('תודה');
  await page.getByTestId('chat-input').press('Enter');
  await turnsDone(page, 3);
  expect(errors).toEqual([]);
});

test('the chat takes the room of the panel: the composer at its foot, the messages scroll', async ({
  page,
}) => {
  await openImportPanel(page);
  await chooseFile(page);
  await turnsDone(page, 1);
  const edges = (testId: string) =>
    page.getByTestId(testId).evaluate((node) => {
      const { top, bottom } = node.getBoundingClientRect();
      return { top, bottom };
    });
  const messages = () =>
    page
      .getByTestId('chat')
      .locator('[data-radix-scroll-area-viewport]')
      .evaluate((view) => ({
        top: view.getBoundingClientRect().top,
        bottom: view.getBoundingClientRect().bottom,
        room: view.clientHeight,
        content: view.scrollHeight,
        scrolled: view.scrollTop,
      }));

  // A plan that is shorter than the panel leaves the room empty above the composer, not under it.
  expect((await edges('chat')).bottom).toBeCloseTo((await edges('import-session')).bottom, 0);
  expect((await edges('chat-input')).bottom).toBeGreaterThan((await edges('chat')).bottom - 64);

  // In a window too short for the plan the composer stays in the panel, and the plan scrolls.
  await page.setViewportSize({ width: 1280, height: 440 });
  const session = await edges('import-session');
  expect(session.bottom).toBeLessThanOrEqual(440);
  expect((await edges('chat')).bottom).toBeCloseTo(session.bottom, 0);
  await expect(page.getByTestId('chat-send')).toBeInViewport({ ratio: 1 });
  const list = await messages();
  expect(list.content).toBeGreaterThan(list.room);
  expect(list.bottom).toBeLessThanOrEqual((await edges('chat-input')).top);

  // The end of what the agent wrote can be reached.
  await page.getByTestId('chat').locator('[data-radix-scroll-area-viewport]').hover();
  await page.mouse.wheel(0, 4000);
  await expect.poll(async () => (await messages()).scrolled).toBeGreaterThan(0);
  const end = await messages();
  expect(end.scrolled + end.room).toBeCloseTo(end.content, 0);
  await expect(turns(page).first().getByTestId('turn-usage')).toBeInViewport({ ratio: 1 });
});

test('the capture turn is one undo step, and comes back on redo', async ({ page }) => {
  await openImportPanel(page);
  await chooseFile(page);
  await turnsDone(page, 1);
  await page.getByTestId('import-approve').getByRole('button').click();
  await turnsDone(page, 2);
  expect(await slideNames(page)).toHaveLength(6);

  await turns(page).nth(1).getByTestId('undo-turn').click();
  expect(await slideNames(page)).toEqual([undefined]);
  expect(await page.evaluate(() => window.slidr!.bus.deck.meta.title)).toBe('');
  // The report follows the deck: slides that are gone have no row.
  await expect(page.getByTestId('import-count')).toHaveCount(0);

  await page.evaluate(() => window.slidr!.bus.redo());
  expect(await slideNames(page)).toHaveLength(6);
  await expect(page.getByTestId('import-count')).toHaveText('נלכדו 6');
});

test('without the approval step the agent is told to go ahead', async ({ page }) => {
  await openImportPanel(page, { lang: 'en' });
  await expect(page.getByText('Import a deck from an HTML file')).toBeVisible();
  await page.getByTestId('import-confirm').click();
  await expect(page.getByText('The agent will import without stopping for approval')).toBeVisible();
  await chooseFile(page);
  await expect(page.getByTestId('chat-user').first()).toHaveText(
    'Import the file "handwritten.html" as a deck. Import without waiting for the plan to be approved.',
  );
});

test('a file that is not there to read says so, and the panel stays usable', async ({ page }) => {
  await openImportPanel(page);
  // The page's own picker cannot hand over a missing file; the app's failure path is the same
  // one a job failure takes, so it is driven directly.
  await page.evaluate(async () => {
    const start = window.slidrImport!.start;
    const broken = new File([], 'broken.html');
    Object.defineProperty(broken, 'arrayBuffer', {
      value: () => Promise.reject(new Error('could not read the file')),
    });
    await start(window.slidr!, { file: broken }, { confirm: true }).catch(() => undefined);
  });
  await expect(page.getByTestId('import-session')).toHaveCount(0);
  await expect(page.getByTestId('import-start')).toBeVisible();
});
