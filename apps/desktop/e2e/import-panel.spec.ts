import { expect, test } from '@playwright/test';
import { collectErrors } from './agent-helpers';
import {
  aiPanel,
  chooseFile,
  deckChat,
  importChat,
  openForImport,
  pickFile,
  slideNames,
  turns,
  turnsDone,
} from './import-helpers';

/*
 * The HTML import in the AI chat (SPEC 13.3, IMP-03; WG9-T18) against the scripted agent:
 * "Import HTML" asks for the file, the request is a message of the chat like any other, the
 * agent shows its plan and waits, the slides come in when it is approved, the report is the
 * app's own, the chat goes on, and the whole import is one undo step per turn.
 */

test('imports a file: plan, approval, slides, report, and the chat goes on', async ({ page }) => {
  const errors = collectErrors(page);
  await openForImport(page);
  // Nothing of the import stands in the window before a file is chosen.
  await expect(page.locator('[data-testid="activity-bar"] [data-panel="import"]')).toHaveCount(0);
  await expect(deckChat(page)).toBeVisible();

  await chooseFile(page);
  // The request is the first message of the chat, sent for the user, asking for the plan first.
  await expect(page.getByTestId('chat-user')).toHaveCount(1);
  await expect(page.getByTestId('chat-user').first()).toContainText(
    'ייבא את הקובץ "handwritten.html" כמצגת.',
  );
  await expect(page.getByTestId('chat-user').first()).toContainText('חכה לאישור שלי');
  await turnsDone(page, 1);
  await expect(turns(page).first()).toContainText('6 שקפים');
  // Nothing was captured: the deck is still the blank one, and the chat offers to approve.
  expect(await slideNames(page)).toEqual([undefined]);
  await expect(page.getByTestId('import-count')).toHaveCount(0);
  const approve = page.getByTestId('import-approve');
  await expect(
    importChat(page).locator('[data-radix-scroll-area-viewport]').getByTestId('import-approve'),
  ).toBeVisible();
  expect(
    await approve.evaluate((node) => node.previousElementSibling?.getAttribute('data-testid')),
  ).toBe('chat-assistant');
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

  // The report stands folded at the end of the conversation, built from the app's record of
  // each slide.
  const report = page.getByTestId('import-report');
  await expect(report).toHaveCount(0);
  await page.getByTestId('import-report-toggle').click();
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
  await page.getByTestId('chat-input').fill('תודה');
  await page.getByTestId('chat-input').press('Enter');
  await turnsDone(page, 3);
  expect(errors).toEqual([]);
});

test('the import is a conversation of the AI chat: listed with the others, and left for a new one', async ({
  page,
}) => {
  await openForImport(page);
  // The user is elsewhere when the file is chosen: the chat comes up with the request in it.
  await page.locator('[data-testid="activity-bar"] [data-panel="templates"]').click();
  await expect(aiPanel(page)).toHaveCount(0);
  await chooseFile(page);
  await turnsDone(page, 1);
  // The frame is the AI chat's own: its tabs, its bar of conversations, its composer.
  await expect(aiPanel(page).getByRole('tab')).toHaveCount(2);
  await expect(importChat(page).getByTestId('conversations')).toBeVisible();
  await expect(importChat(page).getByTestId('chat-input')).toBeVisible();

  // A new conversation is a conversation of the deck, with nothing of the import in it.
  await page.getByTestId('conversation-new').click();
  await expect(deckChat(page)).toBeVisible();
  await expect(importChat(page)).toHaveCount(0);
  await expect(page.getByTestId('chat-user')).toHaveCount(0);
  await expect(page.getByTestId('import-approve')).toHaveCount(0);

  // The import is in the list of conversations, under its request, and comes back from there.
  await page.getByTestId('conversations').click();
  const listed = page.getByRole('menuitemradio');
  await expect(listed).toHaveCount(2);
  await listed.filter({ hasText: 'ייבא את הקובץ "handwritten.html" כמצגת.' }).click();
  await expect(importChat(page)).toBeVisible();
  await expect(page.getByTestId('chat-user')).toHaveCount(1);
  await expect(page.getByTestId('import-approve')).toBeVisible();
});

test('from the welcome screen: the dialog, and then the editor with the request in the chat', async ({
  page,
}) => {
  await openForImport(page, { welcome: true });
  const welcome = page.getByTestId('welcome');
  await expect(welcome).toBeVisible();
  // The screen stays while no file is chosen: the dialog alone changes nothing.
  const dialog = page.waitForEvent('filechooser');
  await page.getByTestId('welcome-import').click();
  await dialog;
  await expect(welcome).toBeVisible();

  await pickFile(page, undefined, page.getByTestId('welcome-import'));
  await expect(welcome).toHaveCount(0);
  await expect(page.getByTestId('stage-frame')).toBeVisible();
  await expect(importChat(page)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('chat-user').first()).toContainText(
    'ייבא את הקובץ "handwritten.html" כמצגת.',
  );
});

test('the chat takes the room of the panel: the composer at its foot, the messages scroll', async ({
  page,
}) => {
  await openForImport(page);
  await chooseFile(page);
  await turnsDone(page, 1);
  const edgesOf = (node: Element) => {
    const { top, bottom } = node.getBoundingClientRect();
    return { top, bottom };
  };
  const edges = (testId: string) => page.getByTestId(testId).evaluate(edgesOf);
  const panel = () => aiPanel(page).evaluate(edgesOf);
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
  expect((await edges('chat')).bottom).toBeCloseTo((await panel()).bottom, 0);
  expect((await edges('chat-input')).bottom).toBeGreaterThan((await edges('chat')).bottom - 64);

  // In a window too short for the plan the composer stays in the panel, and the plan scrolls.
  await page.setViewportSize({ width: 1280, height: 440 });
  const frame = await panel();
  expect(frame.bottom).toBeLessThanOrEqual(440);
  expect((await edges('chat')).bottom).toBeCloseTo(frame.bottom, 0);
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
  const approveButton = page.getByTestId('import-approve').getByRole('button');
  await approveButton.scrollIntoViewIfNeeded();
  await expect(approveButton).toBeInViewport();
  const usage = turns(page).first().getByTestId('turn-usage');
  await usage.scrollIntoViewIfNeeded();
  await expect(usage).toBeInViewport();
});

test('the capture turn is one undo step, and comes back on redo', async ({ page }) => {
  await openForImport(page);
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

test('a file that cannot be read says so in a dialog, and the chat stays as it was', async ({
  page,
}) => {
  await openForImport(page);
  // The page's own picker cannot hand over a file that is not there: the read of the one it
  // hands over is made to fail, which is the path a file that fails to open or to load takes.
  await page.evaluate(() => {
    Object.defineProperty(File.prototype, 'arrayBuffer', {
      value: () => Promise.reject(new Error('could not read the file')),
    });
  });
  await pickFile(page);
  const told = page.getByRole('dialog');
  await expect(told).toContainText('הייבוא לא התחיל');
  await expect(told).toContainText('could not read the file');
  await told.getByRole('button', { name: 'אישור' }).click();
  await expect(told).toHaveCount(0);
  await expect(page.getByTestId('import-opening')).toHaveCount(0);
  await expect(importChat(page)).toHaveCount(0);
  await expect(deckChat(page)).toBeVisible();
  await expect(page.getByTestId('chat-user')).toHaveCount(0);
});
