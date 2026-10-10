import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { answerDialog, invoke, launchApp, showPanel, workspaces, type RunningApp } from './app';
import { longDeck, openDeckFile, writeDeckFile } from './decks';

/*
 * Failure and recovery (WG13-T03, WG10-T11), in the packaged app: a file that is damaged or cut
 * short, a disk that refuses a save and an autosave, a crash with unsaved work, and an agent
 * session that is closed for sitting idle and goes on when it is spoken to again.
 *
 * A full disk cannot be staged without rights this run does not have, so the disk that refuses
 * is a folder the user may not write to (an access rule put on it and taken off again): the
 * same path through the app, with `refused` where a full disk says `disk_full`. That a full
 * disk is told apart is checked where it is decided, in the core (`error.rs`).
 */

const user = `${process.env.USERDOMAIN ?? ''}\\${process.env.USERNAME ?? ''}`;
/** Forbids the user to make files in a folder; undone by `allowWrites`. */
const denyWrites = (dir: string) => execFileSync('icacls', [dir, '/deny', `${user}:(WD,AD)`]);
const allowWrites = (dir: string) => execFileSync('icacls', [dir, '/remove:d', user]);

const TITLE = 'עבודה שלא נשמרה';
const toolA = (page: Page, name: string) =>
  page.getByTestId('top-tools-a').getByRole('button', { name, exact: true });
const onStage = (page: Page) => page.getByTestId('stage-frame').locator('[data-element-id]');

/** The dialog the shell tells a failure in; returns its text and dismisses it. */
async function told(page: Page, title: string): Promise<string> {
  const dialog = page.getByRole('dialog').filter({ hasText: title });
  await expect(dialog).toBeVisible();
  const text = await dialog.innerText();
  await dialog.getByRole('button', { name: 'אישור' }).click();
  await expect(dialog).toHaveCount(0);
  return text;
}

async function addText(page: Page, text: string) {
  await toolA(page, 'תיבת טקסט').click();
  await expect(page.locator('[data-text-editor]')).toBeFocused();
  await page.keyboard.insertText(text);
  await expect(page.locator('[data-text-editor]')).toContainText(text);
  await page.keyboard.press('Escape');
}

