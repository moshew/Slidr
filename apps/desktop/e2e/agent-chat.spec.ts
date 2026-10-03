import { expect, test } from '@playwright/test';
import {
  chips,
  collectErrors,
  currentSlide,
  input,
  openChat,
  say,
  slides,
  turns,
} from './agent-helpers';

/*
 * The deck tool's chat in the shell (WG11-T01, T03), against the scripted mock agent: a slide is
 * built in front of the user, the Stage follows it, the turn can be undone, the design check
 * shows as a folded line, and a harness that fails says what to do.
 */

test('builds a slide in the chat, follows it on the Stage, and undoes the turn', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await openChat(page, { script: 'deck-build' });
  await expect(page.getByText('מה נבנה?')).toBeVisible();
  const [blank] = await slides(page);

  const turn = await say(page, 'צור שקף פתיחה');
  await expect(page.getByTestId('chat-user')).toHaveText('צור שקף פתיחה');
  await expect(turn).toHaveAttribute('data-outcome', 'completed');

  // The deck grew by the slide, and the Stage is on it (AID-06).
  const deck = await slides(page);
  expect(deck.map((s) => s.archetype)).toEqual([undefined, 'hero']);
  expect(await currentSlide(page)).toBe(deck[1]!.id);
  await expect(page.getByTestId('filmstrip').getByRole('option')).toHaveCount(2);

  // One chip, in plain words, with the slide's number; Markdown in the reply is drawn.
  const chip = chips(page);
  await expect(chip).toHaveCount(1);
  await expect(chip).toHaveAttribute('data-state', 'ok');
  await expect(chip).toContainText('יצירת שקף · שקף 2');
  await expect(turn.locator('strong')).toHaveText('תוכנית העבודה לשנת 2027');

  // "Undo changes" takes the whole turn back.
  await page.getByTestId('undo-turn').click();
  expect(await slides(page)).toEqual([blank]);
  await expect(turn.getByText('השינויים בוטלו')).toBeVisible();
  // The chip no longer has a slide to name or to go to.
  await expect(chip).toContainText('יצירת שקף');
  await expect(chip).not.toContainText('שקף 2');
  expect(errors).toEqual([]);
});

test('a chip goes to its target and unfolds its details', async ({ page }) => {
  await openChat(page, { script: 'deck-build' });
  await say(page, 'צור שקף פתיחה');
  await say(page, 'הוסף שקף עם המספר המרכזי');
  const deck = await slides(page);
  expect(deck.map((s) => s.archetype)).toEqual([undefined, 'hero', 'bigNumber']);
  expect(await currentSlide(page)).toBe(deck[2]!.id);

  const first = chips(page).first();
  await first.getByRole('button', { name: /מעבר ליעד/ }).click();
  expect(await currentSlide(page)).toBe(deck[1]!.id);

  await expect(first.getByText('קלט')).toHaveCount(0);
  await first.getByRole('button', { name: 'פרטים' }).click();
  await expect(first.getByText('קלט')).toBeVisible();
  await expect(first.locator('pre').first()).toContainText('"name": "פתיחה"');
  await expect(first.getByText('תוצאה')).toBeVisible();
});

test('warns before undoing a turn over changes made after it', async ({ page }) => {
  await openChat(page, { script: 'deck-build' });
  await say(page, 'צור שקף פתיחה');
  await page.evaluate(() => {
    const { bus } = window.slidr!;
    bus.dispatch({ type: 'slide.update', slideId: bus.deck.slides[1]!.id, patch: { name: 'x' } });
  });
  await page.getByTestId('undo-turn').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('לבטל גם את מה שנעשה אחרי התור?');
  await dialog.getByRole('button', { name: 'ביטול', exact: true }).click();
  expect(await slides(page)).toHaveLength(2);

  await page.getByTestId('undo-turn').click();
  await page.getByRole('dialog').getByRole('button', { name: 'בטל הכול' }).click();
  expect(await slides(page)).toHaveLength(1);
});

test('does not move the Stage when following is off', async ({ page }) => {
  await openChat(page, { script: 'deck-build' });
  const before = await currentSlide(page);
  await page.getByRole('button', { name: 'מעקב אחרי השקף הנבנה' }).click();
  await say(page, 'צור שקף פתיחה');
  expect(await slides(page)).toHaveLength(2);
  expect(await currentSlide(page)).toBe(before);
});

