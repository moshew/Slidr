import { expect, test, type Page } from '@playwright/test';
import { chips, openApp, openTool, say } from './aitools-helpers';

/*
 * What a chat holds on to and what it lets go of, against the scripted mock agent: across a look
 * at another tab or panel, across a document that is opened in the same window, and across a
 * long history. Each test here was a defect the bug hunt of 2026-10-04 proved (`ai-ui.md`).
 */

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