test.describe('files and the disk', () => {
  let app: RunningApp;
  let files: string;

  test.beforeAll(async () => {
    files = mkdtempSync(join(tmpdir(), 'slidr-recovery-'));
    app = await launchApp();
  });

  test.afterAll(async () => {
    await app?.kill();
    rmSync(files, { recursive: true, force: true });
  });

  test.describe.configure({ mode: 'serial' });

  test('a file that is not a deck, or is cut short, is refused in words, and nothing is left behind', async () => {
    const { page } = app;
    await addText(page, TITLE);
    const good = join(files, 'good.slidr');
    await writeDeckFile(page, good, longDeck(3));
    const whole = readFileSync(good);

    const cases: [string, Buffer][] = [
      // Not an archive at all.
      ['noise.slidr', Buffer.from('this was never a deck '.repeat(200))],
      // An archive whose end, where its directory is, did not arrive.
      ['cut.slidr', whole.subarray(0, Math.floor(whole.length * 0.6))],
      // An archive with a byte of its deck changed: the checksum no longer holds.
      ['flipped.slidr', Buffer.from(whole).fill(0x55, 60, 140)],
      // Nothing.
      ['empty.slidr', Buffer.alloc(0)],
    ];
    for (const [name, bytes] of cases) {
      const file = join(files, name);
      writeFileSync(file, bytes);
      await openDeckFile(page, file);
      // The unsaved text box is in the way of opening: the question comes first.
      const question = page.getByRole('dialog').filter({ hasText: 'לשמור את השינויים' });
      await question.getByRole('button', { name: 'בלי לשמור' }).click();
      const text = await told(page, 'לא ניתן לפתוח את הקובץ');
      expect(text, name).toContain('הקובץ פגום או קטוע');
      // In the user's words only: not the error's own text, and no path.
      expect(text, name).not.toMatch(/zip|archive|os error|[A-Z]:\\/i);
      // The deck that was open is still open, with its unsaved work.
      await expect(onStage(page).first()).toContainText(TITLE);
      await expect(page.getByTestId('document-name')).toHaveText('מצגת ללא שם');
      expect(statSync(file).size, name).toBe(bytes.length);
    }
    // One workspace, the open deck's: none of the four refusals left one behind.
    await expect.poll(() => workspaces().length).toBe(1);
  });

  test('a deck from a newer version is refused as one', async () => {
    const { page } = app;
    const file = join(files, 'newer.slidr');
    await writeDeckFile(page, file, { ...longDeck(1), schemaVersion: 999 } as never);
    await openDeckFile(page, file);
    await page
      .getByRole('dialog')
      .filter({ hasText: 'לשמור את השינויים' })
      .getByRole('button', { name: 'בלי לשמור' })
      .click();
    expect(await told(page, 'לא ניתן לפתוח את הקובץ')).toContain('גרסה חדשה יותר של Slidr');
    await expect(onStage(page).first()).toContainText(TITLE);
    await expect.poll(() => workspaces().length).toBe(1);
  });

  test('a save the disk refuses says so, and loses neither the deck nor the file that was there', async () => {
    const { page } = app;
    const folder = join(files, 'locked');
    mkdirSync(folder);
    const target = join(folder, 'deck.slidr');
    await answerDialog(page, 'save', target);
    await page.getByTestId('stage-surface').focus();
    await page.keyboard.press('Control+s');
    await expect(page.getByTestId('document-name')).toHaveText('deck');
    const saved = readFileSync(target);

    await page.getByTestId('new-slide').click();
    await expect(page.getByTestId('status-save')).toHaveText('לא נשמר');
    denyWrites(folder);
    try {
      await page.getByTestId('stage-surface').focus();
      await page.keyboard.press('Control+s');
      const text = await told(page, 'השמירה נכשלה');
      expect(text).toContain('מערכת הקבצים סירבה לפעולה');
    } finally {
      allowWrites(folder);
    }
    // The file is the one saved before, whole; the document still says it has unsaved work.
    expect(readFileSync(target).equals(saved)).toBe(true);
    await expect(page.getByTestId('status-save')).toHaveText('לא נשמר');
    await expect(page.getByTestId('status-slide')).toHaveText('שקף 2 מתוך 2');
    // With the folder writable again, the same save goes through.
    await page.keyboard.press('Control+s');
    await expect(page.getByTestId('status-save')).toHaveText('נשמר');
    expect(readFileSync(target).equals(saved)).toBe(false);
  });

  test('an autosave the disk refuses is said in the status bar, and tried again until it goes through', async () => {
    const { page } = app;
    const [workspace] = workspaces();
    expect(workspace).toBeDefined();
    denyWrites(workspace!.dir);
    try {
      await page.getByTestId('new-slide').click();
      const state = page.getByTestId('status-save');
      // A few seconds after the change the autosave runs, and cannot write.
      await expect(state).toHaveAttribute('data-failure', 'refused', { timeout: 15_000 });
      await expect(state).toHaveText('השמירה האוטומטית נכשלה');
      await expect(state).toHaveAttribute('role', 'alert');
      // The deck in the window has the change all the while.
      await expect(page.getByTestId('status-slide')).toHaveText('שקף 3 מתוך 3');
    } finally {
      allowWrites(workspace!.dir);
    }
    // Nothing is changed by hand now: the app tries again by itself, and the alert goes.
    await expect(page.getByTestId('status-save')).not.toHaveAttribute('data-failure', /.+/, {
      timeout: 30_000,
    });
    await expect(page.getByTestId('status-save')).toHaveText('לא נשמר');
    const deck = workspaces()[0]!.deck as { slides: unknown[] };
    expect(deck.slides).toHaveLength(3);
  });

  test('work that was not saved when the app died is offered back when it starts', async () => {
    let { page } = app;
    await page.getByTestId('new-slide').click();
    await expect(page.getByTestId('status-slide')).toHaveText('שקף 4 מתוך 4');
    // The autosave has it within a few seconds; then the app is killed, as a crash kills it.
    await expect
      .poll(() => (workspaces()[0]?.deck as { slides: unknown[] } | null)?.slides.length, {
        timeout: 15_000,
      })
      .toBe(4);
    await app.kill();

    app = await launchApp({ keepWorkspaces: true });
    ({ page } = app);
    const offer = page.getByRole('dialog').filter({ hasText: 'לשחזר את' });
    await expect(offer).toBeVisible();
    await expect(offer).toContainText('deck');
    await offer.getByRole('button', { name: 'שחזור', exact: true }).click();
    await expect(page.getByTestId('status-slide')).toHaveText('שקף 1 מתוך 4');
    await expect(onStage(page).first()).toContainText(TITLE);
    // What was recovered is unsaved work of the file it came from.
    await expect(page.getByTestId('document-name')).toHaveText('deck');
    await expect(page.getByTestId('status-save')).toHaveText('לא נשמר');
    expect(existsSync(join(files, 'locked', 'deck.slidr'))).toBe(true);
  });
});