test('the design check sends the agent back, as a folded line, until the slide is valid', async ({
  page,
}) => {
  await openChat(page, { script: 'quality-gate' });
  const turn = await say(page, 'צור שקף פתיחה');

  const gate = turn.getByTestId('gate-line');
  await expect(gate).toHaveCount(1);
  await expect(gate).toContainText('בדיקת העיצוב החזירה את ה-Agent לתיקון');
  // Folded by default; unfolded, it says what was sent back, in the user's words.
  await expect(gate.getByText('תוכן חורג מהשקף')).toHaveCount(0);
  await gate.getByRole('button').first().click();
  await expect(gate.getByText('שקף 2: תוכן חורג מהשקף')).toBeVisible();

  await expect(chips(page)).toHaveCount(2);
  await expect(turn.getByTestId('gate-remaining')).toHaveCount(0);
  expect(await slides(page)).toHaveLength(2);
  // The follow-up is the app's, not a message of the user's.
  await expect(page.getByTestId('chat-user')).toHaveCount(1);
});

test('after two rounds the findings are left for the user, who can ask again', async ({ page }) => {
  await openChat(page, { script: 'gate-stuck' });
  const turn = await say(page, 'צור שקף פתיחה');
  await expect(turn.getByTestId('gate-line')).toHaveCount(2);
  const left = turn.getByTestId('gate-remaining');
  await expect(left).toContainText('נשארו ממצאי עיצוב');
  await expect(left).toContainText('שקף 2: תוכן חורג מהשקף');

  await left.getByRole('button', { name: 'נסה לתקן שוב' }).click();
  const retry = turns(page).nth(1);
  await expect(retry).toHaveAttribute('data-outcome', 'completed', { timeout: 30_000 });
  await expect(retry.getByTestId('gate-line')).toHaveCount(1);
  await expect(retry.getByTestId('gate-remaining')).toHaveCount(0);
  await expect(page.getByTestId('chat-user')).toHaveCount(1);
});

test('shows what the agent is doing, and stops when asked', async ({ page }) => {
  await openChat(page, { script: 'slide-chat', speed: 1 });
  // The first turn only plays events; the second is a long streamed reply.
  await say(page, 'Build an opening slide');
  await input(page).fill('תן לי רעיונות');
  await input(page).press('Enter');

  const working = page.getByTestId('chat-working');
  await expect(working).toBeVisible();
  await expect(page.getByTestId('chat-send')).toHaveCount(0);
  await expect(turns(page).nth(1)).toContainText('מפת הדרכים');
  await page.getByTestId('chat-stop').click();

  const turn = turns(page).nth(1);
  await expect(turn).toHaveAttribute('data-outcome', 'interrupted');
  await expect(turn).toContainText('התור נעצר');
  await expect(working).toHaveCount(0);
  await expect(page.getByTestId('chat-send')).toBeVisible();
});

test('a failed tool call and a failed turn each say what happened', async ({ page }) => {
  const errors = collectErrors(page);
  await openChat(page, { script: 'errors' });
  const first = await say(page, 'Update the title');
  await expect(first).toHaveAttribute('data-outcome', 'completed');
  await expect(chips(page).first()).toHaveAttribute('data-state', 'failed');
  await expect(chips(page).nth(1)).toHaveAttribute('data-state', 'ok');

  const second = await say(page, 'Again');
  await expect(second).toHaveAttribute('data-outcome', 'failed');
  const problem = second.getByTestId('chat-problem');
  await expect(problem).toHaveAttribute('data-kind', 'quota');
  await expect(problem).toContainText('המכסה מוצתה');
  await expect(problem).toContainText('usage limit reached');

  const third = await say(page, 'And again');
  await expect(third.getByTestId('chat-problem')).toHaveAttribute('data-kind', 'tools_unavailable');
  expect(errors).toEqual([]);
});

test('Shift+Enter is a new line, and the English chat reads left to right', async ({ page }) => {
  await openChat(page, { script: 'deck-build', lang: 'en' });
  await expect(page.getByText('What shall we build?')).toBeVisible();
  await input(page).fill('Line one');
  await input(page).press('Shift+Enter');
  await input(page).pressSequentially('line two');
  await expect(input(page)).toHaveValue('Line one\nline two');
  await input(page).press('Enter');
  await expect(page.getByTestId('chat-user')).toHaveText('Line one\nline two');
  await expect(turns(page).first()).toHaveAttribute('data-outcome', 'completed');
  await expect(chips(page).first()).toContainText('Creating a slide · slide 2');
  await expect(page.getByTestId('undo-turn')).toHaveText('Undo changes');
});
