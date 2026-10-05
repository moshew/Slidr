import { closeSync, ftruncateSync, mkdirSync, openSync, readFileSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import type * as Runtime from '../src/ai/runtime';
import {
  chat,
  choose,
  input,
  LOGO,
  openApp as openDeckChat,
  say as sayToDeck,
  tab,
  turnEnds,
  turns,
} from './aifinish-helpers';
import { chips, openApp, openTool, say } from './aitools-helpers';

/*
 * What a chat holds on to and what it lets go of, against the scripted mock agent: across a look
 * at another tab or panel, across a document that is opened in the same window, and across a
 * long history. Each test here was a defect the bug hunt of 2026-10-04 proved (`ai-ui.md`).
 */

/** The app's own module, as the page has it: a specifier that is not a literal stays unbundled. */
const RUNTIME = '/src/ai/runtime.ts';

/**
 * What `DocumentService.open` does to the editor when the same file is opened again: the bus is
 * reset with a deck whose slides and elements carry the ids they had.
 */
function reopenSameDeck(page: Page): Promise<void> {
  return page.evaluate(() => {
    const editor = window.slidr!;
    editor.bus.reset(JSON.parse(JSON.stringify(editor.bus.deck)) as typeof editor.bus.deck);
  });
}

test('the slide tool works on after the same deck is opened again', async ({ page }) => {
  await openApp(page, { script: 'slide-redesign' });
  await openTool(page, 'ai.slide');
  // The panel is up, on the chat of the first slide, when the document is replaced under it.
  await reopenSameDeck(page);
  await say(page, 'עצב מחדש');
  // The app's tools found the chat the message was sent in (finding 2).
  await expect(chips(page).first()).toHaveAttribute('data-state', 'ok');
});

test('a deck opened under the deck tool shows the conversation that was written in last', async ({
  page,
}) => {
  await openDeckChat(page, { script: 'deck-build' });
  await sayToDeck(page, 'ראשונה');
  await page.getByTestId('conversation-new').click();
  await expect(turns(page)).toHaveCount(0);
  await sayToDeck(page, 'שנייה');
  const latest = (await chat(page).getAttribute('data-thread'))!;
  expect(latest).toMatch(/^deck-c/);

  // File > Open with the deck tool on screen. A plain page keeps its chats in memory, so the
  // "file" that is opened holds the two conversations.
  await reopenSameDeck(page);
  // As when the app starts on a deck (`AgentService.restore`), not the first one (finding 16).
  await expect(chat(page)).toHaveAttribute('data-thread', latest);
  await expect(turns(page)).toHaveCount(1);
});

test('what was typed and attached in a chat is there after a look elsewhere', async ({ page }) => {
  const request = 'בנה מצגת של 8 שקפים על תוכנית העבודה לשנת 2027, עם שקף לכל רבעון';
  const attached = page.getByTestId('composer-files').getByTestId('attachment');
  await openDeckChat(page, { script: 'deck-build' });
  await input(page).fill(request);
  await choose(page, () => page.getByTestId('chat-attach').click(), LOGO.path);
  await expect(attached).toHaveCount(1);

  // The Actions tab of the tool, where its template gallery is, and back (finding 3).
  await tab(page, 'actions');
  await tab(page, 'chat');
  await expect(input(page)).toHaveValue(request);
  await expect(attached).toHaveCount(1);

  // Another tool is another chat, with a message of its own being written.
  await openTool(page, 'ai.slide');
  await expect(input(page)).toHaveValue('');
  await expect(attached).toHaveCount(0);
  await input(page).fill('הגדל את הכותרת');
  // The Stage goes to another slide, as it does when it follows the agent: another chat again.
  const first = await page.evaluate(() => {
    const { bus, selection } = window.slidr!;
    const before = selection.getState().currentSlideId!;
    bus.dispatch({ type: 'slide.add', slide: { id: 's_second00', elements: [], timeline: [] } });
    selection.getState().setCurrentSlide('s_second00');
    return before;
  });
  await expect(input(page)).toHaveValue('');
  await page.evaluate((id) => window.slidr!.selection.getState().setCurrentSlide(id), first);
  await expect(input(page)).toHaveValue('הגדל את הכותרת');

  // Back in the deck tool the message is as it was left, and once it is sent it is gone.
  await openTool(page, 'ai.deck');
  await expect(input(page)).toHaveValue(request);
  await expect(attached).toHaveCount(1);
  await input(page).press('Enter');
  await turnEnds(page, 1);
  await tab(page, 'actions');
  await tab(page, 'chat');
  await expect(input(page)).toHaveValue('');
  await expect(attached).toHaveCount(0);
});

test('words copied with a picture beside them are pasted as words', async ({ page }) => {
  await openDeckChat(page, { script: 'deck-build' });
  await input(page).focus();
  // What a spreadsheet puts on the clipboard for copied cells: their text, and a picture of
  // them. A paste event made in the page: no input is sent to the desktop.
  const cancelled = await page.evaluate(() => {
    const data = new DataTransfer();
    data.setData('text/plain', 'Q1\t120\nQ2\t150');
    data.items.add(
      new File([new Uint8Array([137, 80, 78, 71])], 'image.png', { type: 'image/png' }),
    );
    const paste = new ClipboardEvent('paste', {
      clipboardData: data,
      bubbles: true,
      cancelable: true,
    });
    document.activeElement!.dispatchEvent(paste);
    return paste.defaultPrevented;
  });
  // The paste is left to the field, which puts the words in, and no picture is attached
  // (finding 4). A picture alone is still a file: `aifinish-chat.spec.ts`.
  expect(cancelled).toBe(false);
  await expect(page.getByTestId('composer-files')).toHaveCount(0);
});

test('a turn says "changes undone" only when its changes were undone', async ({ page }) => {
  await openDeckChat(page, { script: 'deck-build' });
  const turn = await sayToDeck(page, 'בנה שקף פתיחה');
  const undo = turn.getByTestId('undo-turn');
  await expect(undo).toBeVisible();
  const built = await page.evaluate(() => window.slidr!.bus.deck.slides.length);

  // Undone, it says so; redone, it offers the undo again.
  await undo.click();
  await expect(turn).toContainText('השינויים בוטלו');
  await page.evaluate(() => window.slidr!.bus.redo());
  await expect(undo).toBeVisible();
  await expect(turn).not.toContainText('השינויים בוטלו');

  // 200 edits of the user's, each a step of its own: the history keeps 200 steps, so the turn
  // is no longer in it. Its slide is in the deck: there is nothing to undo, and nothing was
  // undone (finding 5).
  await page.evaluate(() => {
    const { bus } = window.slidr!;
    for (let i = 0; i < 200; i++) {
      bus.dispatch({ type: 'deck.setMeta', patch: { title: `title ${i}` } });
    }
  });
  expect(await page.evaluate(() => window.slidr!.bus.deck.slides.length)).toBe(built);
  await expect(undo).toHaveCount(0);
  await expect(turn).not.toContainText('השינויים בוטלו');
});

test('a turn kept with the deck does not say "changes undone" when the deck is opened again', async ({
  page,
}) => {
  await openDeckChat(page, { script: 'deck-build' });
  const turn = await sayToDeck(page, 'בנה שקף פתיחה');
  await expect(turn.getByTestId('undo-turn')).toBeVisible();
  await reopenSameDeck(page);
  // The chat is read again from its transcript, the turn in it: an old turn has no button
  // (SPEC, the note on CHT-U04), and no label either (finding 5).
  await expect(turns(page)).toHaveCount(1);
  await expect(turns(page).first()).toContainText('שקף הפתיחה מוכן');
  await expect(turns(page).first().getByTestId('undo-turn')).toHaveCount(0);
  await expect(turns(page).first()).not.toContainText('השינויים בוטלו');
});

test('every conversation of a tool can be reached in its list, however many there are', async ({
  page,
}) => {
  // A low window, and more conversations than it has room for: they are kept without a limit.
  await page.setViewportSize({ width: 1366, height: 600 });
  await openDeckChat(page, { script: 'outline' });
  await sayToDeck(page, 'ראשונה');
  await page.evaluate(async (path) => {
    const { aiOf } = (await import(/* @vite-ignore */ path)) as typeof Runtime;
    const { agent } = aiOf(window.slidr!);
    for (let i = 0; i < 24; i++) {
      const thread = agent.newConversation({ kind: 'deck' });
      await thread.send(`שיחה ${i}`);
      await new Promise<void>((resolve) => {
        const check = () => (thread.store.getState().busy ? setTimeout(check, 10) : resolve());
        check();
      });
    }
  }, RUNTIME);

  await page.getByTestId('conversations').click();
  const items = page.locator('[data-conversation]');
  await expect(items).toHaveCount(25);
  // The list is inside the window, and scrolls (finding 10: it was as tall as its items).
  const menu = (await page.getByRole('menu').boundingBox())!;
  expect(menu.y).toBeGreaterThanOrEqual(0);
  expect(menu.y + menu.height).toBeLessThanOrEqual(600);
  const oldest = items.last();
  await expect(oldest).not.toBeInViewport();

  // The oldest conversation is the last in the list: End goes to it, and Enter opens it.
  await page.keyboard.press('End');
  await expect(oldest).toBeFocused();
  await expect(oldest).toBeInViewport({ ratio: 1 });
  await page.keyboard.press('Enter');
  await expect(chat(page)).toHaveAttribute('data-thread', 'deck');
  await expect(page.getByTestId('chat-user').first()).toContainText('ראשונה');
});

test('a file a message cannot take is refused in words, with the limit', async ({
  page,
}, testInfo) => {
  // Last year's deck with its pictures, 51 MB: an empty file of that length, in the folder of
  // this test's results.
  const big = testInfo.outputPath('last-year.pptx');
  mkdirSync(dirname(big), { recursive: true });
  const handle = openSync(big, 'w');
  ftruncateSync(handle, 51 * 1024 * 1024);
  closeSync(handle);
  try {
    await openDeckChat(page, { script: 'deck-build' });
    const attached = page.getByTestId('composer-files').getByTestId('attachment');
    const refused = page.getByTestId('files-refused');
    await choose(page, () => page.getByTestId('chat-attach').click(), big);
    // Not a chip, and not silence (finding 11): the name of the file, and how large one may be.
    await expect(refused).toHaveRole('alert');
    await expect(refused).toContainText('last-year.pptx');
    await expect(refused).toContainText('50MB');
    await expect(attached).toHaveCount(0);
    // The next choice is taken, and the words go with the choice they were about.
    await choose(page, () => page.getByTestId('chat-attach').click(), LOGO.path);
    await expect(attached).toHaveCount(1);
    await expect(refused).toHaveCount(0);
  } finally {
    rmSync(big, { force: true });
  }
});

test('the template form says which file it left out, and a new logo takes the place of the old', async ({
  page,
}) => {
  const logo = readFileSync(LOGO.path);
  const picture = (name: string) => ({ name, mimeType: 'image/png', buffer: logo });
  /** Answers the file dialog a button of the form opens. */
  const pick = async (button: string, files: ReturnType<typeof picture>[]) => {
    const chooser = page.waitForEvent('filechooser');
    await page.getByTestId(button).click();
    await (await chooser).setFiles(files);
  };
  await openDeckChat(page, { script: 'template-create', lang: 'en' });
  await tab(page, 'actions');
  await page.locator('[data-action="template.create"]').click();
  const rows = page.getByTestId('template-file');
  const theLogo = page.locator('[data-testid="template-file"][data-use="logo"]');
  const refused = page.getByTestId('files-refused');

  // A logo and nine examples: as many files as a message takes.
  await pick('template-logo', [picture('logo.png')]);
  await pick(
    'template-files',
    Array.from({ length: 9 }, (_, i) => picture(`example-${i + 1}.png`)),
  );
  await expect(rows).toHaveCount(10);
  await expect(refused).toHaveCount(0);

  // One more example has no room, and the form says so, with the limit.
  await pick('template-files', [picture('one-too-many.png')]);
  await expect(refused).toHaveRole('alert');
  await expect(refused).toContainText('up to 10 files');
  await expect(rows).toHaveCount(10);

  // A new logo takes the place of the old one, so it needs no room of its own. It used to
  // remove the old logo and add nothing (finding 11).
  await pick('template-logo', [picture('new-logo.png')]);
  await expect(rows).toHaveCount(10);
  await expect(theLogo).toHaveCount(1);
  await expect(theLogo).toContainText('new-logo.png');
  await expect(refused).toHaveCount(0);
});