test.describe('an agent session that sits idle (AGT-07, AGT-08)', () => {
  let app: RunningApp;

  interface LogEntry {
    kind: string;
    session: string;
    data: Record<string, unknown>;
  }
  const log = async (page: Page): Promise<LogEntry[]> => {
    const view = await invoke<{ text: string }>(page, 'agent_diagnostics_read', {});
    return view.text
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as LogEntry);
  };
  const say = async (page: Page, message: string, nth: number) => {
    await showPanel(page, 'ai');
    await page.getByTestId('chat-input').fill(message);
    await page.getByTestId('chat-input').press('Enter');
    const turn = page.getByTestId('chat-assistant').nth(nth);
    await expect(turn).toHaveAttribute('data-outcome', 'completed', { timeout: 60_000 });
    return turn;
  };

  test.beforeAll(async () => {
    // The scripted harness, and three seconds in place of the ten minutes a session may idle.
    app = await launchApp({ env: { SLIDR_AGENT_MOCK: '1', SLIDR_AGENT_IDLE_SECS: '3' } });
    await invoke(app.page, 'agent_diagnostics_clear');
    await app.page.evaluate(() =>
      localStorage.setItem(
        'slidr.agent',
        JSON.stringify({ harnessId: 'mock', model: 'slide-chat' }),
      ),
    );
  });

  test.afterAll(async () => {
    await app?.kill();
  });

  test.describe.configure({ mode: 'serial' });

  test('is closed, and the next message goes on in a session that resumes it', async () => {
    const { page } = app;
    await say(page, 'שקף פתיחה', 0);

    // Nobody speaks to it: within a few seconds its session is closed, without a word in the chat.
    await expect
      .poll(
        async () => (await log(page)).filter((e) => e.kind === 'close').map((e) => e.data.reason),
        {
          timeout: 20_000,
        },
      )
      .toEqual(['idle']);
    await expect(page.getByTestId('chat-problem')).toHaveCount(0);
    await expect(page.getByTestId('chat-assistant')).toHaveCount(1);

    // The next message is answered as if nothing happened.
    const turn = await say(page, 'ועוד אחד', 1);
    await expect(turn.getByTestId('chat-problem')).toHaveCount(0);
    const entries = await log(page);
    const starts = entries.filter((e) => e.kind === 'start');
    expect(starts).toHaveLength(2);
    expect(starts[0]!.data.resume).toBeNull();
    // It names the conversation the first session reported: that is what resuming is.
    const reported = entries.find((e) => e.kind === 'event' && e.data.type === 'session_started')
      ?.data.nativeSessionId;
    expect(reported).toBeTruthy();
    expect(starts[1]!.data.resume).toBe(reported);
    expect(starts[1]!.session).not.toBe(starts[0]!.session);
  });

  test('the diagnostics log shows it all in the settings screen', async () => {
    const { page } = app;
    await showPanel(page, 'settings');
    const about = page.locator('[data-settings-section="about"]');
    await about.scrollIntoViewIfNeeded();
    await expect(about.getByTestId('about-log-size')).toContainText('גודל היומן');
    await about.getByTestId('about-log').click();
    const dialog = page.getByTestId('log-dialog');
    const rows = dialog.getByTestId('log-entry');
    await expect(rows.first()).toContainText('mock');
    const kinds = await rows.evaluateAll((all) => all.map((row) => row.getAttribute('data-kind')));
    expect(kinds.filter((kind) => kind === 'start')).toHaveLength(2);
    expect(kinds).toEqual(expect.arrayContaining(['send', 'event', 'close']));
    // A tool call the scripted turn made through the bridge, with what it was called with.
    const call = rows.filter({ hasText: 'tool_call_started · slide_create_from_html' }).first();
    await call.getByRole('button').click();
    await expect(call.locator('pre')).toContainText('"source": "app"');
    // The file is under this copy's own data folder.
    await expect(dialog.getByTestId('log-path')).toContainText(
      'slidr.app.hardening\\agent\\diagnostics.jsonl',
    );
    await page.keyboard.press('Escape');
  });
});
